import { useMemo, useState } from "react"

import { SawRentShell, WindowSurface } from "../../components/os/SawRentShell"
import { useWindowManager } from "../../components/os/useWindowManager"
import {
  formatDateRange,
  formatDateTime,
  formatMoney,
  getStatusTone,
  normalizeStatusLabel,
} from "../../lib/presentation"
import { getCryptoCopyFields, getCryptoExplorerUrl } from "../../lib/cryptoReview"

const MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "DB", size: "wide", description: "Counter-wide operational overview" },
  { key: "reservations", label: "Chainsaw Rentals", icon: "RS", size: "wide", description: "Approve requests and move rentals into checkout" },
  { key: "checkout", label: "Checkout", icon: "CO", size: "wide", description: "Advance live rental orders" },
  { key: "inventory", label: "Inventory", icon: "IV", size: "wide", description: "Inspect saw status and availability" },
  { key: "customers", label: "Customers", icon: "CU", size: "standard", description: "Customer history and active work" },
  { key: "calendar", label: "Calendar", icon: "CA", size: "standard", description: "Date-driven reservation view" },
  { key: "maintenance", label: "Maintenance", icon: "MT", size: "standard", description: "Persisted service records and queue", side: "right" },
  { key: "settings", label: "Settings", icon: "ST", size: "standard", description: "Saved business and workflow settings", side: "right" },
]

const DEFAULT_OPEN_WINDOWS = []
const WORKSPACE_STORAGE_KEY = "saw-rent-admin-workspace-v2"
const LEGACY_WORKSPACE_STORAGE_KEYS = ["saw-rent-admin-workspace-v2"]
const WORKSPACE_RESTORE_PARAM = "restoreWorkspace"
const MODULE_QUERY_PARAM = "module"
const MODULE_LAUNCH_PARAM = "launch"

function isValidModuleKey(key) {
  return MODULES.some((module) => module.key === key)
}

function readAdminBootIntent() {
  if (typeof window === "undefined") {
    return {
      restoreFromStorage: false,
      moduleKey: "",
    }
  }

  const params = new URLSearchParams(window.location.search)
  const restoreValue = (params.get(WORKSPACE_RESTORE_PARAM) || "").trim().toLowerCase()
  const requestedModule = params.get(MODULE_QUERY_PARAM) || ""
  const launchValue = (params.get(MODULE_LAUNCH_PARAM) || "").trim().toLowerCase()

  return {
    restoreFromStorage: ["1", "true", "yes"].includes(restoreValue),
    moduleKey: (launchValue === "module" || requestedModule) && isValidModuleKey(requestedModule) ? requestedModule : "",
  }
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10)
}

function getDaysUntil(dateString) {
  if (!dateString) return null
  const today = new Date(getTodayIso())
  const target = new Date(dateString)
  if (Number.isNaN(target.getTime())) return null
  return Math.round((target - today) / (24 * 60 * 60 * 1000))
}

function getDueTone(record, leadDays) {
  if (!record?.dueDate || record.status === "completed") return "neutral"
  const daysUntil = getDaysUntil(record.dueDate)
  if (daysUntil === null) return "neutral"
  if (daysUntil < 0) return "danger"
  if (daysUntil <= leadDays) return "warning"
  return "info"
}

function getPaymentMethodLabel(entry) {
  if (entry.paymentMethod === "crypto") {
    return `${entry.cryptoCurrency || "Crypto"} deposit`
  }

  if (entry.paymentMethod === "stripe") {
    return "Card deposit"
  }

  return "Payment not selected"
}

function getCryptoRateUsd(entry) {
  const rate = Number(entry?.cryptoRateUsd || entry?.cryptoAmountFiatSnapshot?.rateUsd || 0)
  return Number.isFinite(rate) && rate > 0 ? rate : 0
}

function getCryptoRateSource(entry) {
  return entry?.cryptoRateSource || entry?.cryptoAmountFiatSnapshot?.rateSource || "unknown"
}

function getCryptoQuoteTime(entry) {
  return entry?.cryptoRateQuotedAt || entry?.cryptoAmountFiatSnapshot?.quotedAt || null
}

function getUsdAmount(value, fallbackCents = 0) {
  const amount = Number(value)
  if (Number.isFinite(amount) && amount >= 0) return amount
  return Number((Number(fallbackCents || 0) / 100).toFixed(2))
}

function buildCustomers(requests, bookings) {
  const map = new Map()
  function ensureCustomer(entry) {
    const key = entry.phone || entry.customerName
    if (!key) return null

    if (!map.has(key)) {
      map.set(key, {
        key,
        name: entry.customerName || "Walk-in customer",
        phone: entry.phone || "No phone",
        requests: [],
        bookings: [],
        activities: [],
        depositsHeldCents: 0,
        rentalRevenueCents: 0,
        activeItems: 0,
        lastActivityAt: "",
        currentStatus: "unknown",
      })
    }

    return map.get(key)
  }

  for (const request of requests) {
    const customer = ensureCustomer(request)
    if (!customer) continue

    customer.requests.push(request)
    customer.activities.push({
      id: request.id,
      kind: "Request",
      status: request.status,
      sawName: request.sawName,
      startDate: request.startDate,
      endDate: request.endDate,
      paymentStatus: request.paymentStatus,
      paymentMethod: request.paymentMethod || "",
      cryptoCurrency: request.cryptoCurrency || "",
      createdAt: request.createdAt,
      updatedAt: request.updatedAt || request.createdAt,
      notes: request.notes || "",
    })

    if (["requested", "approved"].includes(request.status) && request.paymentStatus === "paid") {
      customer.depositsHeldCents += Number(request.depositCents || 0)
    }
  }

  for (const booking of bookings) {
    const customer = ensureCustomer(booking)
    if (!customer) continue

    customer.bookings.push(booking)
    customer.activities.push({
      id: booking.id,
      kind: "Order",
      status: booking.status,
      sawName: booking.sawName,
      startDate: booking.startDate,
      endDate: booking.endDate,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod || "",
      cryptoCurrency: booking.cryptoCurrency || "",
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt || booking.createdAt,
      notes: booking.notes || "",
    })

    customer.rentalRevenueCents += Number(booking.rentalTotalCents || 0)
    if (["requested", "approved", "out"].includes(booking.status)) {
      customer.depositsHeldCents += Number(booking.depositCents || 0)
    }
  }

  return [...map.values()]
    .map((customer) => {
      const activities = customer.activities.sort((left, right) =>
        `${right.updatedAt}${right.id}`.localeCompare(`${left.updatedAt}${left.id}`),
      )

      return {
        ...customer,
        requests: customer.requests.sort((left, right) => `${right.createdAt}${right.id}`.localeCompare(`${left.createdAt}${left.id}`)),
        bookings: customer.bookings.sort((left, right) => `${right.createdAt}${right.id}`.localeCompare(`${left.createdAt}${left.id}`)),
        activities,
        activeItems:
          customer.requests.filter((request) => ["requested", "approved"].includes(request.status)).length +
          customer.bookings.filter((booking) => ["requested", "approved", "out"].includes(booking.status)).length,
        lastActivityAt: activities[0]?.updatedAt || activities[0]?.createdAt || "",
        currentStatus: activities.find((activity) => ["requested", "approved", "out"].includes(activity.status))?.status || activities[0]?.status || "unknown",
      }
    })
    .sort((left, right) => `${right.lastActivityAt}${right.key}`.localeCompare(`${left.lastActivityAt}${left.key}`))
}

function buildCalendarRows(requests, bookings, saws) {
  const sawNames = new Map(saws.map((saw) => [saw.id, saw.name]))
  const requestRows = requests.map((entry) => ({
    id: entry.id,
    sawName: entry.sawName || sawNames.get(entry.sawId) || "Unknown unit",
    customerName: entry.customerName,
    status: entry.status,
    startDate: entry.startDate,
    endDate: entry.endDate,
    kind: "Request",
    paymentStatus: entry.paymentStatus || "unpaid",
    paymentMethod: entry.paymentMethod || "",
    cryptoCurrency: entry.cryptoCurrency || "",
  }))

  const bookingRows = bookings.map((entry) => ({
    id: entry.id,
    sawName: entry.sawName || sawNames.get(entry.sawId) || "Unknown unit",
    customerName: entry.customerName,
    status: entry.status,
    startDate: entry.startDate,
    endDate: entry.endDate,
    kind: "Reservation",
    paymentStatus: entry.paymentStatus || "unpaid",
    paymentMethod: entry.paymentMethod || "",
    cryptoCurrency: entry.cryptoCurrency || "",
  }))

  return [...requestRows, ...bookingRows].sort((left, right) =>
    `${left.startDate}${left.id}`.localeCompare(`${right.startDate}${right.id}`),
  )
}

