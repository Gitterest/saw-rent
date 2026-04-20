import crypto from "node:crypto"

import {
  CRYPTO_CURRENCIES,
  applyCryptoTransition,
  getEffectivePaymentStatus,
} from "./cryptoPayments.js"

export const CRYPTO_MONITORING_STATES = {
  PENDING: "monitoring_pending",
  PAYMENT_DETECTED: "payment_detected",
  AWAITING_CONFIRMATIONS: "awaiting_confirmations",
  PAID: "paid",
  UNDERPAID: "underpaid",
  EXPIRED: "expired",
  ERROR: "monitor_error",
  CANCELLED: "cancelled",
}

function monitoringError(message, status = 409) {
  const error = new Error(message)
  error.status = status
  return error
}

function pow10(decimals) {
  return 10n ** BigInt(decimals)
}

function parseCryptoAmount(value, decimals) {
  const raw = String(value || "").trim()
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw monitoringError("Crypto amount is invalid.", 400)
  }

  const [whole, fraction = ""] = raw.split(".")
  const paddedFraction = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals)
  return BigInt(whole) * pow10(decimals) + BigInt(paddedFraction || "0")
}

function amountMeetsExpected({ received, expected, currency }) {
  const decimals = CRYPTO_CURRENCIES[currency]?.decimals
  if (!Number.isFinite(decimals)) {
    throw monitoringError("Crypto currency must be BTC or XMR.", 400)
  }

  return parseCryptoAmount(received, decimals) >= parseCryptoAmount(expected, decimals)
}

