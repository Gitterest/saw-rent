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
  isActiveBooking,
  isSawAvailableForBooking,
  mutateState,
  readState,
  updateSawAvailability,
} from "./store.js"

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

function sanitizeRequest(request) {
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
    paymentStatus: request.paymentStatus,
    createdAt: request.createdAt,
    bookingId: request.bookingId || null,
  }
}

function sanitizeBooking(booking) {
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
    paymentStatus: booking.paymentStatus,
    status: booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  }
}

function adminSnapshot(state) {
  return {
    saws: state.saws.map(sanitizeSaw),
    requests: state.requests.map(sanitizeRequest),
    bookings: state.bookings.map(sanitizeBooking),
  }
}

export function createApp() {
  const app = express()

  app.disable("x-powered-by")

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
          request.paymentIntentId = String(session.payment_intent || "")
          request.checkoutSessionId = String(session.id || "")
          request.paidAt = new Date().toISOString()
          request.updatedAt = new Date().toISOString()

          const booking = state.bookings.find((entry) => entry.requestId === requestId)
          if (booking) {
            booking.paymentStatus = "paid"
            booking.paymentIntentId = request.paymentIntentId
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
          paymentStatus: "unpaid",
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

      await mutateState((draft) => {
        const target = draft.requests.find((entry) => entry.id === request.id)
        if (target) {
          target.checkoutSessionId = String(session.id)
          target.updatedAt = new Date().toISOString()
        }
        return draft
      })

      res.json({ sessionId: session.id })
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
      res.json(adminSnapshot(state))
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
      res.json({ request: sanitizeRequest(updated) })
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
          paymentStatus: request.paymentStatus,
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
      res.status(201).json({ booking: sanitizeBooking(booking) })
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
      res.json({ booking: sanitizeBooking(booking) })
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

        if (status === "available") {
          assert(!hasActiveBooking, 409, "Cannot restore availability while booking is active.")
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
  })

  return server
}

if (process.env.SAW_RENT_NO_AUTOSTART !== "1") {
  startServer().catch((error) => {
    console.error("Server failed to start", error)
    process.exit(1)
  })
}

