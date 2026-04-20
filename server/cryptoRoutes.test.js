import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

process.env.SAW_RENT_NO_AUTOSTART = "1"
process.env.ADMIN_PASSWORD = "route-test-password"
process.env.ADMIN_SESSION_SECRET = "route-test-secret-with-enough-length"
process.env.CRYPTO_PAYMENT_EXPIRATION_MINUTES = "30"
process.env.CRYPTO_MODE = "static_txid"
process.env.CRYPTO_DESTINATION_PROVIDER = "static_txid"
process.env.CRYPTO_MONITORING_PROVIDER = "none"
process.env.CRYPTO_BTC_STATIC_ADDRESS = "bc1qroutebtcstaticreceiveaddress000000000000000"
process.env.CRYPTO_XMR_STATIC_ADDRESS = "43RouteStaticXmrReceiveAddressForSawRentTestingOnly0000000000000000000000000000000000000000"

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "saw-rent-crypto-routes-"))
process.env.SAW_RENT_DATA_PATH = path.join(tempDir, "data.json")

const { createApp } = await import("./index.js?crypto-routes-test")
const { mutateState } = await import("./store.js")
const { StaticCryptoRateProvider } = await import("./cryptoRates.js")
const { CryptoPaymentMonitor, StaticCryptoMonitorProvider } = await import("./cryptoMonitoring.js")

function listen(app) {
  app.use((error, _req, res, next) => {
    void next
    const status = Number(error?.status || 500)
    res.status(status).json({ error: error.message || "Internal server error." })
  })

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address()
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
  })
}

async function requestJson(baseUrl, pathName, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json()
  return { response, payload }
}

async function createPublicRequest(baseUrl, sawId, suffix = "A") {
  const { response, payload } = await requestJson(baseUrl, "/api/public/requests", {
    method: "POST",
    body: {
      name: `Crypto Tester ${suffix}`,
      phone: `555010${suffix.charCodeAt(0)}`,
      sawId,
      startDate: "2026-04-20",
      endDate: "2026-04-20",
      pickupPreference: "pickup",
      notes: "Route test",
    },
  })

  assert.equal(response.status, 201)
  return payload.request
}

async function loginAdmin(baseUrl) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  })
  assert.equal(response.status, 200)
  return response.headers.get("set-cookie")
}

