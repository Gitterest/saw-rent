import crypto from "node:crypto"

import { createCryptoDestinationProvider } from "./cryptoDestinations.js"
import { createCryptoRateProvider } from "./cryptoRates.js"

export const CRYPTO_PAYMENT_STATUSES = new Set([
  "pending",
  "awaiting_crypto_payment",
  "awaiting_txid_submission",
  "awaiting_txid_review",
  "crypto_payment_detected",
  "paid",
  "expired",
  "cancelled",
  "underpaid",
])

export const CRYPTO_CURRENCIES = {
  BTC: {
    code: "BTC",
    label: "Bitcoin",
    decimals: 8,
    defaultReceivingAddress: "",
  },
  XMR: {
    code: "XMR",
    label: "Monero",
    decimals: 12,
    defaultReceivingAddress: "",
  },
}

const PRE_PAYMENT_STATUSES = new Set(["pending", "unpaid", "expired", "cancelled"])
const EXPIRING_CRYPTO_STATUSES = new Set(["awaiting_crypto_payment", "awaiting_txid_submission"])
const ACTIVE_CRYPTO_STATUSES = new Set([
  "awaiting_crypto_payment",
  "awaiting_txid_submission",
  "awaiting_txid_review",
  "crypto_payment_detected",
  "underpaid",
])
const DEFAULT_EXPIRATION_MINUTES = 30

function paymentError(message, status = 409) {
  const error = new Error(message)
  error.status = status
  error.expose = true
  return error
}

export function normalizeCryptoCurrency(value) {
  const currency = String(value || "").trim().toUpperCase()
  return CRYPTO_CURRENCIES[currency] ? currency : ""
}

export function isCryptoPaymentExpired(payment, now = new Date()) {
  if (!payment?.paymentExpiresAt || !EXPIRING_CRYPTO_STATUSES.has(payment.paymentStatus)) {
    return false
  }

  const expiresAt = new Date(payment.paymentExpiresAt)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()
}

export function getEffectivePaymentStatus(payment, now = new Date()) {
  if (isCryptoPaymentExpired(payment, now)) {
    return "expired"
  }

  return payment?.paymentStatus || "pending"
}

export function assertCryptoPaymentCanBeCreated(request, now = new Date()) {
  if (!request) {
    throw paymentError("Request not found.", 404)
  }

  if (request.status === "denied" || request.status === "converted") {
    throw paymentError("Crypto payment cannot be created for this request.")
  }

  if (request.paymentStatus === "paid") {
    throw paymentError("Request is already paid.")
  }

  const effectiveStatus = getEffectivePaymentStatus(request, now)
  if (!PRE_PAYMENT_STATUSES.has(effectiveStatus)) {
    throw paymentError("Existing crypto payment instructions are still active.")
  }
}

export function assertCryptoTransition(request, action, now = new Date()) {
  if (!request) {
    throw paymentError("Request not found.", 404)
  }

  if (request.paymentMethod !== "crypto") {
    throw paymentError("Request is not using crypto payment.")
  }

  if (request.paymentStatus === "paid") {
    throw paymentError("Crypto payment is already confirmed.")
  }

  const effectiveStatus = getEffectivePaymentStatus(request, now)

  if (effectiveStatus === "expired") {
    throw paymentError("Crypto payment instructions are expired.")
  }

  if (action === "detected" && !["awaiting_crypto_payment", "awaiting_txid_submission", "awaiting_txid_review", "crypto_payment_detected"].includes(effectiveStatus)) {
    throw paymentError("Crypto payment must be awaiting payment or TXID review before it can be marked detected.")
  }

  if (action === "confirm" && !["awaiting_txid_review", "crypto_payment_detected"].includes(effectiveStatus)) {
    throw paymentError("Crypto payment must be awaiting TXID review before confirmation.")
  }

  if (action === "underpaid" && !["awaiting_crypto_payment", "awaiting_txid_submission", "awaiting_txid_review", "crypto_payment_detected", "underpaid"].includes(effectiveStatus)) {
    throw paymentError("Crypto payment must be active before it can be marked underpaid.")
  }

  if (action === "cancel" && !ACTIVE_CRYPTO_STATUSES.has(effectiveStatus)) {
    throw paymentError("Only active crypto payments can be cancelled.")
  }
}

