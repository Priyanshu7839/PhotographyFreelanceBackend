import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CATALOG from "../booking/catalog.js";
import { formatUSD } from "../booking/pricing.js";
import { API_URL } from "../booking/api.js";
import site from "./siteConfig.js";
import "./home.css";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const labelFor = (folder) => site.folderLabels?.[folder] || folder;

/** Marks elements with [data-reveal] as shown (data-shown) when they scroll into view.
 *  A data attribute is used (not a class) so React re-renders never remove it. */
function useReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const els = root.querySelectorAll("[data-reveal]:not([data-shown])");
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      els.forEach((el) => { el.dataset.shown = ""; });
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.dataset.shown = ""; io.unobserve(e.target); }
      }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setY(window.scrollY)); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", on); };
  }, []);
  return y;
}

function usePortfolio() {
  const [folders, setFolders] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${API_URL}/homepage/folders`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((r) => setFolders((r?.data || []).filter((f) => f.cover_image && f.number_of_images > 0)))
      .catch((e) => { if (e.name !== "AbortError") setError(true); });
    return () => ctrl.abort();
  }, []);
  return { folders, error };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const rootRef = useRef(null);
  const { folders, error } = usePortfolio();
  const [lightbox, setLightbox] = useState(null); // folder name
  useReveal(rootRef, [folders]);

  useEffect(() => {
    const prev = document.title;
    document.title = `${site.brand} · Wedding & Event Photography and Film · ${site.location}`;
    return () => { document.title = prev; };
  }, []);

  const heroSlides = useMemo(() => {
    if (!folders?.length) return [];
    const wanted = site.heroFolders?.length ? site.heroFolders : [];
    const picked = wanted.map((n) => folders.find((f) => f.variant_type === n)).filter(Boolean);
    const rest = folders.filter((f) => !picked.includes(f));
    return [...picked, ...rest].slice(0, 5);
  }, [folders]);

  return (
    <div className="mh" ref={rootRef}>
      <Nav />
      <Hero slides={heroSlides} onOpen={setLightbox} />
      <Marquee />
      <Portfolio folders={folders} error={error} onOpen={setLightbox} />
      <Packages />
      <Process />
      <Stats />
      <Why />
      <Partners />
      <Testimonials />
      <Faq />
      <Cta />
      <Footer />
      {lightbox && <Lightbox folder={lightbox} folders={folders || []} onClose={() => setLightbox(null)} onSwitch={setLightbox} />}
      <LocalBusinessSchema />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

const NAV = [
  ["Portfolio", "#portfolio"],
  ["Packages", "#packages"],
  ["Process", "#process"],
  ["FAQ", "#faq"],
];

function Nav() {
  const y = useScrollY();
  const last = useRef(0);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dy = y - last.current;
    if (Math.abs(dy) > 6) { setHidden(dy > 0 && y > 400 && !open); last.current = y; }
  }, [y, open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <header className={`mh-nav ${y > 40 ? "is-solid" : ""} ${hidden ? "is-hidden" : ""} ${open ? "is-open" : ""}`}>
      <div className="mh-nav__inner">
        <a href="/" className="mh-logo" aria-label={`${site.brand} home`}>
          <span className="mh-logo__mark" aria-hidden="true">M</span>
          <span>{site.brand}</span>
        </a>
        <nav className="mh-nav__links" aria-label="Main">
          {NAV.map(([l, h]) => <a key={h} href={h}>{l}</a>)}
          <a href="/workspace" className="mh-nav__muted">Client login</a>
        </nav>
        <a href="/booking" className="mh-btn mh-btn--primary mh-btn--sm mh-nav__cta">Book now</a>
        <button type="button" className="mh-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span /><span />
        </button>
      </div>
      <div className="mh-drawer" aria-hidden={!open}>
        <nav aria-label="Mobile">
          {NAV.map(([l, h], i) => <a key={h} href={h} onClick={() => setOpen(false)} style={{ "--i": i }}>{l}</a>)}
          <a href="/workspace" onClick={() => setOpen(false)} style={{ "--i": 4 }}>Client login</a>
          <a href="/booking" className="mh-btn mh-btn--primary" style={{ "--i": 5 }}>Book now</a>
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

const HERO_WORDS = ["Moments", "that", "stay."];

function Hero({ slides, onOpen }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState({});
  const y = useScrollY();
  const DURATION = 6000;

  useEffect(() => {
    if (slides.length < 2 || paused || prefersReducedMotion()) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % slides.length), DURATION);
    return () => clearTimeout(t);
  }, [i, slides.length, paused]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const current = slides[i];
  const parallax = prefersReducedMotion() ? 0 : Math.min(y * 0.35, 260);

  return (
    <section className="mh-hero" aria-label="Introduction">
      <div className="mh-hero__media" style={{ transform: `translate3d(0, ${parallax}px, 0)` }}>
        {slides.map((s, n) => {
          // Only load the current slide and the next one: originals are very large files.
          const near = n === i || n === (i + 1) % slides.length || loaded[n];
          return (
            <div key={s.variant_type} className={`mh-hero__slide ${n === i ? "is-active" : ""} ${loaded[n] ? "is-loaded" : ""}`} aria-hidden={n !== i}>
              {near && (
                <img
                  src={s.cover_image}
                  alt=""
                  decoding="async"
                  fetchPriority={n === 0 ? "high" : "low"}
                  onLoad={() => setLoaded((m) => ({ ...m, [n]: true }))}
                />
              )}
            </div>
          );
        })}
        <div className="mh-hero__shade" />
        <div className="mh-hero__grain" aria-hidden="true" />
      </div>

      <div className="mh-hero__content">
        <p className="mh-eyebrow mh-hero__eyebrow">{site.tagline} · {site.location}</p>
        <h1 className="mh-hero__title" aria-label={HERO_WORDS.join(" ")}>
          {HERO_WORDS.map((w, n) => (
            <span key={w} className="mh-word" aria-hidden="true"><span style={{ "--d": `${180 + n * 120}ms` }}>{w}</span></span>
          ))}
        </h1>
        <p className="mh-hero__lead">
          Wedding, portrait and event photography and film across {site.serviceArea}. One team, every frame, from the first look to the last dance.
        </p>
        <div className="mh-hero__actions">
          <a href="/booking" className="mh-btn mh-btn--primary mh-btn--lg">See packages &amp; book</a>
          <a href="#portfolio" className="mh-btn mh-btn--glass mh-btn--lg">View our work</a>
        </div>
      </div>

      {slides.length > 0 && (
        <div className="mh-hero__foot">
          {current && (
            <button type="button" className="mh-hero__caption" onClick={() => onOpen(current.variant_type)}>
              <span className="mh-hero__caption-k">Now showing</span>
              <span key={current.variant_type} className="mh-hero__caption-v">{labelFor(current.variant_type)} →</span>
            </button>
          )}
          <div className="mh-hero__dots" role="tablist" aria-label="Slides">
            {slides.map((s, n) => (
              <button
                key={s.variant_type}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={`Show ${labelFor(s.variant_type)}`}
                className={n === i ? "is-active" : n < i ? "is-done" : ""}
                onClick={() => setI(n)}
              >
                <span style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? "paused" : "running" }} />
              </button>
            ))}
          </div>
        </div>
      )}
      <a href="#portfolio" className="mh-scrollcue" aria-label="Scroll to portfolio"><span /></a>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Marquee                                                             */
/* ------------------------------------------------------------------ */

const MARQUEE = ["Weddings", "Indian & multi-day weddings", "Engagements", "Maternity", "Graduations", "Birthdays", "Corporate events", "Brand content", "Drone", "Live streaming"];

function Marquee() {
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className="mh-marquee" aria-label={MARQUEE.join(", ")}>
      <div className="mh-marquee__track" aria-hidden="true">
        {items.map((t, n) => <span key={n}>{t}<i>✦</i></span>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio                                                           */
/* ------------------------------------------------------------------ */

/** Tile sizes for a 4-column mosaic that always fills complete rows (no gaps).
 *  Pattern: [big + 4 small] then [wide + wide], repeated; leftovers fill the last row. */
function mosaicSizes(count) {
  const out = [];
  let left = count;
  while (left > 0) {
    if (left >= 5) { out.push("big", "s", "s", "s", "s"); left -= 5; if (left >= 2 && left !== 3) { out.push("wide", "wide"); left -= 2; } continue; }
    if (left === 4) out.push("s", "s", "s", "s");
    else if (left === 3) out.push("s", "s", "wide");
    else if (left === 2) out.push("wide", "wide");
    else out.push("full");
    left = 0;
  }
  return out;
}

function Portfolio({ folders, error, onOpen }) {
  const sizes = useMemo(() => mosaicSizes(folders?.length || 0), [folders]);
  return (
    <section id="portfolio" className="mh-section">
      <div className="mh-container">
        <SectionHead eyebrow="Our work" title="Stories we've told" text="Browse a few of our favorite sessions. Tap any collection to see every photo." />
        {error && <p className="mh-muted">Our portfolio is taking a moment to load. Please refresh in a few seconds.</p>}
        <div className="mh-bento">
          {!folders && !error && Array.from({ length: 6 }).map((_, n) => <div key={n} className="mh-tile mh-tile--skeleton" />)}
          {folders?.map((f, n) => (
            <button
              key={f.variant_type}
              type="button"
              className={`mh-tile mh-tile--${sizes[n]}`}
              onClick={() => onOpen(f.variant_type)}
              data-reveal
              style={{ "--d": `${(n % 4) * 80}ms` }}
            >
              <img src={f.cover_image} alt={`${labelFor(f.variant_type)} photography by ${site.brand}`} loading="lazy" decoding="async" />
              <span className="mh-tile__shade" />
              <span className="mh-tile__meta">
                <span className="mh-tile__name">{labelFor(f.variant_type)}</span>
                <span className="mh-tile__count">{f.number_of_images} photos <i aria-hidden="true">→</i></span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Lightbox({ folder, folders, onClose, onSwitch }) {
  const [images, setImages] = useState(null);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef(null);
  const touch = useRef(null);
  const lastFocus = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    setImages(null); setI(0); setFailed(false);
    const ctrl = new AbortController();
    fetch(`${API_URL}/homepage/folders/${encodeURIComponent(folder)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((r) => setImages((r?.data || []).map((x) => x.image_url).filter(Boolean)))
      .catch((e) => { if (e.name !== "AbortError") setFailed(true); });
    return () => ctrl.abort();
  }, [folder]);

  const count = images?.length || 0;
  const go = useCallback((d) => count && setI((n) => (n + d + count) % count), [count]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const toRestore = lastFocus.current;
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener("keydown", onKey); toRestore?.focus?.(); };
  }, [go, onClose]);

  // Preload neighbours
  useEffect(() => {
    if (!count) return;
    [i + 1, i - 1].forEach((n) => { const img = new Image(); img.src = images[(n + count) % count]; });
  }, [i, count, images]);

  const idx = folders.findIndex((f) => f.variant_type === folder);
  const nextFolder = folders.length > 1 ? folders[(idx + 1) % folders.length]?.variant_type : null;

  return (
    <div className="mh-lightbox" role="dialog" aria-modal="true" aria-label={`${labelFor(folder)} gallery`}>
      <div className="mh-lightbox__top">
        <div>
          <p className="mh-eyebrow">Collection</p>
          <h2 className="mh-lightbox__title">{labelFor(folder)}</h2>
        </div>
        <div className="mh-lightbox__tools">
          {count > 0 && <span className="mh-lightbox__count" aria-live="polite">{i + 1} / {count}</span>}
          <button type="button" ref={closeRef} className="mh-icon-btn" onClick={onClose} aria-label="Close gallery">✕</button>
        </div>
      </div>

      <div
        className="mh-lightbox__stage"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touch.current = null; }}
      >
        {!images && !failed && <div className="mh-spinner" aria-label="Loading" />}
        {failed && <p className="mh-muted">Couldn't load this collection. Please try again.</p>}
        {images?.map((src, n) => (
          Math.abs(n - i) <= 1 || (i === 0 && n === count - 1) || (i === count - 1 && n === 0) ? (
            <img key={src} src={src} alt={`${labelFor(folder)} photo ${n + 1} of ${count}`} className={`mh-lightbox__img ${n === i ? "is-active" : ""}`} decoding="async" />
          ) : null
        ))}
        {count > 1 && (
          <>
            <button type="button" className="mh-icon-btn mh-lightbox__prev" onClick={() => go(-1)} aria-label="Previous photo">←</button>
            <button type="button" className="mh-icon-btn mh-lightbox__next" onClick={() => go(1)} aria-label="Next photo">→</button>
          </>
        )}
      </div>

      <div className="mh-lightbox__bottom">
        {count > 1 && (
          <div className="mh-lightbox__bar"><span style={{ width: `${((i + 1) / count) * 100}%` }} /></div>
        )}
        <div className="mh-lightbox__actions">
          {nextFolder && <button type="button" className="mh-link" onClick={() => onSwitch(nextFolder)}>Next collection: {labelFor(nextFolder)} →</button>}
          <a href="/booking" className="mh-btn mh-btn--primary mh-btn--sm">Book a session like this</a>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Packages (live data from the booking catalog)                       */
/* ------------------------------------------------------------------ */

const TABS = [
  ["wedding", "Weddings"],
  ["multi_event_wedding", "Multi-day weddings"],
  ["small_event", "Portraits & events"],
];

function Packages() {
  const [tab, setTab] = useState("wedding");
  const pkgs = CATALOG.packages.filter((p) => p.categories.includes(tab));
  const cat = CATALOG.categories.find((c) => c.id === tab);
  const tabRefs = useRef({});
  const [ind, setInd] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  useEffect(() => {
    const onR = () => { const el = tabRefs.current[tab]; if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth }); };
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [tab]);

  return (
    <section id="packages" className="mh-section mh-section--alt">
      <div className="mh-container">
        <SectionHead eyebrow="Packages" title="Clear prices. No surprises." text="Every wedding package includes photos and a film. Pick a starting point, then make it yours on the booking page." />
        <div className="mh-tabs" role="tablist" aria-label="Package type" data-reveal>
          <span className="mh-tabs__ind" style={{ transform: `translateX(${ind.left}px)`, width: ind.width }} aria-hidden="true" />
          {TABS.map(([id, l]) => (
            <button key={id} ref={(el) => { tabRefs.current[id] = el; }} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
              {l}
            </button>
          ))}
        </div>
        <p className="mh-muted mh-center mh-tabs__desc">{cat?.description}</p>

        <div key={tab} className="mh-pkgs" role="tabpanel">
          {pkgs.map((p, n) => (
            <article key={p.id} className={`mh-pkg ${p.popular ? "is-popular" : ""}`} style={{ "--d": `${n * 70}ms` }}>
              {p.popular && <span className="mh-pkg__badge">Most popular</span>}
              <h3 className="mh-pkg__name">{tab === "multi_event_wedding" && p.multiEventLabel ? p.multiEventLabel : p.name}</h3>
              <p className="mh-pkg__price">{formatUSD(p.price)}</p>
              <p className="mh-pkg__meta">{p.hoursLabel || `${p.hours} hour${p.hours > 1 ? "s" : ""}`} · {p.team}</p>
              <ul className="mh-pkg__list">
                {(p.receive || []).slice(0, 4).map((x) => <li key={x}>{x}</li>)}
              </ul>
              <a href={`/booking?category=${tab}&package=${p.id}`} className="mh-btn mh-btn--outline mh-btn--block">Choose {p.name}</a>
            </article>
          ))}
        </div>
        <p className="mh-center mh-muted mh-small">{CATALOG.business.travelNote} Add-ons like drone, live stream, albums and extra hours are on the booking page.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Process                                                             */
/* ------------------------------------------------------------------ */

const STEPS = [
  ["Book your package", "Choose a package online and send your request. It's free, and nothing is charged online."],
  ["Consultation call", "A short call to go through your plans, confirm your date and answer questions."],
  ["Plan together", "Timeline, shot list and moodboard, shared in your private client workspace."],
  ["The day", "A calm, prepared team with backup cameras and audio, so nothing is missed."],
  ["Delivery", "Sneak peeks first, then your full online gallery and film, with print release."],
];

function Process() {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);
  const y = useScrollY();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = (vh * 0.7 - r.top) / (r.height);
    setProgress(Math.max(0, Math.min(1, p)));
  }, [y]);

  return (
    <section id="process" className="mh-section">
      <div className="mh-container mh-process">
        <SectionHead eyebrow="How it works" title="From hello to your gallery" text="A simple, transparent process. You always know what happens next." align="left" />
        <ol className="mh-steps" ref={ref}>
          <span className="mh-steps__line" aria-hidden="true"><span style={{ transform: `scaleY(${progress})` }} /></span>
          {STEPS.map(([t, d], n) => (
            <li key={t} className={progress * STEPS.length > n + 0.15 ? "is-lit" : ""} data-reveal style={{ "--d": `${n * 60}ms` }}>
              <span className="mh-steps__num">{String(n + 1).padStart(2, "0")}</span>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function CountUp({ to, suffix }) {
  const ref = useRef(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) { setV(to); return undefined; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 1400);
        setV(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{v}{suffix}</span>;
}

function Stats() {
  if (!site.stats?.length) return null;
  return (
    <section className="mh-stats" aria-label="In numbers">
      <div className="mh-container mh-stats__grid">
        {site.stats.map((s) => (
          <div key={s.label} className="mh-stat" data-reveal>
            <strong><CountUp to={s.value} suffix={s.suffix} /></strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Why Midori                                                          */
/* ------------------------------------------------------------------ */

const WHY = [
  ["Photo and film, one team", "Every wedding package includes both, shot by people who plan together and never get in each other's way."],
  ["Backups for everything", "Two camera bodies per shooter, backup audio recorders and cloud backup, so nothing is lost."],
  ["Your own client workspace", "Timeline, moodboard, music, invoices and files in one private place, with every step visible."],
  ["Delivery dates you can count on", "Sneak peeks in 24-72 hours, galleries in 2-6 weeks, films in 4-12 weeks, written into your package."],
];

function Why() {
  return (
    <section className="mh-section mh-section--alt">
      <div className="mh-container">
        <SectionHead eyebrow="Why Midori" title="Calm on the day. Careful after it." />
        <div className="mh-why">
          {WHY.map(([t, d], n) => (
            <div key={t} className="mh-why__item" data-reveal style={{ "--d": `${n * 80}ms` }}>
              <span className="mh-why__icon" aria-hidden="true">{["◐", "◎", "▣", "◷"][n]}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Partners & testimonials (only real content from siteConfig)         */
/* ------------------------------------------------------------------ */

function Partners() {
  const list = (site.partners || []).filter((p) => p.name);
  if (!list.length) return null;
  return (
    <section className="mh-partners" aria-label="Brands we've worked with">
      <div className="mh-container">
        <p className="mh-eyebrow mh-center">Brands we've worked with</p>
        <div className="mh-partners__row" data-reveal>
          {list.map((p) => (
            <span key={p.name} className="mh-partner">
              {p.logo ? <img src={p.logo} alt={p.name} loading="lazy" /> : p.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const list = site.testimonials || [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (list.length < 2 || prefersReducedMotion()) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % list.length), 7000);
    return () => clearTimeout(t);
  }, [i, list.length]);
  if (!list.length) return null;
  const q = list[i];
  return (
    <section className="mh-section">
      <div className="mh-container mh-quote">
        <p className="mh-eyebrow mh-center">Kind words</p>
        <blockquote key={i} className="mh-quote__text">“{q.quote}”</blockquote>
        <p className="mh-quote__who">{q.name}{q.event ? ` · ${q.event}` : ""}</p>
        {list.length > 1 && (
          <div className="mh-quote__dots">
            {list.map((_, n) => <button key={n} type="button" aria-label={`Review ${n + 1}`} className={n === i ? "is-active" : ""} onClick={() => setI(n)} />)}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

const price = (id) => formatUSD(CATALOG.packages.find((p) => p.id === id)?.price);
const FAQS = [
  ["How do I book?", "Choose a package on our booking page and send your request. It's free and nothing is charged online. Then pick a time for a short call. We confirm your date and send your contract and deposit details."],
  ["Do your wedding packages include video?", "Yes. All five wedding packages include photos and a film, from a 3-5 minute highlight film in Essential to a 10-20 minute documentary-style film in Legacy."],
  ["When will we get our photos and film?", "Weddings: sneak peeks in 24-72 hours, the full gallery in 4-6 weeks and the film in 8-12 weeks, depending on your package. Small events: previews in 48 hours and the gallery in 2-3 weeks."],
  ["Do you cover Indian and multi-day weddings?", `Yes. An event day plus the wedding day is ${price("two_day_wedding")}, a three-day wedding (such as mehndi, sangeet and wedding) is ${price("three_day_wedding")}, and Legacy (${price("legacy")}) covers the wedding plus one event in one booking.`],
  ["Do you travel?", `We're based in ${site.location} and serve ${site.serviceArea}. Travel fees may apply outside the Kansas City area, and we confirm any fee before you book.`],
  ["Is drone included?", "Drone is included from the Classic package up, and is a $250 add-on for Essential and small outdoor events. Flights depend on FAA rules, the venue, airspace and the weather."],
  ["Can we print our photos?", "Yes. Every package includes an online gallery and a print release."],
  ["Can we add more time on the day?", "Yes. Extra hours are available on every package, from $175 to $450 per hour depending on the package."],
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="mh-section mh-section--alt">
      <div className="mh-container mh-faq">
        <SectionHead eyebrow="FAQ" title="Good questions" align="left" text={<>Something else? <a className="mh-link" href={`mailto:${site.contact.email}`}>Email us</a>, we reply within 24 hours.</>} />
        <div className="mh-faq__list">
          {FAQS.map(([q, a], n) => (
            <div key={q} className={`mh-faq__item ${open === n ? "is-open" : ""}`} data-reveal style={{ "--d": `${n * 40}ms` }}>
              <h3>
                <button type="button" aria-expanded={open === n} aria-controls={`faq-${n}`} id={`faq-q-${n}`} onClick={() => setOpen(open === n ? -1 : n)}>
                  {q}<span className="mh-faq__icon" aria-hidden="true" />
                </button>
              </h3>
              <div className="mh-faq__a" id={`faq-${n}`} role="region" aria-labelledby={`faq-q-${n}`}>
                <div><p>{a}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CTA & footer                                                        */
/* ------------------------------------------------------------------ */

function Cta() {
  return (
    <section className="mh-cta">
      <div className="mh-cta__glow" aria-hidden="true" />
      <div className="mh-container mh-center" data-reveal>
        <p className="mh-eyebrow">Your date is waiting</p>
        <h2 className="mh-cta__title">Let's make something<br />you'll keep forever.</h2>
        <p className="mh-muted mh-cta__text">See your price in two minutes. No payment, no pressure.</p>
        <div className="mh-hero__actions mh-center-row">
          <a href="/booking" className="mh-btn mh-btn--primary mh-btn--lg">Start your booking</a>
          <a href={`mailto:${site.contact.email}`} className="mh-btn mh-btn--glass mh-btn--lg">Ask a question</a>
        </div>
      </div>
    </section>
  );
}

const SOCIAL_LABELS = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", linkedin: "LinkedIn" };

function Footer() {
  const socials = Object.entries(site.social || {}).filter(([, url]) => url);
  return (
    <footer className="mh-footer">
      <div className="mh-container mh-footer__grid">
        <div>
          <a href="/" className="mh-logo"><span className="mh-logo__mark" aria-hidden="true">M</span><span>{site.brand}</span></a>
          <p className="mh-muted mh-small">{site.tagline} in {site.location}.<br />Serving {site.serviceArea}.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <a href="#portfolio">Portfolio</a>
          <a href="#packages">Packages</a>
          <a href="#process">How it works</a>
          <a href="#faq">FAQ</a>
        </div>
        <div>
          <h4>Book</h4>
          <a href="/booking?category=wedding">Weddings</a>
          <a href="/booking?category=multi_event_wedding">Multi-day weddings</a>
          <a href="/booking?category=small_event">Portraits &amp; events</a>
          <a href="/workspace">Client login</a>
        </div>
        <div>
          <h4>Contact</h4>
          {site.contact.email && <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>}
          {site.contact.phone && <a href={`tel:${site.contact.phone.replace(/[^\d+]/g, "")}`}>{site.contact.phone}</a>}
          {socials.map(([k, url]) => <a key={k} href={url} target="_blank" rel="noreferrer">{SOCIAL_LABELS[k] || k}</a>)}
        </div>
      </div>
      <div className="mh-container mh-footer__base">
        <span>© {new Date().getFullYear()} {site.legalName}</span>
        <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" }); }}>Back to top ↑</a>
      </div>
    </footer>
  );
}

function SectionHead({ eyebrow, title, text, align = "center" }) {
  return (
    <div className={`mh-head mh-head--${align}`} data-reveal>
      <p className="mh-eyebrow">{eyebrow}</p>
      <h2 className="mh-h2">{title}</h2>
      {text && <p className="mh-muted mh-head__text">{text}</p>}
    </div>
  );
}

/** Helps Google show your business details. Only uses real values from siteConfig. */
function LocalBusinessSchema() {
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: site.legalName,
    description: "Wedding, portrait and event photography and film.",
    url: typeof window !== "undefined" ? window.location.origin : undefined,
    email: site.contact.email || undefined,
    telephone: site.contact.phone || undefined,
    address: { "@type": "PostalAddress", addressLocality: "Overland Park", addressRegion: "KS", addressCountry: "US" },
    areaServed: ["Kansas", "Missouri"],
    priceRange: `${formatUSD(300)}-${formatUSD(11900)}`,
    sameAs: Object.values(site.social || {}).filter(Boolean),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
