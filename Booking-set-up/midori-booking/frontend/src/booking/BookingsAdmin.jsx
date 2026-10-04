import { useCallback, useEffect, useState } from "react";
import { listBookings, updateBooking } from "./api.js";
import { formatUSD } from "./pricing.js";
import "./booking.css";

const STATUSES = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["call_scheduled", "Call booked"],
  ["confirmed", "Confirmed"],
  ["declined", "Declined"],
  ["cancelled", "Cancelled"],
];
const label = (s) => STATUSES.find(([v]) => v === s)?.[1] || s;
const fmtDate = (s) => {
  if (!s) return "";
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const fmtDateTime = (s) => (s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

/** Admin page: every booking request from the website. Mount at /dashboard/bookings. */
export default function BookingsAdmin() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ data: [], counts: {}, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    listBookings({ status, q: search, page, limit: 25 })
      .then((r) => setData(r))
      .catch((e) => setError(e.status === 401 || e.status === 403 ? "Please log in as an admin to see bookings." : e.message))
      .finally(() => setLoading(false));
  }, [status, search, page]);
  useEffect(load, [load]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const total = Object.values(data.counts || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="mb-root mb-admin">
      <header className="mb-admin__head">
        <div>
          <p className="mb-eyebrow">Dashboard</p>
          <h1 className="mb-step-title">Booking requests</h1>
        </div>
        <input className="mb-input mb-admin__search" type="search" placeholder="Search name, email or reference" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" />
      </header>

      <div className="mb-chips mb-admin__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={status === ""} className={`mb-chip ${status === "" ? "is-selected" : ""}`} onClick={() => { setStatus(""); setPage(1); }}>All · {total}</button>
        {STATUSES.map(([v, l]) => (
          <button type="button" role="tab" key={v} aria-selected={status === v} className={`mb-chip ${status === v ? "is-selected" : ""}`} onClick={() => { setStatus(v); setPage(1); }}>
            {l} · {data.counts?.[v] ?? 0}
          </button>
        ))}
      </div>

      {error && <div className="mb-alert" role="alert">{error}</div>}

      <div className="mb-admin__table" aria-busy={loading}>
        <table>
          <thead>
            <tr><th>Reference</th><th>Client</th><th>Package</th><th>Event date</th><th className="num">Quote</th><th>Status</th><th>Received</th></tr>
          </thead>
          <tbody>
            {!loading && data.data.length === 0 && (
              <tr><td colSpan={7} className="mb-muted mb-center">No booking requests{status ? ` with status “${label(status)}”` : ""} yet.</td></tr>
            )}
            {data.data.map((b) => (
              <tr key={b.booking_id} onClick={() => setSelected(b)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(b)} className={selected?.booking_id === b.booking_id ? "is-active" : ""}>
                <td className="mono">{b.reference}</td>
                <td><div>{b.full_name}</div><div className="mb-muted mb-small">{b.email}</div></td>
                <td>{b.package_name}</td>
                <td>{fmtDate(b.event_date)}</td>
                <td className="num">{formatUSD(b.quoted_total)}</td>
                <td><span className={`mb-status mb-status--${b.status}`}>{label(b.status)}</span></td>
                <td className="mb-muted mb-small">{fmtDateTime(b.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div className="mb-nav">
          <button type="button" className="mb-btn mb-btn--ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="mb-muted">Page {page} of {data.totalPages}</span>
          <button type="button" className="mb-btn mb-btn--ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {selected && (
        <BookingDrawer
          booking={selected}
          onClose={() => setSelected(null)}
          onSaved={(b) => { setSelected(b); load(); }}
        />
      )}
    </div>
  );
}

function BookingDrawer({ booking, onClose, onSaved }) {
  const [status, setStatus] = useState(booking.status);
  const [notes, setNotes] = useState(booking.admin_notes || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // Reset the form only when a different booking is opened (not after saving this one).
  useEffect(() => { setStatus(booking.status); setNotes(booking.admin_notes || ""); setMsg(""); }, [booking.booking_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const r = await updateBooking(booking.booking_id, { status, adminNotes: notes });
      onSaved(r.data);
      setMsg("Saved");
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const b = booking;
  return (
    <div className="mb-drawer" role="dialog" aria-modal="true" aria-label={`Booking ${b.reference}`}>
      <div className="mb-drawer__backdrop" onClick={onClose} />
      <div className="mb-drawer__panel">
        <div className="mb-review__head">
          <p className="mb-eyebrow mono">{b.reference}</p>
          <button type="button" className="mb-btn mb-btn--ghost mb-btn--sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <h2 className="mb-step-title">{b.full_name}</h2>
        <p><a className="mb-link" href={`mailto:${b.email}?subject=${encodeURIComponent(`Your Midori booking request ${b.reference}`)}`}>{b.email}</a>{b.phone && <> · <a className="mb-link" href={`tel:${b.phone}`}>{b.phone}</a></>}</p>
        <p className="mb-muted mb-small">Prefers {b.preferred_contact}{b.referral_source ? ` · Heard via ${b.referral_source}` : ""} · Received {fmtDateTime(b.created_at)}</p>

        <section className="mb-review">
          <h3 className="mb-h3">{b.package_name}</h3>
          <p className="mb-muted mb-small">{b.category.replace(/_/g, " ")}{b.event_type ? ` · ${b.event_type.replace(/_/g, " ")}` : ""}</p>
          <p>{fmtDate(b.event_date)}{b.event_end_date && b.event_end_date !== b.event_date ? ` – ${fmtDate(b.event_end_date)}` : ""}{b.start_time ? ` · ${b.start_time.slice(0, 5)}` : ""}</p>
          <p className="mb-muted">{[b.venue, b.city].filter(Boolean).join(", ")}{b.is_outdoor ? " · Outdoor" : ""}{b.guest_count ? ` · ${b.guest_count} guests` : ""}</p>
          <ul className="mb-lines">
            {(b.quote?.lines || []).map((l) => (
              <li key={l.id}><span>{l.label}{l.detail && <span className="mb-line-detail">{l.detail}</span>}</span><span>{l.from ? "from " : ""}{formatUSD(l.amount)}</span></li>
            ))}
          </ul>
          <div className="mb-total"><span>Quoted total</span><strong>{formatUSD(b.quoted_total)}{b.quote?.isEstimate ? "+" : ""}</strong></div>
        </section>

        {b.message && (<section className="mb-review"><h3 className="mb-h3">Their message</h3><p className="mb-quote">{b.message}</p></section>)}

        <section className="mb-review">
          <h3 className="mb-h3">Consultation call</h3>
          {b.call_booked_at ? (
            <p>{b.call_start_at ? `Call on ${fmtDateTime(b.call_start_at)}` : `Booked a call on ${fmtDateTime(b.call_booked_at)}`} · see Calendly for details</p>
          ) : <p className="mb-muted">No call booked yet.</p>}
        </section>

        <div className="mb-form">
          <div className="mb-field">
            <label className="mb-label" htmlFor="mb-admin-status">Status</label>
            <select id="mb-admin-status" className="mb-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="mb-field">
            <label className="mb-label" htmlFor="mb-admin-notes">Private notes</label>
            <textarea id="mb-admin-notes" className="mb-input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
          </div>
          <div className="mb-nav">
            <span className="mb-muted" role="status">{msg}</span>
            <button type="button" className="mb-btn mb-btn--primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
