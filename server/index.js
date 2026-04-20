import "dotenv/config"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import cookieParser from "cookie-parser"
import express from "express"
import Stripe from "stripe"

import {
  clearAdminCookie,
  createSessionToken,
  readAdminSession,
  requireAdmin,
  setAdminCookie,
  verifyAdminPassword,
} from "./auth.js"
import {
  computeRentalDays,
  hasOpenMaintenanceRecord,
  isActiveBooking,
  isSawAvailableForBooking,
  mutateState,
  readState,
  updateSawAvailability,
} from "./store.js"
import {
  applyCryptoTransition,
  createCryptoPayment,
  getEffectivePaymentStatus,
  normalizeCryptoCurrency,
  readCryptoConfig,
  submitCryptoTxid,
} from "./cryptoPayments.js"
import {
  CryptoMonitorScheduler,
  createCryptoMonitorRunner,
  readCryptoMonitorSchedulerConfig,
  syncCryptoPaymentToBooking,
} from "./cryptoMonitorWorker.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, "..")
const DIST_DIR = path.join(ROOT_DIR, "dist")
const PORT = Number(process.env.PORT || 5173)

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ""
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ""
const stripeClient = stripeSecretKey ? new Stripe(stripeSecretKey) : null

const BOOKING_TRANSITIONS = {
  requested: "approved",
  approved: "out",
  out: "returned",
}

function isPhoneLike(value) {
  return /^[0-9+()\-\s]{7,20}$/.test(String(value || "").trim())
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim())
}

function assert(condition, status, message) {
  if (!condition) {
    const error = new Error(message)
    error.status = status
    throw error
  }
}

function sanitizeSaw(saw) {
  return {
    id: saw.id,
    name: saw.name,
    category: saw.category,
    barSize: saw.barSize,
    engineCc: saw.engineCc,
    dailyRateCents: saw.dailyRateCents,
    depositCents: saw.depositCents,
    status: saw.status,
    notes: saw.notes,
  }
}

function buildCryptoOpsFields(entry) {
  return {
    destinationProvider: entry.destinationProvider || entry.cryptoAddressProvider || "",
    destinationUnique: entry.destinationUnique === true,
    destinationAllocationState: entry.destinationAllocationState || "",
    destinationAllocation: entry.destinationAllocation || null,
    btcDerivationIndex: Number.isFinite(Number(entry.btcDerivationIndex)) ? Number(entry.btcDerivationIndex) : null,
    btcDerivationPath: entry.btcDerivationPath || "",
    xmrAccountIndex: Number.isFinite(Number(entry.xmrAccountIndex)) ? Number(entry.xmrAccountIndex) : null,
    xmrSubaddressIndex: Number.isFinite(Number(entry.xmrSubaddressIndex)) ? Number(entry.xmrSubaddressIndex) : null,
    expectedCryptoAmount: entry.expectedCryptoAmount || entry.cryptoAmount || "",
    receivedCryptoAmount: entry.receivedCryptoAmount || "",
    monitoredAt: entry.monitoredAt || null,
    lastChainCheckAt: entry.lastChainCheckAt || null,
    chainConfirmations: Number(entry.chainConfirmations || 0),
    monitoringState: entry.monitoringState || "",
    monitorError: entry.monitorError || "",
    customerSubmittedTxid: entry.customerSubmittedTxid || "",
    customerTxidSubmittedAt: entry.customerTxidSubmittedAt || null,
    customerTxidNote: entry.customerTxidNote || "",
    cryptoAlertReviewedAt: entry.cryptoAlertReviewedAt || null,
    cryptoAlertReviewedState: entry.cryptoAlertReviewedState || "",
  }
}

function sanitizeRequest(request, { includeOpsCryptoDetails = false } = {}) {
  const effectivePaymentStatus = getEffectivePaymentStatus(request)
  const cryptoAmountFiatSnapshot = request.cryptoAmountFiatSnapshot || null
  const depositUsdAmount = Number.isFinite(Number(request.depositUsdAmount))
    ? Number(request.depositUsdAmount)
    : Number((Number(request.depositCents || 0) / 100).toFixed(2))
  const refundableUsdAmount = Number.isFinite(Number(request.refundableUsdAmount))
    ? Number(request.refundableUsdAmount)
    : depositUsdAmount

  return {
    id: request.id,
    sawId: request.sawId,
    sawName: request.sawName,
    customerName: request.customerName,
    phone: request.phone,
    startDate: request.startDate,
    endDate: request.endDate,
    pickupPreference: request.pickupPreference,
    notes: request.notes,
    rentalDays: request.rentalDays,
    rentalTotalCents: request.rentalTotalCents,
    depositCents: request.depositCents,
    status: request.status,
    paymentMethod: request.paymentMethod || "",
    paymentStatus: effectivePaymentStatus,
    cryptoCurrency: request.cryptoCurrency || "",
    cryptoAddress: request.cryptoAddress || "",
    cryptoAmount: request.cryptoAmount || "",
    cryptoAmountFiatSnapshot,
    cryptoRateSource: request.cryptoRateSource || cryptoAmountFiatSnapshot?.rateSource || "",
    cryptoRateUsd: Number(request.cryptoRateUsd || cryptoAmountFiatSnapshot?.rateUsd || 0),
    cryptoRateQuotedAt: request.cryptoRateQuotedAt || cryptoAmountFiatSnapshot?.quotedAt || null,
    cryptoQrData: request.cryptoQrData || "",
    cryptoPaymentId: request.cryptoPaymentId || "",
    cryptoAttempt: Number(request.cryptoAttempt || 0),
    cryptoAddressProvider: request.cryptoAddressProvider || "",
    paymentExpiresAt: request.paymentExpiresAt || null,
    paymentConfirmedAt: request.paymentConfirmedAt || request.paidAt || null,
    blockchainTxid: request.blockchainTxid || "",
    customerSubmittedTxid: request.customerSubmittedTxid || "",
    customerTxidSubmittedAt: request.customerTxidSubmittedAt || null,
    customerTxidNote: request.customerTxidNote || "",
    depositUsdAmount,
    refundableUsdAmount,
    ...(includeOpsCryptoDetails ? buildCryptoOpsFields(request) : {}),
    paymentEvents: Array.isArray(request.paymentEvents) ? request.paymentEvents : [],
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    bookingId: request.bookingId || null,
  }
}

