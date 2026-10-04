// Small API client for the booking flow. Uses the same backend as the rest of the site.
// Set VITE_API_URL in your .env to point at another backend (e.g. a staging server).
export const API_URL = (import.meta.env.VITE_API_URL || "https://photographyfreelancebackend.onrender.com").replace(/\/$/, "");

async function request(path, { method = "GET", body, signal, credentials } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
      credentials,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    const e = new Error("We couldn't reach our server. Check your connection and try again.");
    e.network = true;
    throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const e = new Error(data?.message || data?.errors?.[0]?.message || "Something went wrong. Please try again.");
    e.status = res.status;
    e.errors = data?.errors || [];
    throw e;
  }
  return data;
}

export const getCatalog = (signal) => request("/booking/catalog", { signal });
export const submitBooking = (payload) => request("/booking/requests", { method: "POST", body: payload });
export const attachCall = (reference, body) => request(`/booking/requests/${encodeURIComponent(reference)}/call`, { method: "POST", body });

// Admin (uses the logged-in admin's cookie)
export const listBookings = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString();
  return request(`/booking/requests${qs ? `?${qs}` : ""}`, { credentials: "include" });
};
export const updateBooking = (id, body) => request(`/booking/requests/${id}`, { method: "PUT", body, credentials: "include" });
