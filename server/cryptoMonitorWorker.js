import crypto from "node:crypto"

import { getEffectivePaymentStatus, readCryptoConfig } from "./cryptoPayments.js"
import {
  CRYPTO_MONITORING_STATES,
  CryptoPaymentMonitor,
  createCryptoMonitorProvider,
} from "./cryptoMonitoring.js"

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase())
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function appendMonitorEvent(request, event) {
  request.paymentEvents = [
    {
      id: crypto.randomUUID(),
      ...event,
    },
    ...(Array.isArray(request.paymentEvents) ? request.paymentEvents : []),
  ]
}

export function readCryptoMonitorSchedulerConfig(env = process.env) {
  const intervalMs = parsePositiveInt(
    env.CRYPTO_MONITOR_INTERVAL_MS,
    parsePositiveInt(env.CRYPTO_MONITOR_INTERVAL_MINUTES, 5) * 60 * 1000,
  )

  return {
    enabled: parseBoolean(env.CRYPTO_MONITOR_SCHEDULER_ENABLED, false),
    intervalMs,
    staleAlertMinutes: parsePositiveInt(env.CRYPTO_MONITOR_STALE_ALERT_MINUTES, 10),
  }
}

export function syncCryptoPaymentToBooking(request, booking, now = new Date()) {
  if (!request || !booking) return

  const fields = [
    "paymentStatus",
    "paymentMethod",
    "paymentConfirmedAt",
    "blockchainTxid",
    "receivedCryptoAmount",
    "customerSubmittedTxid",
    "customerTxidSubmittedAt",
    "customerTxidNote",
    "chainConfirmations",
    "monitoredAt",
    "lastChainCheckAt",
    "monitoringState",
    "monitorError",
    "cryptoAlertReviewedAt",
    "cryptoAlertReviewedState",
    "paymentEvents",
  ]

  for (const field of fields) {
    booking[field] = request[field]
  }

  booking.updatedAt = now.toISOString()
}

export function shouldMonitorCryptoRequest(request, now = new Date()) {
  if (!request || request.paymentMethod !== "crypto") return false
  if (["paid", "cancelled"].includes(request.paymentStatus)) return false
  return [
    "awaiting_crypto_payment",
    "awaiting_txid_submission",
    "awaiting_txid_review",
    "crypto_payment_detected",
    "underpaid",
    "expired",
  ].includes(getEffectivePaymentStatus(request, now))
}

export class CryptoMonitorRunner {
  constructor({
    mutateState,
    monitorFactory,
    now = () => new Date(),
  } = {}) {
    this.mutateState = mutateState
    this.monitorFactory = monitorFactory
    this.now = now
    this.running = false
    this.status = {
      automaticEnabled: false,
      intervalMs: 0,
      running: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastRunSource: "",
      lastRunChecked: 0,
      lastRunUpdated: 0,
      lastRunSkipped: false,
      lastError: "",
    }
  }

  configureScheduler({ enabled = false, intervalMs = 0 } = {}) {
    this.status.automaticEnabled = Boolean(enabled)
    this.status.intervalMs = Number(intervalMs || 0)
  }

  getStatus() {
    return { ...this.status, running: this.running }
  }