function sanitizeBooking(booking, { includeOpsCryptoDetails = false } = {}) {
  const cryptoAmountFiatSnapshot = booking.cryptoAmountFiatSnapshot || null
  const depositUsdAmount = Number.isFinite(Number(booking.depositUsdAmount))
    ? Number(booking.depositUsdAmount)
    : Number((Number(booking.depositCents || 0) / 100).toFixed(2))
  const refundableUsdAmount = Number.isFinite(Number(booking.refundableUsdAmount))
    ? Number(booking.refundableUsdAmount)
    : depositUsdAmount

  return {
    id: booking.id,
    requestId: booking.requestId || null,
    sawId: booking.sawId,
    sawName: booking.sawName,
    customerName: booking.customerName,
    phone: booking.phone,
    startDate: booking.startDate,
    endDate: booking.endDate,
    pickupPreference: booking.pickupPreference,
    notes: booking.notes,
    rentalDays: booking.rentalDays,
    rentalTotalCents: booking.rentalTotalCents,
    depositCents: booking.depositCents,
    paymentMethod: booking.paymentMethod || "",
    paymentStatus: booking.paymentStatus,
    cryptoCurrency: booking.cryptoCurrency || "",
    cryptoAddress: booking.cryptoAddress || "",
    cryptoAmount: booking.cryptoAmount || "",
    cryptoAmountFiatSnapshot,
    cryptoRateSource: booking.cryptoRateSource || cryptoAmountFiatSnapshot?.rateSource || "",
    cryptoRateUsd: Number(booking.cryptoRateUsd || cryptoAmountFiatSnapshot?.rateUsd || 0),
    cryptoRateQuotedAt: booking.cryptoRateQuotedAt || cryptoAmountFiatSnapshot?.quotedAt || null,
    cryptoQrData: booking.cryptoQrData || "",
    cryptoPaymentId: booking.cryptoPaymentId || "",
    cryptoAttempt: Number(booking.cryptoAttempt || 0),
    cryptoAddressProvider: booking.cryptoAddressProvider || "",
    paymentExpiresAt: booking.paymentExpiresAt || null,
    paymentConfirmedAt: booking.paymentConfirmedAt || booking.paidAt || null,
    blockchainTxid: booking.blockchainTxid || "",
    customerSubmittedTxid: booking.customerSubmittedTxid || "",
    customerTxidSubmittedAt: booking.customerTxidSubmittedAt || null,
    customerTxidNote: booking.customerTxidNote || "",
    depositUsdAmount,
    refundableUsdAmount,
    ...(includeOpsCryptoDetails ? buildCryptoOpsFields(booking) : {}),
    paymentEvents: Array.isArray(booking.paymentEvents) ? booking.paymentEvents : [],
    status: booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  }
}

function sanitizeMaintenanceRecord(record) {
  return {
    id: record.id,
    sawId: record.sawId,
    sawName: record.sawName,
    summary: record.summary,
    details: record.details,
    priority: record.priority,
    status: record.status,
    dueDate: record.dueDate || "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt || null,
    history: Array.isArray(record.history) ? record.history : [],
  }
}

function sanitizeSettings(settings) {
  return {
    businessName: settings.businessName,
    contactPhone: settings.contactPhone,
    contactEmail: settings.contactEmail,
    location: settings.location,
    defaultPickupPreference: settings.defaultPickupPreference,
    defaultRentalDays: settings.defaultRentalDays,
    maintenanceLeadDays: settings.maintenanceLeadDays,
  }
}

function buildCryptoAlertKey(request, type) {
  return [
    request.id,
    type,
    request.paymentStatus || "",
    request.monitoringState || "",
    request.blockchainTxid || "",
    request.receivedCryptoAmount || "",
    request.chainConfirmations || 0,
    request.paymentExpiresAt || "",
  ].join(":")
}

function createCryptoAlert(request, type, tone, title, detail) {
  const reviewKey = buildCryptoAlertKey(request, type)
  if (request.cryptoAlertReviewedState === reviewKey) {
    return null
  }

  return {
    id: reviewKey,
    requestId: request.id,
    type,
    tone,
    title,
    detail,
    customerName: request.customerName,
    sawName: request.sawName,
    cryptoCurrency: request.cryptoCurrency,
    paymentStatus: getEffectivePaymentStatus(request),
    monitoringState: request.monitoringState || "",
    lastChainCheckAt: request.lastChainCheckAt || null,
    reviewKey,
  }
}

