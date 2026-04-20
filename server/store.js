import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_PATH = process.env.SAW_RENT_DATA_PATH
  ? path.resolve(process.env.SAW_RENT_DATA_PATH)
  : path.join(__dirname, "data.json")

const DEFAULT_SETTINGS = {
  businessName: "Saw Rent",
  contactPhone: "",
  contactEmail: "",
  location: "",
  defaultPickupPreference: "pickup",
  defaultRentalDays: 1,
  maintenanceLeadDays: 3,
}

function createSaw({ name, category, barSize, engineCc, dailyRateCents, depositCents, status = "available", notes = "" }) {
  return {
    id: crypto.randomUUID(),
    name,
    category,
    barSize,
    engineCc,
    dailyRateCents,
    depositCents,
    status,
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createSeedState() {
  const now = new Date().toISOString()
  return {
    saws: [
      createSaw({
        name: "Husqvarna 51",
        category: "Farm & Ranch",
        barSize: "20 in",
        engineCc: 51,
        dailyRateCents: 6000,
        depositCents: 22000,
        status: "available",
        notes: "Good running mid-size saw",
      }),
      createSaw({
        name: "Husqvarna 350",
        category: "Farm & Ranch",
        barSize: "20 in",
        engineCc: 50,
        dailyRateCents: 6000,
        depositCents: 22000,
        status: "available",
        notes: "more light in weight compared to 51",
      }),
      createSaw({
        name: "McCulloch 610 Pro Mac",
        category: "Heavy Duty",
        barSize: "20 in",
        engineCc: 61,
        dailyRateCents: 5500,
        depositCents: 20000,
        status: "available",
        notes: "Reliable torque-heavy option",
      }),
      createSaw({
        name: "Husqvarna 23 Compact",
        category: "Light Homeowner",
        barSize: "16 in",
        engineCc: 38,
        dailyRateCents: 4000,
        depositCents: 15000,
        status: "available",
        notes: "Light duty top handle saw",
      }),
      createSaw({
        name: "Husqvarna 141",
        category: "Homeowner",
        barSize: "16 in",
        engineCc: 41,
        dailyRateCents: 4000,
        depositCents: 15000,
        status: "available",
        notes: "Light duty homeowner saw",
      }),
    ],
    requests: [],
    bookings: [],
    maintenanceRecords: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: now,
    createdAt: now,
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function sanitizeObjectArray(value, fallback) {
  if (!Array.isArray(value)) return fallback
  return value.filter((entry) => isRecord(entry))
}

function sanitizeSettings(candidate) {
  const source = isRecord(candidate) ? candidate : {}
  const defaultRentalDays = Number.parseInt(source.defaultRentalDays, 10)
  const maintenanceLeadDays = Number.parseInt(source.maintenanceLeadDays, 10)

  return {
    ...DEFAULT_SETTINGS,
    ...source,
    businessName: typeof source.businessName === "string" && source.businessName.trim() ? source.businessName.trim() : DEFAULT_SETTINGS.businessName,
    contactPhone: typeof source.contactPhone === "string" ? source.contactPhone.trim() : DEFAULT_SETTINGS.contactPhone,
    contactEmail: typeof source.contactEmail === "string" ? source.contactEmail.trim() : DEFAULT_SETTINGS.contactEmail,
    location: typeof source.location === "string" ? source.location.trim() : DEFAULT_SETTINGS.location,
    defaultPickupPreference: ["pickup", "dropoff", "flexible"].includes(source.defaultPickupPreference)
      ? source.defaultPickupPreference
      : DEFAULT_SETTINGS.defaultPickupPreference,
    defaultRentalDays: Number.isFinite(defaultRentalDays) && defaultRentalDays >= 1 ? defaultRentalDays : DEFAULT_SETTINGS.defaultRentalDays,
    maintenanceLeadDays: Number.isFinite(maintenanceLeadDays) && maintenanceLeadDays >= 0 ? maintenanceLeadDays : DEFAULT_SETTINGS.maintenanceLeadDays,
  }
}

function sanitizeState(candidate) {
  const seed = createSeedState()
  if (!isRecord(candidate)) {
    return seed
  }

  return {
    ...seed,
    ...candidate,
    saws: sanitizeObjectArray(candidate.saws, seed.saws),
    requests: sanitizeObjectArray(candidate.requests, []),
    bookings: sanitizeObjectArray(candidate.bookings, []),
    maintenanceRecords: sanitizeObjectArray(candidate.maintenanceRecords, []),
    settings: sanitizeSettings(candidate.settings),
  }
}

let cache = null
let writeQueue = Promise.resolve()

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function ensureStoreFile() {
  try {
    await fs.access(DATA_PATH)
  } catch {
    const seed = createSeedState()
    await fs.writeFile(DATA_PATH, JSON.stringify(seed, null, 2), "utf8")
  }
}

export async function readState() {
  if (cache) {
    return deepClone(cache)
  }

  await ensureStoreFile()
  const raw = await fs.readFile(DATA_PATH, "utf8")
  let parsed

  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = createSeedState()
  }

  cache = sanitizeState(parsed)
  return deepClone(cache)
}

export async function mutateState(mutator) {
  const operation = writeQueue.then(async () => {
    const current = await readState()
    const draft = deepClone(current)
    const next = sanitizeState((await mutator(draft)) || draft)
    next.updatedAt = new Date().toISOString()
    cache = next
    await fs.writeFile(DATA_PATH, JSON.stringify(next, null, 2), "utf8")
    return deepClone(next)
  })

  writeQueue = operation.catch(() => {})
  return operation
}

export function computeRentalDays(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0
  }

  const dayMs = 24 * 60 * 60 * 1000
  const diff = Math.floor((end - start) / dayMs) + 1
  return diff > 0 ? diff : 0
}

export function isActiveBooking(status) {
  return ["requested", "approved", "out"].includes(status)
}

export function hasOpenMaintenanceRecord(state, sawId) {
  return state.maintenanceRecords.some(
    (record) => record.sawId === sawId && record.status !== "completed",
  )
}

export function isSawAvailableForBooking(state, sawId, excludeBookingId = null) {
  const saw = state.saws.find((item) => item.id === sawId)
  if (!saw || saw.status !== "available") {
    return false
  }

  return !state.bookings.some(
    (booking) =>
      booking.id !== excludeBookingId &&
      booking.sawId === sawId &&
      isActiveBooking(booking.status),
  )
}

export function updateSawAvailability(state, sawId) {
  const saw = state.saws.find((item) => item.id === sawId)
  if (!saw) return

  if (saw.status === "unavailable") {
    return
  }

  const hasActiveBooking = state.bookings.some(
    (booking) => booking.sawId === sawId && isActiveBooking(booking.status),
  )
  const hasPendingMaintenance = hasOpenMaintenanceRecord(state, sawId) || saw.status === "maintenance"

  if (hasActiveBooking) {
    saw.status = "out"
  } else if (hasPendingMaintenance) {
    saw.status = "maintenance"
  } else {
    saw.status = "available"
  }

  saw.updatedAt = new Date().toISOString()
}

export function moneyFromCents(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2))
}