export function readCryptoConfig(env = process.env) {
  const expirationMinutes = Number.parseInt(env.CRYPTO_PAYMENT_EXPIRATION_MINUTES, 10)
  const rateTimeoutMs = Number.parseInt(env.CRYPTO_RATE_TIMEOUT_MS, 10)
  const xmrAccountIndex = Number.parseInt(env.CRYPTO_XMR_ACCOUNT_INDEX, 10)
  const btcMinConfirmations = Number.parseInt(env.CRYPTO_BTC_MIN_CONFIRMATIONS, 10)
  const xmrMinConfirmations = Number.parseInt(env.CRYPTO_XMR_MIN_CONFIRMATIONS, 10)
  const cryptoMode = String(env.CRYPTO_MODE || "static_txid").trim().toLowerCase() || "static_txid"
  const destinationMode = String(env.CRYPTO_DESTINATION_PROVIDER || cryptoMode).trim().toLowerCase()
  const hasWalletConfig = Boolean(env.CRYPTO_BTC_WALLET_ALLOCATE_URL || env.CRYPTO_XMR_WALLET_RPC_URL)

  return {
    expirationMinutes: Number.isFinite(expirationMinutes) && expirationMinutes > 0
      ? expirationMinutes
      : DEFAULT_EXPIRATION_MINUTES,
    receivingAddresses: {
      BTC: readReceivingAddress(env.CRYPTO_BTC_STATIC_ADDRESS || env.CRYPTO_BTC_RECEIVING_ADDRESS, CRYPTO_CURRENCIES.BTC.defaultReceivingAddress),
      XMR: readReceivingAddress(env.CRYPTO_XMR_STATIC_ADDRESS || env.CRYPTO_XMR_RECEIVING_ADDRESS, CRYPTO_CURRENCIES.XMR.defaultReceivingAddress),
    },
    rateProvider: {
      ...(env.CRYPTO_KRAKEN_TICKER_URL ? { baseUrl: env.CRYPTO_KRAKEN_TICKER_URL } : {}),
      timeoutMs: Number.isFinite(rateTimeoutMs) && rateTimeoutMs > 0 ? rateTimeoutMs : 8000,
    },
    destinationProvider: {
      mode: destinationMode || (hasWalletConfig ? "wallet" : "static_txid"),
      static: {
        btcAddress: readReceivingAddress(env.CRYPTO_BTC_STATIC_ADDRESS || env.CRYPTO_BTC_RECEIVING_ADDRESS, CRYPTO_CURRENCIES.BTC.defaultReceivingAddress),
        xmrAddress: readReceivingAddress(env.CRYPTO_XMR_STATIC_ADDRESS || env.CRYPTO_XMR_RECEIVING_ADDRESS, CRYPTO_CURRENCIES.XMR.defaultReceivingAddress),
      },
      btc: {
        allocateUrl: env.CRYPTO_BTC_WALLET_ALLOCATE_URL || "",
        token: env.CRYPTO_BTC_WALLET_SERVICE_TOKEN || "",
        account: env.CRYPTO_BTC_WALLET_ACCOUNT || "",
      },
      xmr: {
        rpcUrl: env.CRYPTO_XMR_WALLET_RPC_URL || "",
        username: env.CRYPTO_XMR_WALLET_RPC_USER || "",
        password: env.CRYPTO_XMR_WALLET_RPC_PASSWORD || "",
        accountIndex: Number.isFinite(xmrAccountIndex) && xmrAccountIndex >= 0 ? xmrAccountIndex : 0,
      },
    },
    monitoring: {
      mode: env.CRYPTO_MONITORING_PROVIDER || (hasWalletConfig ? "wallet" : "none"),
      btc: {
        lookupUrl: env.CRYPTO_BTC_MONITOR_LOOKUP_URL || "",
        token: env.CRYPTO_BTC_WALLET_SERVICE_TOKEN || "",
      },
      xmr: {
        rpcUrl: env.CRYPTO_XMR_WALLET_RPC_URL || "",
        username: env.CRYPTO_XMR_WALLET_RPC_USER || "",
        password: env.CRYPTO_XMR_WALLET_RPC_PASSWORD || "",
        accountIndex: Number.isFinite(xmrAccountIndex) && xmrAccountIndex >= 0 ? xmrAccountIndex : 0,
      },
      minConfirmations: {
        BTC: Number.isFinite(btcMinConfirmations) && btcMinConfirmations >= 0 ? btcMinConfirmations : 1,
        XMR: Number.isFinite(xmrMinConfirmations) && xmrMinConfirmations >= 0 ? xmrMinConfirmations : 10,
      },
    },
  }
}