function buildOverview(dashboard) {
  const pendingRequests = dashboard.requests.filter((request) => request.status === "requested")
  const approvedRequests = dashboard.requests.filter((request) => request.status === "approved")
  const activeBookings = dashboard.bookings.filter((booking) => ["requested", "approved", "out"].includes(booking.status))
  const overdueBookings = dashboard.bookings.filter((booking) => booking.endDate < getTodayIso() && booking.status !== "returned")
  const maintenanceUnits = dashboard.saws.filter((saw) => ["maintenance", "unavailable"].includes(saw.status))
  const openMaintenanceRecords = dashboard.maintenanceRecords.filter((record) => record.status !== "completed")
  const depositsHeldCents = activeBookings.reduce((sum, booking) => sum + Number(booking.depositCents || 0), 0)
  const cryptoAttentionRequests = dashboard.requests.filter(
    (request) => request.paymentMethod === "crypto" && [
      "awaiting_crypto_payment",
      "awaiting_txid_submission",
      "awaiting_txid_review",
      "crypto_payment_detected",
      "underpaid",
      "expired",
    ].includes(request.paymentStatus),
  )
  const cryptoAlerts = Array.isArray(dashboard.cryptoAlerts) ? dashboard.cryptoAlerts : []

  return {
    pendingRequests,
    approvedRequests,
    activeBookings,
    overdueBookings,
    maintenanceUnits,
    openMaintenanceRecords,
    depositsHeldCents,
    cryptoAttentionRequests,
    cryptoAlerts,
    cryptoAlertCounts: {
      total: cryptoAlerts.length,
      underpaid: cryptoAlerts.filter((alert) => alert.type === "underpaid").length,
      expired: cryptoAlerts.filter((alert) => alert.type === "expired").length,
      awaitingReview: cryptoAlerts.filter((alert) => alert.type === "awaiting_txid_review").length,
      awaitingConfirmations: cryptoAlerts.filter((alert) => alert.type === "awaiting_confirmations").length,
      monitorError: cryptoAlerts.filter((alert) => alert.type === "monitor_error").length,
    },
  }
}

function getWindowDefinition(key) {
  return MODULES.find((module) => module.key === key) || MODULES[0]
}

function SectionHeader({ eyebrow, title, detail, trailing }) {
  return (
    <div className="section-heading">
      <div>
        <p className="section-eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        {detail ? <p className="section-detail">{detail}</p> : null}
      </div>
      {trailing}
    </div>
  )
}

function CryptoMonitorStatus({ monitor }) {
  const source = monitor && typeof monitor === "object" ? monitor : {}
  return (
    <div className="crypto-monitor-strip">
      <span className={`sr-badge tone-${source.automaticEnabled ? "success" : "neutral"}`}>
        {source.automaticEnabled ? "Auto monitor on" : "Manual crypto review"}
      </span>
      <span>Last run: {formatDateTime(source.lastFinishedAt)}</span>
      <span>Source: {source.lastRunSource || "none"}</span>
      <span>{source.running ? "Monitor running" : "Monitor idle"}</span>
      {source.lastError ? <span className="tone-danger">{source.lastError}</span> : null}
    </div>
  )
}

function shouldShowCryptoMonitorControls(monitor) {
  const source = monitor && typeof monitor === "object" ? monitor : {}
  return Boolean(source.automaticEnabled || source.running || source.lastFinishedAt || source.lastError)
}

