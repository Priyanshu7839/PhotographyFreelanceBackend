import crypto from "crypto";
import { supabase } from "../supabase.js";
import { CATALOG } from "./catalog.js";
import { computeQuote } from "./pricing.js";
import { sendBookingEmails } from "./mailer.js";

const STATUSES = ["new", "contacted", "call_scheduled", "confirmed", "declined", "cancelled"];
const ADMIN_FIELDS =
  "booking_id, reference, status, category, package_id, package_name, extra_hours, addons, quote, quoted_total, catalog_version, event_type, event_date, event_end_date, start_time, venue, city, is_outdoor, guest_count, message, full_name, email, phone, preferred_contact, referral_source, call_event_uri, call_invitee_uri, call_booked_at, call_start_at, admin_notes, client_id, created_at, updated_at";

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
const newReference = () => "MID-" + Array.from(crypto.randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const todayISO = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10); // Central time, roughly

export function publicCatalog(req, res) {
  res.set("Cache-Control", "public, max-age=300");
  return res.json({
    success: true,
    data: { ...CATALOG, calendlyUrl: process.env.CALENDLY_URL || "" },
  });
}

export function quote(req, res) {
  const result = computeQuote(CATALOG, {
    category: req.body?.category,
    packageId: req.body?.packageId,
    extraHours: req.body?.extraHours ?? 0,
    addons: req.body?.addons ?? [],
    outdoor: req.body?.outdoor === true,
  });
  return res.status(result.ok ? 200 : 400).json({ success: result.ok, data: result, errors: result.errors });
}

/** Validates the contact/event part of a booking. Returns { errors, value }. */
export function validateBookingDetails(body = {}) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  const full_name = str(body.fullName, 120);
  if (full_name.length < 2) add("fullName", "Please enter your full name.");

  const email = str(body.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) add("email", "Please enter a valid email address.");

  const phone = str(body.phone, 30);
  if (phone && !/^[+()\-.\s\d]{7,30}$/.test(phone)) add("phone", "Please enter a valid phone number.");

  const preferred_contact = body.preferredContact ? str(body.preferredContact, 10) : "email";
  if (!["email", "phone", "text"].includes(preferred_contact)) add("preferredContact", "Choose email, phone or text.");
  if ((preferred_contact === "phone" || preferred_contact === "text") && !phone) add("phone", "Add a phone number so we can call or text you.");

  const event_date = str(body.eventDate, 10);
  if (!isISODate(event_date)) add("eventDate", "Choose your event date.");
  else {
    if (event_date < todayISO()) add("eventDate", "The event date is in the past.");
    const max = new Date(); max.setUTCFullYear(max.getUTCFullYear() + 3);
    if (event_date > max.toISOString().slice(0, 10)) add("eventDate", "We book up to 3 years ahead.");
  }

  let event_end_date = str(body.eventEndDate, 10) || null;
  if (event_end_date) {
    if (!isISODate(event_end_date)) add("eventEndDate", "Choose a valid last day.");
    else if (isISODate(event_date)) {
      if (event_end_date < event_date) add("eventEndDate", "The last day must be on or after the first day.");
      const days = (Date.parse(event_end_date) - Date.parse(event_date)) / 86400000;
      if (days > 14) add("eventEndDate", "Multi-day events can span up to 14 days.");
    }
  }

  const start_time = str(body.startTime, 5) || null;
  if (start_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(start_time)) add("startTime", "Choose a valid start time.");

  const venue = str(body.venue, 200);
  const city = str(body.city, 120);
  if (!venue && !city) add("city", "Tell us the city or venue.");

  let guest_count = null;
  if (body.guestCount !== undefined && body.guestCount !== null && body.guestCount !== "") {
    guest_count = Number(body.guestCount);
    if (!Number.isInteger(guest_count) || guest_count < 0 || guest_count > 5000) add("guestCount", "Guest count must be a whole number up to 5,000.");
  }

  const message = str(body.message, 2000);
  const referral_source = str(body.referralSource, 100);
  const is_outdoor = body.outdoor === true;

  return { errors, value: { full_name, email, phone: phone || null, preferred_contact, event_date, event_end_date, start_time, venue: venue || null, city: city || null, guest_count, message: message || null, referral_source: referral_source || null, is_outdoor } };
}

