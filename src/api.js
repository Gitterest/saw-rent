import { BACKEND_UNAVAILABLE_MESSAGE, getApiRoot } from "./runtimeConfig"

const API_ROOT = getApiRoot()

async function readPayload(response) {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

async function parseResponse(response, payload = undefined) {
  const responsePayload = payload === undefined ? await readPayload(response) : payload
  if (!response.ok) {
    throw new Error(responsePayload?.error || `Request failed (${response.status}).`)
  }

  return responsePayload
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

  let response
  try {
    response = await fetch(`${API_ROOT}${path}`, request)
  } catch {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE)
  }

  let payload
  if (response.status === 404 && API_ROOT === "/api") {
    payload = await readPayload(response.clone())
    const shouldTryLegacyPath = !payload || payload.error === "API endpoint not found."
    if (!shouldTryLegacyPath) {
      return parseResponse(response, payload)
    }

    let fallbackResponse
    try {
      fallbackResponse = await fetch(path, request)
    } catch {
      throw new Error(BACKEND_UNAVAILABLE_MESSAGE)
    }
    return parseResponse(fallbackResponse)
  }

  return parseResponse(response, payload)
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

