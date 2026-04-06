import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_PATH = path.join(__dirname, "data.json")

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
        name: "Husqvarna 550XP Mark II",
        category: "Professional",
        barSize: "20 in",
        engineCc: 50,
        dailyRateCents: 7800,
        depositCents: 25000,
        status: "available",
        notes: "High-torque pro saw for hardwood and storm cleanup.",
      }),
      createSaw({
        name: "Stihl MS 271 Farm Boss",
        category: "Farm & Ranch",
        barSize: "18 in",
        engineCc: 50,
        dailyRateCents: 6400,
        depositCents: 22000,
        status: "available",
        notes: "Balanced power and control for medium to large cuts.",
      }),
      createSaw({
        name: "Echo CS-590 Timber Wolf",
        category: "Heavy Duty",
        barSize: "20 in",
        engineCc: 59.8,
        dailyRateCents: 7200,
        depositCents: 24000,
        status: "available",
        notes: "Reliable torque-heavy option for long sessions.",
      }),
      createSaw({
        name: "Stihl MS 170",
        category: "Homeowner",
        barSize: "16 in",
        engineCc: 30.1,
        dailyRateCents: 3900,
        depositCents: 15000,
        status: "unavailable",
        notes: "Light-duty saw currently held for parts replacement.",
      }),
      createSaw({
        name: "Husqvarna 460 Rancher",
        category: "Farm & Ranch",
        barSize: "24 in",
        engineCc: 60.3,
        dailyRateCents: 8600,
        depositCents: 28000,
        status: "maintenance",
        notes: "In maintenance for chain brake and clutch inspection.",
      }),
    ],
    requests: [],
    bookings: [],
    updatedAt: now,
    createdAt: now,
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
  cache = JSON.parse(raw)
  return deepClone(cache)
}

export async function mutateState(mutator) {
  writeQueue = writeQueue.then(async () => {
    const current = await readState()
    const draft = deepClone(current)
    const next = (await mutator(draft)) || draft
    next.updatedAt = new Date().toISOString()
    cache = next
    await fs.writeFile(DATA_PATH, JSON.stringify(next, null, 2), "utf8")
    return deepClone(next)
  })

  return writeQueue
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

  if (["maintenance", "unavailable"].includes(saw.status)) {
    return
  }

  const hasActiveBooking = state.bookings.some(
    (booking) => booking.sawId === sawId && isActiveBooking(booking.status),
  )

  saw.status = hasActiveBooking ? "out" : "available"
  saw.updatedAt = new Date().toISOString()
}

export function moneyFromCents(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2))
}

