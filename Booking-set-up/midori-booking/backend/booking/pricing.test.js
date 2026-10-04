// Run: node --test booking/
// Every expected number below is copied from the Midori Package Guide.
import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "./catalog.js";
import { computeQuote, addonStatus } from "./pricing.js";

const q = (category, packageId, addons = [], extraHours = 0, outdoor = false) =>
  computeQuote(CATALOG, { category, packageId, addons, extraHours, outdoor });

test("wedding package prices (Part 1)", () => {
  for (const [id, price] of [["essential", 2500], ["classic", 3800], ["signature", 5000], ["premier", 6900], ["legacy", 10500]]) {
    assert.equal(q("wedding", id).total, price, id);
  }
});

test("wedding extra hour rates (Part 1 side-by-side)", () => {
  for (const [id, base, rate] of [["essential", 2500, 250], ["classic", 3800, 250], ["signature", 5000, 350], ["premier", 6900, 350], ["legacy", 10500, 450]]) {
    assert.equal(q("wedding", id, [], 2).total, base + 2 * rate, id);
  }
});

test("wedding add-ons (Part 2)", () => {
  assert.equal(q("wedding", "essential", ["engagement_session"]).total, 2950);
  assert.equal(q("wedding", "essential", ["drone_wedding"]).total, 2750);
  assert.equal(q("wedding", "classic", ["toasts_film"]).total, 4200);
  assert.equal(q("wedding", "premier", ["raw_video_wedding"]).total, 7450);
  assert.equal(q("wedding", "classic", ["rehearsal_dinner"]).total, 4400);
  assert.equal(q("wedding", "classic", ["album_10x10"]).total, 4400);
  assert.equal(q("wedding", "premier", ["album_10x10"]).total, 7000, "Premier has a $500 album credit");
  assert.equal(q("wedding", "legacy", ["content_creator", "livestream_wedding"]).total, 10500 + 950 + 1250);
});

test("add-ons already included are not charged", () => {
  const r = q("wedding", "legacy", ["album_10x10", "raw_video_wedding"]);
  assert.equal(r.ok, true);
  assert.equal(r.total, 10500);
  assert.equal(addonStatus(CATALOG.addons.find((a) => a.id === "toasts_film"), "signature"), "included");
});

test("add-ons not offered for a package are rejected", () => {
  assert.equal(q("wedding", "classic", ["engagement_session"]).ok, true, "classic includes engagement: ignored, not charged");
  assert.equal(q("wedding", "classic", ["engagement_session"]).total, 3800);
  assert.equal(q("wedding", "essential", ["highlight_video"]).ok, false);
  assert.equal(q("wedding", "essential", ["nonsense"]).ok, false);
});

test("multi-event weddings (Part 2)", () => {
  assert.equal(q("multi_event_wedding", "premier").total, 6900);
  assert.equal(q("multi_event_wedding", "two_day_wedding").total, 9400);
  assert.equal(q("multi_event_wedding", "three_day_wedding").total, 11900);
  assert.equal(q("multi_event_wedding", "legacy").total, 10500);
  assert.equal(q("multi_event_wedding", "essential").ok, false, "Essential alone is not a multi-event option");
});

test("small event packages and extra hours (Part 3)", () => {
  for (const [id, price, rate] of [["quick_session", 300, 175], ["mini_moment", 450, 175], ["photo_reel", 700, 200], ["event_film", 1300, 300], ["full_event", 1800, 300]]) {
    assert.equal(q("small_event", id).total, price, id);
    assert.equal(q("small_event", id, [], 1).total, price + rate, `${id} +1h`);
  }
});

test("small event extras (Part 3)", () => {
  assert.equal(q("small_event", "mini_moment", ["drone_small"], 0, true).total, 700);
  assert.equal(q("small_event", "mini_moment", ["drone_small"], 0, false).ok, false, "drone is outdoor only");
  assert.equal(q("small_event", "full_event", ["drone_small"], 0, true).total, 1800, "included in Full Event");
  assert.equal(q("small_event", "event_film", ["livestream_1cam"]).total, 2050);
  assert.equal(q("small_event", "event_film", ["livestream_2cam"]).total, 2550);
  assert.equal(q("small_event", "event_film", ["livestream_1cam", "livestream_2cam"]).ok, false);
  assert.equal(q("small_event", "mini_moment", ["short_reel"]).total, 700);
  assert.equal(q("small_event", "mini_moment", ["highlight_video"]).total, 1300);
  assert.equal(q("small_event", "event_film", ["full_event_video"]).total, 1600);
  assert.equal(q("small_event", "full_event", ["full_event_video"]).total, 2300);
  assert.equal(q("small_event", "mini_moment", ["full_event_video"]).ok, false, "needs a videographer");
  assert.equal(q("small_event", "mini_moment", ["highlight_video", "full_event_video"]).total, 450 + 850 + 300);
  assert.equal(q("small_event", "photo_reel", ["raw_video_small"]).total, 950);
  assert.equal(q("small_event", "full_event", ["raw_video_small"]).total, 2200);
  assert.equal(q("small_event", "quick_session", ["raw_video_small"]).ok, false, "only on packages with video");
  assert.equal(q("small_event", "quick_session", ["unedited_photos"]).total, 450);
});

test("rush delivery is +25% and excludes live streams", () => {
  assert.equal(q("small_event", "mini_moment", ["rush_delivery"]).total, 450 + 113);
  assert.equal(q("small_event", "event_film", ["rush_delivery", "livestream_1cam"]).total, 1300 + 750 + 325);
  assert.equal(q("wedding", "classic", ["rush_delivery"]).ok, false, "rush is a small-event extra");
});

test("input validation", () => {
  assert.equal(computeQuote(CATALOG, {}).ok, false);
  assert.equal(q("wedding", "classic", [], -1).ok, false);
  assert.equal(q("wedding", "classic", [], 1.5).ok, false);
  assert.equal(q("wedding", "classic", [], 99).ok, false);
  assert.equal(q("small_event", "classic").ok, false, "package must match the category");
  assert.equal(computeQuote(CATALOG, { category: "wedding", packageId: "classic", addons: "drone" }).ok, false);
});