function readReceivingAddress(value, fallback) {
  const address = String(value || "").trim()
  return address || fallback
}

function formatCryptoAmount(amount, decimals) {
  return amount.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")
}

function buildPaymentUri({ currency, address, amount, requestId }) {
  const label = encodeURIComponent(`Saw Rent ${requestId}`)
  const description = encodeURIComponent(`Rental deposit ${requestId}`)

  if (currency === "BTC") {
    return `bitcoin:${address}?amount=${amount}&label=${label}`
  }

  return `monero:${address}?tx_amount=${amount}&recipient_name=Saw%20Rent&tx_description=${description}`
}

export class StubCryptoAddressProvider {
  async createDestination({ currency, requestId, attempt }) {
    const seed = `${currency}:${requestId}:${attempt}:${crypto.randomUUID()}`
    const digest = crypto.createHash("sha256").update(seed).digest("hex")

    if (currency === "BTC") {
      return {
        address: `btc_stub_${digest.slice(0, 38)}`,
        provider: "stub",
      }
    }

    return {
      address: `xmr_stub_${digest.slice(0, 95)}`,
      provider: "stub",
    }
  }
}

export class ConfiguredCryptoAddressProvider {
  constructor(config = readCryptoConfig()) {
    this.addresses = config.receivingAddresses || {}
  }

  async createDestination({ currency }) {
    const address = String(this.addresses[currency] || "").trim()
    if (!address) {
      throw paymentError(`${currency} receiving address is not configured.`, 503)
    }

    return {
      address,
      provider: currency === "BTC" ? "configured-btc-receiving-address" : "configured-xmr-receiving-address",
      unique: false,
    }
  }
}

function getUsdDepositBasis(request) {
  const depositCents = Number(request.depositCents || 0)
  const depositUsdAmount = Number((depositCents / 100).toFixed(2))
  const refundableUsdAmount = Number(
    Number.isFinite(Number(request.refundableUsdAmount))
      ? Number(request.refundableUsdAmount)
      : depositUsdAmount,
  )

  if (!Number.isFinite(depositCents) || depositCents <= 0 || depositUsdAmount <= 0) {
    throw paymentError("Request deposit must be a positive USD amount.", 400)
  }

  return {
    depositCents,
    depositUsdAmount,
    refundableUsdAmount,
  }
}

function assertCryptoQuoteSnapshot(request) {
  const rateUsd = Number(request.cryptoRateUsd || request.cryptoAmountFiatSnapshot?.rateUsd)
  const depositUsdAmount = Number(request.depositUsdAmount || request.cryptoAmountFiatSnapshot?.amount)

  if (!request.cryptoPaymentId || !request.cryptoAddress || !request.cryptoAmount) {
    throw paymentError("Crypto payment quote snapshot is incomplete.")
  }

  if (!Number.isFinite(rateUsd) || rateUsd <= 0 || !Number.isFinite(depositUsdAmount) || depositUsdAmount <= 0) {
    throw paymentError("Crypto payment USD quote basis is incomplete.")
  }
}

function validateTxidForCurrency(currency, txid) {
  const normalized = String(txid || "").trim()
  if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
    throw paymentError(`${currency} transaction hash must be 64 hexadecimal characters.`, 400)
  }
  return normalized.toLowerCase()
}

function normalizeActionNote(note) {
  return String(note || "").trim().slice(0, 500)
}

export function submitCryptoTxid(request, { txid, note = "", now = new Date() } = {}) {
  if (!request) {
    throw paymentError("Request not found.", 404)
  }
  if (request.paymentMethod !== "crypto") {
    throw paymentError("Request is not using crypto payment.")
  }
  if (request.paymentStatus === "paid") {
    throw paymentError("Crypto payment is already confirmed.")
  }

  const effectiveStatus = getEffectivePaymentStatus(request, now)
  if (effectiveStatus === "expired") {
    throw paymentError("Crypto payment instructions are expired.")
  }
  if (!["awaiting_crypto_payment", "awaiting_txid_submission", "awaiting_txid_review", "underpaid"].includes(effectiveStatus)) {
    throw paymentError("Crypto transaction ID cannot be submitted for this payment state.")
  }
  if (request.customerSubmittedTxid && request.paymentStatus === "awaiting_txid_review") {
    throw paymentError("A transaction ID is already awaiting review.")
  }

  assertCryptoQuoteSnapshot(request)

  const submittedTxid = validateTxidForCurrency(request.cryptoCurrency, txid)
  const submittedAt = now.toISOString()
  request.paymentStatus = "awaiting_txid_review"
  request.blockchainTxid = submittedTxid
  request.customerSubmittedTxid = submittedTxid
  request.customerTxidSubmittedAt = submittedAt
  request.customerTxidNote = String(note || "").trim().slice(0, 500)
  request.monitoringState = "manual_review"
  request.lastChainCheckAt = request.lastChainCheckAt || null
  request.paymentEvents = [
    {
      id: crypto.randomUUID(),
      type: "crypto_txid_submitted",
      status: request.paymentStatus,
      cryptoPaymentId: request.cryptoPaymentId || "",
      blockchainTxid: submittedTxid,
      note: request.customerTxidNote,
      createdAt: submittedAt,
    },
    ...(Array.isArray(request.paymentEvents) ? request.paymentEvents : []),
  ]

  return request
}

