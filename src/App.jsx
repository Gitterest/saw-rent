import { useEffect, useMemo, useState } from "react"

import { api } from "./api"
import { AdminWorkspace } from "./features/admin/AdminWorkspace"
import { PublicWorkspace } from "./features/public/PublicWorkspace"
import { getPublicAppOrigin, isNativePlatform } from "./runtimeConfig"
import "./styles/app-shell.css"
import "./App.css"

const DEFAULT_LOCATION_LABEL = "LaPorte County / Northwest Indiana"

function toSafeArray(value) {
  return Array.isArray(value) ? value : []
}

function toSafeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function normalizeStatusValue(status) {
  return toSafeString(status, "unknown").trim().toLowerCase() || "unknown"
}

function addDaysIso(startDate, daysToAdd) {
  const base = new Date(startDate)
  base.setDate(base.getDate() + daysToAdd)
  return base.toISOString().slice(0, 10)
}

function tomorrowIso() {
  const now = new Date()
  now.setDate(now.getDate() + 1)
  return now.toISOString().slice(0, 10)
}

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {}
  const defaultRentalDays = Number.parseInt(source.defaultRentalDays, 10)
  const maintenanceLeadDays = Number.parseInt(source.maintenanceLeadDays, 10)

  return {
    businessName: toSafeString(source.businessName, "Saw Rent"),
    contactPhone: toSafeString(source.contactPhone),
    contactEmail: toSafeString(source.contactEmail),
    location: toSafeString(source.location, DEFAULT_LOCATION_LABEL) || DEFAULT_LOCATION_LABEL,
    defaultPickupPreference: "pickup",
    defaultRentalDays: Number.isFinite(defaultRentalDays) && defaultRentalDays >= 1 ? defaultRentalDays : 1,
    maintenanceLeadDays: Number.isFinite(maintenanceLeadDays) && maintenanceLeadDays >= 0 ? maintenanceLeadDays : 3,
  }
}

function normalizeSaw(entry, index) {
  const saw = entry && typeof entry === "object" ? entry : {}
  const fallbackName = toSafeString(saw.name, `Saw ${index + 1}`)
  const [fallbackBrand = "Saw", ...modelParts] = fallbackName.split(" ")
  const brand = toSafeString(saw.brand, fallbackBrand)
  const model = toSafeString(saw.model, modelParts.join(" ") || fallbackName)
  const type = toSafeString(saw.type || saw.category, "General")
  const image = toSafeString(saw.image || saw.imageUrl)
  const dailyPrice = Number(saw.dailyPrice || saw.dailyRateCents || 0)
  const deposit = Number(saw.deposit || saw.depositCents || 0)

  return {
    id: toSafeString(saw.id, `saw-${index}`),
    name: toSafeString(saw.name, `${brand} ${model}`.trim() || "Unlisted saw"),
    brand,
    model,
    category: type,
    type,
    barSize: toSafeString(saw.barSize, "N/A"),
    engineCc: Number.isFinite(Number(saw.engineCc)) ? Number(saw.engineCc) : null,
    dailyRateCents: dailyPrice,
    dailyPrice,
    depositCents: deposit,
    deposit,
    status: normalizeStatusValue(saw.status),
    notes: toSafeString(saw.notes, "No additional notes."),
    image,
    imageUrl: image,
  }
}

function normalizeInventoryPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {}
  return {
    saws: toSafeArray(source.saws).map(normalizeSaw),
    paymentsEnabled: Boolean(source.paymentsEnabled),
    cryptoPaymentsEnabled: source.cryptoPaymentsEnabled !== false,
    settings: normalizeSettings(source.settings),
  }
}

function normalizeDashboard(payload) {
  const source = payload && typeof payload === "object" ? payload : {}
  return {
    saws: toSafeArray(source.saws).map(normalizeSaw),
    requests: toSafeArray(source.requests),
    bookings: toSafeArray(source.bookings),
    maintenanceRecords: toSafeArray(source.maintenanceRecords),
    settings: normalizeSettings(source.settings),
    cryptoAlerts: toSafeArray(source.cryptoAlerts),
    cryptoMonitor: source.cryptoMonitor && typeof source.cryptoMonitor === "object" ? source.cryptoMonitor : {},
  }
}

function App() {
  const isAdmin = window.location.pathname.startsWith("/admin")
  return (
    <>
      <NetworkStatusBanner />
      {isAdmin ? <AdminApp /> : <PublicApp />}
    </>
  )
}