function CryptoAlertsPanel({ alerts, markCryptoAlertReviewed }) {
  if (!alerts.length) {
    return (
      <div className="alert-card tone-service">
        <strong>No active crypto review alerts</strong>
        <p>No submitted TXIDs, underpaid payments, expired quotes, or optional monitor errors require review.</p>
      </div>
    )
  }

  return (
    <div className="alert-list">
      {alerts.map((alert) => (
        <div key={alert.id} className={`alert-card tone-${alert.tone || "warning"}`}>
          <strong>{alert.title}</strong>
          <p>{alert.detail}</p>
          <small>{alert.customerName} | {alert.sawName} | {alert.cryptoCurrency} | {normalizeStatusLabel(alert.monitoringState || alert.paymentStatus)}</small>
          <div className="table-actions">
            <button type="button" className="button button-secondary" onClick={() => markCryptoAlertReviewed(alert.requestId, alert.reviewKey)}>
              Mark reviewed
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function DashboardWindow({ overview, settings, cryptoMonitor, markCryptoAlertReviewed }) {
  const showMonitorStatus = shouldShowCryptoMonitorControls(cryptoMonitor)
  return (
    <div className="window-stack">
      {showMonitorStatus ? <CryptoMonitorStatus monitor={cryptoMonitor} /> : null}
      <div className="metric-strip">
        <article className="metric-panel">
          <span>Pending approvals</span>
          <strong>{overview.pendingRequests.length}</strong>
          <p>Requests waiting on payment validation or desk approval.</p>
        </article>
        <article className="metric-panel">
          <span>Active rentals</span>
          <strong>{overview.activeBookings.length}</strong>
          <p>Rentals moving through requested, approved, or out states.</p>
        </article>
        <article className="metric-panel">
          <span>Open service jobs</span>
          <strong>{overview.openMaintenanceRecords.length}</strong>
          <p>Persisted maintenance records currently blocking or tracking units.</p>
        </article>
        <article className="metric-panel">
          <span>Deposit exposure</span>
          <strong>{formatMoney(overview.depositsHeldCents)}</strong>
          <p>Deposits currently attached to active orders.</p>
        </article>
        <article className="metric-panel">
          <span>Crypto review</span>
          <strong>{overview.cryptoAlertCounts.total}</strong>
          <p>Submitted TXIDs, underpaid payments, expired quotes, and optional monitor errors.</p>
        </article>
      </div>

      <div className="sr-grid sr-grid--dashboard">
        <article className="panel-stack">
          <SectionHeader
            eyebrow="Queue health"
            title="Immediate actions"
            detail="Items that need counter attention first."
          />
          <div className="alert-list">
            <div className="alert-card tone-warning">
              <strong>{overview.pendingRequests.length} requests awaiting approval</strong>
              <p>Approve only after deposit is paid. Denials free the queue immediately.</p>
            </div>
            <div className="alert-card tone-danger">
              <strong>{overview.overdueBookings.length} overdue or late return items</strong>
              <p>These bookings have end dates before today and are not marked returned.</p>
            </div>
            <div className="alert-card tone-service">
              <strong>{overview.openMaintenanceRecords.length} open maintenance records</strong>
              <p>Service work is now tracked separately from simple saw status flags.</p>
            </div>
            <div className="alert-card tone-warning">
              <strong>{overview.cryptoAlertCounts.total} crypto review alerts</strong>
              <p>{overview.cryptoAlertCounts.awaitingReview} TXIDs to review, {overview.cryptoAlertCounts.underpaid} underpaid, {overview.cryptoAlertCounts.expired} expired.</p>
            </div>
          </div>
        </article>

        <article className="panel-stack">
          <SectionHeader
            eyebrow="Crypto review"
            title="Operator alerts"
            detail="Manual crypto items that need desk verification."
          />
          <CryptoAlertsPanel alerts={overview.cryptoAlerts} markCryptoAlertReviewed={markCryptoAlertReviewed} />
        </article>

        <article className="panel-stack">
          <SectionHeader
            eyebrow="Configuration"
            title={settings.businessName}
            detail={settings.location || "Update business contact info in Settings."}
          />
          <div className="summary-grid">
            <div className="summary-card">
              <span>Default pickup</span>
              <strong>{normalizeStatusLabel(settings.defaultPickupPreference)}</strong>
            </div>
            <div className="summary-card">
              <span>Default rental length</span>
              <strong>{settings.defaultRentalDays} day{settings.defaultRentalDays === 1 ? "" : "s"}</strong>
            </div>
            <div className="summary-card">
              <span>Maintenance lead</span>
              <strong>{settings.maintenanceLeadDays} day{settings.maintenanceLeadDays === 1 ? "" : "s"}</strong>
            </div>
            <div className="summary-card">
              <span>Contact phone</span>
              <strong>{settings.contactPhone || "Not set"}</strong>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}

function CryptoQuoteMeta({ entry }) {
  if (entry.paymentMethod !== "crypto") {
    return null
  }

  const rateUsd = getCryptoRateUsd(entry)
  const depositUsdAmount = getUsdAmount(entry.depositUsdAmount, entry.depositCents)
  const refundableUsdAmount = getUsdAmount(entry.refundableUsdAmount, entry.depositCents)
  const destinationProvider = entry.destinationProvider || entry.cryptoAddressProvider || ""
  const staticDestination = !entry.destinationUnique && (
    destinationProvider.includes("static") ||
    entry.destinationAllocationState === "static_configured"
  )
  const submittedTxid = entry.customerSubmittedTxid || entry.blockchainTxid || ""
  const hasChainStatus = Boolean(entry.lastChainCheckAt || entry.receivedCryptoAmount || Number(entry.chainConfirmations || 0) > 0)

  return (
    <dl className="crypto-admin-quote">
      <div>
        <dt>Quote source</dt>
        <dd>{getCryptoRateSource(entry)}</dd>
      </div>
      <div>
        <dt>Destination</dt>
        <dd>{entry.destinationUnique ? "Unique wallet-backed" : staticDestination ? "Static configured address" : "Shared fallback"}</dd>
      </div>
      <div>
        <dt>Provider</dt>
        <dd>{destinationProvider || "Not recorded"}</dd>
      </div>
      <div>
        <dt>Allocation state</dt>
        <dd>{normalizeStatusLabel(entry.destinationAllocationState || "unknown")}</dd>
      </div>
      {entry.cryptoCurrency === "BTC" && (entry.destinationUnique || entry.btcDerivationIndex !== null) ? (
        <div>
          <dt>BTC index</dt>
          <dd>{entry.btcDerivationIndex ?? "Not recorded"}</dd>
        </div>
      ) : null}
      {entry.cryptoCurrency === "XMR" && (entry.destinationUnique || entry.xmrSubaddressIndex !== null) ? (
        <div>
          <dt>XMR subaddress</dt>
          <dd>{entry.xmrSubaddressIndex ?? "Not recorded"}</dd>
        </div>
      ) : null}
      <div>
        <dt>Quoted rate</dt>
        <dd>{rateUsd ? `${formatMoney(rateUsd * 100)} / ${entry.cryptoCurrency}` : "Not recorded"}</dd>
      </div>
      <div>
        <dt>Quote time</dt>
        <dd>{formatDateTime(getCryptoQuoteTime(entry))}</dd>
      </div>
      <div>
        <dt>Expires</dt>
        <dd>{formatDateTime(entry.paymentExpiresAt)}</dd>
      </div>
      <div>
        <dt>Payment state</dt>
        <dd>{normalizeStatusLabel(entry.paymentStatus)}</dd>
      </div>
      <div>
        <dt>Review mode</dt>
        <dd>{normalizeStatusLabel(entry.monitoringState || "manual_review")}</dd>
      </div>
      {submittedTxid ? (
        <div>
          <dt>Submitted TXID</dt>
          <dd>{submittedTxid}</dd>
        </div>
      ) : null}
      {entry.customerTxidSubmittedAt ? (
        <div>
          <dt>TXID submitted</dt>
          <dd>{formatDateTime(entry.customerTxidSubmittedAt)}</dd>
        </div>
      ) : null}
      {entry.customerTxidNote ? (
        <div>
          <dt>Customer note</dt>
          <dd>{entry.customerTxidNote}</dd>
        </div>
      ) : null}
      {hasChainStatus ? (
        <>
          <div>
            <dt>Last check</dt>
            <dd>{formatDateTime(entry.lastChainCheckAt)}</dd>
          </div>
          <div>
            <dt>Confirmations</dt>
            <dd>{Number(entry.chainConfirmations || 0)}</dd>
          </div>
        </>
      ) : null}
      <div>
        <dt>Expected</dt>
        <dd>{entry.expectedCryptoAmount || entry.cryptoAmount} {entry.cryptoCurrency}</dd>
      </div>
      <div>
        <dt>Received</dt>
        <dd>{entry.receivedCryptoAmount || "None"} {entry.receivedCryptoAmount ? entry.cryptoCurrency : ""}</dd>
      </div>
      <div>
        <dt>USD deposit basis</dt>
        <dd>{formatMoney(depositUsdAmount * 100)}</dd>
      </div>
      <div>
        <dt>Refundable USD basis</dt>
        <dd>{formatMoney(refundableUsdAmount * 100)}</dd>
      </div>
    </dl>
  )
}

function getCryptoEventLabel(type) {
  const labels = {
    crypto_txid_submitted: "TXID submitted",
    crypto_payment_detected: "Payment detected",
    crypto_payment_confirmed: "Confirmed paid",
    crypto_payment_underpaid: "Marked underpaid",
    crypto_payment_cancelled: "Cancelled / rejected",
    crypto_chain_payment_detected: "Chain payment detected",
    crypto_chain_payment_rejected: "Chain payment rejected",
    crypto_monitor_error: "Monitor error",
    crypto_payment_created: "Quote created",
  }
  return labels[type] || normalizeStatusLabel(type)
}

function CryptoActionTimeline({ events = [] }) {
  const reviewEvents = events.filter((event) => [
    "crypto_txid_submitted",
    "crypto_payment_detected",
    "crypto_payment_confirmed",
    "crypto_payment_underpaid",
    "crypto_payment_cancelled",
    "crypto_chain_payment_detected",
    "crypto_chain_payment_rejected",
    "crypto_monitor_error",
  ].includes(event.type))

  if (!reviewEvents.length) {
    return (
      <div className="crypto-admin-timeline">
        <span className="helper-copy">No crypto review actions recorded yet.</span>
      </div>
    )
  }

  return (
    <ol className="crypto-admin-timeline">
      {reviewEvents.map((event) => (
        <li key={event.id || `${event.type}-${event.createdAt}`}>
          <strong>{getCryptoEventLabel(event.type)}</strong>
          <span>{formatDateTime(event.createdAt)}</span>
          {event.blockchainTxid ? <code>{event.blockchainTxid}</code> : null}
          {event.note ? <p>{event.note}</p> : null}
        </li>
      ))}
    </ol>
  )
}

function CryptoAdminActions({ request, updateCryptoPayment }) {
  const [txid, setTxid] = useState(request.customerSubmittedTxid || request.blockchainTxid || "")
  const [actionNote, setActionNote] = useState("")
  const [copyNotice, setCopyNotice] = useState("")

  if (request.paymentMethod !== "crypto") {
    return null
  }

  const status = request.paymentStatus
  const submittedTxid = request.customerSubmittedTxid || request.blockchainTxid || ""
  const explorerUrl = getCryptoExplorerUrl(request.cryptoCurrency, submittedTxid)
  const copyFields = getCryptoCopyFields(request)
  const quoteExpired = status === "expired"
  const canDetect = ["awaiting_crypto_payment", "awaiting_txid_submission"].includes(status)
  const canConfirm = ["awaiting_txid_review", "crypto_payment_detected"].includes(status)
  const canUnderpaid = ["awaiting_crypto_payment", "awaiting_txid_submission", "awaiting_txid_review", "crypto_payment_detected", "underpaid"].includes(status)
  const canCancel = ["awaiting_crypto_payment", "awaiting_txid_submission", "awaiting_txid_review", "crypto_payment_detected", "underpaid"].includes(status)

  async function copyReviewValue(label, value) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopyNotice(`${label} copied`)
    } catch {
      setCopyNotice("Copy failed")
    }
  }

  function submitAdminAction(action) {
    updateCryptoPayment(request.id, {
      action,
      blockchainTxid: txid,
      note: actionNote,
    })
    setActionNote("")
  }

  return (
    <div className="crypto-admin-actions">
      <div className="crypto-admin-meta">
        <span>{request.cryptoCurrency} {request.cryptoAmount}</span>
        <small>{request.cryptoAddress}</small>
        {request.customerSubmittedTxid ? <small>Customer TX {request.customerSubmittedTxid}</small> : null}
        {!request.customerSubmittedTxid && request.blockchainTxid ? <small>TX {request.blockchainTxid}</small> : null}
      </div>
      <div className="crypto-review-panel">
        <div className="crypto-review-heading">
          <strong>Verification checklist</strong>
          {explorerUrl ? (
            <a className="button button-secondary button-small" href={explorerUrl} target="_blank" rel="noreferrer">
              Open explorer
            </a>
          ) : null}
        </div>
        <ul className="crypto-checklist">
          <li>
            <span>Expected crypto amount</span>
            <strong>{request.expectedCryptoAmount || request.cryptoAmount} {request.cryptoCurrency}</strong>
          </li>
          <li className={submittedTxid ? "is-complete" : "is-missing"}>
            <span>Submitted TXID</span>
            <strong>{submittedTxid || "Missing"}</strong>
          </li>
          <li>
            <span>Saw Rent wallet address</span>
            <strong>{request.cryptoAddress}</strong>
          </li>
          <li>
            <span>Quote timestamp</span>
            <strong>{formatDateTime(getCryptoQuoteTime(request))}</strong>
          </li>
          <li className={quoteExpired ? "is-missing" : "is-complete"}>
            <span>Expiration status</span>
            <strong>{quoteExpired ? "Expired" : `Valid until ${formatDateTime(request.paymentExpiresAt)}`}</strong>
          </li>
        </ul>
        {copyFields.length ? (
          <div className="crypto-copy-actions">
            {copyFields.map((field) => (
              <button key={field.key} type="button" className="button button-secondary button-small" onClick={() => copyReviewValue(field.label.replace(/^Copy\s+/i, ""), field.value)}>
                {field.label}
              </button>
            ))}
          </div>
        ) : null}
        {copyNotice ? <span className="helper-copy">{copyNotice}</span> : null}
      </div>
      {(canDetect || canConfirm || canUnderpaid || canCancel) ? (
        <div className="crypto-admin-note-block">
          <input
            value={txid}
            onChange={(event) => setTxid(event.target.value)}
            placeholder="Blockchain txid"
            aria-label={`Blockchain transaction ID for ${request.id}`}
          />
          <textarea
            value={actionNote}
            onChange={(event) => setActionNote(event.target.value)}
            rows={3}
            placeholder="Optional admin verification note"
            aria-label={`Admin crypto action note for ${request.id}`}
          />
        </div>
      ) : null}
      <div className="table-actions">
        {canDetect ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => submitAdminAction("detected")}
          >
            Record TXID for review
          </button>
        ) : null}
        {canConfirm ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => submitAdminAction("confirm")}
            disabled={!txid}
          >
            Confirm Paid
          </button>
        ) : null}
        {canUnderpaid ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => submitAdminAction("underpaid")}
          >
            Mark Underpaid
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            className="button button-danger"
            onClick={() => submitAdminAction("cancel")}
          >
            Cancel / Reject
          </button>
        ) : null}
      </div>
      <CryptoActionTimeline events={request.paymentEvents} />
      <CryptoQuoteMeta entry={request} />
    </div>
  )
}

