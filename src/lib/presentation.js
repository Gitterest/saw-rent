const SUCCESS_STATUSES = new Set(["available", "paid", "approved", "returned", "complete", "cleared"])
const WARNING_STATUSES = new Set([
  "requested",
  "pending",
  "out",
  "converted",
  "unpaid",
  "attention",
  "awaiting_crypto_payment",
  "awaiting_txid_submission",
  "awaiting_txid_review",
  "crypto_payment_detected",
])
const DANGER_STATUSES = new Set(["maintenance", "unavailable", "denied", "blocked", "damaged", "overdue", "failed", "expired", "cancelled", "underpaid"])
const SERVICE_STATUSES = new Set(["service"])

export function normalizeStatusLabel(status) {
  if (!status) return "Unknown"
  return String(status)
    .split("_")
    .map((piece) => piece.slice(0, 1).toUpperCase() + piece.slice(1))
    .join(" ")
}

export function getStatusTone(status) {
  const normalized = String(status || "").trim().toLowerCase()
  if (SUCCESS_STATUSES.has(normalized)) return "success"
  if (WARNING_STATUSES.has(normalized)) return "warning"
  if (SERVICE_STATUSES.has(normalized)) return "service"
  if (DANGER_STATUSES.has(normalized)) return "danger"
  return "neutral"
}

export function formatMoney(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100)
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return "Date not set"
  if (!endDate || startDate === endDate) return startDate
  return `${startDate} to ${endDate}`
}

export function formatDateTime(value) {
  if (!value) return "No timestamp"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "No timestamp"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}