function NetworkStatusBanner() {
  const [networkStatus, setNetworkStatus] = useState(null)

  useEffect(() => {
    function handleNetworkStatus(event) {
      setNetworkStatus(event.detail || null)
    }
    function handleOnline() {
      setNetworkStatus({ connected: true })
    }
    function handleOffline() {
      setNetworkStatus({ connected: false })
    }

    window.addEventListener("sawrent:network-status", handleNetworkStatus)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("sawrent:network-status", handleNetworkStatus)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  if (!isNativePlatform() || networkStatus?.connected !== false) return null

  return (
    <div className="native-network-banner" role="status">
      Saw Rent is offline. Reconnect to load inventory, requests, checkout, and admin data.
    </div>
  )
}

function PublicApp() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saws, setSaws] = useState([])
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const [cryptoPaymentsEnabled, setCryptoPaymentsEnabled] = useState(true)
  const [settings, setSettings] = useState(() => normalizeSettings({}))
  const [submitting, setSubmitting] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [cryptoBusy, setCryptoBusy] = useState(false)
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
        setForm((current) => ({ ...current, sawId: "" }))
      }
      return
    }

    if (selectedSaw.id !== form.sawId) {
      setForm((current) => ({ ...current, sawId: selectedSaw.id }))
    }
  }, [selectedSaw, form.sawId])

  useEffect(() => {
    let alive = true

    async function bootstrap() {
      try {
        const inventoryPayload = await api.getPublicInventory()
        if (!alive) return

        const {
          saws: nextSaws,
          paymentsEnabled: enabled,
          cryptoPaymentsEnabled: cryptoEnabled,
          settings: nextSettings,
        } = normalizeInventoryPayload(inventoryPayload)
        setSaws(nextSaws)
        setPaymentsEnabled(enabled)
        setCryptoPaymentsEnabled(cryptoEnabled)
        setSettings(nextSettings)
        setForm((current) => {
          const nextStartDate = current.startDate || tomorrowIso()
          return {
            ...current,
            pickupPreference: "pickup",
            endDate: addDaysIso(nextStartDate, Math.max(0, nextSettings.defaultRentalDays - 1)),
          }
        })

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
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      if (!selectedSaw?.id) {
        throw new Error("No saw is available for the selected rental request.")
      }

      const { request } = await api.createRequest({ ...form, sawId: selectedSaw.id, pickupPreference: "pickup" })
      setSubmittedRequest(request)
      setForm((current) => ({
        ...current,
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

  async function startCardCheckout() {
    if (!submittedRequest) return

    setCheckoutBusy(true)
    setError("")

    try {
      const checkoutPayload = await api.createCheckoutSession({
        requestId: submittedRequest.id,
        origin: getPublicAppOrigin(),
      })

      const sessionUrl = toSafeString(
        checkoutPayload?.sessionUrl || checkoutPayload?.url || checkoutPayload?.checkoutUrl,
      )

      if (!sessionUrl || typeof sessionUrl !== "string") {
        throw new Error("Stripe Checkout session URL was not returned.")
      }

      window.location.assign(sessionUrl)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCheckoutBusy(false)
    }
  }

  async function startCryptoPayment(currency) {
    if (!submittedRequest) return null

    setCryptoBusy(true)
    setError("")

    try {
      const response = await api.createCryptoPayment(submittedRequest.id, { currency })
      const request = response?.request || null
      setSubmittedRequest(request)
      setCheckoutNotice("Crypto deposit instructions are ready. Send the exact amount before the timer expires.")
      window.history.replaceState({}, "", `/?requestId=${encodeURIComponent(submittedRequest.id)}&payment=crypto`)
      return request
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setCryptoBusy(false)
    }
  }

  async function refreshSubmittedRequest() {
    if (!submittedRequest?.id) return null

    try {
      const response = await api.getRequest(submittedRequest.id)
      const request = response?.request || null
      setSubmittedRequest(request)
      return request
    } catch (requestError) {
      setError(requestError.message)
      return null
    }
  }

  async function submitCryptoTxid(payload) {
    if (!submittedRequest?.id) return null

    setError("")

    try {
      const response = await api.submitCryptoTxid(submittedRequest.id, payload)
      const request = response?.request || null
      setSubmittedRequest(request)
      setCheckoutNotice("Transaction ID submitted. The rental desk will verify the crypto deposit before approval.")
      return request
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading available saw inventory...</div>
  }

  return (
    <PublicWorkspace
      saws={saws}
      availableSaws={availableSaws}
      selectedSaw={selectedSaw}
      paymentsEnabled={paymentsEnabled}
      cryptoPaymentsEnabled={cryptoPaymentsEnabled}
      settings={settings}
      form={form}
      updateForm={updateForm}
      handleSubmit={handleSubmit}
      submitting={submitting}
      submittedRequest={submittedRequest}
      checkoutBusy={checkoutBusy}
      cryptoBusy={cryptoBusy}
      startCardCheckout={startCardCheckout}
      startCryptoPayment={startCryptoPayment}
      submitCryptoTxid={submitCryptoTxid}
      refreshSubmittedRequest={refreshSubmittedRequest}
      checkoutNotice={checkoutNotice}
      error={error}
      resetSubmittedRequest={() => {
        setSubmittedRequest(null)
        setCheckoutNotice("")
        window.history.replaceState({}, "", "/")
      }}
    />
  )
}

function AdminApp() {
  const [authLoading, setAuthLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [dashboard, setDashboard] = useState(() => normalizeDashboard({}))
  const [dataLoading, setDataLoading] = useState(false)
  const [paymentsEnabled, setPaymentsEnabled] = useState(false)
  const [cryptoPaymentsEnabled, setCryptoPaymentsEnabled] = useState(true)

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
      const [snapshot, inventoryPayload] = await Promise.all([
        api.adminDashboard(),
        api.getPublicInventory(),
      ])
      setDashboard(normalizeDashboard(snapshot))
      setPaymentsEnabled(Boolean(inventoryPayload?.paymentsEnabled))
      setCryptoPaymentsEnabled(inventoryPayload?.cryptoPaymentsEnabled !== false)
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

  async function updateCryptoPayment(requestId, payload) {
    setError("")
    try {
      await api.updateCryptoPayment(requestId, payload)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function runCryptoMonitor() {
    setError("")
    try {
      await api.runCryptoMonitor()
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function markCryptoAlertReviewed(requestId, reviewKey) {
    setError("")
    try {
      const response = await api.markCryptoAlertReviewed(requestId, reviewKey)
      if (response?.dashboard) {
        setDashboard(normalizeDashboard(response.dashboard))
      } else {
        await loadDashboard()
      }
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

  async function createMaintenanceRecord(payload) {
    setError("")
    try {
      const response = await api.createMaintenanceRecord(payload)
      await loadDashboard()
      return response
    } catch (requestError) {
      setError(requestError.message)
      return null
    }
  }

  async function updateMaintenanceRecord(recordId, payload) {
    setError("")
    try {
      const response = await api.updateMaintenanceRecord(recordId, payload)
      await loadDashboard()
      return response
    } catch (requestError) {
      setError(requestError.message)
      return null
    }
  }

  async function updateSettings(payload) {
    setError("")
    try {
      const response = await api.updateSettings(payload)
      await loadDashboard()
      return response
    } catch (requestError) {
      setError(requestError.message)
      return null
    }
  }

  if (authLoading) {
    return <div className="loading-screen">Validating admin session...</div>
  }

  if (!authenticated) {
    return (
      <div className="auth-screen">
        <div className="auth-window">
          <div className="auth-window__header">
            <p className="section-eyebrow">Owner access</p>
            <h1>Rental Operations Console</h1>
            <p>Authenticate to enter the Saw Rent OS admin workspace.</p>
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          <form onSubmit={login} className="ops-form">
            <label>
              <span>Admin password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <div className="window-actions">
              <button className="button button-primary" type="submit">Sign in</button>
              <a className="button button-secondary" href="/">Return to renter desk</a>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <AdminWorkspace
      dashboard={dashboard}
      dataLoading={dataLoading}
      error={error}
      paymentsEnabled={paymentsEnabled}
      cryptoPaymentsEnabled={cryptoPaymentsEnabled}
      loadDashboard={loadDashboard}
      logout={logout}
      updateRequestStatus={updateRequestStatus}
      updateCryptoPayment={updateCryptoPayment}
      runCryptoMonitor={runCryptoMonitor}
      markCryptoAlertReviewed={markCryptoAlertReviewed}
      convertRequest={convertRequest}
      updateBookingStatus={updateBookingStatus}
      updateSawStatus={updateSawStatus}
      createMaintenanceRecord={createMaintenanceRecord}
      updateMaintenanceRecord={updateMaintenanceRecord}
      updateSettings={updateSettings}
    />
  )
}

export default App
