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
  createCryptoPayment(requestId, payload) {
    return send(`/public/requests/${requestId}/crypto-payment`, { method: "POST", body: payload })
  },
  submitCryptoTxid(requestId, payload) {
    return send(`/public/requests/${requestId}/crypto-payment/txid`, { method: "POST", body: payload })
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
  updateSettings(payload) {
    return send("/admin/settings", { method: "PATCH", body: payload })
  },
  createMaintenanceRecord(payload) {
    return send("/admin/maintenance", { method: "POST", body: payload })
  },
  updateMaintenanceRecord(recordId, payload) {
    return send(`/admin/maintenance/${recordId}`, { method: "PATCH", body: payload })
  },
  updateRequestStatus(requestId, status) {
    return send(`/admin/requests/${requestId}`, { method: "PATCH", body: { status } })
  },
  updateCryptoPayment(requestId, payload) {
    return send(`/admin/requests/${requestId}/crypto-payment`, { method: "PATCH", body: payload })
  },
  runCryptoMonitor() {
    return send("/admin/crypto-monitor/run", { method: "POST" })
  },
  markCryptoAlertReviewed(requestId, reviewKey) {
    return send(`/admin/requests/${requestId}/crypto-alert`, { method: "PATCH", body: { reviewKey } })
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

