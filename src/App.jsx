import { useEffect, useMemo, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"

import { api } from "./api"
import "./App.css"

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ""
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null

const BOOKING_FLOW = {
  requested: "approved",
  approved: "out",
  out: "returned",
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : []
}

function toSafeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function normalizeStatusValue(status) {
  return toSafeString(status, "unknown").trim().toLowerCase() || "unknown"
}

function formatMoney(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100)
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return "Date not set"
  if (!endDate || startDate === endDate) return startDate
  return `${startDate} to ${endDate}`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function tomorrowIso() {
  const now = new Date()
  now.setDate(now.getDate() + 1)
  return now.toISOString().slice(0, 10)
}

function statusClass(status) {
  if (["available", "paid", "approved", "returned"].includes(status)) return "status-pill status-pill-green"
  if (["requested", "out", "converted", "unpaid"].includes(status)) return "status-pill status-pill-amber"
  if (["maintenance", "unavailable", "denied"].includes(status)) return "status-pill status-pill-red"
  return "status-pill status-pill-neutral"
}

function normalizeStatusLabel(status) {
  if (!status) return "Unknown"
  return String(status)
    .split("_")
    .map((piece) => piece.slice(0, 1).toUpperCase() + piece.slice(1))
    .join(" ")
}

function normalizeSaw(entry, index) {
  const saw = entry && typeof entry === "object" ? entry : {}
  return {
    id: toSafeString(saw.id, `saw-${index}`),
    name: toSafeString(saw.name, "Unlisted saw"),
    category: toSafeString(saw.category, "General"),
    barSize: toSafeString(saw.barSize, "N/A"),
    engineCc: Number.isFinite(Number(saw.engineCc)) ? Number(saw.engineCc) : null,
    dailyRateCents: Number(saw.dailyRateCents || 0),
    depositCents: Number(saw.depositCents || 0),
    status: normalizeStatusValue(saw.status),
    notes: toSafeString(saw.notes, "No additional notes."),
  }
}

function normalizeInventoryPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {}
  const saws = toSafeArray(source.saws).map(normalizeSaw)
  return {
    saws,
    paymentsEnabled: Boolean(source.paymentsEnabled),
  }
}

function normalizeDashboard(payload) {
  const source = payload && typeof payload === "object" ? payload : {}
  return {
    saws: toSafeArray(source.saws).map(normalizeSaw),
    requests: toSafeArray(source.requests),
    bookings: toSafeArray(source.bookings),
  }
}

function App() {
  const isAdmin = window.location.pathname.startsWith("/admin")
  return isAdmin ? <AdminApp /> : <PublicApp />
}