test("crypto routes create static quotes, submit txids, confirm, and reject stale payment instructions", async () => {
  const monitorObservations = []
  const { server, baseUrl } = await listen(createApp({
    cryptoRateProvider: new StaticCryptoRateProvider({ BTC: 55000, XMR: 140 }, "route-test"),
    cryptoMonitor: new CryptoPaymentMonitor({
      provider: new StaticCryptoMonitorProvider(monitorObservations),
      minConfirmations: { BTC: 1, XMR: 10 },
    }),
  }))

  try {
    const inventory = await requestJson(baseUrl, "/api/public/inventory")
    const sawId = inventory.payload.saws[0].id
    const cookie = await loginAdmin(baseUrl)

    const firstRequest = await createPublicRequest(baseUrl, sawId, "A")
    const firstCrypto = await requestJson(baseUrl, `/api/public/requests/${firstRequest.id}/crypto-payment`, {
      method: "POST",
      body: { currency: "BTC" },
    })

    assert.equal(firstCrypto.response.status, 201)
    assert.equal(firstCrypto.payload.request.paymentMethod, "crypto")
    assert.equal(firstCrypto.payload.request.paymentStatus, "awaiting_crypto_payment")
    assert.equal(firstCrypto.payload.request.cryptoCurrency, "BTC")
    assert.equal(firstCrypto.payload.request.cryptoRateSource, "route-test")
    assert.equal(firstCrypto.payload.request.cryptoRateUsd, 55000)
    assert.equal(firstCrypto.payload.request.depositUsdAmount, 220)
    assert.equal(firstCrypto.payload.request.refundableUsdAmount, 220)
    assert.equal(firstCrypto.payload.request.cryptoAddress, process.env.CRYPTO_BTC_STATIC_ADDRESS)
    assert.match(firstCrypto.payload.request.cryptoQrData, /^bitcoin:/)

    const secondRequest = await createPublicRequest(baseUrl, sawId, "B")
    const secondCrypto = await requestJson(baseUrl, `/api/public/requests/${secondRequest.id}/crypto-payment`, {
      method: "POST",
      body: { currency: "BTC" },
    })
    assert.equal(firstCrypto.payload.request.cryptoAddress, secondCrypto.payload.request.cryptoAddress)

    monitorObservations.push({
      requestId: secondRequest.id,
      currency: "BTC",
      address: secondCrypto.payload.request.cryptoAddress,
      amount: secondCrypto.payload.request.expectedCryptoAmount || secondCrypto.payload.request.cryptoAmount,
      txid: "b".repeat(64),
      confirmations: 1,
    })

    const monitored = await requestJson(baseUrl, "/api/admin/crypto-monitor/run", {
      method: "POST",
      headers: { Cookie: cookie },
    })
    assert.equal(monitored.response.status, 200)
    const monitoredRequest = monitored.payload.dashboard.requests.find((request) => request.id === secondRequest.id)
    assert.equal(monitoredRequest.paymentStatus, "paid")
    assert.equal(monitoredRequest.monitoringState, "paid")
    assert.equal(monitoredRequest.receivedCryptoAmount, secondCrypto.payload.request.cryptoAmount)

    const submitted = await requestJson(baseUrl, `/api/public/requests/${firstRequest.id}/crypto-payment/txid`, {
      method: "POST",
      body: {
        txid: "a".repeat(64),
        note: "Sent from route test wallet",
      },
    })
    assert.equal(submitted.response.status, 200)
    assert.equal(submitted.payload.request.paymentStatus, "awaiting_txid_review")
    assert.equal(submitted.payload.request.customerSubmittedTxid, "a".repeat(64))

    const duplicateTxidRequest = await createPublicRequest(baseUrl, sawId, "D")
    await requestJson(baseUrl, `/api/public/requests/${duplicateTxidRequest.id}/crypto-payment`, {
      method: "POST",
      body: { currency: "BTC" },
    })
    const duplicateTxid = await requestJson(baseUrl, `/api/public/requests/${duplicateTxidRequest.id}/crypto-payment/txid`, {
      method: "POST",
      body: { txid: "a".repeat(64) },
    })
    assert.equal(duplicateTxid.response.status, 409)

    const dashboardWithReview = await requestJson(baseUrl, "/api/admin/dashboard", {
      headers: { Cookie: cookie },
    })
    const reviewAlert = dashboardWithReview.payload.cryptoAlerts.find((alert) => alert.requestId === firstRequest.id)
    assert.equal(reviewAlert.type, "awaiting_txid_review")

    const confirmed = await requestJson(baseUrl, `/api/admin/requests/${firstRequest.id}/crypto-payment`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: {
        action: "confirm",
        blockchainTxid: "a".repeat(64),
        note: "Explorer amount and destination match",
      },
    })
    assert.equal(confirmed.response.status, 200)
    assert.equal(confirmed.payload.request.paymentStatus, "paid")
    assert.ok(confirmed.payload.request.paymentConfirmedAt)
    assert.equal(confirmed.payload.request.paymentEvents[0].note, "Explorer amount and destination match")

    const underpaidRequest = await createPublicRequest(baseUrl, sawId, "E")
    await requestJson(baseUrl, `/api/public/requests/${underpaidRequest.id}/crypto-payment`, {
      method: "POST",
      body: { currency: "XMR" },
    })
    const underpaid = await requestJson(baseUrl, `/api/admin/requests/${underpaidRequest.id}/crypto-payment`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: {
        action: "underpaid",
        note: "Explorer amount is short",
      },
    })
    assert.equal(underpaid.response.status, 200)
    assert.equal(underpaid.payload.request.paymentStatus, "underpaid")
    assert.equal(underpaid.payload.request.paymentEvents[0].note, "Explorer amount is short")

    const duplicateConfirm = await requestJson(baseUrl, `/api/admin/requests/${firstRequest.id}/crypto-payment`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { action: "confirm" },
    })
    assert.equal(duplicateConfirm.response.status, 409)

    const staleRequest = await createPublicRequest(baseUrl, sawId, "C")
    const staleCrypto = await requestJson(baseUrl, `/api/public/requests/${staleRequest.id}/crypto-payment`, {
      method: "POST",
      body: { currency: "XMR" },
    })
    assert.equal(staleCrypto.response.status, 201)
    assert.equal(staleCrypto.payload.request.cryptoAddress, process.env.CRYPTO_XMR_STATIC_ADDRESS)

    await mutateState((state) => {
      const request = state.requests.find((entry) => entry.id === staleRequest.id)
      request.paymentExpiresAt = "2026-04-10T00:00:00.000Z"
      return state
    })

    const staleLoaded = await requestJson(baseUrl, `/api/public/requests/${staleRequest.id}`)
    assert.equal(staleLoaded.payload.request.paymentStatus, "expired")

    const staleDetected = await requestJson(baseUrl, `/api/admin/requests/${staleRequest.id}/crypto-payment`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { action: "detected", blockchainTxid: "tx-stale" },
    })
    assert.equal(staleDetected.response.status, 409)

    const dashboardWithAlert = await requestJson(baseUrl, "/api/admin/dashboard", {
      headers: { Cookie: cookie },
    })
    const expiredAlert = dashboardWithAlert.payload.cryptoAlerts.find((alert) => alert.requestId === staleRequest.id)
    assert.equal(expiredAlert.type, "expired")

    const reviewed = await requestJson(baseUrl, `/api/admin/requests/${staleRequest.id}/crypto-alert`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { reviewKey: expiredAlert.reviewKey },
    })
    assert.equal(reviewed.response.status, 200)
    assert.equal(
      reviewed.payload.dashboard.cryptoAlerts.some((alert) => alert.requestId === staleRequest.id),
      false,
    )

    const regenerated = await requestJson(baseUrl, `/api/public/requests/${staleRequest.id}/crypto-payment`, {
      method: "POST",
      body: { currency: "XMR" },
    })
    assert.equal(regenerated.response.status, 201)
    assert.equal(regenerated.payload.request.cryptoAttempt, 2)
    assert.equal(regenerated.payload.request.cryptoAddress, staleCrypto.payload.request.cryptoAddress)
    assert.equal(regenerated.payload.request.cryptoRateSource, "route-test")
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