function buildCryptoAlerts(state) {
  return state.requests
    .filter((request) => request.paymentMethod === "crypto")
    .map((request) => {
      const effectiveStatus = getEffectivePaymentStatus(request)
      const monitoringState = request.monitoringState || ""

      if (monitoringState === "monitor_error") {
        return createCryptoAlert(
          request,
          "monitor_error",
          "danger",
          "Crypto monitor error",
          request.monitorError || "The optional wallet monitor could not check this payment.",
        )
      }

      if (effectiveStatus === "underpaid" || monitoringState === "underpaid") {
        return createCryptoAlert(
          request,
          "underpaid",
          "danger",
          "Underpaid crypto payment",
          `Expected ${request.expectedCryptoAmount || request.cryptoAmount} ${request.cryptoCurrency}, received ${request.receivedCryptoAmount || "less"}.`,
        )
      }

      if (request.paymentStatus === "awaiting_txid_review") {
        const txidTail = request.customerSubmittedTxid
          ? request.customerSubmittedTxid.slice(-12)
          : "not recorded"
        return createCryptoAlert(
          request,
          "awaiting_txid_review",
          "warning",
          "Crypto TXID submitted",
          `Review the ${request.cryptoCurrency} transaction hash ending ${txidTail} against the stored USD quote basis.`,
        )
      }

      if (effectiveStatus === "expired" && request.paymentStatus !== "paid") {
        return createCryptoAlert(
          request,
          "expired",
          "warning",
          "Expired crypto quote",
          "The unpaid quote expired and needs fresh payment instructions.",
        )
      }

      if (request.paymentStatus === "crypto_payment_detected" || monitoringState === "awaiting_confirmations" || monitoringState === "payment_detected") {
        return createCryptoAlert(
          request,
          "awaiting_confirmations",
          "warning",
          "Payment detected, waiting confirmation",
          `${Number(request.chainConfirmations || 0)} chain confirmation${Number(request.chainConfirmations || 0) === 1 ? "" : "s"} recorded.`,
        )
      }

      return null
    })
    .filter(Boolean)
}

function adminSnapshot(state, { cryptoMonitorStatus = null } = {}) {
  const cryptoAlerts = buildCryptoAlerts(state)

  return {
    saws: state.saws.map(sanitizeSaw),
    requests: state.requests.map((request) => sanitizeRequest(request, { includeOpsCryptoDetails: true })),
    bookings: state.bookings.map((booking) => sanitizeBooking(booking, { includeOpsCryptoDetails: true })),
    maintenanceRecords: state.maintenanceRecords.map(sanitizeMaintenanceRecord),
    settings: sanitizeSettings(state.settings),
    cryptoAlerts,
    cryptoMonitor: cryptoMonitorStatus || {},
  }
}