export async function createCryptoPayment({
  request,
  currency,
  config = readCryptoConfig(),
  addressProvider = createCryptoDestinationProvider(config.destinationProvider),
  rateProvider = createCryptoRateProvider(config.rateProvider),
  now = new Date(),
}) {
  const normalizedCurrency = normalizeCryptoCurrency(currency)
  if (!normalizedCurrency) {
    throw paymentError("Crypto currency must be BTC or XMR.", 400)
  }

  assertCryptoPaymentCanBeCreated(request, now)

  const coin = CRYPTO_CURRENCIES[normalizedCurrency]
  const attempt = Number(request.cryptoAttempt || 0) + 1
  const {
    depositCents,
    depositUsdAmount,
    refundableUsdAmount,
  } = getUsdDepositBasis(request)
  const rateQuote = await rateProvider.getUsdRate(normalizedCurrency)
  const rateUsd = Number(rateQuote.rateUsd)
  if (!Number.isFinite(rateUsd) || rateUsd <= 0) {
    throw paymentError("Crypto market rate lookup returned an invalid USD rate.")
  }

  const quotedAt = now.toISOString()
  const cryptoAmount = formatCryptoAmount(depositUsdAmount / rateUsd, coin.decimals)
  const paymentId = crypto.randomUUID()
  const destination = await addressProvider.createDestination({
    currency: normalizedCurrency,
    requestId: request.id,
    paymentId,
    attempt,
  })
  const expiresAt = new Date(now.getTime() + (config.expirationMinutes * 60 * 1000))
  const qrData = buildPaymentUri({
    currency: normalizedCurrency,
    address: destination.address,
    amount: cryptoAmount,
    requestId: request.id,
  })

  return {
    paymentMethod: "crypto",
    paymentStatus: "awaiting_crypto_payment",
    cryptoCurrency: normalizedCurrency,
    cryptoAddress: destination.address,
    cryptoAmount,
    cryptoAmountFiatSnapshot: {
      currency: "USD",
      amountCents: depositCents,
      amount: depositUsdAmount,
      rateUsd,
      rateSource: rateQuote.source,
      ratePair: rateQuote.pair || "",
      quotedAt,
    },
    cryptoRateSource: rateQuote.source,
    cryptoRateUsd: rateUsd,
    cryptoRateQuotedAt: quotedAt,
    cryptoQrData: qrData,
    cryptoPaymentId: paymentId,
    cryptoAttempt: attempt,
    cryptoAddressProvider: destination.provider,
    destinationProvider: destination.provider,
    destinationUnique: destination.unique === true,
    destinationAllocationState: destination.destinationAllocationState || "allocated",
    destinationAllocation: destination.destinationMetadata || null,
    btcDerivationIndex: Number.isFinite(Number(destination.btcDerivationIndex)) ? Number(destination.btcDerivationIndex) : null,
    btcDerivationPath: destination.btcDerivationPath || "",
    xmrAccountIndex: Number.isFinite(Number(destination.xmrAccountIndex)) ? Number(destination.xmrAccountIndex) : null,
    xmrSubaddressIndex: Number.isFinite(Number(destination.xmrSubaddressIndex)) ? Number(destination.xmrSubaddressIndex) : null,
    paymentExpiresAt: expiresAt.toISOString(),
    paymentConfirmedAt: null,
    blockchainTxid: "",
    depositUsdAmount,
    refundableUsdAmount,
    expectedCryptoAmount: cryptoAmount,
    receivedCryptoAmount: "",
    chainConfirmations: 0,
    monitoredAt: null,
    lastChainCheckAt: null,
    monitoringState: "monitoring_pending",
    paymentEvents: [
      {
        id: crypto.randomUUID(),
        type: "crypto_payment_created",
        status: "awaiting_crypto_payment",
        cryptoPaymentId: paymentId,
        cryptoCurrency: normalizedCurrency,
        cryptoAddress: destination.address,
        cryptoAmount,
        destinationProvider: destination.provider,
        destinationUnique: destination.unique === true,
        destinationAllocationState: destination.destinationAllocationState || "allocated",
        cryptoRateSource: rateQuote.source,
        cryptoRateUsd: rateUsd,
        depositUsdAmount,
        refundableUsdAmount,
        createdAt: now.toISOString(),
      },
      ...(Array.isArray(request.paymentEvents) ? request.paymentEvents : []),
    ],
  }
}