export async function createBooking(req, res) {
  try {
    const body = req.body || {};

    // Spam trap: real people never fill the hidden "website" field.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return res.status(201).json({ success: true, data: { reference: newReference() } });
    }

    const selection = body.selection || {};
    const q = computeQuote(CATALOG, {
      category: selection.category,
      packageId: selection.packageId,
      extraHours: selection.extraHours ?? 0,
      addons: selection.addons ?? [],
      outdoor: body.outdoor === true,
    });

    const details = validateBookingDetails(body);
    const eventTypes = CATALOG.eventTypes[selection.category] || [];
    const event_type = str(body.eventType, 40);
    const errors = [...(q.ok ? [] : q.errors), ...details.errors];
    if (event_type && !eventTypes.some((t) => t.id === event_type)) errors.push({ field: "eventType", message: "Choose an event type from the list." });
    if (body.acknowledged !== true) errors.push({ field: "acknowledged", message: "Please confirm you understand this is a request, not a confirmed booking." });

    if (errors.length) return res.status(400).json({ success: false, message: errors[0].message, errors });

    const v = details.value;

    // Double-click / resubmit protection: same person, date and package within 15 minutes.
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: dup } = await supabase
      .from("booking_requests")
      .select("reference")
      .eq("email", v.email)
      .eq("event_date", v.event_date)
      .eq("package_id", q.package.id)
      .gte("created_at", since)
      .limit(1);
    if (dup?.length) {
      return res.status(200).json({ success: true, duplicate: true, data: { reference: dup[0].reference, quote: q, calendlyUrl: process.env.CALENDLY_URL || "" } });
    }

    const manageToken = crypto.randomBytes(24).toString("base64url");
    const row = {
      reference: newReference(),
      status: "new",
      category: selection.category,
      package_id: q.package.id,
      package_name: q.package.name,
      extra_hours: Number(selection.extraHours || 0),
      addons: q.lines.filter((l) => l.kind === "addon").map((l) => l.id.replace(/^addon:/, "")),
      quote: { lines: q.lines, notes: q.notes, isEstimate: q.isEstimate },
      quoted_total: q.total,
      catalog_version: q.catalogVersion,
      event_type: event_type || null,
      ...v,
      manage_token_hash: sha256(manageToken),
      user_agent: str(req.get("user-agent"), 300) || null,
    };

    let inserted = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const { data, error } = await supabase.from("booking_requests").insert(row).select(ADMIN_FIELDS).single();
      if (!error) inserted = data;
      else if (error.code === "23505") row.reference = newReference(); // reference collision, retry
      else throw error;
    }
    if (!inserted) throw new Error("Could not create booking reference");

    const emails = await sendBookingEmails(inserted);

    return res.status(201).json({
      success: true,
      data: {
        reference: inserted.reference,
        manageToken,
        quote: q,
        emailSent: emails.client,
        calendlyUrl: process.env.CALENDLY_URL || "",
      },
    });
  } catch (err) {
    console.error("Create booking error:", err);
    return res.status(500).json({ success: false, message: "We couldn't save your request. Please try again, or email us directly." });
  }
}

/** Called by the website after the client picks a call time in the Calendly widget. */
export async function attachCall(req, res) {
  try {
    const { reference } = req.params;
    const token = str(req.body?.token, 100);
    const eventUri = str(req.body?.eventUri, 300);
    const inviteeUri = str(req.body?.inviteeUri, 300);
    if (!token || !/^https:\/\/api\.calendly\.com\/scheduled_events\/[\w-]+$/.test(eventUri)) {
      return res.status(400).json({ success: false, message: "Invalid call details" });
    }
    if (inviteeUri && !/^https:\/\/api\.calendly\.com\/scheduled_events\/[\w-]+\/invitees\/[\w-]+$/.test(inviteeUri)) {
      return res.status(400).json({ success: false, message: "Invalid call details" });
    }
    const { data: b } = await supabase.from("booking_requests").select("booking_id, status, manage_token_hash").eq("reference", reference).maybeSingle();
    const expected = Buffer.from(b?.manage_token_hash || "0".repeat(64));
    const given = Buffer.from(sha256(token));
    if (!b || !crypto.timingSafeEqual(expected, given)) return res.status(404).json({ success: false, message: "Booking not found" });

    let call_start_at = null;
    if (process.env.CALENDLY_API_TOKEN) {
      try {
        const r = await fetch(eventUri, { headers: { Authorization: `Bearer ${process.env.CALENDLY_API_TOKEN}` } });
        if (r.ok) call_start_at = (await r.json())?.resource?.start_time || null;
      } catch (e) {
        console.error("Calendly lookup failed:", e?.message);
      }
    }

    const update = { call_event_uri: eventUri, call_invitee_uri: inviteeUri || null, call_booked_at: new Date().toISOString(), call_start_at };
    if (b.status === "new" || b.status === "contacted") update.status = "call_scheduled";
    const { error } = await supabase.from("booking_requests").update(update).eq("booking_id", b.booking_id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error("Attach call error:", err);
    return res.status(500).json({ success: false, message: "Could not save the call time" });
  }
}

// ----------------------------- Admin -----------------------------

export async function listBookings(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const status = str(req.query.status, 20);
    const search = str(req.query.q, 80).replace(/[%,()]/g, " ");

    let query = supabase.from("booking_requests").select(ADMIN_FIELDS, { count: "exact" });
    if (status && STATUSES.includes(status)) query = query.eq("status", status);
    if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,reference.ilike.%${search}%`);
    const from = (page - 1) * limit;
    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + limit - 1);
    if (error) throw error;

    const { data: counts } = await supabase.from("booking_requests").select("status");
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const r of counts || []) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

    return res.json({ success: true, data, total: count || 0, page, limit, totalPages: Math.max(1, Math.ceil((count || 0) / limit)), counts: byStatus });
  } catch (err) {
    console.error("List bookings error:", err);
    return res.status(500).json({ success: false, message: "Could not load bookings" });
  }
}

export async function getBooking(req, res) {
  const { data, error } = await supabase.from("booking_requests").select(ADMIN_FIELDS).eq("booking_id", req.params.id).maybeSingle();
  if (error && error.code !== "22P02") return res.status(500).json({ success: false, message: "Could not load booking" });
  if (!data) return res.status(404).json({ success: false, message: "Booking not found" });
  return res.json({ success: true, data });
}

export async function updateBooking(req, res) {
  try {
    const update = {};
    if (req.body?.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ success: false, message: `Status must be one of: ${STATUSES.join(", ")}` });
      update.status = req.body.status;
    }
    if (req.body?.adminNotes !== undefined) update.admin_notes = str(req.body.adminNotes, 4000) || null;
    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: "Nothing to update" });

    const { data, error } = await supabase.from("booking_requests").update(update).eq("booking_id", req.params.id).select(ADMIN_FIELDS).maybeSingle();
    if (error && error.code !== "22P02") throw error;
    if (!data) return res.status(404).json({ success: false, message: "Booking not found" });
    return res.json({ success: true, data });
  } catch (err) {
    console.error("Update booking error:", err);
    return res.status(500).json({ success: false, message: "Could not update booking" });
  }
}
