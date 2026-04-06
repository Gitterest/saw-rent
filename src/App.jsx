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

function formatMoney(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100)
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
  if (["available", "paid", "approved"].includes(status)) return "badge badge-green"
  if (["requested", "out", "converted"].includes(status)) return "badge badge-gold"
  if (["maintenance", "unavailable", "denied", "unpaid"].includes(status)) return "badge badge-red"
  return "badge badge-neutral"
}

function normalizeStatusLabel(status) {
  if (!status) return "Unknown"
  return status
    .split("_")
    .map((piece) => piece.slice(0, 1).toUpperCase() + piece.slice(1))
    .join(" ")
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
  const selectedSawId = availableSaws.some((saw) => saw.id === form.sawId) ? form.sawId : (availableSaws[0]?.id || "")

  useEffect(() => {
    let alive = true

    async function bootstrap() {
      try {
        const [{ saws: list, paymentsEnabled: enabled }] = await Promise.all([api.getPublicInventory()])
        if (!alive) return

        setSaws(list)
        setPaymentsEnabled(Boolean(enabled))

        const defaultSawId = list.find((entry) => entry.status === "available")?.id || ""
        setForm((prev) => ({ ...prev, sawId: defaultSawId }))

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
            const { request } = await api.getRequest(requestId)
            if (!alive) return
            setSubmittedRequest(request)
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

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      const { request } = await api.createRequest({ ...form, sawId: selectedSawId })
      setSubmittedRequest(request)
      setForm((prev) => ({
        ...prev,
        name: "",
        phone: "",
        notes: "",
      }))
      setCheckoutNotice("We received your request. Pay your deposit to lock in processing.")
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
    return <div className="shell loading">Loading inventory...</div>
  }

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-title">Saw Rent</div>
        <h1>Chainsaw Rentals For Real Jobsite Work</h1>
        <p>Reserve pro-grade saws with transparent pricing, live deposit payment, and same-day approval workflow.</p>
      </header>

      {checkoutNotice ? <div className="notice">{checkoutNotice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="layout">
        <div className="panel">
          <h2>Available Inventory</h2>
          <p className="panel-subtitle">Daily rate, deposit, status, and notes are shown for every saw.</p>
          <div className="inventory-grid">
            {saws.map((saw) => (
              <article key={saw.id} className="saw-card">
                <div className="saw-card-head">
                  <strong>{saw.name}</strong>
                  <span className={statusClass(saw.status)}>{normalizeStatusLabel(saw.status)}</span>
                </div>
                <div className="saw-row"><span>Category</span><strong>{saw.category}</strong></div>
                <div className="saw-row"><span>Bar / Engine</span><strong>{saw.barSize} · {saw.engineCc}cc</strong></div>
                <div className="saw-row"><span>Daily Price</span><strong>{formatMoney(saw.dailyRateCents)}</strong></div>
                <div className="saw-row"><span>Deposit</span><strong>{formatMoney(saw.depositCents)}</strong></div>
                <p className="saw-notes">{saw.notes || "No notes."}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          {!submittedRequest ? (
            <>
              <h2>Request Rental</h2>
              <p className="panel-subtitle">Submit your rental request, then pay your deposit to prioritize approval.</p>
              <form className="form" onSubmit={handleSubmit}>
                <label>
                  Name
                  <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
                </label>
                <label>
                  Phone
                  <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} required />
                </label>
                <label>
                  Chainsaw
                  <select value={selectedSawId} onChange={(event) => setForm((prev) => ({ ...prev, sawId: event.target.value }))} required>
                    {availableSaws.length === 0 ? <option value="">No available saws</option> : null}
                    {availableSaws.map((saw) => (
                      <option key={saw.id} value={saw.id}>{saw.name}</option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Start Date
                    <input type="date" value={form.startDate} min={todayIso()} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} required />
                  </label>
                  <label>
                    End Date
                    <input type="date" value={form.endDate} min={form.startDate || todayIso()} onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))} required />
                  </label>
                </div>
                <label>
                  Pickup / Return Preference
                  <select value={form.pickupPreference} onChange={(event) => setForm((prev) => ({ ...prev, pickupPreference: event.target.value }))} required>
                    <option value="pickup">Pickup</option>
                    <option value="dropoff">Dropoff</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </label>
                <label>
                  Notes (optional)
                  <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} />
                </label>
                <button className="button primary" type="submit" disabled={submitting || availableSaws.length === 0}>
                  {submitting ? "Submitting..." : "Request Rental"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2>We Received Your Request</h2>
              <p className="panel-subtitle">Next step: complete the deposit payment so we can finalize scheduling.</p>
              <div className="request-summary">
                <div className="saw-row"><span>Request ID</span><strong>{submittedRequest.id}</strong></div>
                <div className="saw-row"><span>Saw</span><strong>{submittedRequest.sawName}</strong></div>
                <div className="saw-row"><span>Dates</span><strong>{submittedRequest.startDate} to {submittedRequest.endDate}</strong></div>
                <div className="saw-row"><span>Daily Rate</span><strong>{formatMoney(submittedRequest.rentalTotalCents / submittedRequest.rentalDays)}</strong></div>
                <div className="saw-row"><span>Deposit Due</span><strong>{formatMoney(submittedRequest.depositCents)}</strong></div>
                <div className="saw-row"><span>Payment Status</span><span className={statusClass(submittedRequest.paymentStatus)}>{normalizeStatusLabel(submittedRequest.paymentStatus)}</span></div>
              </div>

              {paymentsEnabled && STRIPE_PUBLISHABLE_KEY ? (
                <button className="button primary" onClick={startCheckout} disabled={checkoutBusy}>
                  {checkoutBusy ? "Opening Checkout..." : "Pay Deposit"}
                </button>
              ) : (
                <div className="notice warning">Deposit payments are temporarily unavailable. Contact the rental desk.</div>
              )}

              <button
                className="button ghost"
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
        </div>
      </section>
    </div>
  )
}

function AdminApp() {
  const [authLoading, setAuthLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [dashboard, setDashboard] = useState({ saws: [], requests: [], bookings: [] })
  const [dataLoading, setDataLoading] = useState(false)
  const [tab, setTab] = useState("requests")

  useEffect(() => {
    let alive = true

    async function checkSession() {
      try {
        const { authenticated: sessionOk } = await api.adminSession()
        if (!alive) return
        setAuthenticated(sessionOk)
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
      setDashboard(snapshot)
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
    setDashboard({ saws: [], requests: [], bookings: [] })
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
    return <div className="shell loading">Validating admin session...</div>
  }

  if (!authenticated) {
    return (
      <div className="shell admin-login-shell">
        <div className="admin-login-card">
          <h1>Owner Access</h1>
          <p>Admin tools are protected. Authenticate with the owner password.</p>
          {error ? <div className="error">{error}</div> : null}
          <form onSubmit={login} className="form">
            <label>
              Admin Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button className="button primary" type="submit">Sign In</button>
          </form>
          <a className="back-link" href="/">Return to renter site</a>
        </div>
      </div>
    )
  }

  return (
    <div className="shell admin-shell">
      <header className="admin-header">
        <div>
          <div className="hero-title">Saw Rent Admin</div>
          <h1>Rental Operations Console</h1>
        </div>
        <div className="admin-actions">
          <button className="button ghost" onClick={loadDashboard} disabled={dataLoading}>Refresh</button>
          <button className="button ghost" onClick={logout}>Sign Out</button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <nav className="tabs" aria-label="Admin sections">
        <button className={tab === "requests" ? "tab active" : "tab"} onClick={() => setTab("requests")}>Requests</button>
        <button className={tab === "bookings" ? "tab active" : "tab"} onClick={() => setTab("bookings")}>Bookings</button>
        <button className={tab === "inventory" ? "tab active" : "tab"} onClick={() => setTab("inventory")}>Inventory</button>
      </nav>

      <section className="panel">
        {dataLoading ? <div className="loading-inline">Updating data...</div> : null}

        {tab === "requests" ? (
          <>
            <h2>Incoming Requests</h2>
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
                {dashboard.requests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.customerName}</strong>
                      <div className="table-sub">{request.phone}</div>
                    </td>
                    <td>{request.sawName}</td>
                    <td>{request.startDate} to {request.endDate}</td>
                    <td>{formatMoney(request.depositCents)}</td>
                    <td><span className={statusClass(request.paymentStatus)}>{normalizeStatusLabel(request.paymentStatus)}</span></td>
                    <td><span className={statusClass(request.status)}>{normalizeStatusLabel(request.status)}</span></td>
                    <td>
                      <div className="table-actions">
                        {request.status === "requested" ? (
                          <>
                            <button className="button tiny" onClick={() => updateRequestStatus(request.id, "approved")} disabled={request.paymentStatus !== "paid"}>Approve</button>
                            <button className="button tiny danger" onClick={() => updateRequestStatus(request.id, "denied")}>Deny</button>
                          </>
                        ) : null}
                        {request.status === "approved" ? (
                          <button className="button tiny" onClick={() => convertRequest(request.id)} disabled={request.paymentStatus !== "paid"}>Convert</button>
                        ) : null}
                        {request.status === "converted" && request.bookingId ? <span className="table-sub">Booking linked</span> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {tab === "bookings" ? (
          <>
            <h2>Bookings Lifecycle</h2>
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
                {dashboard.bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <strong>{booking.customerName}</strong>
                      <div className="table-sub">{booking.phone}</div>
                    </td>
                    <td>{booking.sawName}</td>
                    <td>{booking.startDate} to {booking.endDate}</td>
                    <td>{formatMoney(booking.rentalTotalCents)}</td>
                    <td>{formatMoney(booking.depositCents)}</td>
                    <td><span className={statusClass(booking.status)}>{normalizeStatusLabel(booking.status)}</span></td>
                    <td>
                      {BOOKING_FLOW[booking.status] ? (
                        <button className="button tiny" onClick={() => updateBookingStatus(booking.id, BOOKING_FLOW[booking.status])}>
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
          </>
        ) : null}

        {tab === "inventory" ? (
          <>
            <h2>Inventory Status Controls</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Saw</th>
                  <th>Category</th>
                  <th>Price/Deposit</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.saws.map((saw) => (
                  <tr key={saw.id}>
                    <td>
                      <strong>{saw.name}</strong>
                      <div className="table-sub">{saw.barSize} · {saw.engineCc}cc</div>
                    </td>
                    <td>{saw.category}</td>
                    <td>{formatMoney(saw.dailyRateCents)} / {formatMoney(saw.depositCents)}</td>
                    <td><span className={statusClass(saw.status)}>{normalizeStatusLabel(saw.status)}</span></td>
                    <td>
                      <div className="table-actions">
                        <button className="button tiny" onClick={() => updateSawStatus(saw.id, "maintenance")}>Maintenance</button>
                        <button className="button tiny" onClick={() => updateSawStatus(saw.id, "unavailable")}>Unavailable</button>
                        <button className="button tiny" onClick={() => updateSawStatus(saw.id, "available")}>Restore</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </section>
    </div>
  )
}

export default App

