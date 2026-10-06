import nodemailer from "nodemailer";
import { formatUSD } from "./pricing.js";
import { smtpConfig } from "../mailConfig.js";

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  if (process.env.EMAIL_TRANSPORT === "json") {
    // Used by automated tests: builds the message but sends nothing.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transporter = nodemailer.createTransport(smtpConfig);
  }
  return transporter;
}

export const sentLog = []; // last messages (tests / debugging only)

const esc = (v = "") =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const fmtDate = (d) => {
  if (!d) return "";
  const [y, m, day] = String(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
};

const shell = (title, body) => `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#fafafa">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#121212;border:1px solid #262626;border-radius:14px">
<tr><td style="padding:28px 32px 8px"><div style="font-size:13px;letter-spacing:2px;color:#6fbf9f;text-transform:uppercase">Midori Media</div>
<h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#fafafa">${esc(title)}</h1></td></tr>
<tr><td style="padding:8px 32px 28px;font-size:15px;line-height:1.6;color:#d4d4d4">${body}</td></tr></table>
<div style="color:#666;font-size:12px;margin-top:16px">Midori Media Company LLC · Overland Park, Kansas</div>
</td></tr></table></body></html>`;

function summaryTable(b) {
  const rows = (b.quote?.lines || [])
    .map((l) => `<tr><td style="padding:6px 0;color:#d4d4d4">${esc(l.label)}${l.detail ? `<div style="font-size:12px;color:#888">${esc(l.detail)}</div>` : ""}</td><td style="padding:6px 0;text-align:right;color:#fafafa;white-space:nowrap">${l.from ? "from " : ""}${formatUSD(l.amount)}</td></tr>`)
    .join("");
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0;border-top:1px solid #262626;border-bottom:1px solid #262626">
${rows}
<tr><td style="padding:10px 0;font-weight:600;color:#fafafa;border-top:1px solid #262626">Estimated total</td><td style="padding:10px 0;text-align:right;font-weight:600;color:#6fbf9f;border-top:1px solid #262626">${formatUSD(b.quoted_total)}${b.quote?.isEstimate ? "+" : ""}</td></tr></table>`;
}

function eventBlock(b) {
  const when = [fmtDate(b.event_date), b.event_end_date && b.event_end_date !== b.event_date ? `to ${fmtDate(b.event_end_date)}` : "", b.start_time ? `at ${fmtTime(b.start_time)}` : ""].filter(Boolean).join(" ");
  const where = [b.venue, b.city].filter(Boolean).join(", ");
  return `<p style="margin:0 0 4px"><strong style="color:#fafafa">When:</strong> ${esc(when)}</p>
${where ? `<p style="margin:0 0 4px"><strong style="color:#fafafa">Where:</strong> ${esc(where)}${b.is_outdoor ? " (outdoor)" : ""}</p>` : ""}
${b.guest_count ? `<p style="margin:0 0 4px"><strong style="color:#fafafa">Guests:</strong> ${esc(b.guest_count)}</p>` : ""}`;
}

const button = (href, label) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#2d5f4f;color:#fafafa;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${esc(label)}</a>`;

export function buildClientEmail(b, { calendlyUrl, zoomUrl } = {}) {
  const first = String(b.full_name).trim().split(/\s+/)[0];
  const callBlock = calendlyUrl
    ? `<p style="margin:20px 0 8px"><strong style="color:#fafafa">Next step: pick a time for a short consultation call.</strong> We'll go over your plans, answer questions and confirm your date.</p>
<p style="margin:0 0 8px">${button(calendlyUrl, "Choose a call time")}</p>`
    : `<p style="margin:20px 0 8px"><strong style="color:#fafafa">Next step:</strong> we'll reach out within 24 hours to set up a short consultation call.</p>`;
  const zoomBlock = zoomUrl ? `<p style="margin:8px 0;font-size:13px;color:#888">Our calls happen on Zoom: <a href="${esc(zoomUrl)}" style="color:#6fbf9f">${esc(zoomUrl.split("?")[0])}</a></p>` : "";
  const html = shell(
    `Thanks, ${first}. We received your booking request.`,
    `<p style="margin:0 0 12px">Your reference is <strong style="color:#fafafa;letter-spacing:1px">${esc(b.reference)}</strong>. Your date is not reserved yet: we'll confirm availability, then send your contract and deposit details.</p>
<p style="margin:16px 0 4px;color:#fafafa;font-weight:600">${esc(b.package_name)}</p>
${eventBlock(b)}
${summaryTable(b)}
${callBlock}${zoomBlock}
<p style="margin:20px 0 0;font-size:13px;color:#888">Travel fees may apply outside the Kansas City area; we'll confirm any travel fee before you book. Drone coverage depends on FAA rules, the venue, airspace and the weather.</p>
<p style="margin:12px 0 0;font-size:13px;color:#888">Questions? Just reply to this email.</p>`
  );
  const text = `Thanks, ${first}. We received your booking request ${b.reference}.
Package: ${b.package_name}
Date: ${fmtDate(b.event_date)}${b.start_time ? " at " + fmtTime(b.start_time) : ""}
Estimated total: ${formatUSD(b.quoted_total)}${b.quote?.isEstimate ? "+" : ""}
Your date is not reserved yet. We'll confirm availability, then send your contract and deposit details.
${calendlyUrl ? "Choose a consultation call time: " + calendlyUrl : "We'll reach out within 24 hours to set up a consultation call."}
${zoomUrl ? "Zoom: " + zoomUrl : ""}`;
  return { subject: `We received your request (${b.reference}) · Midori Media`, html, text };
}

export function buildAdminEmail(b, { dashboardUrl } = {}) {
  const contact = `<p style="margin:0 0 4px"><strong style="color:#fafafa">${esc(b.full_name)}</strong></p>
<p style="margin:0 0 4px"><a style="color:#6fbf9f" href="mailto:${esc(b.email)}">${esc(b.email)}</a>${b.phone ? ` · <a style="color:#6fbf9f" href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ""}</p>
<p style="margin:0 0 12px;color:#888">Prefers: ${esc(b.preferred_contact || "email")}${b.referral_source ? ` · Heard via: ${esc(b.referral_source)}` : ""}</p>`;
  const html = shell(
    `New booking request ${b.reference}`,
    `${contact}
<p style="margin:16px 0 4px;color:#fafafa;font-weight:600">${esc(b.package_name)} · ${esc(b.event_type || b.category)}</p>
${eventBlock(b)}
${summaryTable(b)}
${b.message ? `<p style="margin:12px 0 4px;color:#fafafa;font-weight:600">Their message</p><p style="margin:0;white-space:pre-wrap">${esc(b.message)}</p>` : ""}
${dashboardUrl ? `<p style="margin:20px 0 0">${button(dashboardUrl, "Open bookings")}</p>` : ""}`
  );
  const text = `New booking request ${b.reference}
${b.full_name} <${b.email}> ${b.phone || ""}
${b.package_name} on ${b.event_date}${b.start_time ? " " + b.start_time : ""}
Estimated total: ${formatUSD(b.quoted_total)}
${b.message || ""}`;
  return { subject: `New booking: ${b.full_name} · ${b.package_name} · ${b.event_date}`, html, text };
}

/** Sends both emails. Never throws: a mail failure must not lose the booking. */
export async function sendBookingEmails(b) {
  const from = `"Midori Media" <${process.env.EMAIL_SENDER}>`;
  const adminTo = process.env.BOOKING_NOTIFY_EMAIL || process.env.ENQUIRY_RECIPIENT || "midorimediacompany@gmail.com";
  const opts = {
    calendlyUrl: process.env.CALENDLY_URL || "",
    zoomUrl: process.env.ZOOM_MEETING_URL || "",
    dashboardUrl: process.env.ADMIN_BOOKINGS_URL || "https://midorimediacompany.com/dashboard/bookings",
  };
  const results = { admin: false, client: false };
  const t = getTransporter();
  const client = buildClientEmail(b, opts);
  const admin = buildAdminEmail(b, opts);
  await Promise.all([
    t.sendMail({ from, to: b.email, replyTo: adminTo, ...client }).then(() => { results.client = true; sentLog.push({ to: b.email, subject: client.subject }); }),
    t.sendMail({ from, to: adminTo, replyTo: b.email, ...admin }).then(() => { results.admin = true; sentLog.push({ to: adminTo, subject: admin.subject }); }),
  ].map((p) => p.catch((err) => console.error("Booking email failed:", err?.message))));
  if (sentLog.length > 50) sentLog.splice(0, sentLog.length - 50);
  return results;
}
