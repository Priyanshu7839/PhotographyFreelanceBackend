// Removes secret fields from every JSON response, wherever they come from
// (many queries use select("*")). Defense in depth: never send hashes to a browser.
const SECRET_KEYS = new Set(["password", "password_hash", "manage_token_hash", "access_token"]);

function scrub(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value instanceof Date) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!SECRET_KEYS.has(k)) out[k] = scrub(v, depth + 1);
  }
  return out;
}

export function stripSecrets(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => json(scrub(body));
  next();
}