export function applyCryptoTransition(
  request,
  action,
  {
    blockchainTxid = "",
    receivedCryptoAmount = "",
    chainConfirmations = null,
    monitoringState = "",
    note = "",
    now = new Date(),
  } = {},
) {
  assertCryptoTransition(request, action, now)
  assertCryptoQuoteSnapshot(request)

  const actionNote = normalizeActionNote(note)
  const submittedTxid = String(blockchainTxid || request.blockchainTxid || request.customerSubmittedTxid || "").trim()
  if (action === "confirm" && !submittedTxid) {
    throw paymentError("Crypto payment confirmation requires a transaction ID.", 400)
  }

  const eventBase = {
    id: crypto.randomUUID(),
    cryptoPaymentId: request.cryptoPaymentId || "",
    createdAt: now.toISOString(),
    ...(actionNote ? { note: actionNote } : {}),
  }

  if (action === "detected") {
    request.paymentStatus = "awaiting_txid_review"
    request.blockchainTxid = submittedTxid
    request.receivedCryptoAmount = String(receivedCryptoAmount || request.receivedCryptoAmount || "").trim()
    if (Number.isFinite(Number(chainConfirmations))) {
      request.chainConfirmations = Number(chainConfirmations)
    }
    request.lastChainCheckAt = now.toISOString()
    request.monitoringState = monitoringState || "payment_detected"
    request.paymentEvents = [
      {
        ...eventBase,
        type: "crypto_payment_detected",
        status: request.paymentStatus,
        blockchainTxid: request.blockchainTxid,
        receivedCryptoAmount: request.receivedCryptoAmount,
        chainConfirmations: request.chainConfirmations || 0,
      },
      ...(Array.isArray(request.paymentEvents) ? request.paymentEvents : []),
    ]
    return request
  }

  if (action === "confirm") {
    request.paymentStatus = "paid"
    request.blockchainTxid = submittedTxid
    request.receivedCryptoAmount = String(receivedCryptoAmount || request.receivedCryptoAmount || "").trim()
    if (Number.isFinite(Number(chainConfirmations))) {
      request.chainConfirmations = Number(chainConfirmations)
    }
    request.lastChainCheckAt = now.toISOString()
    request.monitoringState = monitoringState || "paid"
    request.paymentConfirmedAt = now.toISOString()
    request.paidAt = now.toISOString()
    request.paymentEvents = [
      {
        ...eventBase,
        type: "crypto_payment_confirmed",
        status: request.paymentStatus,
        blockchainTxid: request.blockchainTxid || "",
        receivedCryptoAmount: request.receivedCryptoAmount,
        chainConfirmations: request.chainConfirmations || 0,
      },
      ...(Array.isArray(request.paymentEvents) ? request.paymentEvents : []),
    ]
    return request
  }

  if (action === "underpaid") {
    request.paymentStatus = "underpaid"
    request.blockchainTxid = submittedTxid
    request.monitoringState = "underpaid"
    request.paymentEvents = [
      {
        ...eventBase,
        type: "crypto_payment_underpaid",
        status: request.paymentStatus,
        blockchainTxid: request.blockchainTxid || "",
      },
      ...(Array.isArray(request.paymentEvents) ? request.paymentEvents : []),
    ]
    return request
  }

  request.paymentStatus = "cancelled"
  request.monitoringState = "cancelled"
  request.paymentEvents = [
    {
      ...eventBase,
      type: "crypto_payment_cancelled",
      status: request.paymentStatus,
    },
    ...(Array.isArray(request.paymentEvents) ? request.paymentEvents : []),
  ]
  return request
}