export function createApp({
  cryptoRateProvider = null,
  cryptoAddressProvider = null,
  cryptoMonitor = null,
  cryptoMonitorRunner = null,
} = {}) {
  const app = express()
  const cryptoSchedulerConfig = readCryptoMonitorSchedulerConfig()
  const monitorRunner = cryptoMonitorRunner || createCryptoMonitorRunner({
    mutateState,
    cryptoMonitor,
  })
  const monitorScheduler = new CryptoMonitorScheduler({
    runner: monitorRunner,
    enabled: cryptoSchedulerConfig.enabled,
    intervalMs: cryptoSchedulerConfig.intervalMs,
  })
  monitorRunner.configureScheduler({
    enabled: cryptoSchedulerConfig.enabled,
    intervalMs: cryptoSchedulerConfig.intervalMs,
  })

  app.disable("x-powered-by")
  app.locals.cryptoMonitorRunner = monitorRunner
  app.locals.cryptoMonitorScheduler = monitorScheduler

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true })
  })

  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripeClient || !stripeWebhookSecret) {
      res.status(400).json({ error: "Stripe webhook is not configured." })
      return
    }

    let event

    try {
      const signature = req.headers["stripe-signature"]
      assert(Boolean(signature), 400, "Stripe signature is missing.")
      event = stripeClient.webhooks.constructEvent(req.body, signature, stripeWebhookSecret)
    } catch {
      res.status(400).json({ error: "Webhook verification failed." })
      return
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const requestId = session?.metadata?.requestId

      if (requestId) {
        await mutateState((state) => {
          const request = state.requests.find((entry) => entry.id === requestId)
          if (!request) return state

          request.paymentStatus = "paid"
          request.paymentMethod = request.paymentMethod || "stripe"
          request.paymentIntentId = String(session.payment_intent || "")
          request.checkoutSessionId = String(session.id || "")
          request.paidAt = new Date().toISOString()
          request.paymentConfirmedAt = request.paidAt
          request.updatedAt = new Date().toISOString()

          const booking = state.bookings.find((entry) => entry.requestId === requestId)
          if (booking) {
            booking.paymentStatus = "paid"
            booking.paymentMethod = request.paymentMethod
            booking.paymentIntentId = request.paymentIntentId
            booking.paymentConfirmedAt = request.paymentConfirmedAt
            booking.updatedAt = new Date().toISOString()
          }

          return state
        })
      }
    }

    res.json({ received: true })
  })

  app.use(express.json({ limit: "200kb" }))
  app.use(cookieParser())

  function handleAdminLogin(req, res, next) {
    try {
      const { password } = req.body || {}
      assert(typeof password === "string" && password.length > 0, 400, "Password is required.")

      const ok = verifyAdminPassword(password)
      if (!ok) {
        res.status(401).json({ error: "Invalid credentials." })
        return
      }

      const token = createSessionToken("owner")
      setAdminCookie(res, token)
      res.json({ authenticated: true })
    } catch (error) {
      next(error)
    }
  }

  function handleAdminLogout(_req, res) {
    clearAdminCookie(res)
    res.json({ authenticated: false })
  }

  function handleAdminSession(req, res, next) {
    try {
      const session = readAdminSession(req)
      res.json({ authenticated: Boolean(session) })
    } catch (error) {
      next(error)
    }
  }

  app.get("/api/public/inventory", async (_req, res, next) => {
    try {
      const state = await readState()
      res.json({
        saws: state.saws.map(sanitizeSaw),
        paymentsEnabled: Boolean(stripeClient),
        cryptoPaymentsEnabled: true,
        settings: sanitizeSettings(state.settings),
      })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/public/requests", async (req, res, next) => {
    try {
      const { name, phone, sawId, startDate, endDate, pickupPreference, notes } = req.body || {}

      assert(typeof name === "string" && name.trim().length >= 2, 400, "Name is required.")
      assert(isPhoneLike(phone), 400, "Phone number is invalid.")
      assert(typeof sawId === "string" && sawId.trim().length > 0, 400, "Saw selection is required.")
      assert(isIsoDate(startDate) && isIsoDate(endDate), 400, "Start and end dates are required.")

      const rentalDays = computeRentalDays(startDate, endDate)
      assert(rentalDays > 0, 400, "End date must be after or equal to start date.")

      const nextState = await mutateState((state) => {
        const saw = state.saws.find((entry) => entry.id === sawId)
        assert(Boolean(saw), 404, "Saw not found.")
        assert(saw.status === "available", 409, "Selected saw is not available.")

        const request = {
          id: crypto.randomUUID(),
          sawId: saw.id,
          sawName: saw.name,
          customerName: name.trim(),
          phone: String(phone || "").trim(),
          startDate,
          endDate,
          pickupPreference: String(pickupPreference || "pickup").trim() || "pickup",
          notes: String(notes || "").trim(),
          rentalDays,
          rentalTotalCents: Number(saw.dailyRateCents) * rentalDays,
          depositCents: Number(saw.depositCents),
          status: "requested",
          paymentMethod: "",
          paymentStatus: "pending",
          cryptoCurrency: "",
          cryptoAddress: "",
          cryptoAmount: "",
          cryptoAmountFiatSnapshot: null,
          cryptoRateSource: "",
          cryptoRateUsd: 0,
          cryptoRateQuotedAt: null,
          cryptoQrData: "",
          cryptoPaymentId: "",
          cryptoAttempt: 0,
          cryptoAddressProvider: "",
          destinationProvider: "",
          destinationUnique: false,
          destinationAllocationState: "",
          destinationAllocation: null,
          btcDerivationIndex: null,
          btcDerivationPath: "",
          xmrAccountIndex: null,
          xmrSubaddressIndex: null,
          paymentExpiresAt: null,
          paymentConfirmedAt: null,
          blockchainTxid: "",
          customerSubmittedTxid: "",
          customerTxidSubmittedAt: null,
          customerTxidNote: "",
          depositUsdAmount: Number((Number(saw.depositCents) / 100).toFixed(2)),
          refundableUsdAmount: Number((Number(saw.depositCents) / 100).toFixed(2)),
          expectedCryptoAmount: "",
          receivedCryptoAmount: "",
          monitoredAt: null,
          lastChainCheckAt: null,
          chainConfirmations: 0,
          monitoringState: "",
          paymentEvents: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        state.requests.unshift(request)
        state.updatedAt = new Date().toISOString()
        return state
      })

      const created = nextState.requests[0]
      res.status(201).json({ request: sanitizeRequest(created) })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/public/requests/:id", async (req, res, next) => {
    try {
      const state = await readState()
      const request = state.requests.find((entry) => entry.id === req.params.id)
      assert(Boolean(request), 404, "Request not found.")
      res.json({ request: sanitizeRequest(request) })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/public/checkout-session", async (req, res, next) => {
    try {
      assert(Boolean(stripeClient), 503, "Stripe payments are not configured.")

      const { requestId, origin } = req.body || {}
      assert(typeof requestId === "string" && requestId.trim().length > 0, 400, "requestId is required.")

      const state = await readState()
      const request = state.requests.find((entry) => entry.id === requestId)
      assert(Boolean(request), 404, "Request not found.")
      assert(request.status !== "denied", 409, "Cannot pay deposit for denied request.")

      const saw = state.saws.find((entry) => entry.id === request.sawId)
      assert(Boolean(saw), 404, "Associated saw not found.")

      const originCandidate = String(origin || req.headers.origin || "").trim()
      let parsedOrigin
      try {
        parsedOrigin = new URL(originCandidate)
      } catch {
        assert(false, 400, "Invalid origin.")
      }
      assert(["http:", "https:"].includes(parsedOrigin.protocol), 400, "Invalid origin.")

      const successUrl = `${parsedOrigin.origin}/?checkout=success&requestId=${encodeURIComponent(request.id)}`
      const cancelUrl = `${parsedOrigin.origin}/?checkout=cancel&requestId=${encodeURIComponent(request.id)}`

      const session = await stripeClient.checkout.sessions.create({
        ui_mode: "hosted",
        mode: "payment",
        payment_method_types: ["card"],
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Number(request.depositCents),
              product_data: {
                name: `Deposit - ${saw.name}`,
                description: `${request.startDate} to ${request.endDate} (${request.rentalDays} day${request.rentalDays === 1 ? "" : "s"})`,
              },
            },
          },
        ],
        metadata: {
          requestId: request.id,
          kind: "deposit",
        },
      })

      assert(typeof session.url === "string" && session.url.length > 0, 500, "Stripe Checkout URL was not generated.")

      await mutateState((draft) => {
        const target = draft.requests.find((entry) => entry.id === request.id)
        if (target) {
          target.paymentMethod = "stripe"
          target.checkoutSessionId = String(session.id)
          target.updatedAt = new Date().toISOString()
        }
        return draft
      })

      res.json({ sessionId: session.id, sessionUrl: session.url, url: session.url })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/public/requests/:id/crypto-payment", async (req, res, next) => {
    try {
      const { currency } = req.body || {}
      const normalizedCurrency = normalizeCryptoCurrency(currency)
      assert(Boolean(normalizedCurrency), 400, "Crypto currency must be BTC or XMR.")

      const now = new Date()
      const config = readCryptoConfig()
      const nextState = await mutateState(async (state) => {
        const request = state.requests.find((entry) => entry.id === req.params.id)
        assert(Boolean(request), 404, "Request not found.")

        const cryptoPayment = await createCryptoPayment({
          request,
          currency: normalizedCurrency,
          config,
          ...(cryptoRateProvider ? { rateProvider: cryptoRateProvider } : {}),
          ...(cryptoAddressProvider ? { addressProvider: cryptoAddressProvider } : {}),
          now,
        })

        Object.assign(request, cryptoPayment, {
          updatedAt: now.toISOString(),
        })

        return state
      })

      const updated = nextState.requests.find((entry) => entry.id === req.params.id)
      res.status(201).json({ request: sanitizeRequest(updated) })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/public/requests/:id/crypto-payment/txid", async (req, res, next) => {
    try {
      const { txid, note } = req.body || {}
      const now = new Date()
      const nextState = await mutateState((state) => {
        const request = state.requests.find((entry) => entry.id === req.params.id)
        assert(Boolean(request), 404, "Request not found.")
        const submittedTxid = String(txid || "").trim().toLowerCase()
        if (/^[a-f0-9]{64}$/.test(submittedTxid)) {
          const duplicate = state.requests.find(
            (entry) =>
              entry.id !== request.id &&
              entry.paymentMethod === "crypto" &&
              (String(entry.customerSubmittedTxid || "").toLowerCase() === submittedTxid ||
                String(entry.blockchainTxid || "").toLowerCase() === submittedTxid),
          )
          assert(!duplicate, 409, "Transaction ID is already attached to another crypto payment.")
        }

        submitCryptoTxid(request, { txid, note, now })
        request.updatedAt = now.toISOString()

        const booking = state.bookings.find((entry) => entry.requestId === request.id)
        syncCryptoPaymentToBooking(request, booking, now)

        return state
      })

      const updated = nextState.requests.find((entry) => entry.id === req.params.id)
      res.json({ request: sanitizeRequest(updated) })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/admin/login", handleAdminLogin)
  app.post("/api/admin/logout", handleAdminLogout)
  app.get("/api/admin/session", handleAdminSession)

  // Compatibility aliases for admin UIs that post directly under /admin/*.
  app.post("/admin/login", handleAdminLogin)
  app.post("/admin/logout", handleAdminLogout)
  app.get("/admin/session", handleAdminSession)

  app.get("/api/admin/dashboard", requireAdmin, async (_req, res, next) => {
    try {
      const state = await readState()
      res.json(adminSnapshot(state, { cryptoMonitorStatus: monitorRunner.getStatus() }))
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/settings", requireAdmin, async (req, res, next) => {
    try {
      const {
        businessName,
        contactPhone,
        contactEmail,
        location,
        defaultPickupPreference,
        defaultRentalDays,
        maintenanceLeadDays,
      } = req.body || {}

      if (businessName !== undefined) {
        assert(typeof businessName === "string" && businessName.trim().length >= 2, 400, "Business name is required.")
      }
      if (contactPhone !== undefined) {
        assert(contactPhone === "" || isPhoneLike(contactPhone), 400, "Contact phone is invalid.")
      }
      if (contactEmail !== undefined) {
        assert(contactEmail === "" || isEmailLike(contactEmail), 400, "Contact email is invalid.")
      }
      if (location !== undefined) {
        assert(typeof location === "string" && location.trim().length <= 120, 400, "Location is invalid.")
      }
      if (defaultPickupPreference !== undefined) {
        assert(["pickup", "dropoff", "flexible"].includes(defaultPickupPreference), 400, "Default pickup preference is invalid.")
      }

      const parsedDefaultRentalDays = defaultRentalDays === undefined ? undefined : Number.parseInt(defaultRentalDays, 10)
      const parsedMaintenanceLeadDays = maintenanceLeadDays === undefined ? undefined : Number.parseInt(maintenanceLeadDays, 10)

      if (parsedDefaultRentalDays !== undefined) {
        assert(Number.isFinite(parsedDefaultRentalDays) && parsedDefaultRentalDays >= 1 && parsedDefaultRentalDays <= 14, 400, "Default rental days must be between 1 and 14.")
      }
      if (parsedMaintenanceLeadDays !== undefined) {
        assert(Number.isFinite(parsedMaintenanceLeadDays) && parsedMaintenanceLeadDays >= 0 && parsedMaintenanceLeadDays <= 30, 400, "Maintenance lead days must be between 0 and 30.")
      }

      const nextState = await mutateState((state) => {
        state.settings = {
          ...state.settings,
          ...(businessName !== undefined ? { businessName: businessName.trim() } : {}),
          ...(contactPhone !== undefined ? { contactPhone: String(contactPhone).trim() } : {}),
          ...(contactEmail !== undefined ? { contactEmail: String(contactEmail).trim() } : {}),
          ...(location !== undefined ? { location: location.trim() } : {}),
          ...(defaultPickupPreference !== undefined ? { defaultPickupPreference } : {}),
          ...(parsedDefaultRentalDays !== undefined ? { defaultRentalDays: parsedDefaultRentalDays } : {}),
          ...(parsedMaintenanceLeadDays !== undefined ? { maintenanceLeadDays: parsedMaintenanceLeadDays } : {}),
        }
        return state
      })

      res.json({ settings: sanitizeSettings(nextState.settings) })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/admin/maintenance", requireAdmin, async (req, res, next) => {
    try {
      const { sawId, summary, details, priority, dueDate } = req.body || {}

      assert(typeof sawId === "string" && sawId.trim().length > 0, 400, "Saw selection is required.")
      assert(typeof summary === "string" && summary.trim().length >= 3, 400, "Maintenance summary is required.")
      assert(details === undefined || typeof details === "string", 400, "Maintenance details are invalid.")
      assert(["low", "medium", "high"].includes(priority), 400, "Maintenance priority is invalid.")
      assert(!dueDate || isIsoDate(dueDate), 400, "Maintenance due date is invalid.")

      const now = new Date().toISOString()
      const nextState = await mutateState((state) => {
        const saw = state.saws.find((entry) => entry.id === sawId)
        assert(Boolean(saw), 404, "Saw not found.")

        const record = {
          id: crypto.randomUUID(),
          sawId: saw.id,
          sawName: saw.name,
          summary: summary.trim(),
          details: String(details || "").trim(),
          priority,
          status: "open",
          dueDate: dueDate || "",
          createdAt: now,
          updatedAt: now,
          completedAt: null,
          history: [
            {
              id: crypto.randomUUID(),
              type: "created",
              note: String(details || summary).trim(),
              status: "open",
              createdAt: now,
            },
          ],
        }

        state.maintenanceRecords.unshift(record)

        const hasActiveBooking = state.bookings.some(
          (booking) => booking.sawId === saw.id && isActiveBooking(booking.status),
        )

        if (!hasActiveBooking && saw.status !== "unavailable") {
          saw.status = "maintenance"
          saw.updatedAt = now
        }

        return state
      })

      res.status(201).json({ record: sanitizeMaintenanceRecord(nextState.maintenanceRecords[0]) })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/maintenance/:id", requireAdmin, async (req, res, next) => {
    try {
      const { status, note, summary, details, priority, dueDate } = req.body || {}

      if (status !== undefined) {
        assert(["open", "in_progress", "completed"].includes(status), 400, "Maintenance status is invalid.")
      }
      if (note !== undefined) {
        assert(typeof note === "string" && note.trim().length >= 2, 400, "Maintenance note is invalid.")
      }
      if (summary !== undefined) {
        assert(typeof summary === "string" && summary.trim().length >= 3, 400, "Maintenance summary is invalid.")
      }
      if (details !== undefined) {
        assert(typeof details === "string", 400, "Maintenance details are invalid.")
      }
      if (priority !== undefined) {
        assert(["low", "medium", "high"].includes(priority), 400, "Maintenance priority is invalid.")
      }
      if (dueDate !== undefined) {
        assert(dueDate === "" || isIsoDate(dueDate), 400, "Maintenance due date is invalid.")
      }

      const now = new Date().toISOString()
      const nextState = await mutateState((state) => {
        const record = state.maintenanceRecords.find((entry) => entry.id === req.params.id)
        assert(Boolean(record), 404, "Maintenance record not found.")

        const previousStatus = record.status
        if (summary !== undefined) record.summary = summary.trim()
        if (details !== undefined) record.details = details.trim()
        if (priority !== undefined) record.priority = priority
        if (dueDate !== undefined) record.dueDate = dueDate
        if (status !== undefined) record.status = status

        record.updatedAt = now
        if (status === "completed") {
          record.completedAt = now
        } else if (status && previousStatus === "completed") {
          record.completedAt = null
        }

        if (note !== undefined || status !== undefined || summary !== undefined || details !== undefined || priority !== undefined || dueDate !== undefined) {
          record.history = Array.isArray(record.history) ? record.history : []
          record.history.unshift({
            id: crypto.randomUUID(),
            type: status !== undefined ? "status" : "note",
            note: String(note || details || summary || "Maintenance record updated.").trim(),
            status: record.status,
            createdAt: now,
          })
        }

        const saw = state.saws.find((entry) => entry.id === record.sawId)
        if (saw && saw.status !== "unavailable") {
          if (record.status === "completed") {
            const otherOpenRecords = state.maintenanceRecords.some(
              (entry) => entry.id !== record.id && entry.sawId === record.sawId && entry.status !== "completed",
            )
            if (!otherOpenRecords) {
              if (saw.status === "maintenance") {
                saw.status = "available"
              }
              updateSawAvailability(state, saw.id)
            }
          } else {
            const hasActiveBooking = state.bookings.some(
              (booking) => booking.sawId === saw.id && isActiveBooking(booking.status),
            )
            if (!hasActiveBooking) {
              saw.status = "maintenance"
              saw.updatedAt = now
            }
          }
        }

        return state
      })

      const record = nextState.maintenanceRecords.find((entry) => entry.id === req.params.id)
      res.json({ record: sanitizeMaintenanceRecord(record) })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/requests/:id", requireAdmin, async (req, res, next) => {
    try {
      const { status } = req.body || {}
      assert(["approved", "denied"].includes(status), 400, "Invalid request status.")

      const nextState = await mutateState((state) => {
        const request = state.requests.find((entry) => entry.id === req.params.id)
        assert(Boolean(request), 404, "Request not found.")
        assert(["requested", "approved"].includes(request.status), 409, "Request cannot be updated.")

        if (status === "approved") {
          assert(request.paymentStatus === "paid", 409, "Deposit payment is required before approval.")
        }

        request.status = status
        request.updatedAt = new Date().toISOString()
        return state
      })

      const updated = nextState.requests.find((entry) => entry.id === req.params.id)
      res.json({ request: sanitizeRequest(updated, { includeOpsCryptoDetails: true }) })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/requests/:id/crypto-payment", requireAdmin, async (req, res, next) => {
    try {
      const { action, blockchainTxid, note } = req.body || {}
      assert(["detected", "confirm", "underpaid", "cancel"].includes(action), 400, "Invalid crypto payment action.")

      const now = new Date()
      const nextState = await mutateState((state) => {
        const request = state.requests.find((entry) => entry.id === req.params.id)
        assert(Boolean(request), 404, "Request not found.")

        applyCryptoTransition(request, action, {
          blockchainTxid,
          note,
          now,
        })
        request.updatedAt = now.toISOString()

        const booking = state.bookings.find((entry) => entry.requestId === request.id)
        syncCryptoPaymentToBooking(request, booking, now)

        return state
      })

      const updated = nextState.requests.find((entry) => entry.id === req.params.id)
      res.json({ request: sanitizeRequest(updated, { includeOpsCryptoDetails: true }) })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/admin/crypto-monitor/run", requireAdmin, async (_req, res, next) => {
    try {
      const result = await monitorRunner.runOnce({ source: "manual" })
      const state = result.state || await readState()

      res.json({
        checked: result.checked || 0,
        updated: result.updated || 0,
        skipped: result.skipped === true,
        reason: result.reason || "",
        results: result.results || [],
        dashboard: adminSnapshot(state, { cryptoMonitorStatus: monitorRunner.getStatus() }),
      })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/requests/:id/crypto-alert", requireAdmin, async (req, res, next) => {
    try {
      const { reviewKey } = req.body || {}
      assert(typeof reviewKey === "string" && reviewKey.trim().length > 0, 400, "reviewKey is required.")

      const now = new Date()
      const nextState = await mutateState((state) => {
        const request = state.requests.find((entry) => entry.id === req.params.id)
        assert(Boolean(request), 404, "Request not found.")
        assert(request.paymentMethod === "crypto", 409, "Request is not using crypto payment.")

        request.cryptoAlertReviewedAt = now.toISOString()
        request.cryptoAlertReviewedState = reviewKey.trim()
        request.updatedAt = now.toISOString()

        const booking = state.bookings.find((entry) => entry.requestId === request.id)
        syncCryptoPaymentToBooking(request, booking, now)

        return state
      })

      const updated = nextState.requests.find((entry) => entry.id === req.params.id)
      res.json({
        request: sanitizeRequest(updated, { includeOpsCryptoDetails: true }),
        dashboard: adminSnapshot(nextState, { cryptoMonitorStatus: monitorRunner.getStatus() }),
      })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/admin/requests/:id/convert", requireAdmin, async (req, res, next) => {
    try {
      const nextState = await mutateState((state) => {
        const request = state.requests.find((entry) => entry.id === req.params.id)
        assert(Boolean(request), 404, "Request not found.")
        assert(request.status === "approved", 409, "Request must be approved before conversion.")
        assert(request.paymentStatus === "paid", 409, "Deposit must be paid before conversion.")
        assert(!request.bookingId, 409, "Request is already converted.")
        assert(isSawAvailableForBooking(state, request.sawId), 409, "Saw is no longer available.")

        const booking = {
          id: crypto.randomUUID(),
          requestId: request.id,
          sawId: request.sawId,
          sawName: request.sawName,
          customerName: request.customerName,
          phone: request.phone,
          startDate: request.startDate,
          endDate: request.endDate,
          pickupPreference: request.pickupPreference,
          notes: request.notes,
          rentalDays: request.rentalDays,
          rentalTotalCents: request.rentalTotalCents,
          depositCents: request.depositCents,
          paymentMethod: request.paymentMethod || "",
          paymentStatus: request.paymentStatus,
          cryptoCurrency: request.cryptoCurrency || "",
          cryptoAddress: request.cryptoAddress || "",
          cryptoAmount: request.cryptoAmount || "",
          cryptoAmountFiatSnapshot: request.cryptoAmountFiatSnapshot || null,
          cryptoRateSource: request.cryptoRateSource || request.cryptoAmountFiatSnapshot?.rateSource || "",
          cryptoRateUsd: Number(request.cryptoRateUsd || request.cryptoAmountFiatSnapshot?.rateUsd || 0),
          cryptoRateQuotedAt: request.cryptoRateQuotedAt || request.cryptoAmountFiatSnapshot?.quotedAt || null,
          cryptoQrData: request.cryptoQrData || "",
          cryptoPaymentId: request.cryptoPaymentId || "",
          cryptoAttempt: Number(request.cryptoAttempt || 0),
          cryptoAddressProvider: request.cryptoAddressProvider || "",
          paymentExpiresAt: request.paymentExpiresAt || null,
          paymentConfirmedAt: request.paymentConfirmedAt || request.paidAt || null,
          blockchainTxid: request.blockchainTxid || "",
          depositUsdAmount: Number.isFinite(Number(request.depositUsdAmount))
            ? Number(request.depositUsdAmount)
            : Number((Number(request.depositCents || 0) / 100).toFixed(2)),
          refundableUsdAmount: Number.isFinite(Number(request.refundableUsdAmount))
            ? Number(request.refundableUsdAmount)
            : Number((Number(request.depositCents || 0) / 100).toFixed(2)),
          ...buildCryptoOpsFields(request),
          paymentEvents: Array.isArray(request.paymentEvents) ? request.paymentEvents : [],
          status: "requested",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        state.bookings.unshift(booking)
        request.status = "converted"
        request.bookingId = booking.id
        request.updatedAt = new Date().toISOString()

        const saw = state.saws.find((entry) => entry.id === request.sawId)
        if (saw && saw.status === "available") {
          saw.status = "out"
          saw.updatedAt = new Date().toISOString()
        }

        return state
      })

      const booking = nextState.bookings[0]
      res.status(201).json({ booking: sanitizeBooking(booking, { includeOpsCryptoDetails: true }) })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/bookings/:id/status", requireAdmin, async (req, res, next) => {
    try {
      const { status } = req.body || {}
      assert(typeof status === "string", 400, "Booking status is required.")

      const nextState = await mutateState((state) => {
        const booking = state.bookings.find((entry) => entry.id === req.params.id)
        assert(Boolean(booking), 404, "Booking not found.")

        const expected = BOOKING_TRANSITIONS[booking.status]
        assert(expected === status, 409, `Booking must transition to ${expected || "<none>"}.`)

        booking.status = status
        booking.updatedAt = new Date().toISOString()

        if (status === "returned") {
          updateSawAvailability(state, booking.sawId)
        } else {
          const saw = state.saws.find((entry) => entry.id === booking.sawId)
          if (saw && saw.status === "available") {
            saw.status = "out"
            saw.updatedAt = new Date().toISOString()
          }
        }

        return state
      })

      const booking = nextState.bookings.find((entry) => entry.id === req.params.id)
      res.json({ booking: sanitizeBooking(booking, { includeOpsCryptoDetails: true }) })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/saws/:id/status", requireAdmin, async (req, res, next) => {
    try {
      const { status } = req.body || {}
      assert(["available", "maintenance", "unavailable"].includes(status), 400, "Invalid saw status.")

      const nextState = await mutateState((state) => {
        const saw = state.saws.find((entry) => entry.id === req.params.id)
        assert(Boolean(saw), 404, "Saw not found.")

        const hasActiveBooking = state.bookings.some(
          (booking) => booking.sawId === saw.id && isActiveBooking(booking.status),
        )
        const hasOpenMaintenance = hasOpenMaintenanceRecord(state, saw.id)

        if (status === "available") {
          assert(!hasActiveBooking, 409, "Cannot restore availability while booking is active.")
          assert(!hasOpenMaintenance, 409, "Complete open maintenance records before restoring availability.")
        } else {
          assert(!hasActiveBooking, 409, "Cannot change saw status while booking is active.")
        }

        saw.status = status
        saw.updatedAt = new Date().toISOString()
        return state
      })

      const saw = nextState.saws.find((entry) => entry.id === req.params.id)
      res.json({ saw: sanitizeSaw(saw) })
    } catch (error) {
      next(error)
    }
  })

  return app
}

export async function startServer({ port = PORT } = {}) {
  const app = createApp()

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found." })
  })

  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite")
    const vite = await createServer({
      root: ROOT_DIR,
      configLoader: "native",
      server: { middlewareMode: true },
      appType: "custom",
    })

    app.use(vite.middlewares)

    app.use(async (req, res, next) => {
      if (req.method !== "GET") {
        next()
        return
      }

      try {
        const url = req.originalUrl
        const templatePath = path.join(ROOT_DIR, "index.html")
        const html = await fs.readFile(templatePath, "utf8")
        const result = await vite.transformIndexHtml(url, html)
        res.status(200).set({ "Content-Type": "text/html" }).end(result)
      } catch (error) {
        vite.ssrFixStacktrace(error)
        next(error)
      }
    })
  } else {
    app.use(express.static(DIST_DIR))
    app.use((req, res, next) => {
      if (req.method !== "GET") {
        next()
        return
      }

      res.sendFile(path.join(DIST_DIR, "index.html"))
    })
  }

  app.use((error, _req, res, next) => {
    void next
    const status = Number(error?.status || 500)
    const message = status >= 500 ? "Internal server error." : error.message
    res.status(status).json({ error: message })
  })

  const server = app.listen(port, () => {
    console.log(`Saw Rent server listening on port ${port}`)
    const started = app.locals.cryptoMonitorScheduler?.start()
    if (started) {
      const status = app.locals.cryptoMonitorRunner?.getStatus()
      console.log(`Crypto monitor scheduler running every ${Math.round(Number(status?.intervalMs || 0) / 1000)}s`)
    }
  })

  server.on("close", () => {
    app.locals.cryptoMonitorScheduler?.stop()
  })

  return server
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename

if (isDirectRun && process.env.SAW_RENT_NO_AUTOSTART !== "1") {
  startServer().catch((error) => {
    console.error("Server failed to start", error)
    process.exit(1)
  })
}