function ReservationsWindow({
  requests,
  cryptoAlerts,
  cryptoMonitor,
  dataLoading,
  updateRequestStatus,
  updateCryptoPayment,
  runCryptoMonitor,
  markCryptoAlertReviewed,
  convertRequest,
}) {
  const showMonitorControls = shouldShowCryptoMonitorControls(cryptoMonitor)
  const headerTrailing = dataLoading || showMonitorControls
    ? (
        <div className="table-actions">
          {dataLoading ? <span className="sr-badge tone-info">Refreshing</span> : null}
          {showMonitorControls ? (
            <button type="button" className="button button-secondary" onClick={runCryptoMonitor}>
              Run optional monitor
            </button>
          ) : null}
        </div>
      )
    : null

  return (
    <div className="window-stack">
      <SectionHeader
        eyebrow="Request queue"
        title="Chainsaw Rentals"
        detail="Approve after payment clears, deny when the desk cannot fulfill, then move approved rentals into checkout."
        trailing={headerTrailing}
      />

      {showMonitorControls ? <CryptoMonitorStatus monitor={cryptoMonitor} /> : null}
      <CryptoAlertsPanel alerts={cryptoAlerts} markCryptoAlertReviewed={markCryptoAlertReviewed} />

      <div className="data-table">
        <div className="data-table__head data-table__head--reservations">
          <span>Customer</span>
          <span>Unit</span>
          <span>Dates</span>
          <span>Deposit</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {requests.length === 0 ? <div className="empty-panel">No reservation requests are currently in the queue.</div> : null}

        {requests.map((request) => (
          <div key={request.id} className="data-table__row data-table__row--reservations">
            <div>
              <strong>{request.customerName}</strong>
              <small>{request.phone}</small>
            </div>
            <div>
              <strong>{request.sawName}</strong>
              <small>{normalizeStatusLabel(request.pickupPreference)}</small>
            </div>
            <div>
              <strong>{formatDateRange(request.startDate, request.endDate)}</strong>
              <small>{request.rentalDays} day rental</small>
            </div>
            <div>
              <strong>{formatMoney(request.depositCents)}</strong>
              <small className={`status-pill tone-${getStatusTone(request.paymentStatus)}`}>{normalizeStatusLabel(request.paymentStatus)}</small>
              <small>{getPaymentMethodLabel(request)}</small>
            </div>
            <div>
              <span className={`status-pill tone-${getStatusTone(request.status)}`}>{normalizeStatusLabel(request.status)}</span>
            </div>
            <div className="table-actions">
              {request.status === "requested" ? (
                <>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => updateRequestStatus(request.id, "approved")}
                    disabled={request.paymentStatus !== "paid"}
                  >
                    Approve
                  </button>
                  <button type="button" className="button button-danger" onClick={() => updateRequestStatus(request.id, "denied")}>
                    Deny
                  </button>
                </>
              ) : null}

              <CryptoAdminActions
                key={`${request.id}:${request.customerSubmittedTxid || request.blockchainTxid || ""}`}
                request={request}
                updateCryptoPayment={updateCryptoPayment}
              />

              {request.status === "approved" ? (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => convertRequest(request.id)}
                  disabled={request.paymentStatus !== "paid"}
                >
                  Convert to checkout
                </button>
              ) : null}

              {request.status === "converted" && request.bookingId ? (
                <span className="helper-copy">Linked to order {request.bookingId}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CheckoutWindow({ bookings, updateBookingStatus }) {
  return (
    <div className="window-stack">
      <SectionHeader
        eyebrow="Order board"
        title="Checkout"
        detail="Advance active rentals through requested, approved, out, and returned."
      />

      <div className="data-table">
        <div className="data-table__head data-table__head--checkout">
          <span>Customer</span>
          <span>Unit</span>
          <span>Dates</span>
          <span>Financials</span>
          <span>Status</span>
          <span>Next step</span>
        </div>

        {bookings.length === 0 ? <div className="empty-panel">No checkout records are active yet.</div> : null}

        {bookings.map((booking) => {
          const nextStatus =
            booking.status === "requested" ? "approved" :
            booking.status === "approved" ? "out" :
            booking.status === "out" ? "returned" :
            ""

          return (
            <div key={booking.id} className="data-table__row data-table__row--checkout">
              <div>
                <strong>{booking.customerName}</strong>
                <small>{booking.phone}</small>
              </div>
              <div>
                <strong>{booking.sawName}</strong>
                <small>{booking.pickupPreference}</small>
              </div>
              <div>
                <strong>{formatDateRange(booking.startDate, booking.endDate)}</strong>
                <small>{booking.rentalDays} day rental</small>
              </div>
              <div>
                <strong>{formatMoney(booking.rentalTotalCents)}</strong>
                <small>{formatMoney(booking.depositCents)} deposit | {getPaymentMethodLabel(booking)}</small>
                <CryptoQuoteMeta entry={booking} />
              </div>
              <div>
                <span className={`status-pill tone-${getStatusTone(booking.status)}`}>{normalizeStatusLabel(booking.status)}</span>
              </div>
              <div className="table-actions">
                {nextStatus ? (
                  <button type="button" className="button button-secondary" onClick={() => updateBookingStatus(booking.id, nextStatus)}>
                    Move to {normalizeStatusLabel(nextStatus)}
                  </button>
                ) : (
                  <span className="helper-copy">Order complete</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InventoryWindow({ saws, updateSawStatus }) {
  return (
    <div className="window-stack">
      <SectionHeader
        eyebrow="Unit control"
        title="Inventory"
        detail="Inspect inventory state and update blocked or service units."
      />

      <div className="inventory-cards">
        {saws.map((saw) => (
          <article key={saw.id} className="inventory-card">
            <div className="inventory-card__head">
              <div>
                <h3>{saw.name}</h3>
                <p>{saw.category} • {saw.barSize} • {saw.engineCc ? `${saw.engineCc}cc` : "N/A"}</p>
              </div>
              <span className={`status-pill tone-${getStatusTone(saw.status)}`}>{normalizeStatusLabel(saw.status)}</span>
            </div>
            <div className="detail-list">
              <div>
                <dt>Daily rate</dt>
                <dd>{formatMoney(saw.dailyRateCents)}</dd>
              </div>
              <div>
                <dt>Deposit</dt>
                <dd>{formatMoney(saw.depositCents)}</dd>
              </div>
            </div>
            <p className="inventory-card__note">{saw.notes}</p>
            <div className="table-actions">
              <button type="button" className="button button-secondary" onClick={() => updateSawStatus(saw.id, "maintenance")}>
                Send to service
              </button>
              <button type="button" className="button button-danger" onClick={() => updateSawStatus(saw.id, "unavailable")}>
                Block unit
              </button>
              <button type="button" className="button button-primary" onClick={() => updateSawStatus(saw.id, "available")}>
                Restore
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function CustomersWindow({ customers }) {
  const [query, setQuery] = useState("")
  const [selectedCustomerKey, setSelectedCustomerKey] = useState("")

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return customers
    return customers.filter((customer) =>
      `${customer.name} ${customer.phone} ${customer.currentStatus}`.toLowerCase().includes(normalized),
    )
  }, [customers, query])

  const selectedCustomer = filteredCustomers.find((customer) => customer.key === selectedCustomerKey)
    || filteredCustomers[0]
    || null
  const activeActivities = selectedCustomer
    ? selectedCustomer.activities.filter((activity) => ["requested", "approved", "out"].includes(activity.status))
    : []

  return (
    <div className="window-stack">
      <SectionHeader
        eyebrow="Relationship desk"
        title="Customers"
        detail="Search customer history across requests and completed or active orders."
      />

      <div className="split-layout split-layout--customers">
        <section className="panel-stack">
          <div className="toolbar-row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by customer or phone"
            />
            <span className="sr-badge tone-neutral">{filteredCustomers.length} customers</span>
          </div>

          <div className="list-panel">
            {filteredCustomers.length === 0 ? <div className="empty-panel">No customers match the current search.</div> : null}
            {filteredCustomers.map((customer) => (
              <button
                key={customer.key}
                type="button"
                className={`list-row ${selectedCustomerKey === customer.key ? "is-selected" : ""}`}
                onClick={() => setSelectedCustomerKey(customer.key)}
              >
                <div>
                  <strong>{customer.name}</strong>
                  <small>{customer.phone}</small>
                </div>
                <div className="list-row__meta">
                  <span className={`status-pill tone-${getStatusTone(customer.currentStatus)}`}>{normalizeStatusLabel(customer.currentStatus)}</span>
                  <small>{customer.activeItems} active</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-stack">
          {!selectedCustomer ? (
            <div className="empty-panel">Select a customer to inspect rentals, orders, and recent activity.</div>
          ) : (
            <>
              <SectionHeader
                eyebrow="Customer detail"
                title={selectedCustomer.name}
                detail={selectedCustomer.phone}
                trailing={<span className={`status-pill tone-${getStatusTone(selectedCustomer.currentStatus)}`}>{normalizeStatusLabel(selectedCustomer.currentStatus)}</span>}
              />

              <div className="summary-grid">
                <div className="summary-card">
                  <span>Requests</span>
                  <strong>{selectedCustomer.requests.length}</strong>
                </div>
                <div className="summary-card">
                  <span>Orders</span>
                  <strong>{selectedCustomer.bookings.length}</strong>
                </div>
                <div className="summary-card">
                  <span>Deposit exposure</span>
                  <strong>{formatMoney(selectedCustomer.depositsHeldCents)}</strong>
                </div>
                <div className="summary-card">
                  <span>Rental revenue</span>
                  <strong>{formatMoney(selectedCustomer.rentalRevenueCents)}</strong>
                </div>
              </div>

              <div className="panel-stack panel-stack--flush">
                <SectionHeader
                  eyebrow="Open work"
                  title="Requests and active orders"
                  detail="Current items the desk may need to act on."
                />
                <div className="activity-list">
                  {activeActivities.map((activity) => (
                    <div key={`${activity.kind}-${activity.id}`} className="activity-row">
                      <div>
                        <strong>{activity.kind} • {activity.sawName}</strong>
                        <small>{formatDateRange(activity.startDate, activity.endDate)} • {normalizeStatusLabel(activity.paymentStatus)} • {getPaymentMethodLabel(activity)}</small>
                      </div>
                      <span className={`status-pill tone-${getStatusTone(activity.status)}`}>{normalizeStatusLabel(activity.status)}</span>
                    </div>
                  ))}
                  {activeActivities.length === 0 ? (
                    <div className="empty-panel">No active requests or orders for this customer.</div>
                  ) : null}
                </div>
              </div>

              <div className="panel-stack panel-stack--flush">
                <SectionHeader
                  eyebrow="Activity history"
                  title="Timeline"
                  detail={`Last activity ${formatDateTime(selectedCustomer.lastActivityAt)}`}
                />
                <div className="activity-list">
                  {selectedCustomer.activities.map((activity) => (
                    <div key={`${activity.kind}-${activity.id}`} className="activity-row">
                      <div>
                        <strong>{activity.kind} • {activity.sawName}</strong>
                        <small>{formatDateRange(activity.startDate, activity.endDate)} • Updated {formatDateTime(activity.updatedAt)}</small>
                        {activity.notes ? <small>{activity.notes}</small> : null}
                      </div>
                      <span className={`status-pill tone-${getStatusTone(activity.status)}`}>{normalizeStatusLabel(activity.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function CalendarWindow({ calendarRows }) {
  return (
    <div className="window-stack">
      <SectionHeader
        eyebrow="Schedule board"
        title="Calendar"
        detail="Chronological view of requests and orders using live booking data."
      />

      <div className="timeline">
        {calendarRows.length === 0 ? <div className="empty-panel">No schedule activity is currently on the board.</div> : null}
        {calendarRows.map((row) => (
          <article key={row.id} className="timeline__item">
            <div className="timeline__date">
              <strong>{row.startDate}</strong>
              <span>{row.endDate !== row.startDate ? row.endDate : "Same day"}</span>
            </div>
            <div className="timeline__body">
              <div className="timeline__topline">
                <strong>{row.customerName}</strong>
                <span className={`status-pill tone-${getStatusTone(row.status)}`}>{normalizeStatusLabel(row.status)}</span>
              </div>
              <p>{row.kind} | {row.sawName}</p>
              <small>Payment: {normalizeStatusLabel(row.paymentStatus)} | {getPaymentMethodLabel(row)}</small>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function MaintenanceDetailPanel({ record, onUpdate }) {
  const [detailDraft, setDetailDraft] = useState({
    summary: record.summary,
    details: record.details || "",
    priority: record.priority,
    dueDate: record.dueDate || "",
  })
  const [noteDraft, setNoteDraft] = useState("")

  async function handleSaveRecord() {
    await onUpdate(record.id, detailDraft)
  }

  async function handleStatusChange(nextStatus) {
    await onUpdate(record.id, { status: nextStatus })
  }

  async function handleAddNote(event) {
    event.preventDefault()
    if (!noteDraft.trim()) return
    await onUpdate(record.id, { note: noteDraft })
    setNoteDraft("")
  }

  return (
    <>
      <SectionHeader
        eyebrow="Record detail"
        title={record.summary}
        detail={record.sawName}
        trailing={<span className={`status-pill tone-${getStatusTone(record.status)}`}>{normalizeStatusLabel(record.status)}</span>}
      />

      <div className="detail-list">
        <div>
          <dt>Priority</dt>
          <dd>{normalizeStatusLabel(record.priority)}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{record.dueDate || "Not scheduled"}</dd>
        </div>
        <div>
          <dt>Opened</dt>
          <dd>{formatDateTime(record.createdAt)}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{record.completedAt ? formatDateTime(record.completedAt) : "Still open"}</dd>
        </div>
      </div>

      <div className="form-grid">
        <label>
          <span>Summary</span>
          <input value={detailDraft.summary} onChange={(event) => setDetailDraft((current) => ({ ...current, summary: event.target.value }))} />
        </label>
        <label>
          <span>Priority</span>
          <select value={detailDraft.priority} onChange={(event) => setDetailDraft((current) => ({ ...current, priority: event.target.value }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      <label className="ops-form">
        <span>Details</span>
        <textarea rows={4} value={detailDraft.details} onChange={(event) => setDetailDraft((current) => ({ ...current, details: event.target.value }))} />
      </label>

      <div className="form-grid">
        <label>
          <span>Due date</span>
          <input type="date" value={detailDraft.dueDate} onChange={(event) => setDetailDraft((current) => ({ ...current, dueDate: event.target.value }))} />
        </label>
        <div className="window-actions window-actions--compact">
          <button type="button" className="button button-secondary" onClick={() => handleStatusChange("open")}>Mark open</button>
          <button type="button" className="button button-secondary" onClick={() => handleStatusChange("in_progress")}>In progress</button>
          <button type="button" className="button button-primary" onClick={() => handleStatusChange("completed")}>Complete</button>
        </div>
      </div>

      <div className="window-actions">
        <button type="button" className="button button-secondary" onClick={handleSaveRecord}>Save record changes</button>
      </div>

      <form className="ops-form" onSubmit={handleAddNote}>
        <label>
          <span>Add service note</span>
          <textarea rows={3} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Diagnosis, parts, technician note, or completion summary" />
        </label>
        <button type="submit" className="button button-secondary">Add note</button>
      </form>

      <div className="panel-stack panel-stack--flush">
        <SectionHeader
          eyebrow="History"
          title="Record log"
          detail="Every update appends a dated maintenance note."
        />
        <div className="activity-list">
          {(record.history || []).map((entry) => (
            <div key={entry.id} className="activity-row">
              <div>
                <strong>{normalizeStatusLabel(entry.status)}</strong>
                <small>{entry.note || "Record updated."}</small>
              </div>
              <small>{formatDateTime(entry.createdAt)}</small>
            </div>
          ))}
          {(record.history || []).length === 0 ? <div className="empty-panel">No maintenance history has been recorded yet.</div> : null}
        </div>
      </div>
    </>
  )
}

function MaintenanceWindow({
  maintenanceRecords,
  saws,
  settings,
  dataLoading,
  createMaintenanceRecord,
  updateMaintenanceRecord,
}) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedRecordId, setSelectedRecordId] = useState("")
  const [createDraft, setCreateDraft] = useState(() => ({
    sawId: saws[0]?.id || "",
    summary: "",
    details: "",
    priority: "medium",
    dueDate: "",
  }))

  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return maintenanceRecords.filter((record) => {
      const matchesQuery = !normalized || `${record.sawName} ${record.summary} ${record.details}`.toLowerCase().includes(normalized)
      const matchesStatus = statusFilter === "all" || record.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [maintenanceRecords, query, statusFilter])

  const selectedRecord = filteredRecords.find((record) => record.id === selectedRecordId)
    || filteredRecords[0]
    || maintenanceRecords.find((record) => record.id === selectedRecordId)
    || null
  const createSawId = createDraft.sawId || saws[0]?.id || ""

  const openRecords = maintenanceRecords.filter((record) => record.status !== "completed")
  const overdueRecords = openRecords.filter((record) => getDueTone(record, settings.maintenanceLeadDays) === "danger")
  const upcomingRecords = openRecords.filter((record) => getDueTone(record, settings.maintenanceLeadDays) === "warning")

  async function handleCreateRecord(event) {
    event.preventDefault()
    const response = await createMaintenanceRecord({
      ...createDraft,
      sawId: createSawId,
    })
    setCreateDraft((current) => ({
      ...current,
      sawId: createSawId,
      summary: "",
      details: "",
      priority: "medium",
      dueDate: "",
    }))
    if (response?.record?.id) {
      setSelectedRecordId(response.record.id)
    }
  }

  return (
    <div className="window-stack">
      <SectionHeader
        eyebrow="Service queue"
        title="Maintenance"
        detail="Create and update persisted service records linked to rental units."
        trailing={dataLoading ? <span className="sr-badge tone-info">Refreshing</span> : null}
      />

      <div className="metric-strip">
        <article className="metric-panel">
          <span>Open records</span>
          <strong>{openRecords.length}</strong>
          <p>Service items not yet marked complete.</p>
        </article>
        <article className="metric-panel">
          <span>Overdue service</span>
          <strong>{overdueRecords.length}</strong>
          <p>Records with due dates before today.</p>
        </article>
        <article className="metric-panel">
          <span>Due soon</span>
          <strong>{upcomingRecords.length}</strong>
          <p>Records due within {settings.maintenanceLeadDays} day{settings.maintenanceLeadDays === 1 ? "" : "s"}.</p>
        </article>
      </div>

      <div className="split-layout split-layout--maintenance">
        <section className="panel-stack">
          <form className="ops-form" onSubmit={handleCreateRecord}>
            <SectionHeader
              eyebrow="New service record"
              title="Log maintenance"
              detail="Persist a service issue and link it to a unit."
            />
            <label>
              <span>Unit</span>
              <select value={createSawId} onChange={(event) => setCreateDraft((current) => ({ ...current, sawId: event.target.value }))} required>
                {saws.map((saw) => (
                  <option key={saw.id} value={saw.id}>{saw.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Summary</span>
              <input value={createDraft.summary} onChange={(event) => setCreateDraft((current) => ({ ...current, summary: event.target.value }))} required />
            </label>
            <label>
              <span>Details</span>
              <textarea rows={3} value={createDraft.details} onChange={(event) => setCreateDraft((current) => ({ ...current, details: event.target.value }))} />
            </label>
            <div className="form-grid">
              <label>
                <span>Priority</span>
                <select value={createDraft.priority} onChange={(event) => setCreateDraft((current) => ({ ...current, priority: event.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                <span>Due date</span>
                <input type="date" value={createDraft.dueDate} onChange={(event) => setCreateDraft((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
            </div>
            <button type="submit" className="button button-primary">Create service record</button>
          </form>

          <div className="toolbar-row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search service records"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="list-panel">
            {filteredRecords.length === 0 ? <div className="empty-panel">No maintenance records match the current filters.</div> : null}
            {filteredRecords.map((record) => (
              <button
                key={record.id}
                type="button"
                className={`list-row ${selectedRecord?.id === record.id ? "is-selected" : ""}`}
                onClick={() => setSelectedRecordId(record.id)}
              >
                <div>
                  <strong>{record.sawName}</strong>
                  <small>{record.summary}</small>
                </div>
                <div className="list-row__meta">
                  <span className={`status-pill tone-${getStatusTone(record.status)}`}>{normalizeStatusLabel(record.status)}</span>
                  <small className={`tone-${getDueTone(record, settings.maintenanceLeadDays)}`}>
                    {record.dueDate ? `Due ${record.dueDate}` : "No due date"}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-stack">
          {!selectedRecord ? (
            <div className="empty-panel">Select a maintenance record to inspect history and update status.</div>
          ) : (
            <MaintenanceDetailPanel key={selectedRecord.id} record={selectedRecord} onUpdate={updateMaintenanceRecord} />
          )}
        </section>
      </div>
    </div>
  )
}

function SettingsWindow({ settings, paymentsEnabled, cryptoPaymentsEnabled, updateSettings, onRefresh, onLogout }) {
  const [draft, setDraft] = useState(() => settings)

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings)

  async function handleSubmit(event) {
    event.preventDefault()
    await updateSettings({
      ...draft,
      defaultRentalDays: Number(draft.defaultRentalDays),
      maintenanceLeadDays: Number(draft.maintenanceLeadDays),
    })
  }

  return (
    <div className="window-stack">
      <SectionHeader
        eyebrow="System controls"
        title="Settings"
        detail="Only stored settings that affect real app behavior are editable here."
      />

      <form className="ops-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            <span>Business name</span>
            <input value={draft.businessName} onChange={(event) => setDraft((current) => ({ ...current, businessName: event.target.value }))} required />
          </label>
          <label>
            <span>Contact phone</span>
            <input value={draft.contactPhone} onChange={(event) => setDraft((current) => ({ ...current, contactPhone: event.target.value }))} />
          </label>
          <label>
            <span>Contact email</span>
            <input type="email" value={draft.contactEmail} onChange={(event) => setDraft((current) => ({ ...current, contactEmail: event.target.value }))} />
          </label>
          <label>
            <span>Location</span>
            <input value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} />
          </label>
          <label>
            <span>Default pickup preference</span>
            <select value={draft.defaultPickupPreference} onChange={(event) => setDraft((current) => ({ ...current, defaultPickupPreference: event.target.value }))}>
              <option value="pickup">Pickup</option>
              <option value="dropoff">Dropoff</option>
              <option value="flexible">Flexible</option>
            </select>
          </label>
          <label>
            <span>Default rental days</span>
            <input type="number" min="1" max="14" value={draft.defaultRentalDays} onChange={(event) => setDraft((current) => ({ ...current, defaultRentalDays: event.target.value }))} />
          </label>
          <label>
            <span>Maintenance alert lead days</span>
            <input type="number" min="0" max="30" value={draft.maintenanceLeadDays} onChange={(event) => setDraft((current) => ({ ...current, maintenanceLeadDays: event.target.value }))} />
          </label>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <span>Public default pickup</span>
            <strong>{normalizeStatusLabel(draft.defaultPickupPreference)}</strong>
          </div>
          <div className="summary-card">
            <span>Public default rental</span>
            <strong>{draft.defaultRentalDays} day{Number(draft.defaultRentalDays) === 1 ? "" : "s"}</strong>
          </div>
          <div className="summary-card">
            <span>Maintenance alerts</span>
            <strong>{draft.maintenanceLeadDays} day lead</strong>
          </div>
          <div className="summary-card">
            <span>Deposits</span>
            <strong>{[
              paymentsEnabled ? "Card live" : "Card offline",
              cryptoPaymentsEnabled ? "crypto ready" : "crypto offline",
            ].join(" / ")}</strong>
          </div>
        </div>

        <div className="window-actions">
          <button type="submit" className="button button-primary" disabled={!isDirty}>Save settings</button>
          <button type="button" className="button button-secondary" onClick={() => setDraft(settings)} disabled={!isDirty}>Reset</button>
          <button type="button" className="button button-secondary" onClick={onRefresh}>Refresh Data</button>
          <button type="button" className="button button-danger" onClick={onLogout}>Sign Out</button>
        </div>
      </form>
    </div>
  )
}

function renderModule({
  key,
  dashboard,
  overview,
  customers,
  calendarRows,
  dataLoading,
  paymentsEnabled,
  handlers,
}) {
  if (key === "dashboard") {
    return (
      <DashboardWindow
        overview={overview}
        settings={dashboard.settings}
        cryptoMonitor={dashboard.cryptoMonitor}
        markCryptoAlertReviewed={handlers.markCryptoAlertReviewed}
      />
    )
  }
  if (key === "reservations") {
    return (
      <ReservationsWindow
        requests={dashboard.requests}
        cryptoAlerts={overview.cryptoAlerts}
        cryptoMonitor={dashboard.cryptoMonitor}
        dataLoading={dataLoading}
        updateRequestStatus={handlers.updateRequestStatus}
        updateCryptoPayment={handlers.updateCryptoPayment}
        runCryptoMonitor={handlers.runCryptoMonitor}
        markCryptoAlertReviewed={handlers.markCryptoAlertReviewed}
        convertRequest={handlers.convertRequest}
      />
    )
  }
  if (key === "checkout") {
    return <CheckoutWindow bookings={dashboard.bookings} updateBookingStatus={handlers.updateBookingStatus} />
  }
  if (key === "inventory") {
    return <InventoryWindow saws={dashboard.saws} updateSawStatus={handlers.updateSawStatus} />
  }
  if (key === "customers") return <CustomersWindow customers={customers} />
  if (key === "calendar") return <CalendarWindow calendarRows={calendarRows} />
  if (key === "maintenance") {
    return (
      <MaintenanceWindow
        maintenanceRecords={dashboard.maintenanceRecords}
        saws={dashboard.saws}
        settings={dashboard.settings}
        dataLoading={dataLoading}
        createMaintenanceRecord={handlers.createMaintenanceRecord}
        updateMaintenanceRecord={handlers.updateMaintenanceRecord}
      />
    )
  }
  if (key === "settings") {
    return (
      <SettingsWindow
        settings={dashboard.settings}
        paymentsEnabled={paymentsEnabled}
        cryptoPaymentsEnabled={handlers.cryptoPaymentsEnabled}
        updateSettings={handlers.updateSettings}
        onRefresh={handlers.loadDashboard}
        onLogout={handlers.logout}
      />
    )
  }
  return null
}

export function AdminWorkspace({
  dashboard,
  dataLoading,
  error,
  paymentsEnabled,
  cryptoPaymentsEnabled,
  loadDashboard,
  logout,
  updateRequestStatus,
  updateCryptoPayment,
  runCryptoMonitor,
  markCryptoAlertReviewed,
  convertRequest,
  updateBookingStatus,
  updateSawStatus,
  createMaintenanceRecord,
  updateMaintenanceRecord,
  updateSettings,
}) {
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [launcherQuery, setLauncherQuery] = useState("")
  const [workspaceNotice, setWorkspaceNotice] = useState("")
  const bootIntent = useMemo(() => readAdminBootIntent(), [])
  const initialOpenKeys = useMemo(
    () => (bootIntent.moduleKey ? [bootIntent.moduleKey] : DEFAULT_OPEN_WINDOWS),
    [bootIntent.moduleKey],
  )

  const overview = useMemo(() => buildOverview(dashboard), [dashboard])
  const customers = useMemo(() => buildCustomers(dashboard.requests, dashboard.bookings), [dashboard.bookings, dashboard.requests])
  const calendarRows = useMemo(() => buildCalendarRows(dashboard.requests, dashboard.bookings, dashboard.saws), [dashboard.bookings, dashboard.requests, dashboard.saws])
  const {
    openWindows,
    minimizedWindows,
    activeWindow,
    windowOrder,
    windowStates,
    focusWindow,
    closeWindow,
    minimizeWindow,
    toggleTaskbarWindow,
    updateFrame,
    restoreWorkspace,
    clearWorkspace,
    tileVisibleWindows,
    resetWindowPositions,
    toggleMaximizeWindow,
  } = useWindowManager({
    definitions: MODULES,
    defaultOpenKeys: initialOpenKeys,
    defaultActiveKey: bootIntent.moduleKey || "",
    storageKey: WORKSPACE_STORAGE_KEY,
    legacyStorageKeys: LEGACY_WORKSPACE_STORAGE_KEYS,
    restoreFromStorage: bootIntent.restoreFromStorage,
    restoreFromUrl: true,
    syncUrl: true,
    urlParamName: MODULE_QUERY_PARAM,
  })

  function closeLauncher() {
    setLauncherOpen(false)
    setLauncherQuery("")
  }

  function runWorkspaceAction(action, messages) {
    const result = action()
    setWorkspaceNotice(result.ok ? messages.success : messages.empty)
    closeLauncher()
  }

  const launcherQueryValue = launcherQuery.trim().toLowerCase()
  const showMonitorControls = shouldShowCryptoMonitorControls(dashboard.cryptoMonitor)
  const launcherItems = [
    ...MODULES.map((module) => ({
      key: module.key,
      icon: module.icon,
      label: module.label,
      description: openWindows.includes(module.key) ? "Focus running workspace" : module.description,
      group: "Apps",
      onSelect: () => {
        focusWindow(module.key)
        closeLauncher()
      },
    })),
    {
      key: "refresh",
      icon: "RF",
      label: "Refresh Data",
      description: "Reload admin dashboard state from the API",
      group: "Actions",
      onSelect: () => {
        loadDashboard()
        closeLauncher()
      },
    },
    ...(showMonitorControls ? [{
      key: "crypto-monitor",
      icon: "CM",
      label: "Run Crypto Monitor",
      description: "Run optional chain monitoring when a provider is configured",
      group: "Actions",
      onSelect: () => {
        runCryptoMonitor()
        closeLauncher()
      },
    }] : []),
    {
      key: "restore-workspace",
      icon: "RW",
      label: "Restore Workspace",
      description: "Reopen the saved window layout on demand",
      group: "Workspace",
      testId: "shell-workspace-action-restore",
      onSelect: () => runWorkspaceAction(restoreWorkspace, {
        success: "Workspace restored",
        empty: "No saved workspace",
      }),
    },
    {
      key: "clear-workspace",
      icon: "CW",
      label: "Clear Workspace",
      description: "Close all app windows without changing data",
      group: "Workspace",
      testId: "shell-workspace-action-clear",
      onSelect: () => runWorkspaceAction(clearWorkspace, {
        success: "Workspace cleared",
        empty: "Workspace already clear",
      }),
    },
    {
      key: "tile-windows",
      icon: "TW",
      label: "Tile Windows",
      description: "Arrange visible windows into a practical grid",
      group: "Workspace",
      testId: "shell-workspace-action-tile",
      onSelect: () => runWorkspaceAction(tileVisibleWindows, {
        success: "Visible windows tiled",
        empty: "No visible windows",
      }),
    },
    {
      key: "reset-window-positions",
      icon: "RP",
      label: "Reset Window Positions",
      description: "Move open windows back to safe default frames",
      group: "Workspace",
      testId: "shell-workspace-action-reset",
      onSelect: () => runWorkspaceAction(resetWindowPositions, {
        success: "Window positions reset",
        empty: "No open windows",
      }),
    },
    {
      key: "logout",
      icon: "LO",
      label: "Sign Out",
      description: "Close the current admin session",
      group: "Actions",
      onSelect: () => {
        closeLauncher()
        logout()
      },
    },
  ].filter((item) => {
    if (!launcherQueryValue) return true
    return `${item.label} ${item.description}`.toLowerCase().includes(launcherQueryValue)
  })

  const launcherFeaturedItems = launcherItems.filter((item) => item.group === "Apps").slice(0, 8)

  const launcherRailItems = [
    {
      key: "dashboard-rail",
      icon: "DB",
      label: "Dashboard",
      onSelect: () => {
        focusWindow("dashboard")
        closeLauncher()
      },
    },
    {
      key: "refresh-rail",
      icon: "RF",
      label: "Refresh Data",
      onSelect: () => {
        loadDashboard()
        closeLauncher()
      },
    },
    {
      key: "reservations-rail",
      icon: "RS",
      label: "Chainsaw Rentals",
      onSelect: () => {
        focusWindow("reservations")
        closeLauncher()
      },
    },
    {
      key: "settings-rail",
      icon: "ST",
      label: "Settings",
      onSelect: () => {
        focusWindow("settings")
        closeLauncher()
      },
    },
    {
      key: "logout-rail",
      icon: "LO",
      label: "Sign Out",
      onSelect: () => {
        closeLauncher()
        logout()
      },
    },
  ]

  const desktopItems = MODULES.map((module) => ({
    key: module.key,
    icon: module.icon,
    label: module.label,
    meta: openWindows.includes(module.key)
      ? (minimizedWindows.includes(module.key) ? "Minimized" : "Running")
      : "Launch",
    active: activeWindow === module.key,
    running: openWindows.includes(module.key),
    side: module.side,
    onSelect: () => focusWindow(module.key),
  }))

  const taskbarItems = windowOrder.map((key) => {
    const module = getWindowDefinition(key)
    return {
      key,
      icon: module.icon,
      label: module.label,
      active: activeWindow === key,
      minimized: minimizedWindows.includes(key),
      onSelect: () => toggleTaskbarWindow(key),
    }
  })

  const handlers = {
    loadDashboard,
    logout,
    updateRequestStatus,
    updateCryptoPayment,
    runCryptoMonitor,
    markCryptoAlertReviewed,
    convertRequest,
    updateBookingStatus,
    updateSawStatus,
    createMaintenanceRecord,
    updateMaintenanceRecord,
    updateSettings,
    cryptoPaymentsEnabled,
  }

  return (
    <SawRentShell
      brand={dashboard.settings.businessName || "Saw Rent Operations"}
      subtitle={dashboard.settings.location || "Desktop rental workspace for approvals, checkout flow, and inventory control."}
      shellLabel="Admin Workspace"
      desktopItems={desktopItems}
      launcherItems={launcherItems}
      launcherFeaturedItems={launcherFeaturedItems}
      launcherRailItems={launcherRailItems}
      launcherOpen={launcherOpen}
      launcherQuery={launcherQuery}
      onLauncherQueryChange={setLauncherQuery}
      onToggleLauncher={() => setLauncherOpen((current) => !current)}
      taskbarItems={taskbarItems}
      systemBadges={[
        { label: `${overview.pendingRequests.length} awaiting approval`, tone: "warning" },
        { label: `${overview.activeBookings.length} active rentals`, tone: "info" },
        { label: `${overview.openMaintenanceRecords.length} service records`, tone: overview.openMaintenanceRecords.length > 0 ? "service" : "neutral" },
        { label: `${overview.cryptoAlertCounts.total} crypto review`, tone: overview.cryptoAlertCounts.total > 0 ? "warning" : "neutral" },
        ...(showMonitorControls
          ? [{ label: dashboard.cryptoMonitor?.automaticEnabled ? "Auto monitor on" : "Optional monitor", tone: dashboard.cryptoMonitor?.automaticEnabled ? "success" : "neutral" }]
          : []),
        ...(workspaceNotice ? [{ label: workspaceNotice, tone: "neutral" }] : []),
      ]}
    >
      {error ? <div className="error-banner error-banner--floating">{error}</div> : null}

      <div className="window-grid window-grid--admin" data-testid="admin-shell-window-grid">
        {windowStates.map((windowState) => {
          const key = windowState.key
          const module = getWindowDefinition(key)
          return (
            <WindowSurface
              key={key}
              windowKey={key}
              title={module.label}
              subtitle={module.description}
              icon={module.icon}
              frame={windowState.frame}
              zIndex={windowState.zIndex}
              size={module.size}
              active={windowState.active}
              minimized={windowState.minimized}
              onFocus={() => focusWindow(key)}
              onFrameChange={(nextFrame) => updateFrame(key, nextFrame)}
              onMinimize={() => minimizeWindow(key)}
              onToggleMaximize={() => toggleMaximizeWindow(key)}
              onClose={key === "dashboard" ? null : () => closeWindow(key)}
            >
              {renderModule({
                key,
                dashboard,
                overview,
                customers,
                calendarRows,
                dataLoading,
                paymentsEnabled,
                handlers,
              })}
            </WindowSurface>
          )
        })}
      </div>
    </SawRentShell>
  )
}