function PublicApp() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saws, setSaws] = useState([])
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [submittedRequest, setSubmittedRequest] = useState(null)
  const [checkoutNotice, setCheckoutNotice] = useState("")

  const [form, setForm] = useState({
    name: "",
    phone: "",
    sawId: "",
    startDate: tomorrowIso(),
    endDate: tomorrowIso(),
    pickupPreference: "pickup",
    notes: "",
  })

  const availableSaws = useMemo(() => saws.filter((saw) => saw.status === "available"), [saws])
  const selectedSaw = useMemo(() => {
    if (availableSaws.length === 0) return null
    return availableSaws.find((saw) => saw.id === form.sawId) || availableSaws[0]
  }, [availableSaws, form.sawId])

  useEffect(() => {
    if (!selectedSaw) {
      if (form.sawId !== "") {
        setForm((prev) => ({ ...prev, sawId: "" }))
      }
      return
    }

    if (selectedSaw.id !== form.sawId) {
      setForm((prev) => ({ ...prev, sawId: selectedSaw.id }))
    }
  }, [selectedSaw, form.sawId])

  useEffect(() => {
    let alive = true

    async function bootstrap() {
      try {
        const inventoryPayload = await api.getPublicInventory()
        if (!alive) return

        const { saws: nextSaws, paymentsEnabled: enabled } = normalizeInventoryPayload(inventoryPayload)

        setSaws(nextSaws)
        setPaymentsEnabled(enabled)

        const params = new URLSearchParams(window.location.search)
        const checkout = params.get("checkout")
        const requestId = params.get("requestId")

        if (checkout === "success") {
          setCheckoutNotice("Deposit payment submitted. We are validating payment confirmation.")
        } else if (checkout === "cancel") {
          setCheckoutNotice("Deposit payment was canceled. You can try again when ready.")
        }

        if (requestId) {
          try {
            const requestPayload = await api.getRequest(requestId)
            if (!alive) return
            setSubmittedRequest(requestPayload?.request || null)
          } catch {
            if (!alive) return
            setCheckoutNotice("Request reference could not be loaded.")
          }
        }
      } catch (requestError) {
        if (!alive) return
        setError(requestError.message)
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      alive = false
    }
  }, [])

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      if (!selectedSaw?.id) {
        throw new Error("No saw is available for the selected rental request.")
      }

      const { request } = await api.createRequest({ ...form, sawId: selectedSaw.id })
      setSubmittedRequest(request)
      setForm((prev) => ({
        ...prev,
        name: "",
        phone: "",
        notes: "",
      }))
      setCheckoutNotice("Request received. Pay your deposit to prioritize approval.")
      window.history.replaceState({}, "", "/")
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function startCheckout() {
    if (!submittedRequest) return

    setCheckoutBusy(true)
    setError("")

    try {
      if (!stripePromise) {
        throw new Error("Stripe publishable key is not configured in this environment.")
      }

      const stripe = await stripePromise
      if (!stripe) {
        throw new Error("Stripe client failed to initialize.")
      }

      const { sessionId } = await api.createCheckoutSession({
        requestId: submittedRequest.id,
        origin: window.location.origin,
      })

      const result = await stripe.redirectToCheckout({ sessionId })
      if (result?.error?.message) {
        throw new Error(result.error.message)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCheckoutBusy(false)
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading available saw inventory...</div>
  }

  const requestDailyRate = submittedRequest
    ? Math.round(Number(submittedRequest.rentalTotalCents || 0) / Math.max(1, Number(submittedRequest.rentalDays || 1)))
    : 0

  return (
    <div className="app-shell">
      <header className="site-nav">
        <div className="site-nav-inner">
          <a className="brand" href="#top">
            <span className="brand-icon" aria-hidden="true">SR</span>
            <span className="brand-copy">
              <strong>Saw Rent</strong>
              <span>Chainsaw Rental Yard</span>
            </span>
          </a>
          <nav className="site-links" aria-label="Primary">
            <a href="#inventory">Inventory</a>
            <a href="#request">Request Rental</a>
            <a href="/admin">Admin</a>
          </nav>
          <a className="button button-ghost button-small" href="#request">Book Now</a>
        </div>
      </header>

      <main className="shell" id="top">
        <section className="hero">
          <div className="hero-copy-wrap">
            <p className="overline">Professional rental inventory</p>
            <h1>
              Chainsaws Ready
              <span> For Real Jobsite Work</span>
            </h1>
            <p className="hero-lede">
              Rent pro-grade saws with transparent daily pricing, verified deposits, and fast approval for pickup or dropoff.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#request">Request a Rental</a>
              <a className="button button-ghost" href="#inventory">View Inventory</a>
            </div>
          </div>

          <div className="hero-command panel panel-dramatic">
            <p className="command-eyebrow">Dispatch command</p>
            <pre>
              <code>{`reserve --saw "${selectedSaw?.name || "next-available"}"\n--from ${form.startDate} --to ${form.endDate}`}</code>
            </pre>
            <div className="command-grid">
              <div>
                <span>Available saws</span>
                <strong>{availableSaws.length}</strong>
              </div>
              <div>
                <span>Average day rate</span>
                <strong>{formatMoney(availableSaws.reduce((sum, saw) => sum + saw.dailyRateCents, 0) / Math.max(1, availableSaws.length))}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="hero-metrics" aria-label="Business metrics">
          <article className="metric-card">
            <span>Total units</span>
            <strong>{saws.length}</strong>
            <p>Maintained for local rental throughput.</p>
          </article>
          <article className="metric-card">
            <span>Ready now</span>
            <strong>{availableSaws.length}</strong>
            <p>Immediately requestable from this screen.</p>
          </article>
          <article className="metric-card">
            <span>Deposit flow</span>
            <strong>{paymentsEnabled ? "Enabled" : "Offline"}</strong>
            <p>{paymentsEnabled ? "Card checkout live for approved requests." : "Deposit collection handled at the desk."}</p>
          </article>
        </section>

        {checkoutNotice || error ? (
          <section className="feedback-stack" aria-live="polite">
            {checkoutNotice ? <div className="notice-banner">{checkoutNotice}</div> : null}
            {error ? <div className="error-banner">{error}</div> : null}
          </section>
        ) : null}

        <section className="public-layout">
          <article className="panel" id="inventory">
            <header className="panel-head">
              <div>
                <p className="overline-small">Inventory</p>
                <h2>Available Chainsaw Fleet</h2>
                <p className="panel-subtitle">Every saw lists bar length, engine size, daily rate, deposit, and operational notes.</p>
              </div>
              <span className="status-pill status-pill-neutral">{availableSaws.length} ready</span>
            </header>

            {saws.length === 0 ? (
              <div className="empty-state">No inventory is currently loaded. Contact the rental desk for manual scheduling.</div>
            ) : (
              <div className="inventory-grid">
                {saws.map((saw) => (
                  <article key={saw.id} className={`saw-card ${saw.status === "available" ? "saw-card-accent" : ""}`}>
                    <div className="saw-head">
                      <div>
                        <h3>{saw.name}</h3>
                        <p>{saw.category}</p>
                      </div>
                      <span className={statusClass(saw.status)}>{normalizeStatusLabel(saw.status)}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Bar / Engine</dt>
                        <dd>{saw.barSize} / {saw.engineCc ? `${saw.engineCc}cc` : "N/A"}</dd>
                      </div>
                      <div>
                        <dt>Daily rate</dt>
                        <dd>{formatMoney(saw.dailyRateCents)}</dd>
                      </div>
                      <div>
                        <dt>Deposit</dt>
                        <dd>{formatMoney(saw.depositCents)}</dd>
                      </div>
                    </dl>
                    <p className="saw-notes">{saw.notes}</p>
                  </article>
                ))}
              </div>
            )}
          </article>

          <aside className="panel panel-accent" id="request">
            {!submittedRequest ? (
              <>
                <header className="panel-head">
                  <div>
                    <p className="overline-small">Rental request</p>
                    <h2>Request Your Pickup Window</h2>
                    <p className="panel-subtitle">Submit details once. We confirm availability, then collect deposit for final scheduling.</p>
                  </div>
                </header>

                {selectedSaw ? (
                  <div className="selected-saw">
                    <span>Selected saw</span>
                    <strong>{selectedSaw.name}</strong>
                    <p>{formatMoney(selectedSaw.dailyRateCents)} per day / {formatMoney(selectedSaw.depositCents)} deposit</p>
                  </div>
                ) : null}

                <form className="request-form" onSubmit={handleSubmit}>
                  <label>
                    <span>Full name</span>
                    <input
                      value={form.name}
                      onChange={(event) => updateForm("name", event.target.value)}
                      autoComplete="name"
                      required
                    />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input
                      value={form.phone}
                      onChange={(event) => updateForm("phone", event.target.value)}
                      autoComplete="tel"
                      required
                    />
                  </label>
                  <label>
                    <span>Chainsaw model</span>
                    <select
                      value={selectedSaw?.id || ""}
                      onChange={(event) => updateForm("sawId", event.target.value)}
                      disabled={availableSaws.length === 0}
                      required
                    >
                      {availableSaws.length === 0 ? <option value="">No available saws</option> : null}
                      {availableSaws.map((saw) => (
                        <option key={saw.id} value={saw.id}>{saw.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="form-row">
                    <label>
                      <span>Start date</span>
                      <input
                        type="date"
                        value={form.startDate}
                        min={todayIso()}
                        onChange={(event) => updateForm("startDate", event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      <span>End date</span>
                      <input
                        type="date"
                        value={form.endDate}
                        min={form.startDate || todayIso()}
                        onChange={(event) => updateForm("endDate", event.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    <span>Pickup preference</span>
                    <select
                      value={form.pickupPreference}
                      onChange={(event) => updateForm("pickupPreference", event.target.value)}
                      required
                    >
                      <option value="pickup">Pickup</option>
                      <option value="dropoff">Dropoff</option>
                      <option value="flexible">Flexible</option>
                    </select>
                  </label>
                  <label>
                    <span>Job notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(event) => updateForm("notes", event.target.value)}
                      rows={4}
                      placeholder="Cut type, access notes, or crew timing details"
                    />
                  </label>
                  <button className="button button-primary" type="submit" disabled={submitting || availableSaws.length === 0}>
                    {submitting ? "Submitting request..." : "Submit Rental Request"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <header className="panel-head">
                  <div>
                    <p className="overline-small">Request received</p>
                    <h2>Finalize Your Reservation</h2>
                    <p className="panel-subtitle">Complete the deposit to lock queue priority and final approval.</p>
                  </div>
                </header>

                <div className="request-summary">
                  <div>
                    <span>Request ID</span>
                    <strong>{submittedRequest.id}</strong>
                  </div>
                  <div>
                    <span>Saw</span>
                    <strong>{submittedRequest.sawName}</strong>
                  </div>
                  <div>
                    <span>Dates</span>
                    <strong>{formatDateRange(submittedRequest.startDate, submittedRequest.endDate)}</strong>
                  </div>
                  <div>
                    <span>Daily rate</span>
                    <strong>{formatMoney(requestDailyRate)}</strong>
                  </div>
                  <div>
                    <span>Deposit due</span>
                    <strong>{formatMoney(submittedRequest.depositCents)}</strong>
                  </div>
                  <div>
                    <span>Payment</span>
                    <strong className={statusClass(normalizeStatusValue(submittedRequest.paymentStatus))}>{normalizeStatusLabel(submittedRequest.paymentStatus)}</strong>
                  </div>
                </div>

                {paymentsEnabled && STRIPE_PUBLISHABLE_KEY ? (
                  <button className="button button-primary" onClick={startCheckout} disabled={checkoutBusy}>
                    {checkoutBusy ? "Opening checkout..." : "Pay Deposit"}
                  </button>
                ) : (
                  <div className="notice-banner">Deposit payments are temporarily unavailable. Contact the rental desk.</div>
                )}

                <button
                  className="button button-ghost"
                  onClick={() => {
                    setSubmittedRequest(null)
                    setCheckoutNotice("")
                    window.history.replaceState({}, "", "/")
                  }}
                >
                  Submit Another Request
                </button>
              </>
            )}
          </aside>
        </section>
      </main>
    </div>
  )
}

function AdminApp() {
  const [authLoading, setAuthLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [dashboard, setDashboard] = useState(() => normalizeDashboard({}))
  const [dataLoading, setDataLoading] = useState(false)
  const [tab, setTab] = useState("requests")

  useEffect(() => {
    let alive = true

    async function checkSession() {
      try {
        const { authenticated: sessionOk } = await api.adminSession()
        if (!alive) return
        setAuthenticated(Boolean(sessionOk))
      } catch {
        if (!alive) return
        setAuthenticated(false)
      } finally {
        if (alive) {
          setAuthLoading(false)
        }
      }
    }

    checkSession()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!authenticated) return
    void loadDashboard()
  }, [authenticated])

  async function loadDashboard() {
    setDataLoading(true)
    setError("")

    try {
      const snapshot = await api.adminDashboard()
      setDashboard(normalizeDashboard(snapshot))
    } catch (requestError) {
      setError(requestError.message)
      if (requestError.message.toLowerCase().includes("authentication")) {
        setAuthenticated(false)
      }
    } finally {
      setDataLoading(false)
    }
  }

  async function login(event) {
    event.preventDefault()
    setError("")

    try {
      await api.adminLogin(password)
      setPassword("")
      setAuthenticated(true)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function logout() {
    await api.adminLogout()
    setAuthenticated(false)
    setDashboard(normalizeDashboard({}))
  }

  async function updateRequestStatus(requestId, status) {
    setError("")
    try {
      await api.updateRequestStatus(requestId, status)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function convertRequest(requestId) {
    setError("")
    try {
      await api.convertRequest(requestId)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function updateBookingStatus(bookingId, status) {
    setError("")
    try {
      await api.updateBookingStatus(bookingId, status)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function updateSawStatus(sawId, status) {
    setError("")
    try {
      await api.updateSawStatus(sawId, status)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  if (authLoading) {
    return <div className="loading-screen">Validating admin session...</div>
  }

  if (!authenticated) {
    return (
      <div className="app-shell admin-login-shell">
        <div className="auth-card">
          <p className="overline-small">Owner access</p>
          <h1>Rental Operations Console</h1>
          <p className="panel-subtitle">Admin controls are protected. Authenticate with the owner password.</p>
          {error ? <div className="error-banner">{error}</div> : null}
          <form onSubmit={login} className="request-form">
            <label>
              <span>Admin password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button className="button button-primary" type="submit">Sign In</button>
          </form>
          <a className="button button-ghost button-small" href="/">Return to renter site</a>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <main className="shell admin-shell">
        <header className="admin-header panel">
          <div>
            <p className="overline-small">Admin</p>
            <h1>Saw Rent Operations</h1>
            <p className="panel-subtitle">Manage requests, move bookings through lifecycle states, and control inventory status.</p>
          </div>
          <div className="admin-actions">
            <button className="button button-ghost button-small" onClick={loadDashboard} disabled={dataLoading}>Refresh</button>
            <button className="button button-ghost button-small" onClick={logout}>Sign Out</button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <nav className="tabs" aria-label="Admin sections">
          <button className={tab === "requests" ? "tab active" : "tab"} onClick={() => setTab("requests")}>Requests</button>
          <button className={tab === "bookings" ? "tab active" : "tab"} onClick={() => setTab("bookings")}>Bookings</button>
          <button className={tab === "inventory" ? "tab active" : "tab"} onClick={() => setTab("inventory")}>Inventory</button>
        </nav>

        <section className="panel">
          {dataLoading ? <div className="notice-banner">Refreshing data...</div> : null}

          {tab === "requests" ? (
            <>
              <h2>Incoming Requests</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Saw</th>
                      <th>Dates</th>
                      <th>Deposit</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.requests.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No requests found.</td>
                      </tr>
                    ) : dashboard.requests.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <strong>{request.customerName}</strong>
                          <div className="table-sub">{request.phone}</div>
                        </td>
                        <td>{request.sawName}</td>
                        <td>{formatDateRange(request.startDate, request.endDate)}</td>
                        <td>{formatMoney(request.depositCents)}</td>
                        <td><span className={statusClass(normalizeStatusValue(request.paymentStatus))}>{normalizeStatusLabel(request.paymentStatus)}</span></td>
                        <td><span className={statusClass(normalizeStatusValue(request.status))}>{normalizeStatusLabel(request.status)}</span></td>
                        <td>
                          <div className="table-actions">
                            {request.status === "requested" ? (
                              <>
                                <button className="button button-ghost button-small" onClick={() => updateRequestStatus(request.id, "approved")} disabled={normalizeStatusValue(request.paymentStatus) !== "paid"}>Approve</button>
                                <button className="button button-danger button-small" onClick={() => updateRequestStatus(request.id, "denied")}>Deny</button>
                              </>
                            ) : null}
                            {request.status === "approved" ? (
                              <button className="button button-primary button-small" onClick={() => convertRequest(request.id)} disabled={normalizeStatusValue(request.paymentStatus) !== "paid"}>Convert</button>
                            ) : null}
                            {request.status === "converted" && request.bookingId ? <span className="table-sub">Booking linked</span> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {tab === "bookings" ? (
            <>
              <h2>Booking Lifecycle</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Saw</th>
                      <th>Dates</th>
                      <th>Rental</th>
                      <th>Deposit</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.bookings.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No bookings found.</td>
                      </tr>
                    ) : dashboard.bookings.map((booking) => (
                      <tr key={booking.id}>
                        <td>
                          <strong>{booking.customerName}</strong>
                          <div className="table-sub">{booking.phone}</div>
                        </td>
                        <td>{booking.sawName}</td>
                        <td>{formatDateRange(booking.startDate, booking.endDate)}</td>
                        <td>{formatMoney(booking.rentalTotalCents)}</td>
                        <td>{formatMoney(booking.depositCents)}</td>
                        <td><span className={statusClass(normalizeStatusValue(booking.status))}>{normalizeStatusLabel(booking.status)}</span></td>
                        <td>
                          {BOOKING_FLOW[booking.status] ? (
                            <button className="button button-ghost button-small" onClick={() => updateBookingStatus(booking.id, BOOKING_FLOW[booking.status])}>
                              Move to {normalizeStatusLabel(BOOKING_FLOW[booking.status])}
                            </button>
                          ) : (
                            <span className="table-sub">Complete</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {tab === "inventory" ? (
            <>
              <h2>Inventory Controls</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Saw</th>
                      <th>Category</th>
                      <th>Rate / Deposit</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.saws.length === 0 ? (
                      <tr>
                        <td colSpan={5}>No saws found.</td>
                      </tr>
                    ) : dashboard.saws.map((saw) => (
                      <tr key={saw.id}>
                        <td>
                          <strong>{saw.name}</strong>
                          <div className="table-sub">{saw.barSize} / {saw.engineCc ? `${saw.engineCc}cc` : "N/A"}</div>
                        </td>
                        <td>{saw.category}</td>
                        <td>{formatMoney(saw.dailyRateCents)} / {formatMoney(saw.depositCents)}</td>
                        <td><span className={statusClass(normalizeStatusValue(saw.status))}>{normalizeStatusLabel(saw.status)}</span></td>
                        <td>
                          <div className="table-actions">
                            <button className="button button-ghost button-small" onClick={() => updateSawStatus(saw.id, "maintenance")}>Maintenance</button>
                            <button className="button button-danger button-small" onClick={() => updateSawStatus(saw.id, "unavailable")}>Unavailable</button>
                            <button className="button button-primary button-small" onClick={() => updateSawStatus(saw.id, "available")}>Restore</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default App
