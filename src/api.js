function normalizeRoot(value, fallback = "/api") {
  const raw = String(value || "").trim()
  if (!raw) return fallback
  return raw.endsWith("/") ? raw.slice(0, -1) : raw
}

const API_ROOT = normalizeRoot(import.meta.env.VITE_API_ROOT, "/api")

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json") ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status}).`)
  }

  return payload
}

async function send(path, { method = "GET", body } = {}) {
  const request = {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }

  const response = await fetch(`${API_ROOT}${path}`, request)

  if (response.status === 404 && API_ROOT === "/api") {
    const fallbackResponse = await fetch(path, request)
    return parseResponse(fallbackResponse)
  }

  return parseResponse(response)
}

export const api = {
  getPublicInventory() {
    return send("/public/inventory")
  },
  createRequest(payload) {
    return send("/public/requests", { method: "POST", body: payload })
  },
  getRequest(requestId) {
    return send(`/public/requests/${requestId}`)
  },
  createCheckoutSession(payload) {
    return send("/public/checkout-session", { method: "POST", body: payload })
  },
  adminSession() {
    return send("/admin/session")
  },
  adminLogin(password) {
    return send("/admin/login", { method: "POST", body: { password } })
  },
  adminLogout() {
    return send("/admin/logout", { method: "POST" })
  },
  adminDashboard() {
    return send("/admin/dashboard")
  },
  updateRequestStatus(requestId, status) {
    return send(`/admin/requests/${requestId}`, { method: "PATCH", body: { status } })
  },
  convertRequest(requestId) {
    return send(`/admin/requests/${requestId}/convert`, { method: "POST" })
  },
  updateBookingStatus(bookingId, status) {
    return send(`/admin/bookings/${bookingId}/status`, { method: "PATCH", body: { status } })
  },
  updateSawStatus(sawId, status) {
    return send(`/admin/saws/${sawId}/status`, { method: "PATCH", body: { status } })
  },
}