function normalizeObservation(observation = {}) {
  return {
    requestId: String(observation.requestId || "").trim(),
    cryptoPaymentId: String(observation.cryptoPaymentId || "").trim(),
    currency: String(observation.currency || "").trim().toUpperCase(),
    address: String(observation.address || "").trim(),
    txid: String(observation.txid || observation.blockchainTxid || "").trim(),
    amount: String(observation.amount || observation.receivedCryptoAmount || "").trim(),
    confirmations: Number.parseInt(observation.confirmations ?? observation.chainConfirmations ?? 0, 10),
    observedAt: observation.observedAt || null,
    xmrAccountIndex: Number.isFinite(Number(observation.xmrAccountIndex)) ? Number(observation.xmrAccountIndex) : null,
    xmrSubaddressIndex: Number.isFinite(Number(observation.xmrSubaddressIndex)) ? Number(observation.xmrSubaddressIndex) : null,
    btcDerivationIndex: Number.isFinite(Number(observation.btcDerivationIndex)) ? Number(observation.btcDerivationIndex) : null,
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim()
  return raw.endsWith("/") ? raw.slice(0, -1) : raw
}

function buildJsonHeaders(token = "") {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function observationMatchesDestination(request, observation) {
  if (observation.requestId && observation.requestId !== request.id) return false
  if (observation.cryptoPaymentId && observation.cryptoPaymentId !== request.cryptoPaymentId) return false
  if (observation.currency && observation.currency !== request.cryptoCurrency) return false
  if (observation.address && observation.address !== request.cryptoAddress) return false
  if (observation.xmrSubaddressIndex !== null && Number(request.xmrSubaddressIndex) !== observation.xmrSubaddressIndex) return false
  if (observation.btcDerivationIndex !== null && Number(request.btcDerivationIndex) !== observation.btcDerivationIndex) return false
  return true
}

export function matchCryptoPaymentObservation(
  request,
  rawObservation,
  {
    now = new Date(),
    minConfirmations = {},
  } = {},
) {
  if (!request || request.paymentMethod !== "crypto") {
    return { matched: false, action: "ignored", reason: "not_crypto" }
  }

  const observation = normalizeObservation(rawObservation)
  if (!observationMatchesDestination(request, observation)) {
    return { matched: false, action: "ignored", reason: "destination_mismatch" }
  }

  if (!observation.txid || !observation.amount) {
    return { matched: true, action: "rejected", reason: "missing_chain_payment_data", observation }
  }

  if (request.paymentStatus === "paid") {
    return { matched: true, action: "duplicate", reason: "already_paid", observation }
  }

  const effectiveStatus = getEffectivePaymentStatus(request, now)
  if (effectiveStatus === "expired") {
    return { matched: true, action: "rejected", reason: "quote_expired", observation }
  }

  const expectedAmount = request.expectedCryptoAmount || request.cryptoAmount
  if (!amountMeetsExpected({
    received: observation.amount,
    expected: expectedAmount,
    currency: request.cryptoCurrency,
  })) {
    return { matched: true, action: "detected", reason: "underpaid", observation }
  }

  const requiredConfirmations = Number(minConfirmations[request.cryptoCurrency] ?? 1)
  if (observation.confirmations < requiredConfirmations) {
    return { matched: true, action: "detected", reason: "insufficient_confirmations", observation }
  }

  return { matched: true, action: "confirm", reason: "confirmed", observation }
}

function appendPaymentEvent(request, event) {
  request.paymentEvents = [
    {
      id: crypto.randomUUID(),
      ...event,
    },
    ...(Array.isArray(request.paymentEvents) ? request.paymentEvents : []),
  ]
}

export function applyCryptoPaymentObservation(
  request,
  rawObservation,
  {
    now = new Date(),
    minConfirmations = {},
  } = {},
) {
  const match = matchCryptoPaymentObservation(request, rawObservation, { now, minConfirmations })
  if (!match.matched) {
    return match
  }

  const observation = match.observation
  request.monitoredAt = request.monitoredAt || now.toISOString()
  request.lastChainCheckAt = now.toISOString()
  request.blockchainTxid = observation.txid || request.blockchainTxid || ""
  request.receivedCryptoAmount = observation.amount || request.receivedCryptoAmount || ""
  request.chainConfirmations = Number.isFinite(observation.confirmations) ? observation.confirmations : Number(request.chainConfirmations || 0)

  if (match.action === "duplicate") {
    request.monitoringState = CRYPTO_MONITORING_STATES.PAID
    return match
  }

  if (match.action === "rejected") {
    request.monitoringState = match.reason === "quote_expired"
      ? CRYPTO_MONITORING_STATES.EXPIRED
      : CRYPTO_MONITORING_STATES.ERROR
    appendPaymentEvent(request, {
      type: "crypto_chain_payment_rejected",
      status: request.paymentStatus,
      cryptoPaymentId: request.cryptoPaymentId || "",
      blockchainTxid: request.blockchainTxid,
      receivedCryptoAmount: request.receivedCryptoAmount,
      reason: match.reason,
      createdAt: now.toISOString(),
    })
    return match
  }

  if (match.action === "detected") {
    request.monitoringState = match.reason === "underpaid"
      ? CRYPTO_MONITORING_STATES.UNDERPAID
      : CRYPTO_MONITORING_STATES.AWAITING_CONFIRMATIONS
    if (match.reason === "underpaid") {
      applyCryptoTransition(request, "underpaid", { now })
    } else if (request.paymentStatus === "awaiting_crypto_payment") {
      applyCryptoTransition(request, "detected", {
        blockchainTxid: observation.txid,
        receivedCryptoAmount: observation.amount,
        chainConfirmations: observation.confirmations,
        monitoringState: request.monitoringState,
        now,
      })
    } else {
      appendPaymentEvent(request, {
        type: "crypto_chain_payment_detected",
        status: request.paymentStatus,
        cryptoPaymentId: request.cryptoPaymentId || "",
        blockchainTxid: request.blockchainTxid,
        receivedCryptoAmount: request.receivedCryptoAmount,
        chainConfirmations: request.chainConfirmations,
        reason: match.reason,
        createdAt: now.toISOString(),
      })
    }
    return match
  }

  if (request.paymentStatus === "awaiting_crypto_payment") {
    applyCryptoTransition(request, "detected", {
      blockchainTxid: observation.txid,
      receivedCryptoAmount: observation.amount,
      chainConfirmations: observation.confirmations,
      monitoringState: CRYPTO_MONITORING_STATES.PAYMENT_DETECTED,
      now,
    })
  }

  applyCryptoTransition(request, "confirm", {
    blockchainTxid: observation.txid,
    receivedCryptoAmount: observation.amount,
    chainConfirmations: observation.confirmations,
    monitoringState: CRYPTO_MONITORING_STATES.PAID,
    now,
  })

  return match
}

export class StaticCryptoMonitorProvider {
  constructor(observations = []) {
    this.observations = observations
  }

  async findPayments(request) {
    return this.observations.filter((observation) =>
      observation.requestId === request.id ||
      observation.cryptoPaymentId === request.cryptoPaymentId ||
      observation.address === request.cryptoAddress,
    )
  }
}

export class NoopCryptoMonitorProvider {
  async findPayments() {
    return []
  }
}

export class BtcWalletServiceMonitorProvider {
  constructor({
    lookupUrl = "",
    token = "",
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.lookupUrl = normalizeBaseUrl(lookupUrl)
    this.token = token
    this.fetchImpl = fetchImpl
  }

  async findPayments(request) {
    if (request.cryptoCurrency !== "BTC" || !this.lookupUrl) return []

    const response = await this.fetchImpl(this.lookupUrl, {
      method: "POST",
      headers: buildJsonHeaders(this.token),
      body: JSON.stringify({
        requestId: request.id,
        cryptoPaymentId: request.cryptoPaymentId,
        address: request.cryptoAddress,
        expectedAmount: request.expectedCryptoAmount || request.cryptoAmount,
        btcDerivationIndex: request.btcDerivationIndex,
      }),
    })

    if (!response.ok) {
      throw monitoringError(`BTC wallet monitor lookup failed (${response.status}).`, 503)
    }

    const payload = await response.json()
    const payments = Array.isArray(payload.payments) ? payload.payments : []
    return payments.map((payment) => ({
      ...payment,
      currency: "BTC",
      address: payment.address || request.cryptoAddress,
      btcDerivationIndex: payment.btcDerivationIndex ?? request.btcDerivationIndex,
    }))
  }
}

export class MoneroWalletRpcMonitorProvider {
  constructor({
    rpcUrl = "",
    username = "",
    password = "",
    accountIndex = 0,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.rpcUrl = normalizeBaseUrl(rpcUrl)
    this.username = username
    this.password = password
    this.accountIndex = Number.isFinite(Number(accountIndex)) ? Number(accountIndex) : 0
    this.fetchImpl = fetchImpl
  }

  async rpc(method, params) {
    if (!this.rpcUrl) return {}

    const headers = buildJsonHeaders()
    if (this.username || this.password) {
      headers.Authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`
    }

    const response = await this.fetchImpl(`${this.rpcUrl}/json_rpc`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `saw-rent-monitor-${Date.now()}`,
        method,
        params,
      }),
    })

    if (!response.ok) {
      throw monitoringError(`Monero wallet RPC ${method} failed (${response.status}).`, 503)
    }

    const payload = await response.json()
    if (payload.error) {
      throw monitoringError(`Monero wallet RPC ${method} failed: ${payload.error.message || payload.error.code}`, 503)
    }

    return payload.result || {}
  }

  async findPayments(request) {
    if (request.cryptoCurrency !== "XMR" || !this.rpcUrl || !Number.isFinite(Number(request.xmrSubaddressIndex))) {
      return []
    }

    const result = await this.rpc("get_transfers", {
      in: true,
      account_index: Number.isFinite(Number(request.xmrAccountIndex)) ? Number(request.xmrAccountIndex) : this.accountIndex,
      subaddr_indices: [Number(request.xmrSubaddressIndex)],
    })
    const transfers = Array.isArray(result.in) ? result.in : []
    const atomicFactor = 10n ** BigInt(CRYPTO_CURRENCIES.XMR.decimals)

    return transfers.map((transfer) => {
      const amountAtomic = BigInt(String(transfer.amount || "0"))
      const whole = amountAtomic / atomicFactor
      const fraction = String(amountAtomic % atomicFactor).padStart(CRYPTO_CURRENCIES.XMR.decimals, "0").replace(/0+$/, "")

      return {
        currency: "XMR",
        address: request.cryptoAddress,
        txid: transfer.txid,
        amount: fraction ? `${whole}.${fraction}` : String(whole),
        confirmations: Number(transfer.confirmations || 0),
        xmrAccountIndex: request.xmrAccountIndex,
        xmrSubaddressIndex: request.xmrSubaddressIndex,
        observedAt: transfer.timestamp ? new Date(Number(transfer.timestamp) * 1000).toISOString() : null,
      }
    })
  }
}

export class CompositeCryptoMonitorProvider {
  constructor(providers = []) {
    this.providers = providers
  }

  async findPayments(request) {
    const results = []
    for (const provider of this.providers) {
      results.push(...await provider.findPayments(request))
    }
    return results
  }
}

export function createCryptoMonitorProvider(config = {}) {
  const mode = String(config.mode || "").trim().toLowerCase()
  if (["", "none", "local-dev", "static", "static_txid"].includes(mode)) {
    return new NoopCryptoMonitorProvider()
  }

  return new CompositeCryptoMonitorProvider([
    new BtcWalletServiceMonitorProvider(config.btc || {}),
    new MoneroWalletRpcMonitorProvider(config.xmr || {}),
  ])
}

export class CryptoPaymentMonitor {
  constructor({ provider = new NoopCryptoMonitorProvider(), minConfirmations = {} } = {}) {
    this.provider = provider
    this.minConfirmations = minConfirmations
  }

  async checkRequest(request, { now = new Date() } = {}) {
    const observations = await this.provider.findPayments(request)
    const results = []

    for (const observation of observations) {
      results.push(applyCryptoPaymentObservation(request, observation, {
        now,
        minConfirmations: this.minConfirmations,
      }))
      if (request.paymentStatus === "paid") break
    }

    if (results.length === 0 && request.paymentMethod === "crypto") {
      request.monitoredAt = request.monitoredAt || now.toISOString()
      request.lastChainCheckAt = now.toISOString()
      request.monitoringState = request.monitoringState || CRYPTO_MONITORING_STATES.PENDING
    }

    return results
  }
}