  async runOnce({ source = "manual" } = {}) {
    if (this.running) {
      return {
        skipped: true,
        reason: "monitor_already_running",
        status: this.getStatus(),
        results: [],
      }
    }

    if (typeof this.mutateState !== "function") {
      throw new Error("Crypto monitor runner is not configured with state access.")
    }

    this.running = true
    const startedAt = this.now()
    this.status = {
      ...this.status,
      running: true,
      lastStartedAt: startedAt.toISOString(),
      lastRunSource: source,
      lastRunSkipped: false,
      lastError: "",
    }

    const monitor = this.monitorFactory()
    const runResults = []
    let updatedCount = 0
    let nextState = null

    try {
      nextState = await this.mutateState(async (state) => {
        for (const request of state.requests) {
          const now = this.now()
          if (!shouldMonitorCryptoRequest(request, now)) {
            continue
          }

          const effectiveStatus = getEffectivePaymentStatus(request, now)
          if (effectiveStatus === "expired") {
            request.monitoredAt = request.monitoredAt || now.toISOString()
            request.lastChainCheckAt = now.toISOString()
            request.monitoringState = CRYPTO_MONITORING_STATES.EXPIRED
            request.updatedAt = now.toISOString()
            const booking = state.bookings.find((entry) => entry.requestId === request.id)
            syncCryptoPaymentToBooking(request, booking, now)
            runResults.push({
              requestId: request.id,
              action: "expired",
              beforeStatus: request.paymentStatus,
              afterStatus: getEffectivePaymentStatus(request, now),
              results: [],
            })
            updatedCount += 1
            continue
          }

          const beforeStatus = request.paymentStatus
          const beforeMonitoringState = request.monitoringState || ""

          try {
            const results = await monitor.checkRequest(request, { now })
            request.updatedAt = now.toISOString()
            const booking = state.bookings.find((entry) => entry.requestId === request.id)
            syncCryptoPaymentToBooking(request, booking, now)
            runResults.push({
              requestId: request.id,
              action: request.paymentStatus === "paid" ? "paid" : "checked",
              beforeStatus,
              afterStatus: request.paymentStatus,
              beforeMonitoringState,
              afterMonitoringState: request.monitoringState || "",
              results,
            })
            updatedCount += results.length > 0 || beforeMonitoringState !== request.monitoringState ? 1 : 0
          } catch (error) {
            request.monitoredAt = request.monitoredAt || now.toISOString()
            request.lastChainCheckAt = now.toISOString()
            request.monitoringState = CRYPTO_MONITORING_STATES.ERROR
            request.monitorError = error.message || "Crypto monitor failed."
            request.updatedAt = now.toISOString()
            appendMonitorEvent(request, {
              type: "crypto_monitor_error",
              status: request.paymentStatus,
              cryptoPaymentId: request.cryptoPaymentId || "",
              message: request.monitorError,
              createdAt: now.toISOString(),
            })
            const booking = state.bookings.find((entry) => entry.requestId === request.id)
            syncCryptoPaymentToBooking(request, booking, now)
            runResults.push({
              requestId: request.id,
              action: "monitor_error",
              beforeStatus,
              afterStatus: request.paymentStatus,
              error: request.monitorError,
            })
            updatedCount += 1
          }
        }

        return state
      })

      const finishedAt = this.now()
      this.running = false
      this.status = {
        ...this.status,
        running: false,
        lastFinishedAt: finishedAt.toISOString(),
        lastRunChecked: runResults.length,
        lastRunUpdated: updatedCount,
      }

      return {
        skipped: false,
        checked: runResults.length,
        updated: updatedCount,
        results: runResults,
        state: nextState,
        status: this.getStatus(),
      }
    } catch (error) {
      const finishedAt = this.now()
      this.running = false
      this.status = {
        ...this.status,
        running: false,
        lastFinishedAt: finishedAt.toISOString(),
        lastError: error.message || "Crypto monitor run failed.",
      }
      throw error
    } finally {
      this.running = false
    }
  }
}

export class CryptoMonitorScheduler {
  constructor({
    runner,
    enabled = false,
    intervalMs = 5 * 60 * 1000,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = {}) {
    this.runner = runner
    this.enabled = Boolean(enabled)
    this.intervalMs = intervalMs
    this.setIntervalFn = setIntervalFn
    this.clearIntervalFn = clearIntervalFn
    this.timer = null
    this.runner?.configureScheduler({ enabled: this.enabled, intervalMs: this.intervalMs })
  }

  start() {
    if (!this.enabled || this.timer) {
      return false
    }

    this.timer = this.setIntervalFn(() => {
      void this.runScheduled()
    }, this.intervalMs)

    if (typeof this.timer?.unref === "function") {
      this.timer.unref()
    }

    return true
  }

  async runScheduled() {
    if (!this.enabled) {
      return { skipped: true, reason: "scheduler_disabled" }
    }

    try {
      return await this.runner.runOnce({ source: "scheduled" })
    } catch (error) {
      return {
        skipped: false,
        error: error.message || "Scheduled crypto monitor failed.",
        status: this.runner.getStatus(),
      }
    }
  }

  stop() {
    if (!this.timer) {
      return false
    }

    this.clearIntervalFn(this.timer)
    this.timer = null
    return true
  }
}

export function createCryptoMonitorRunner({ mutateState, cryptoMonitor = null, now } = {}) {
  return new CryptoMonitorRunner({
    mutateState,
    now,
    monitorFactory: () => {
      if (cryptoMonitor) return cryptoMonitor
      const config = readCryptoConfig()
      return new CryptoPaymentMonitor({
        provider: createCryptoMonitorProvider(config.monitoring),
        minConfirmations: config.monitoring.minConfirmations,
      })
    },
  })
}
