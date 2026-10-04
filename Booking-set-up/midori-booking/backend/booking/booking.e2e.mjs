// End-to-end API tests for the booking endpoints.
// Run against a LOCAL backend that uses a TEST database (never production):
//   BASE=http://localhost:8002 ADMIN_TOKEN=<jwt of a test admin> node booking/booking.e2e.mjs
import { execSync } from "child_process";
const BASE = process.env.BASE || "http://localhost:8002";
const ADMIN = process.env.ADMIN_TOKEN;
const PSQL = process.env.PSQL; // optional: psql command for DB assertions
const sql = (q) => (PSQL ? execSync(`${PSQL} -tA -c ${JSON.stringify(q)}`).toString().trim() : null);

const results = [];
const t = (id, name, pass, actual = "") => results.push({ id, name, pass: !!pass, actual: String(actual).slice(0, 200) });
async function call(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let data; const text = await r.text(); try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const good = (over = {}) => ({
  selection: { category: "wedding", packageId: "signature", extraHours: 1, addons: ["rehearsal_dinner", "album_10x10"] },
  eventType: "wedding",
  eventDate: future(200),
  startTime: "14:30",
  venue: "The Abbott",
  city: "Kansas City, MO",
  guestCount: 150,
  outdoor: false,
  fullName: "Test Couple",
  email: `couple${Date.now()}@example.test`,
  phone: "+1 (816) 555-0100",
  preferredContact: "email",
  referralSource: "Instagram",
  message: "Ceremony at 3 <b>pm</b>",
  acknowledged: true,
  ...over,
});

// Catalog & quote
let r = await call("GET", "/booking/catalog");
t("BK-01", "Catalog is public and lists 12 packages", r.status === 200 && r.data.data.packages.length === 12, `${r.status} ${r.data?.data?.packages?.length}`);
t("BK-02", "Catalog exposes Calendly URL from env", typeof r.data?.data?.calendlyUrl === "string", r.data?.data?.calendlyUrl);
r = await call("POST", "/booking/quote", { category: "wedding", packageId: "signature", extraHours: 1, addons: ["rehearsal_dinner", "album_10x10"] });
t("BK-03", "Quote: Signature + 1h + rehearsal + album = $6,550", r.data?.data?.total === 5000 + 350 + 600 + 600, r.data?.data?.total);
r = await call("POST", "/booking/quote", { category: "small_event", packageId: "mini_moment", addons: ["drone_small"] });
t("BK-04", "Quote rejects drone for indoor small event", r.status === 400, `${r.status} ${r.data?.errors?.[0]?.message}`);

// Create
const body = good();
r = await call("POST", "/booking/requests", body);
const ref = r.data?.data?.reference, token = r.data?.data?.manageToken;
t("BK-05", "Valid booking is created (201) with reference", r.status === 201 && /^MID-[A-Z2-9]{6}$/.test(ref || ""), `${r.status} ${ref}`);
t("BK-06", "Server total matches catalog ($6,550)", r.data?.data?.quote?.total === 6550, r.data?.data?.quote?.total);
t("BK-07", "Confirmation email built for client", r.data?.data?.emailSent === true, r.data?.data?.emailSent);
if (PSQL) {
  const row = sql(`select status||'|'||quoted_total||'|'||package_id||'|'||array_to_string(addons,',')||'|'||length(manage_token_hash) from booking_requests where reference='${ref}'`);
  t("BK-08", "Row saved in booking_requests with hashed token", row === "new|6550.00|signature|rehearsal_dinner,album_10x10|64", row);
}
r = await call("POST", "/booking/requests", body);
t("BK-09", "Double submit returns the same reference (no duplicate row)", r.status === 200 && r.data?.data?.reference === ref, `${r.status} ${r.data?.data?.reference}`);

// Tampering & validation
r = await call("POST", "/booking/requests", good({ selection: { category: "wedding", packageId: "signature", addons: [] }, total: 1, quotedTotal: 1, price: 1 }));
t("BK-10", "Client-sent price fields are ignored", r.data?.data?.quote?.total === 5000, r.data?.data?.quote?.total);
r = await call("POST", "/booking/requests", good({ selection: { category: "wedding", packageId: "nope" } }));
t("BK-11", "Unknown package rejected", r.status === 400, r.status);
r = await call("POST", "/booking/requests", good({ eventDate: "2020-01-01" }));
t("BK-12", "Past date rejected", r.status === 400 && r.data.errors.some((e) => e.field === "eventDate"), r.status);
r = await call("POST", "/booking/requests", good({ email: "not-an-email" }));
t("BK-13", "Bad email rejected", r.status === 400 && r.data.errors.some((e) => e.field === "email"), r.status);
r = await call("POST", "/booking/requests", good({ acknowledged: false }));
t("BK-14", "Must acknowledge it is a request", r.status === 400, r.status);
r = await call("POST", "/booking/requests", good({ preferredContact: "text", phone: "" }));
t("BK-15", "Text preference needs a phone number", r.status === 400 && r.data.errors.some((e) => e.field === "phone"), r.status);
r = await call("POST", "/booking/requests", good({ eventType: "funeral" }));
t("BK-16", "Event type must match category", r.status === 400, r.status);
r = await call("POST", "/booking/requests", good({ eventDate: future(10), eventEndDate: future(5) }));
t("BK-17", "End date before start date rejected", r.status === 400, r.status);
r = await call("POST", "/booking/requests", "{bad json");
t("BK-18", "Malformed JSON returns JSON 400", r.status === 400 && typeof r.data === "object", `${r.status} ${typeof r.data}`);
const before = PSQL ? sql("select count(*) from booking_requests") : null;
r = await call("POST", "/booking/requests", good({ website: "http://spam.example", email: `bot${Date.now()}@x.test` }));
t("BK-19", "Honeypot: bot gets fake success, nothing saved", r.status === 201 && (!PSQL || sql("select count(*) from booking_requests") === before), r.status);
r = await call("POST", "/booking/requests", good({
  selection: { category: "small_event", packageId: "event_film", extraHours: 1, addons: ["drone_small", "livestream_1cam", "rush_delivery"] },
  eventType: "birthday", outdoor: true, email: `small${Date.now()}@example.test`,
}));
t("BK-20", "Small event outdoor with drone, live stream and rush = $2,950", r.status === 201 && r.data?.data?.quote?.total === 1300 + 300 + 250 + 750 + 463, r.data?.data?.quote?.total);
r = await call("POST", "/booking/requests", good({
  selection: { category: "multi_event_wedding", packageId: "three_day_wedding", addons: ["raw_video_wedding"] },
  eventType: "indian_wedding", eventDate: future(300), eventEndDate: future(302), email: `indian${Date.now()}@example.test`,
}));
t("BK-21", "Three-day Indian wedding + raw clips = $12,450", r.status === 201 && r.data?.data?.quote?.total === 12450, r.data?.data?.quote?.total);

// Calendly call attachment
r = await call("POST", `/booking/requests/${ref}/call`, { token: "wrong", eventUri: "https://api.calendly.com/scheduled_events/ABC123" });
t("BK-22", "Attach call with wrong token is refused", r.status === 404, r.status);
r = await call("POST", `/booking/requests/${ref}/call`, { token, eventUri: "https://evil.example/x" });
t("BK-23", "Attach call with non-Calendly URI is refused", r.status === 400, r.status);
r = await call("POST", `/booking/requests/${ref}/call`, { token, eventUri: "https://api.calendly.com/scheduled_events/ABC123", inviteeUri: "https://api.calendly.com/scheduled_events/ABC123/invitees/XYZ9" });
t("BK-24", "Attach call with correct token", r.status === 200, r.status);

// Admin
r = await call("GET", "/booking/requests");
t("BK-25", "Admin list requires login", r.status === 401, r.status);
if (ADMIN) {
  r = await call("GET", "/booking/requests?limit=10", undefined, ADMIN);
  const mine = r.data?.data?.find((b) => b.reference === ref);
  t("BK-26", "Admin sees booking with call_scheduled status", r.status === 200 && mine?.status === "call_scheduled", `${r.status} ${mine?.status}`);
  t("BK-27", "Admin list never includes manage_token_hash", r.status === 200 && !JSON.stringify(r.data).includes("manage_token_hash"), "");
  t("BK-28", "Admin list returns counts by status", typeof r.data?.counts?.new === "number", JSON.stringify(r.data?.counts));
  r = await call("GET", `/booking/requests?q=${encodeURIComponent(ref)}`, undefined, ADMIN);
  t("BK-29", "Admin search by reference", r.data?.data?.length === 1, r.data?.data?.length);
  r = await call("PUT", `/booking/requests/${mine?.booking_id}`, { status: "confirmed", adminNotes: "Deposit received" }, ADMIN);
  t("BK-30", "Admin updates status and notes", r.status === 200 && r.data?.data?.status === "confirmed" && r.data?.data?.admin_notes === "Deposit received", r.status);
  r = await call("PUT", `/booking/requests/${mine?.booking_id}`, { status: "paid??" }, ADMIN);
  t("BK-31", "Invalid status rejected", r.status === 400, r.status);
  r = await call("PUT", `/booking/requests/00000000-0000-0000-0000-000000000000`, { status: "new" }, ADMIN);
  t("BK-32", "Unknown booking id returns 404", r.status === 404, r.status);
  r = await call("GET", `/booking/requests/not-a-uuid`, undefined, ADMIN);
  t("BK-33", "Malformed booking id returns 404", r.status === 404, r.status);
}
if (process.env.CLIENT_TOKEN) {
  r = await call("GET", "/booking/requests", undefined, process.env.CLIENT_TOKEN);
  t("BK-34", "Client login cannot read bookings", r.status === 403, r.status);
}

const fail = results.filter((x) => !x.pass);
for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"} ${x.id} ${x.name}${x.pass ? "" : " | got " + x.actual}`);
console.log(`\nTOTAL ${results.length}  PASS ${results.length - fail.length}  FAIL ${fail.length}`);
process.exitCode = fail.length ? 1 : 0;
