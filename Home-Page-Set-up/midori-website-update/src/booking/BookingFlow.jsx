import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LOCAL_CATALOG from "./catalog.js";
import { addonPrice, addonStatus, computeQuote, formatUSD, packagesForCategory } from "./pricing.js";
import { attachCall, getCatalog, submitBooking } from "./api.js";
import "./booking.css";

const STEPS = [
  { id: "service", label: "Service" },
  { id: "package", label: "Package" },
  { id: "customize", label: "Customize" },
  { id: "event", label: "Event" },
  { id: "contact", label: "Contact" },
  { id: "review", label: "Review" },
];
const FIELD_STEP = {
  category: 0, packageId: 1, eventType: 1, extraHours: 2, addons: 2,
  eventDate: 3, eventEndDate: 3, startTime: 3, venue: 3, city: 3, guestCount: 3, message: 3,
  fullName: 4, email: 4, phone: 4, preferredContact: 4, referralSource: 4, acknowledged: 5,
};
const DRAFT_KEY = "midori-booking-draft-v1";
const EMPTY = {
  category: "", packageId: "", extraHours: 0, addons: [], outdoor: false, eventType: "",
  eventDate: "", eventEndDate: "", startTime: "", venue: "", city: "", guestCount: "", message: "",
  fullName: "", email: "", phone: "", preferredContact: "email", referralSource: "", website: "", acknowledged: false,
};
const REFERRALS = ["Instagram", "Google", "Facebook", "TikTok", "Friend or family", "Venue or planner", "Wedding fair", "Other"];

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fmtDate = (s) => {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
};
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};
const readDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
};
const writeDraft = (v) => {
  try { v ? localStorage.setItem(DRAFT_KEY, JSON.stringify(v)) : localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
};

/** Keep only add-ons that are still valid after the package or outdoor flag changes. */
function pruneAddons(catalog, form) {
  const pkg = catalog.packages.find((p) => p.id === form.packageId);
  if (!pkg) return [];
  let kept = form.addons.filter((id) => {
    const a = catalog.addons.find((x) => x.id === id);
    return a && addonStatus(a, pkg.id) === "available" && !(a.requiresOutdoor && !form.outdoor);
  });
  // drop add-ons whose prerequisite is gone
  let changed = true;
  while (changed) {
    changed = false;
    kept = kept.filter((id) => {
      const a = catalog.addons.find((x) => x.id === id);
      const needs = [...(a.requires || []), ...((a.requiresByPackage || {})[pkg.id] || [])];
      const ok = needs.every((n) => kept.includes(n));
      if (!ok) changed = true;
      return ok;
    });
  }
  return kept;
}

function validateStep(step, form, pkg) {
  const e = {};
  if (step === 0 && !form.category) e.category = "Choose a service to continue.";
  if (step === 1 && !form.packageId) e.packageId = "Choose a package to continue.";
  if (step === 3) {
    if (!form.eventDate) e.eventDate = "Choose your event date.";
    else if (form.eventDate < todayLocal()) e.eventDate = "That date has already passed.";
    if (pkg?.days > 1) {
      if (!form.eventEndDate) e.eventEndDate = `This package covers ${pkg.days} days. Choose the last day.`;
      else if (form.eventEndDate < form.eventDate) e.eventEndDate = "The last day must be on or after the first day.";
    } else if (form.eventEndDate && form.eventEndDate < form.eventDate) {
      e.eventEndDate = "The last day must be on or after the first day.";
    }
    if (!form.city.trim() && !form.venue.trim()) e.city = "Tell us the city or venue.";
    if (form.guestCount !== "" && (!/^\d+$/.test(String(form.guestCount)) || Number(form.guestCount) > 5000)) e.guestCount = "Enter a whole number up to 5,000.";
  }
  if (step === 4) {
    if (form.fullName.trim().length < 2) e.fullName = "Please enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.email = "Please enter a valid email address.";
    if (form.phone.trim() && !/^[+()\-.\s\d]{7,30}$/.test(form.phone.trim())) e.phone = "Please enter a valid phone number.";
    if ((form.preferredContact === "phone" || form.preferredContact === "text") && !form.phone.trim()) e.phone = "Add a phone number so we can call or text you.";
  }
  if (step === 5 && !form.acknowledged) e.acknowledged = "Please confirm to send your request.";
  return e;
}

// ---------------------------------------------------------------------------

export default function BookingFlow() {
  const [catalog, setCatalog] = useState(LOCAL_CATALOG);
  const [calendlyUrl, setCalendlyUrl] = useState("");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [restored, setRestored] = useState(false);
  const headingRef = useRef(null);
  const firstRender = useRef(true);

  // Load the live catalog (the bundled copy is used until it arrives, or if the server is asleep).
  useEffect(() => {
    const ctrl = new AbortController();
    getCatalog(ctrl.signal)
      .then((r) => {
        if (r?.data?.packages?.length) setCatalog(r.data);
        setCalendlyUrl(r?.data?.calendlyUrl || "");
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Restore a saved draft, then apply ?category=&package= deep links.
  useEffect(() => {
    const draft = readDraft();
    let next = { ...EMPTY };
    let nextStep = 0;
    if (draft?.form) {
      next = { ...next, ...draft.form, website: "", acknowledged: false };
      nextStep = Math.min(Number(draft.step) || 0, 4);
      setRestored(nextStep > 0);
    }
    const qs = new URLSearchParams(window.location.search);
    const cat = qs.get("category");
    const pkgId = qs.get("package");
    if (cat && LOCAL_CATALOG.categories.some((c) => c.id === cat)) {
      next = { ...EMPTY, category: cat };
      nextStep = 1;
      setRestored(false);
    }
    if (pkgId) {
      const p = LOCAL_CATALOG.packages.find((x) => x.id === pkgId);
      if (p) {
        next = { ...EMPTY, category: cat && p.categories.includes(cat) ? cat : p.categories[0], packageId: p.id };
        nextStep = 2;
        setRestored(false);
      }
    }
    setForm(next);
    setStep(nextStep);
  }, []);

  useEffect(() => {
    if (!result) writeDraft({ form: { ...form, website: "", acknowledged: false }, step });
  }, [form, step, result]);

  // Move focus to the step heading for keyboard and screen-reader users.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    const top = headingRef.current?.closest(".mb-root")?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) window.scrollTo({ top: window.scrollY + top - 80, behavior: "smooth" });
  }, [step, result]);

  const pkg = useMemo(() => catalog.packages.find((p) => p.id === form.packageId), [catalog, form.packageId]);
  const category = useMemo(() => catalog.categories.find((c) => c.id === form.category), [catalog, form.category]);
  const quote = useMemo(
    () => (form.category && form.packageId ? computeQuote(catalog, form) : null),
    [catalog, form]
  );

  const update = useCallback((patch) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      if ("packageId" in patch || "outdoor" in patch || "addons" in patch) next.addons = pruneAddons(catalog, next);
      return next;
    });
    setErrors((e) => {
      const copy = { ...e };
      Object.keys(patch).forEach((k) => delete copy[k]);
      return copy;
    });
    setSubmitError("");
  }, [catalog]);

  const chooseCategory = (id) => {
    if (id !== form.category) {
      const defaultType = id === "wedding" ? "wedding" : id === "multi_event_wedding" ? "indian_wedding" : "";
      setForm((f) => ({ ...f, category: id, packageId: "", addons: [], extraHours: 0, eventType: defaultType, eventEndDate: "" }));
    }
    setErrors({});
    setStep(1);
  };
  const choosePackage = (id) => {
    update({ packageId: id, extraHours: 0 });
    setStep(2);
  };

  const goTo = (i) => {
    // Only allow jumping back, or forward through steps that already validate.
    if (i > step) {
      for (let s = step; s < i; s++) {
        const e = validateStep(s, form, pkg);
        if (Object.keys(e).length) { setErrors(e); setStep(s); return; }
      }
    }
    setErrors({});
    setStep(i);
  };
  const next = () => {
    const e = validateStep(step, form, pkg);
    if (Object.keys(e).length) {
      setErrors(e);
      const first = Object.keys(e)[0];
      setTimeout(() => document.getElementById(`mb-${first}`)?.focus(), 0);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => { setErrors({}); setStep((s) => Math.max(0, s - 1)); };

  const submit = async () => {
    const e = validateStep(5, form, pkg);
    if (Object.keys(e).length) { setErrors(e); return; }
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        selection: { category: form.category, packageId: form.packageId, extraHours: form.extraHours, addons: form.addons },
        outdoor: form.outdoor,
        eventType: form.eventType || undefined,
        eventDate: form.eventDate,
        eventEndDate: form.eventEndDate || undefined,
        startTime: form.startTime || undefined,
        venue: form.venue,
        city: form.city,
        guestCount: form.guestCount === "" ? undefined : Number(form.guestCount),
        message: form.message,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        preferredContact: form.preferredContact,
        referralSource: form.referralSource,
        website: form.website,
        acknowledged: form.acknowledged,
      };
      const r = await submitBooking(payload);
      writeDraft(null);
      setResult(r.data);
      if (r.data?.calendlyUrl) setCalendlyUrl(r.data.calendlyUrl);
    } catch (err) {
      if (err.errors?.length) {
        const map = {};
        err.errors.forEach((x) => { if (x.field && !map[x.field]) map[x.field] = x.message; });
        setErrors(map);
        const firstStep = Math.min(...Object.keys(map).map((f) => FIELD_STEP[f] ?? 5));
        if (firstStep < 5) setStep(firstStep);
      }
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    writeDraft(null);
    setForm(EMPTY);
    setErrors({});
    setResult(null);
    setRestored(false);
    setStep(0);
  };

  if (result) {
    return (
      <div className="mb-root">
        <Success result={result} form={form} pkg={pkg} calendlyUrl={calendlyUrl} headingRef={headingRef} onNew={startOver} />
      </div>
    );
  }

  const showSummary = step >= 1;

  return (
    <div className="mb-root">
      <header className="mb-hero">
        <p className="mb-eyebrow">Book Midori Media</p>
        <h1 className="mb-title">Let's plan your day</h1>
        <p className="mb-lead">Choose a package, make it yours, and see your price as you go. Sending a request is free, and nothing is charged online.</p>
      </header>

      <Stepper step={step} onGo={goTo} />

      {restored && (
        <div className="mb-banner" role="status">
          We saved your progress from last time.
          <button type="button" className="mb-link" onClick={startOver}>Start over</button>
        </div>
      )}

      <div className={`mb-layout ${showSummary ? "" : "mb-layout--single"}`}>
        <main className="mb-main">
          <h2 className="mb-step-title" tabIndex={-1} ref={headingRef}>
            {[
              "What are we capturing?",
              category ? `Choose your ${category.id === "small_event" ? "session" : "package"}` : "Choose your package",
              "Make it yours",
              "Tell us about the event",
              "How can we reach you?",
              "Review and send",
            ][step]}
          </h2>

          {step === 0 && <StepService catalog={catalog} value={form.category} onChoose={chooseCategory} error={errors.category} />}
          {step === 1 && (
            <StepPackage catalog={catalog} form={form} update={update} onChoose={choosePackage} error={errors.packageId} />
          )}
          {step === 2 && pkg && <StepCustomize catalog={catalog} form={form} pkg={pkg} update={update} quote={quote} />}
          {step === 3 && <StepEvent catalog={catalog} form={form} pkg={pkg} update={update} errors={errors} />}
          {step === 4 && <StepContact form={form} update={update} errors={errors} />}
          {step === 5 && (
            <StepReview form={form} pkg={pkg} category={category} quote={quote} catalog={catalog} update={update} errors={errors} onEdit={goTo} />
          )}

          {submitError && <div className="mb-alert" role="alert">{submitError}</div>}

          <div className="mb-nav">
            {step > 0 ? (
              <button type="button" className="mb-btn mb-btn--ghost" onClick={back}>Back</button>
            ) : <span />}
            {step === 0 ? null : step < 5 ? (
              <button type="button" className="mb-btn mb-btn--primary" onClick={next} disabled={step === 1 && !form.packageId}>
                Continue
              </button>
            ) : (
              <button type="button" className="mb-btn mb-btn--primary" onClick={submit} disabled={submitting} aria-busy={submitting}>
                {submitting ? "Sending…" : "Send booking request"}
              </button>
            )}
          </div>
        </main>

        {showSummary && <Summary pkg={pkg} category={category} quote={quote} form={form} catalog={catalog} />}
      </div>

      {showSummary && quote?.ok && (
        <div className="mb-mobilebar" aria-hidden="true">
          <div>
            <div className="mb-mobilebar__label">{pkg?.name}</div>
            <div className="mb-mobilebar__total">{formatUSD(quote.total)}{quote.isEstimate ? "+" : ""}</div>
          </div>
          {step < 5 && step > 0 && (
            <button type="button" tabIndex={-1} className="mb-btn mb-btn--primary mb-btn--sm" onClick={next}>Continue</button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stepper({ step, onGo }) {
  return (
    <nav className="mb-stepper" aria-label="Booking steps">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.id} className={i === step ? "is-current" : i < step ? "is-done" : ""}>
            <button type="button" onClick={() => onGo(i)} disabled={i > step} aria-current={i === step ? "step" : undefined}>
              <span className="mb-stepper__num">{i < step ? "✓" : i + 1}</span>
              <span className="mb-stepper__label">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mb-stepper__bar"><span style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} /></div>
    </nav>
  );
}

function StepService({ catalog, value, onChoose, error }) {
  return (
    <div>
      <div className="mb-grid mb-grid--3">
        {catalog.categories.map((c) => (
          <button type="button" key={c.id} className={`mb-card mb-card--choice ${value === c.id ? "is-selected" : ""}`} onClick={() => onChoose(c.id)} aria-pressed={value === c.id}>
            <span className="mb-card__kicker">From {formatUSD(c.fromPrice)}</span>
            <span className="mb-card__title">{c.label}</span>
            <span className="mb-card__sub">{c.tagline}</span>
            <span className="mb-card__body">{c.description}</span>
            <span className="mb-card__cta">Choose →</span>
          </button>
        ))}
      </div>
      {error && <p className="mb-error" role="alert">{error}</p>}
    </div>
  );
}

function StepPackage({ catalog, form, update, onChoose, error }) {
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState("");
  const pkgs = packagesForCategory(catalog, form.category);
  const types = catalog.eventTypes[form.category] || [];
  const suggested = types.find((t) => t.id === form.eventType)?.suggested || [];
  const isSmall = form.category === "small_event";

  return (
    <div>
      {isSmall && (
        <fieldset className="mb-fieldset">
          <legend className="mb-label">What's the occasion? <span className="mb-optional">Helps us suggest a package</span></legend>
          <div className="mb-chips">
            {types.map((t) => (
              <button type="button" key={t.id} className={`mb-chip ${form.eventType === t.id ? "is-selected" : ""}`} aria-pressed={form.eventType === t.id}
                onClick={() => update({ eventType: form.eventType === t.id ? "" : t.id })}>
                {t.label}
              </button>
            ))}
          </div>
          {types.find((t) => t.id === form.eventType)?.note && <p className="mb-hint">{types.find((t) => t.id === form.eventType).note}</p>}
        </fieldset>
      )}

      {form.category !== "small_event" && pkgs.length > 2 && (
        <div className="mb-toolbar">
          <button type="button" className="mb-link" onClick={() => setCompare((v) => !v)} aria-expanded={compare}>
            {compare ? "Hide comparison" : "Compare packages side by side"}
          </button>
        </div>
      )}
      {compare && <CompareTable pkgs={pkgs} />}

      <div className={`mb-grid ${pkgs.length > 3 ? "mb-grid--packages" : "mb-grid--3"}`}>
        {pkgs.map((p) => {
          const isSuggested = suggested.includes(p.id);
          const expanded = open === p.id;
          return (
            <article key={p.id} className={`mb-card mb-pkg ${form.packageId === p.id ? "is-selected" : ""}`}>
              <div className="mb-pkg__badges">
                {p.popular && <span className="mb-badge">Most popular</span>}
                {isSuggested && <span className="mb-badge mb-badge--soft">Fits your occasion</span>}
              </div>
              <h3 className="mb-pkg__name">{form.category === "multi_event_wedding" && p.multiEventLabel ? p.multiEventLabel : p.name}</h3>
              {form.category === "multi_event_wedding" && p.multiEventLabel && <p className="mb-pkg__alias">{p.name} package</p>}
              <p className="mb-pkg__price">{formatUSD(p.price)}</p>
              <ul className="mb-pkg__facts">
                <li>{p.hoursLabel || `${p.hours} hour${p.hours > 1 ? "s" : ""}`}</li>
                <li>{p.team}</li>
                {p.photos && <li>{p.photos} edited photos</li>}
                {p.film && <li>{p.film}</li>}
                {p.video && p.video !== "None" && !p.film && <li>{p.video}</li>}
              </ul>
              <p className="mb-pkg__best">{p.bestFor}</p>
              <button type="button" className="mb-link mb-pkg__more" onClick={() => setOpen(expanded ? "" : p.id)} aria-expanded={expanded}>
                {expanded ? "Show less" : "See everything included"}
              </button>
              {expanded && <PackageDetails p={p} catalog={catalog} category={form.category} />}
              <button type="button" className={`mb-btn ${form.packageId === p.id ? "mb-btn--primary" : "mb-btn--outline"} mb-btn--block`} onClick={() => onChoose(p.id)} aria-pressed={form.packageId === p.id}>
                {form.packageId === p.id ? "Selected · Continue" : `Choose ${p.name}`}
              </button>
            </article>
          );
        })}
      </div>
      {error && <p className="mb-error" role="alert">{error}</p>}
      <p className="mb-hint mb-center">
        Every package includes {(catalog.business.allPackagesInclude[form.category === "small_event" ? "small_event" : "wedding"] || []).join(", ").toLowerCase()}.
      </p>
    </div>
  );
}

function PackageDetails({ p, catalog, category }) {
  return (
    <div className="mb-details">
      {p.receive?.length > 0 && (<><h4>You receive</h4><ul>{p.receive.map((x) => <li key={x}>{x}</li>)}</ul></>)}
      {p.bring?.length > 0 && (<><h4>We bring</h4><ul>{p.bring.map((x) => <li key={x}>{x}</li>)}</ul></>)}
      {p.notIncluded?.length > 0 && (<><h4>Not included</h4><p>{p.notIncluded.join(" · ")}</p></>)}
      {p.delivery && (
        <>
          <h4>Delivery</h4>
          <p>
            {[
              p.delivery.sneakPeek && `Sneak peeks: ${p.delivery.sneakPeek}`,
              p.delivery.previews && `Previews: ${p.delivery.previews}`,
              p.delivery.gallery && `Gallery: ${p.delivery.gallery}`,
              p.delivery.reel && `Reel: ${p.delivery.reel}`,
              p.delivery.film && `Film: ${p.delivery.film}`,
            ].filter(Boolean).join(" · ")}
          </p>
        </>
      )}
      {p.extraHourRate && <p className="mb-hint">Extra hour: {formatUSD(p.extraHourRate)}</p>}
      {(p.drone === true || p.drone === "Yes, for outdoor events") && <p className="mb-hint">{catalog.business.droneNote}</p>}
    </div>
  );
}

function CompareTable({ pkgs }) {
  const rows = [
    ["Price", (p) => formatUSD(p.price)],
    ["Coverage", (p) => p.hoursLabel || `${p.hours} hours`],
    ["Team", (p) => p.team],
    ["Photos", (p) => p.photos || "—"],
    ["Retouched", (p) => (p.retouched !== undefined ? String(p.retouched) : "—")],
    ["Film", (p) => p.film || "—"],
    ["Drone", (p) => (p.drone === true ? "Yes" : p.drone ? String(p.drone) : p.builtFrom ? "Wedding day" : "No")],
    ["Lights", (p) => p.lights || (p.builtFrom ? "Wedding day" : "—")],
    ["Gallery", (p) => p.delivery?.gallery || "—"],
    ["Film delivery", (p) => p.delivery?.film || "—"],
    ["Extra hour", (p) => (p.extraHourRate ? formatUSD(p.extraHourRate) : "—")],
  ];
  return (
    <div className="mb-compare" role="region" aria-label="Package comparison" tabIndex={0}>
      <table>
        <thead><tr><th scope="col"><span className="mb-sr">Feature</span></th>{pkgs.map((p) => <th scope="col" key={p.id}>{p.name}</th>)}</tr></thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label}><th scope="row">{label}</th>{pkgs.map((p) => <td key={p.id}>{fn(p)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepCustomize({ catalog, form, pkg, update, quote }) {
  const group = form.category === "small_event" ? "small_event" : "wedding";
  const addons = catalog.addons.filter((a) => a.group === group && addonStatus(a, pkg.id) !== "unavailable");
  const included = addons.filter((a) => addonStatus(a, pkg.id) === "included");
  const available = addons.filter((a) => addonStatus(a, pkg.id) === "available");
  const needsOutdoor = available.some((a) => a.requiresOutdoor);

  const toggle = (a) => {
    const on = form.addons.includes(a.id);
    let list = on ? form.addons.filter((x) => x !== a.id) : [...form.addons, a.id];
    if (!on && a.excludes) list = list.filter((x) => !a.excludes.includes(x));
    update({ addons: list });
  };

  return (
    <div>
      <section className="mb-section">
        <div className="mb-row">
          <div>
            <h3 className="mb-h3">Extra coverage time</h3>
            <p className="mb-hint">{pkg.name} includes {pkg.hoursLabel || `${pkg.hours} hour${pkg.hours > 1 ? "s" : ""}`}. Add hours at {formatUSD(pkg.extraHourRate)} each.</p>
          </div>
          <div className="mb-stepperctl" role="group" aria-label="Extra hours">
            <button type="button" onClick={() => update({ extraHours: Math.max(0, form.extraHours - 1) })} disabled={form.extraHours <= 0} aria-label="Remove an hour">−</button>
            <output aria-live="polite">{form.extraHours} hr</output>
            <button type="button" onClick={() => update({ extraHours: Math.min(catalog.maxExtraHours, form.extraHours + 1) })} disabled={form.extraHours >= catalog.maxExtraHours} aria-label="Add an hour">+</button>
          </div>
        </div>
      </section>

      {needsOutdoor && (
        <section className="mb-section">
          <label className="mb-switch">
            <input type="checkbox" checked={form.outdoor} onChange={(e) => update({ outdoor: e.target.checked })} />
            <span className="mb-switch__track" aria-hidden="true" />
            <span><strong>Outdoor event</strong><br /><span className="mb-hint">Drone coverage is available for outdoor events only.</span></span>
          </label>
        </section>
      )}

      <section className="mb-section">
        <h3 className="mb-h3">Add-ons</h3>
        {available.length === 0 && <p className="mb-hint">Everything we offer is already in {pkg.name}.</p>}
        <div className="mb-addons">
          {available.map((a) => {
            const on = form.addons.includes(a.id);
            const needs = [...(a.requires || []), ...((a.requiresByPackage || {})[pkg.id] || [])];
            const missing = needs.filter((n) => !form.addons.includes(n));
            const blocked = (a.requiresOutdoor && !form.outdoor) || missing.length > 0;
            const reason = a.requiresOutdoor && !form.outdoor
              ? "Turn on “Outdoor event” to add this."
              : missing.length ? `Add ${missing.map((m) => catalog.addons.find((x) => x.id === m)?.label).join(", ")} first.` : "";
            const price = addonPrice(a, pkg.id);
            const credit = a.creditByPackage?.[pkg.id] || 0;
            const priceText = a.percent ? `+${a.percent}%` : `+${formatUSD(Math.max(0, price - credit))}${a.priceIsFrom ? "+" : ""}`;
            return (
              <label key={a.id} className={`mb-addon ${on ? "is-on" : ""} ${blocked && !on ? "is-blocked" : ""}`}>
                <input type="checkbox" checked={on} disabled={blocked && !on} onChange={() => toggle(a)} />
                <span className="mb-addon__check" aria-hidden="true">{on ? "✓" : ""}</span>
                <span className="mb-addon__text">
                  <span className="mb-addon__title">{a.label}</span>
                  <span className="mb-addon__desc">{a.description}{credit ? ` Includes your $${credit} album credit.` : ""}</span>
                  {(reason || a.note) && <span className="mb-addon__note">{reason || a.note}</span>}
                </span>
                <span className="mb-addon__price">{priceText}</span>
              </label>
            );
          })}
        </div>
      </section>

      {included.length > 0 && (
        <section className="mb-section">
          <h3 className="mb-h3">Already included in {pkg.name}</h3>
          <ul className="mb-included">{included.map((a) => <li key={a.id}>✓ {a.label}</li>)}</ul>
        </section>
      )}
      {quote && !quote.ok && <div className="mb-alert" role="alert">{quote.errors[0]?.message}</div>}
    </div>
  );
}

function Field({ id, label, optional, error, hint, children }) {
  return (
    <div className={`mb-field ${error ? "has-error" : ""}`}>
      <label htmlFor={`mb-${id}`} className="mb-label">{label}{optional && <span className="mb-optional">Optional</span>}</label>
      {children}
      {hint && !error && <p className="mb-hint" id={`mb-${id}-hint`}>{hint}</p>}
      {error && <p className="mb-error" id={`mb-${id}-error`} role="alert">{error}</p>}
    </div>
  );
}
const inputProps = (id, error) => ({ id: `mb-${id}`, name: id, "aria-invalid": !!error || undefined, "aria-describedby": error ? `mb-${id}-error` : undefined, className: "mb-input" });

function StepEvent({ catalog, form, pkg, update, errors }) {
  const multiDay = pkg?.days > 1 || form.category === "multi_event_wedding";
  const types = catalog.eventTypes[form.category] || [];
  return (
    <div className="mb-form">
      {form.category !== "small_event" && types.length > 1 && (
        <Field id="eventType" label="Type of wedding" error={errors.eventType}>
          <select {...inputProps("eventType", errors.eventType)} value={form.eventType} onChange={(e) => update({ eventType: e.target.value })}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
      )}
      <div className="mb-cols">
        <Field id="eventDate" label={multiDay ? "First day" : "Event date"} error={errors.eventDate}>
          <input type="date" {...inputProps("eventDate", errors.eventDate)} min={todayLocal()} value={form.eventDate} onChange={(e) => update({ eventDate: e.target.value })} />
        </Field>
        {multiDay ? (
          <Field id="eventEndDate" label="Last day" optional={!(pkg?.days > 1)} error={errors.eventEndDate} hint={pkg?.days > 1 ? `${pkg.name} covers ${pkg.days} days.` : undefined}>
            <input type="date" {...inputProps("eventEndDate", errors.eventEndDate)} min={form.eventDate || todayLocal()} value={form.eventEndDate} onChange={(e) => update({ eventEndDate: e.target.value })} />
          </Field>
        ) : (
          <Field id="startTime" label="Start time" optional error={errors.startTime}>
            <input type="time" {...inputProps("startTime", errors.startTime)} value={form.startTime} onChange={(e) => update({ startTime: e.target.value })} />
          </Field>
        )}
      </div>
      {multiDay && (
        <Field id="startTime" label="Start time on the first day" optional error={errors.startTime}>
          <input type="time" {...inputProps("startTime", errors.startTime)} value={form.startTime} onChange={(e) => update({ startTime: e.target.value })} />
        </Field>
      )}
      <div className="mb-cols">
        <Field id="venue" label="Venue" optional error={errors.venue} hint="Name of the venue, park or home.">
          <input type="text" {...inputProps("venue", errors.venue)} autoComplete="off" maxLength={200} value={form.venue} onChange={(e) => update({ venue: e.target.value })} />
        </Field>
        <Field id="city" label="City" error={errors.city}>
          <input type="text" {...inputProps("city", errors.city)} autoComplete="address-level2" maxLength={120} placeholder="Overland Park, KS" value={form.city} onChange={(e) => update({ city: e.target.value })} />
        </Field>
      </div>
      <div className="mb-cols">
        <Field id="guestCount" label="Number of guests" optional error={errors.guestCount}>
          <input type="number" inputMode="numeric" min="0" max="5000" {...inputProps("guestCount", errors.guestCount)} value={form.guestCount} onChange={(e) => update({ guestCount: e.target.value })} />
        </Field>
        {form.category === "small_event" && (
          <div className="mb-field mb-field--switch">
            <label className="mb-switch">
              <input type="checkbox" checked={form.outdoor} onChange={(e) => update({ outdoor: e.target.checked })} />
              <span className="mb-switch__track" aria-hidden="true" />
              <span><strong>Outdoor event</strong></span>
            </label>
          </div>
        )}
      </div>
      <Field id="message" label="Anything we should know?" optional error={errors.message} hint="Timeline, must-have shots, cultural traditions, parking, anything.">
        <textarea {...inputProps("message", errors.message)} rows={4} maxLength={2000} value={form.message} onChange={(e) => update({ message: e.target.value })} />
      </Field>
      <p className="mb-hint">{catalog.business.travelNote}</p>
    </div>
  );
}

function StepContact({ form, update, errors }) {
  return (
    <div className="mb-form">
      <Field id="fullName" label="Full name" error={errors.fullName}>
        <input type="text" {...inputProps("fullName", errors.fullName)} autoComplete="name" maxLength={120} value={form.fullName} onChange={(e) => update({ fullName: e.target.value })} />
      </Field>
      <div className="mb-cols">
        <Field id="email" label="Email" error={errors.email}>
          <input type="email" {...inputProps("email", errors.email)} autoComplete="email" maxLength={254} value={form.email} onChange={(e) => update({ email: e.target.value })} />
        </Field>
        <Field id="phone" label="Phone" optional={form.preferredContact === "email"} error={errors.phone}>
          <input type="tel" {...inputProps("phone", errors.phone)} autoComplete="tel" maxLength={30} value={form.phone} onChange={(e) => update({ phone: e.target.value })} />
        </Field>
      </div>
      <fieldset className="mb-fieldset">
        <legend className="mb-label">Best way to reach you</legend>
        <div className="mb-segment" role="radiogroup">
          {[["email", "Email"], ["phone", "Phone call"], ["text", "Text"]].map(([v, l]) => (
            <label key={v} className={form.preferredContact === v ? "is-selected" : ""}>
              <input type="radio" name="preferredContact" value={v} checked={form.preferredContact === v} onChange={() => update({ preferredContact: v })} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="referralSource" label="How did you hear about us?" optional>
        <select {...inputProps("referralSource")} value={form.referralSource} onChange={(e) => update({ referralSource: e.target.value })}>
          <option value="">Choose one</option>
          {REFERRALS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      {/* Spam trap, hidden from people */}
      <div className="mb-hp" aria-hidden="true">
        <label htmlFor="mb-website">Website</label>
        <input id="mb-website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update({ website: e.target.value })} />
      </div>
    </div>
  );
}

function StepReview({ form, pkg, category, quote, catalog, update, errors, onEdit }) {
  const typeLabel = (catalog.eventTypes[form.category] || []).find((t) => t.id === form.eventType)?.label;
  return (
    <div>
      <ReviewBlock title="Package" onEdit={() => onEdit(1)}>
        <p><strong>{pkg?.name}</strong> · {category?.label}{typeLabel ? ` · ${typeLabel}` : ""}</p>
        <p className="mb-muted">{pkg?.hoursLabel || `${pkg?.hours} hours`} · {pkg?.team}</p>
      </ReviewBlock>
      <ReviewBlock title="Extras" onEdit={() => onEdit(2)}>
        {form.extraHours > 0 || form.addons.length ? (
          <ul className="mb-plain">
            {form.extraHours > 0 && <li>{form.extraHours} extra hour{form.extraHours > 1 ? "s" : ""}</li>}
            {form.addons.map((id) => <li key={id}>{catalog.addons.find((a) => a.id === id)?.label}</li>)}
          </ul>
        ) : <p className="mb-muted">No extras</p>}
      </ReviewBlock>
      <ReviewBlock title="Event" onEdit={() => onEdit(3)}>
        <p>{fmtDate(form.eventDate)}{form.eventEndDate && form.eventEndDate !== form.eventDate ? ` to ${fmtDate(form.eventEndDate)}` : ""}{form.startTime ? ` · ${fmtTime(form.startTime)}` : ""}</p>
        <p className="mb-muted">{[form.venue, form.city].filter(Boolean).join(", ")}{form.outdoor ? " · Outdoor" : ""}{form.guestCount ? ` · ${form.guestCount} guests` : ""}</p>
        {form.message && <p className="mb-quote">{form.message}</p>}
      </ReviewBlock>
      <ReviewBlock title="Contact" onEdit={() => onEdit(4)}>
        <p>{form.fullName}</p>
        <p className="mb-muted">{form.email}{form.phone ? ` · ${form.phone}` : ""} · prefers {form.preferredContact === "text" ? "text" : form.preferredContact === "phone" ? "a call" : "email"}</p>
      </ReviewBlock>

      {quote?.ok && (
        <div className="mb-review-total">
          <span>Estimated total</span>
          <strong>{formatUSD(quote.total)}{quote.isEstimate ? "+" : ""}</strong>
        </div>
      )}

      <div className="mb-next">
        <h3 className="mb-h3">What happens next</h3>
        <ol>
          <li>You get an email with your request and reference number right away.</li>
          <li>You pick a time for a short consultation call.</li>
          <li>We confirm your date, then send your contract and deposit details. Nothing is charged today.</li>
        </ol>
      </div>

      <label className={`mb-check ${errors.acknowledged ? "has-error" : ""}`}>
        <input id="mb-acknowledged" type="checkbox" checked={form.acknowledged} onChange={(e) => update({ acknowledged: e.target.checked })} />
        <span>I understand this is a booking request. My date is reserved only after Midori confirms availability and I sign the contract.</span>
      </label>
      {errors.acknowledged && <p className="mb-error" role="alert">{errors.acknowledged}</p>}
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }) {
  return (
    <section className="mb-review">
      <div className="mb-review__head">
        <h3 className="mb-h3">{title}</h3>
        <button type="button" className="mb-link" onClick={onEdit}>Edit<span className="mb-sr"> {title}</span></button>
      </div>
      {children}
    </section>
  );
}

function Summary({ pkg, category, quote, form, catalog }) {
  return (
    <aside className="mb-summary" aria-label="Your quote">
      <div className="mb-summary__card">
        <p className="mb-eyebrow">Your quote</p>
        {!pkg ? (
          <p className="mb-muted">Choose a package to see your price.</p>
        ) : (
          <>
            <p className="mb-summary__pkg">{pkg.name}</p>
            <p className="mb-muted mb-small">{category?.label} · {pkg.hoursLabel || `${pkg.hours} hr`}</p>
            <ul className="mb-lines">
              {quote?.ok && quote.lines.map((l) => (
                <li key={l.id}>
                  <span>{l.label}{l.detail && <span className="mb-line-detail">{l.detail}</span>}</span>
                  <span>{l.from ? "from " : ""}{formatUSD(l.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mb-total" aria-live="polite">
              <span>Estimated total</span>
              <strong>{quote?.ok ? `${formatUSD(quote.total)}${quote.isEstimate ? "+" : ""}` : "—"}</strong>
            </div>
            {quote?.notes?.filter((n) => !/already included/.test(n)).map((n) => <p key={n} className="mb-hint">{n}</p>)}
            <p className="mb-hint">{catalog.business.travelNote}</p>
          </>
        )}
      </div>
      <p className="mb-trust">No payment today · Reply within 24 hours</p>
    </aside>
  );
}

function Success({ result, form, pkg, calendlyUrl, headingRef, onNew }) {
  const [callSaved, setCallSaved] = useState(false);
  useEffect(() => {
    if (!calendlyUrl) return undefined;
    const onMsg = (e) => {
      if (e.origin !== "https://calendly.com" || e.data?.event !== "calendly.event_scheduled") return;
      const eventUri = e.data?.payload?.event?.uri;
      const inviteeUri = e.data?.payload?.invitee?.uri;
      if (!eventUri) return;
      attachCall(result.reference, { token: result.manageToken, eventUri, inviteeUri })
        .then(() => setCallSaved(true))
        .catch(() => setCallSaved(true)); // the call is booked in Calendly either way
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [calendlyUrl, result]);

  const calendlySrc = useMemo(() => {
    if (!calendlyUrl) return "";
    try {
      const u = new URL(calendlyUrl);
      u.searchParams.set("embed_domain", window.location.hostname);
      u.searchParams.set("embed_type", "Inline");
      u.searchParams.set("hide_gdpr_banner", "1");
      u.searchParams.set("name", form.fullName);
      u.searchParams.set("email", form.email);
      u.searchParams.set("a1", `Booking request ${result.reference}`);
      u.searchParams.set("utm_source", "website");
      u.searchParams.set("utm_campaign", result.reference);
      return u.toString();
    } catch { return ""; }
  }, [calendlyUrl, form.fullName, form.email, result.reference]);

  return (
    <div className="mb-success">
      <div className="mb-success__icon" aria-hidden="true">✓</div>
      <p className="mb-eyebrow">Request sent</p>
      <h1 className="mb-title" tabIndex={-1} ref={headingRef}>Thank you, {form.fullName.split(" ")[0]}.</h1>
      <p className="mb-lead">
        Your reference is <strong className="mb-ref">{result.reference}</strong>.{" "}
        {result.emailSent === false
          ? "We saved your request; your confirmation email may take a few minutes."
          : `We sent a confirmation to ${form.email}.`}
      </p>
      <div className="mb-success__summary">
        <span>{pkg?.name} · {fmtDate(form.eventDate)}</span>
        <strong>{formatUSD(result.quote?.total)}{result.quote?.isEstimate ? "+" : ""}</strong>
      </div>

      {calendlySrc ? (
        <section className="mb-calendly">
          <h2 className="mb-h3">{callSaved ? "Your call is booked. See you soon!" : "Last step: pick a time for a short call"}</h2>
          {!callSaved && <p className="mb-hint">We'll confirm your date, walk through your plans and answer questions.</p>}
          <iframe title="Schedule a consultation call" src={calendlySrc} className="mb-calendly__frame" loading="lazy" />
          <p className="mb-hint">Trouble loading? <a className="mb-link" href={calendlyUrl} target="_blank" rel="noreferrer">Open the scheduler in a new tab</a>.</p>
        </section>
      ) : (
        <p className="mb-lead">We'll reach out within 24 hours to set up a short consultation call.</p>
      )}

      <div className="mb-nav mb-nav--center">
        <a className="mb-btn mb-btn--ghost" href="/">Back to home</a>
        <button type="button" className="mb-btn mb-btn--outline" onClick={onNew}>Start another request</button>
      </div>
    </div>
  );
}
