// Pure pricing engine shared by the backend (authoritative) and the website (live totals).
// No imports: pass the catalog in. Amounts are whole US dollars.

export function addonPrice(addon, packageId) {
  if (addon.percent) return null;
  if (addon.priceByPackage) return addon.priceByPackage[packageId] ?? null;
  return addon.price ?? null;
}

/** Add-on availability for a package: "available" | "included" | "unavailable". */
export function addonStatus(addon, packageId) {
  if (addon.includedIn?.includes(packageId)) return "included";
  if (addon.appliesTo?.includes(packageId)) return "available";
  return "unavailable";
}

export function packagesForCategory(catalog, categoryId) {
  return catalog.packages.filter((p) => p.categories.includes(categoryId));
}

/**
 * selection = {
 *   category: "wedding" | "multi_event_wedding" | "small_event",
 *   packageId: string,
 *   extraHours: integer 0..maxExtraHours,
 *   addons: string[],
 *   outdoor: boolean   // needed for drone on small events
 * }
 * Returns { ok, errors[], lines[], subtotal, total, deposit... }
 */
export function computeQuote(catalog, selection = {}) {
  const errors = [];
  const notes = [];
  const lines = [];

  const category = catalog.categories.find((c) => c.id === selection.category);
  if (!category) errors.push({ field: "category", message: "Choose a service." });

  const pkg = catalog.packages.find((p) => p.id === selection.packageId);
  if (!pkg) errors.push({ field: "packageId", message: "Choose a package." });
  else if (category && !pkg.categories.includes(category.id)) {
    errors.push({ field: "packageId", message: `${pkg.name} is not available for ${category.label}.` });
  }

  const extraHoursRaw = selection.extraHours ?? 0;
  const extraHours = Number(extraHoursRaw);
  if (!Number.isInteger(extraHours) || extraHours < 0 || extraHours > catalog.maxExtraHours) {
    errors.push({ field: "extraHours", message: `Extra hours must be a whole number from 0 to ${catalog.maxExtraHours}.` });
  }

  const requested = Array.isArray(selection.addons) ? [...new Set(selection.addons.map(String))] : [];
  if (selection.addons !== undefined && !Array.isArray(selection.addons)) {
    errors.push({ field: "addons", message: "Add-ons must be a list." });
  }

  if (errors.length) return { ok: false, errors, lines: [], subtotal: 0, total: 0, notes };

  // Package
  lines.push({ id: `package:${pkg.id}`, kind: "package", label: `${pkg.name} package`, amount: pkg.price });

  // Extra hours
  if (extraHours > 0) {
    lines.push({
      id: "extra_hours",
      kind: "extra_hours",
      label: `Extra coverage, ${extraHours} hour${extraHours > 1 ? "s" : ""} × $${pkg.extraHourRate}`,
      amount: extraHours * pkg.extraHourRate,
      quantity: extraHours,
      unitPrice: pkg.extraHourRate,
    });
  }

  // Add-ons
  let percentAddon = null;
  for (const id of requested) {
    const addon = catalog.addons.find((a) => a.id === id);
    if (!addon) {
      errors.push({ field: "addons", message: `Unknown add-on: ${id}` });
      continue;
    }
    const status = addonStatus(addon, pkg.id);
    if (status === "included") {
      notes.push(`${addon.label} is already included in ${pkg.name}.`);
      continue;
    }
    if (status === "unavailable") {
      errors.push({ field: "addons", message: `${addon.label} is not available with ${pkg.name}.` });
      continue;
    }
    if (addon.requiresOutdoor && !selection.outdoor) {
      errors.push({ field: "addons", message: `${addon.label} is only available for outdoor events.` });
      continue;
    }
    const needs = [...(addon.requires || []), ...((addon.requiresByPackage || {})[pkg.id] || [])];
    const missing = needs.filter((n) => !requested.includes(n));
    if (missing.length) {
      const names = missing.map((m) => catalog.addons.find((a) => a.id === m)?.label || m).join(", ");
      errors.push({ field: "addons", message: `${addon.label} needs ${names} with ${pkg.name}.` });
      continue;
    }
    const clash = (addon.excludes || []).find((x) => requested.includes(x));
    if (clash) {
      const other = catalog.addons.find((a) => a.id === clash);
      errors.push({ field: "addons", message: `Choose either ${addon.label} or ${other?.label || clash}, not both.` });
      continue;
    }
    if (addon.percent) {
      percentAddon = addon;
      continue;
    }
    const price = addonPrice(addon, pkg.id);
    const credit = addon.creditByPackage?.[pkg.id] || 0;
    const amount = Math.max(0, price - credit);
    lines.push({
      id: `addon:${addon.id}`,
      kind: "addon",
      label: addon.label,
      amount,
      ...(credit ? { detail: `$${price}${addon.priceIsFrom ? " starting price" : ""} less $${credit} album credit included in ${pkg.name}` } : {}),
      ...(addon.priceIsFrom ? { from: true } : {}),
    });
  }

  if (errors.length) return { ok: false, errors, lines: [], subtotal: 0, total: 0, notes };

  // Rush (percentage). Applies to package, extra hours and editing extras, not live streams.
  if (percentAddon) {
    const base = lines
      .filter((l) => !/^addon:livestream/.test(l.id))
      .reduce((s, l) => s + l.amount, 0);
    lines.push({
      id: `addon:${percentAddon.id}`,
      kind: "addon",
      label: `${percentAddon.label} (+${percentAddon.percent}%)`,
      amount: Math.round((base * percentAddon.percent) / 100),
      detail: `${percentAddon.percent}% of $${base}`,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const hasFromPrice = lines.some((l) => l.from);
  if (hasFromPrice) notes.push("The album price is a starting price; the final price depends on the album you choose.");

  return {
    ok: true,
    errors: [],
    notes,
    catalogVersion: catalog.version,
    currency: catalog.currency,
    package: { id: pkg.id, name: pkg.name, price: pkg.price },
    lines,
    subtotal,
    total: subtotal,
    isEstimate: hasFromPrice,
  };
}

export const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
