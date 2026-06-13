import { useEffect, useState } from "react"
import QRCode from "qrcode"

import { SawRentShell, WindowSurface } from "../../components/os/SawRentShell"
import { useWindowManager } from "../../components/os/useWindowManager"
import {
  formatDateRange,
  formatDateTime,
  formatMoney,
  getStatusTone,
  normalizeStatusLabel,
} from "../../lib/presentation"
import {
  SAW_RENT_CONTACT,
  submitContactEmail,
  validateContactDraft,
} from "../../lib/contactSubmission"
import {
  DONATION_METHODS,
  fetchDonationConfig,
  normalizeDonationConfig,
} from "../../lib/donationConfig"

const PUBLIC_MODULES = [
  { key: "dispatch", label: "Chainsaws", icon: "SAWS", size: "wide", description: "Saw photos and rental prices" },
  { key: "reservation", label: "Chainsaw Rentals", icon: "RENT", size: "tall", description: "Request rental dates and complete the deposit flow" },
  { key: "crypto", label: "Crypto Payment", icon: "CP", size: "standard", description: "BTC and XMR rental deposit instructions" },
  { key: "briefing", label: "Pickup Notes", icon: "NOTES", size: "standard", description: "Process, pricing, and pickup instructions", side: "right" },
  { key: "about", label: "ABOUT US", icon: "SFC", size: "wide", description: "Saw Rent and SoFlipCo business details" },
  { key: "email", label: "EMAIL", icon: "MAIL", size: "wide", description: "Compose a message to Saw Rent", side: "right" },
]

const DEFAULT_PUBLIC_WINDOWS = []
const LOCATION_LABEL = "LaPorte County / Northwest Indiana"
const ABOUT_US_COPY = "Saw Rent is a chainsaw rental platform created by SoFlipCo for LaPorte County and Northwest Indiana. As a small local business, we offer chainsaw rentals at competitive prices with flexible payment options. We accept cash, card, and crypto, along with many other payment methods including PayPal, Chime, Venmo, Zelle, Cash App, Apple Pay, and Google Pay."
const ABOUT_PAYMENT_METHODS = ["Cash", "Card", "Crypto", "PayPal", "Chime", "Venmo", "Zelle", "Cash App", "Apple Pay", "Google Pay"]
const SAW_IMAGE_FALLBACKS = {
  "saw-husqvarna-51": "/saws/placeholders/husqvarna-51.jpg",
  "saw-husqvarna-350": "/saws/placeholders/husqvarna-350.jpg",
  "saw-promac-610": "/saws/placeholders/mcculloch-pro-mac-610.jpg",
  "saw-husqvarna-23-compact": "/saws/placeholders/husqvarna-23-compact.jpg",
  "saw-husqvarna-141": "/saws/placeholders/husqvarna-141.jpg",
}

function getSawImageUrl(saw) {
  return saw?.imageUrl || SAW_IMAGE_FALLBACKS[saw?.id] || "/saws/placeholders/husqvarna-51.jpg"
}

function ContactActionLinks({ variant = "default" }) {
  return (
    <div className={`contact-action-row contact-action-row--${variant}`}>
      <a className="contact-action contact-action--call" href={SAW_RENT_CONTACT.telHref}>
        <span className="contact-action__icon" aria-hidden="true">CALL</span>
        <span>
          <strong>Call {SAW_RENT_CONTACT.displayPhone}</strong>
          <small>Fast pickup questions and rental timing</small>
        </span>
      </a>
      <a className="contact-action contact-action--text" href={SAW_RENT_CONTACT.smsHref}>
        <span className="contact-action__icon" aria-hidden="true">TEXT</span>
        <span>
          <strong>Text {SAW_RENT_CONTACT.displayPhone}</strong>
          <small>Send dates, saw questions, or quick job notes</small>
        </span>
      </a>
    </div>
  )
}

function formatCryptoCountdown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

function isActiveCryptoStatus(status) {
  return ["awaiting_crypto_payment", "awaiting_txid_submission"].includes(status)
}

function getCryptoRateUsd(request) {
  const rate = Number(request?.cryptoRateUsd || request?.cryptoAmountFiatSnapshot?.rateUsd || 0)
  return Number.isFinite(rate) && rate > 0 ? rate : 0
}

function getCryptoRateSource(request) {
  return request?.cryptoRateSource || request?.cryptoAmountFiatSnapshot?.rateSource || "unknown"
}

function getCryptoQuoteTime(request) {
  return request?.cryptoRateQuotedAt || request?.cryptoAmountFiatSnapshot?.quotedAt || null
}

function SawCatalog({ saws }) {
  return (
    <div className="saw-showcase">
      <div className="saw-showcase__heading">
        <div>
          <p className="section-eyebrow">SAWS</p>
          <h3>Chainsaw catalog</h3>
        </div>
        <p>To reserve a saw, use the RENT app.</p>
      </div>

      <div className="saw-catalog" aria-label="Available chainsaws">
        {saws.map((saw) => (
          <article key={saw.id} className="saw-catalog-card">
            <div className="saw-catalog-card__image">
              <img src={getSawImageUrl(saw)} alt={`${saw.brand} ${saw.model}`} loading="lazy" />
            </div>
            <div className="saw-catalog-card__body">
              <div>
                <span className="saw-catalog-card__brand">{saw.brand}</span>
                <h4>{saw.model}</h4>
              </div>
              <div className="saw-catalog-card__specs">
                <span>{saw.barSize}</span>
                <span>{saw.type}</span>
              </div>
              <div className="saw-catalog-card__pricing">
                <strong>{formatMoney(saw.dailyPrice)} / day</strong>
                <span>{formatMoney(saw.deposit)} deposit</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      {saws.length === 0 ? (
        <div className="empty-panel">No chainsaws are listed right now.</div>
      ) : null}
    </div>
  )
}
function ReservationDesk({
  availableSaws,
  form,
  updateForm,
  handleSubmit,
  submitting,
  selectedSaw,
  submittedRequest,
  paymentsEnabled,
  cryptoPaymentsEnabled,
  checkoutBusy,
  cryptoBusy,
  startCardCheckout,
  startCryptoPayment,
  checkoutNotice,
  error,
  resetSubmittedRequest,
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [cryptoCurrency, setCryptoCurrency] = useState("BTC")

  return (
    <div className="window-stack">
      {checkoutNotice || error ? (
        <div className="message-stack" aria-live="polite">
          {checkoutNotice ? <div className="notice-banner">{checkoutNotice}</div> : null}
          {error ? <div className="error-banner">{error}</div> : null}
        </div>
      ) : null}

      {!submittedRequest ? (
        <form className="ops-form" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">New request</p>
              <h3>Reserve a pickup window</h3>
            </div>
            {selectedSaw ? (
              <div className="selection-chip">
                <span>{selectedSaw.name}</span>
                <strong>{formatMoney(selectedSaw.dailyRateCents)} / day</strong>
              </div>
            ) : null}
          </div>

          <div className="form-grid">
            <label>
              <span>Full name</span>
              <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} autoComplete="name" required />
            </label>
            <label>
              <span>Phone</span>
              <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} autoComplete="tel" required />
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
            <label>
              <span>Pickup preference</span>
              <select value="pickup" onChange={(event) => updateForm("pickupPreference", event.target.value)} required>
                <option value="pickup">Pickup</option>
              </select>
            </label>
            <label>
              <span>Start date</span>
              <input type="date" value={form.startDate} min={today} onChange={(event) => updateForm("startDate", event.target.value)} required />
            </label>
            <label>
              <span>End date</span>
              <input type="date" value={form.endDate} min={form.startDate} onChange={(event) => updateForm("endDate", event.target.value)} required />
            </label>
          </div>

          <label>
            <span>Job notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              rows={4}
            />
          </label>

          <div className="window-actions">
            <button className="button button-primary" type="submit" disabled={submitting || availableSaws.length === 0}>
              {submitting ? "Submitting request..." : "Submit rental request"}
            </button>
            <span className="helper-copy">Requests are reviewed by the rental desk before pickup is confirmed.</span>
          </div>
        </form>
      ) : (
        <div className="panel-stack">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Queue confirmed</p>
              <h3>Finalize your reservation</h3>
            </div>
            <span className={`status-pill tone-${getStatusTone(submittedRequest.paymentStatus)}`}>
              {normalizeStatusLabel(submittedRequest.paymentStatus)}
            </span>
          </div>

          <div className="summary-grid">
            <div className="summary-card">
              <span>Request ID</span>
              <strong>{submittedRequest.id}</strong>
            </div>
            <div className="summary-card">
              <span>Requested saw</span>
              <strong>{submittedRequest.sawName}</strong>
            </div>
            <div className="summary-card">
              <span>Dates</span>
              <strong>{formatDateRange(submittedRequest.startDate, submittedRequest.endDate)}</strong>
            </div>
            <div className="summary-card">
              <span>Deposit due</span>
              <strong>{formatMoney(submittedRequest.depositCents)}</strong>
            </div>
          </div>

          <div className="detail-list">
            <div>
              <dt>Rental total</dt>
              <dd>{formatMoney(submittedRequest.rentalTotalCents)}</dd>
            </div>
            <div>
              <dt>Pickup mode</dt>
              <dd>{normalizeStatusLabel(submittedRequest.pickupPreference)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(submittedRequest.createdAt)}</dd>
            </div>
          </div>

          <div className="window-actions">
            {paymentsEnabled ? (
              <button className="button button-primary" type="button" onClick={startCardCheckout} disabled={checkoutBusy}>
                {checkoutBusy ? "Opening checkout..." : "Pay by Card"}
              </button>
            ) : (
              <div className="notice-banner">Card checkout is offline. The rental desk can collect the deposit manually.</div>
            )}
            {cryptoPaymentsEnabled ? (
              <div className="crypto-choice-row">
                <label>
                  <span>Crypto deposit</span>
                  <select value={cryptoCurrency} onChange={(event) => setCryptoCurrency(event.target.value)}>
                    <option value="BTC">BTC</option>
                    <option value="XMR">XMR</option>
                  </select>
                </label>
                <button className="button button-secondary" type="button" onClick={() => startCryptoPayment(cryptoCurrency)} disabled={cryptoBusy}>
                  {cryptoBusy ? "Preparing instructions..." : "Pay with Crypto"}
                </button>
              </div>
            ) : null}
            <button className="button button-secondary" type="button" onClick={resetSubmittedRequest}>
              Start another request
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CryptoPaymentWindow({ request, cryptoBusy, startCryptoPayment, submitCryptoTxid, refreshSubmittedRequest }) {
  const [now, setNow] = useState(() => Date.now())
  const [qrImage, setQrImage] = useState("")
  const [copyNotice, setCopyNotice] = useState("")
  const [sentPayment, setSentPayment] = useState(false)
  const [txid, setTxid] = useState(request?.customerSubmittedTxid || request?.blockchainTxid || "")
  const [txidNote, setTxidNote] = useState(request?.customerTxidNote || "")
  const [txidBusy, setTxidBusy] = useState(false)
  const [txidError, setTxidError] = useState("")

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let alive = true
    if (!request?.cryptoQrData) {
      return () => {
        alive = false
      }
    }

    QRCode.toDataURL(request.cryptoQrData, {
      margin: 1,
      scale: 7,
      color: {
        dark: "#111315",
        light: "#f3f5f7",
      },
    }).then((image) => {
      if (alive) setQrImage(image)
    }).catch(() => {
      if (alive) setQrImage("")
    })

    return () => {
      alive = false
    }
  }, [request?.cryptoQrData])

  if (!request?.cryptoAddress) {
    return (
      <div className="window-stack">
        <div className="empty-panel">Create a rental request, then choose Pay with Crypto to generate BTC or XMR deposit instructions.</div>
      </div>
    )
  }

  const expiresAtMs = request.paymentExpiresAt ? new Date(request.paymentExpiresAt).getTime() : 0
  const secondsRemaining = expiresAtMs ? Math.max(0, Math.ceil((expiresAtMs - now) / 1000)) : 0
  const status = secondsRemaining === 0 && isActiveCryptoStatus(request.paymentStatus)
    ? "expired"
    : request.paymentStatus
  const instructionsActive = ["awaiting_crypto_payment", "awaiting_txid_submission"].includes(status)
  const displayedQrImage = request.cryptoQrData && instructionsActive ? qrImage : ""
  const canRegenerate = ["expired", "cancelled"].includes(status)
  const canRefresh = status !== "paid"
  const submittedTxid = request.customerSubmittedTxid || request.blockchainTxid || ""
  const canStartTxidSubmission = instructionsActive && !submittedTxid
  const canSubmitTxid = canStartTxidSubmission && sentPayment
  const rateUsd = getCryptoRateUsd(request)
  const rateSource = getCryptoRateSource(request)
  const quotedAt = getCryptoQuoteTime(request)
  const depositUsdAmount = Number.isFinite(Number(request.depositUsdAmount))
    ? Number(request.depositUsdAmount)
    : Number(request.depositCents || 0) / 100
  const refundableUsdAmount = Number.isFinite(Number(request.refundableUsdAmount))
    ? Number(request.refundableUsdAmount)
    : depositUsdAmount

  async function copyText(value, label) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopyNotice(`${label} copied`)
    } catch {
      setCopyNotice("Copy failed")
    }
  }

  async function handleTxidSubmit(event) {
    event.preventDefault()
    if (!canSubmitTxid || typeof submitCryptoTxid !== "function") return
    if (!/^[a-fA-F0-9]{64}$/.test(String(txid || "").trim())) {
      setTxidError(`${request.cryptoCurrency} transaction hash must be 64 hexadecimal characters.`)
      return
    }

    setTxidBusy(true)
    setTxidError("")
    try {
      const updated = await submitCryptoTxid({ txid, note: txidNote })
      if (updated) {
        setSentPayment(false)
        setCopyNotice("Transaction ID submitted for rental desk review")
      }
    } catch (error) {
      setTxidError(error.message || "Transaction ID could not be submitted.")
    } finally {
      setTxidBusy(false)
    }
  }

  return (
    <div className="window-stack">
      <div className="section-heading">
        <div>
          <p className="section-eyebrow">Crypto deposit</p>
          <h3>{request.cryptoCurrency} rental deposit</h3>
          <p className="section-detail">Request {request.id}. Your deposit is priced and refunded in USD; crypto is only how this deposit is sent.</p>
        </div>
        <span className={`status-pill tone-${getStatusTone(status)}`}>{normalizeStatusLabel(status)}</span>
      </div>

      {status === "paid" ? (
        <div className="notice-banner">Payment confirmed. The rental desk can continue the normal approval workflow.</div>
      ) : null}
      {status === "crypto_payment_detected" ? (
        <div className="notice-banner">Payment detected. The rental desk is checking the transaction before confirmation.</div>
      ) : null}
      {status === "awaiting_txid_review" ? (
        <div className="notice-banner">Transaction ID submitted. The rental desk will verify the on-chain payment before approval.</div>
      ) : null}
      {status === "underpaid" ? (
        <div className="error-banner">The rental desk marked this crypto payment underpaid. Contact the desk before sending anything else.</div>
      ) : null}
      {status === "expired" ? (
        <div className="error-banner">These payment instructions have expired. Do not send funds to this stale quote.</div>
      ) : null}
      {status === "cancelled" ? (
        <div className="error-banner">This crypto payment was cancelled. Regenerate payment instructions to continue.</div>
      ) : null}
      {copyNotice ? <div className="notice-banner">{copyNotice}</div> : null}

      <div className="crypto-policy-note">
        <strong>USD deposit basis</strong>
        <span>
          Send the exact {request.cryptoCurrency} amount before the timer expires. Deposits, credits, and refunds are
          based on the stored USD deposit value, not the original {request.cryptoCurrency} quantity.
        </span>
      </div>

      <div className="crypto-payment-layout">
        <div className="crypto-qr-panel">
          {displayedQrImage ? (
            <img src={displayedQrImage} alt={`${request.cryptoCurrency} payment QR code`} />
          ) : (
            <div className="empty-panel">
              {status === "paid"
                ? "Payment confirmed."
                : status === "awaiting_txid_review"
                  ? "TXID submitted for review."
                  : instructionsActive
                    ? "QR code unavailable."
                    : "Payment instructions disabled."}
            </div>
          )}
          <span className={`sr-badge tone-${getStatusTone(status)}`}>
            {status === "paid"
              ? "Confirmed"
              : status === "awaiting_txid_review"
                ? "Review pending"
                : status === "underpaid"
                  ? "Underpaid"
                  : instructionsActive
                    ? `${formatCryptoCountdown(secondsRemaining)} remaining`
                    : "Disabled"}
          </span>
        </div>

        <div className="panel-stack">
          <div className="summary-grid">
            <div className="summary-card">
              <span>USD deposit due</span>
              <strong>{formatMoney(depositUsdAmount * 100)}</strong>
            </div>
            <div className="summary-card">
              <span>Exact crypto amount</span>
              <strong>{request.cryptoAmount} {request.cryptoCurrency}</strong>
            </div>
            <div className="summary-card">
              <span>Rate snapshot</span>
              <strong>
                {rateUsd
                  ? `${formatMoney(rateUsd * 100)} / ${request.cryptoCurrency}`
                  : "Not recorded"}
              </strong>
              <small>{rateSource}</small>
            </div>
            <div className="summary-card">
              <span>Quote expires</span>
              <strong>{formatDateTime(request.paymentExpiresAt)}</strong>
            </div>
            <div className="summary-card">
              <span>Quote timestamp</span>
              <strong>{formatDateTime(quotedAt)}</strong>
            </div>
            <div className="summary-card">
              <span>Refundable USD basis</span>
              <strong>{formatMoney(refundableUsdAmount * 100)}</strong>
            </div>
          </div>

          <div className="crypto-address-block">
            <span>{instructionsActive ? "Saw Rent wallet address" : "Payment address disabled"}</span>
            <code>{request.cryptoAddress}</code>
          </div>

          {submittedTxid ? (
            <div className="crypto-address-block">
              <span>Submitted transaction ID</span>
              <code>{submittedTxid}</code>
            </div>
          ) : null}

          {request.customerTxidNote ? (
            <div className="crypto-address-block">
              <span>Customer note</span>
              <code>{request.customerTxidNote}</code>
            </div>
          ) : null}

          {canStartTxidSubmission ? (
            <div className="crypto-txid-panel">
              {!sentPayment ? (
                <>
                  <strong>After you send payment</strong>
                  <p>Submit the transaction hash so the rental desk can verify the deposit.</p>
                  <button type="button" className="button button-primary" onClick={() => setSentPayment(true)}>
                    I sent payment
                  </button>
                </>
              ) : (
                <form className="ops-form crypto-txid-form" onSubmit={handleTxidSubmit}>
                  <label>
                    <span>{request.cryptoCurrency} transaction ID / hash</span>
                    <input
                      value={txid}
                      onChange={(event) => {
                        setTxid(event.target.value)
                        setTxidError("")
                      }}
                      placeholder="64-character transaction hash"
                      required
                    />
                  </label>
                  <label>
                    <span>Optional note</span>
                    <textarea
                      value={txidNote}
                      onChange={(event) => setTxidNote(event.target.value)}
                      rows={3}
                      placeholder="Amount sent, wallet note, or timing detail"
                    />
                  </label>
                  {txidError ? <div className="error-banner">{txidError}</div> : null}
                  <div className="window-actions">
                    <button type="submit" className="button button-primary" disabled={!canSubmitTxid || txidBusy}>
                      {txidBusy ? "Submitting transaction ID..." : "Submit transaction ID"}
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => setSentPayment(false)} disabled={txidBusy}>
                      Back to instructions
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}

          <div className="window-actions">
            <button type="button" className="button button-secondary" onClick={() => copyText(request.cryptoAddress, "Address")} disabled={!instructionsActive}>
              Copy address
            </button>
            <button type="button" className="button button-secondary" onClick={() => copyText(request.cryptoQrData, "Payment URI")} disabled={!instructionsActive}>
              Copy QR payment link
            </button>
            {canRefresh ? (
              <button type="button" className="button button-secondary" onClick={refreshSubmittedRequest}>
                Refresh status
              </button>
            ) : null}
            {canRegenerate ? (
              <button type="button" className="button button-primary" onClick={() => startCryptoPayment(request.cryptoCurrency)} disabled={cryptoBusy}>
                {cryptoBusy ? "Refreshing quote..." : "Refresh Quote"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function PickupBriefing({ paymentsEnabled, selectedSaw, availableSaws, submittedRequest, settings }) {
  return (
    <div className="window-stack">
      <div className="briefing-grid">
        <article className="briefing-card">
          <p className="section-eyebrow">Process</p>
          <h3>Counter workflow</h3>
          <ol className="step-list">
            <li>Choose a ready chainsaw from the Chainsaws window.</li>
            <li>Submit one request with your preferred dates and pickup timing.</li>
            <li>{paymentsEnabled ? "Pay the deposit online to hold queue priority." : "The rental desk will arrange deposit collection after approval."}</li>
          </ol>
        </article>

        <article className="briefing-card">
          <p className="section-eyebrow">Selected unit</p>
          <h3>{selectedSaw?.name || "Awaiting selection"}</h3>
          <p>{selectedSaw?.notes || "Choose an available chainsaw to review pricing and operating notes."}</p>
          <div className="detail-list">
            <div>
              <dt>Daily rate</dt>
              <dd>{selectedSaw ? formatMoney(selectedSaw.dailyRateCents) : "N/A"}</dd>
            </div>
            <div>
              <dt>Deposit</dt>
              <dd>{selectedSaw ? formatMoney(selectedSaw.depositCents) : "N/A"}</dd>
            </div>
            <div>
              <dt>Ready count</dt>
              <dd>{availableSaws.length}</dd>
            </div>
          </div>
        </article>
      </div>

      <article className="briefing-card">
        <p className="section-eyebrow">Queue note</p>
        <h3>{submittedRequest ? "Current reservation" : "No active reservation yet"}</h3>
        <p>
          {submittedRequest
            ? `Request ${submittedRequest.id} is queued for ${submittedRequest.sawName} from ${formatDateRange(submittedRequest.startDate, submittedRequest.endDate)}.`
            : "Submit a reservation from the desk to generate a queue reference and deposit instructions."}
        </p>
        <div className="detail-list">
          <div>
            <dt>Contact phone</dt>
            <dd>{settings.contactPhone || "Not set"}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{settings.location || LOCATION_LABEL}</dd>
          </div>
        </div>
      </article>
    </div>
  )
}

function AboutUsWindow() {
  return (
    <div className="about-app">
      <section className="about-hero">
        <div className="about-hero__copy">
          <p className="section-eyebrow">Built by SoFlipCo</p>
          <h3>Saw Rent</h3>
          <p>{ABOUT_US_COPY}</p>
        </div>
        <div className="about-sfc-badge" aria-hidden="true">
          <span>SFC</span>
        </div>
      </section>

      <section className="about-highlight-grid" aria-label="Saw Rent highlights">
        <article className="about-highlight">
          <span>Local business</span>
          <strong>Small, direct, practical</strong>
          <p>Built for renters who need clear pricing, useful pickup details, and flexible checkout options.</p>
        </article>
        <article className="about-highlight">
          <span>Rental value</span>
          <strong>Competitive rates</strong>
          <p>Chainsaw access without buying equipment for a short job, seasonal cleanup, or one-off project.</p>
        </article>
        <article className="about-highlight">
          <span>Payment flexibility</span>
          <strong>Cash, card, crypto, and more</strong>
          <p>Checkout options stay broad so the rental desk can work with how customers already pay.</p>
        </article>
      </section>

      <section className="about-payments" aria-label="Accepted payment methods">
        <div className="section-heading">
          <div>
            <p className="section-eyebrow">Accepted payments</p>
            <h3>Flexible checkout options</h3>
          </div>
          <span className="sr-badge tone-info">{ABOUT_PAYMENT_METHODS.length} methods</span>
        </div>
        <div className="about-payment-chip-grid">
          {ABOUT_PAYMENT_METHODS.map((method, index) => (
            <span key={method} className="about-payment-chip" style={{ "--chip-index": index }}>
              {method}
            </span>
          ))}
        </div>
      </section>

      <section className="about-contact-panel" aria-label="Contact Saw Rent">
        <div className="section-heading">
          <div>
            <p className="section-eyebrow">Contact us</p>
            <h3>Talk with Saw Rent</h3>
            <p className="section-detail">Call or text the rental desk for saw availability, pickup timing, payment questions, or SoFlipCo support.</p>
          </div>
        </div>
        <ContactActionLinks />
      </section>
    </div>
  )
}

function buildCryptoDonationUri(currency, address) {
  if (!address) return ""
  if (currency === "BTC") return `bitcoin:${address}`
  if (currency === "XMR") return `monero:${address}`
  return address
}

function getDonationLink(donationConfig, method) {
  if (method.key === "paypal") return donationConfig.paypalUrl
  if (method.key === "cashapp") return donationConfig.cashAppUrl
  return method.url || ""
}

function DonationPanel({ onClose }) {
  const [donationConfig, setDonationConfig] = useState(() => normalizeDonationConfig())
  const [loadState, setLoadState] = useState("loading")
  const [copyNotice, setCopyNotice] = useState("")
  const [qrImages, setQrImages] = useState({})

  useEffect(() => {
    let alive = true

    fetchDonationConfig()
      .then((config) => {
        if (!alive) return
        setDonationConfig(config)
        setLoadState("ready")
      })
      .catch(() => {
        if (!alive) return
        setDonationConfig(normalizeDonationConfig())
        setLoadState("error")
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    const cryptoMethods = DONATION_METHODS.filter((method) => method.type === "crypto")

    Promise.all(
      cryptoMethods.map(async (method) => {
        const address = donationConfig.crypto[method.key]?.address || ""
        const qrData = buildCryptoDonationUri(method.key, address)
        if (!qrData) return [method.key, ""]

        try {
          const image = await QRCode.toDataURL(qrData, {
            margin: 1,
            scale: 5,
            color: {
              dark: "#111315",
              light: "#f3f5f7",
            },
          })
          return [method.key, image]
        } catch {
          return [method.key, ""]
        }
      }),
    ).then((entries) => {
      if (alive) {
        setQrImages(Object.fromEntries(entries))
      }
    })

    return () => {
      alive = false
    }
  }, [donationConfig])

  async function copyDonationAddress(currency) {
    const address = donationConfig.crypto[currency]?.address || ""
    if (!address) return

    try {
      await navigator.clipboard.writeText(address)
      setCopyNotice(`${currency} donation address copied`)
    } catch {
      setCopyNotice("Copy failed")
    }
  }

  return (
    <aside className="donation-popover" role="dialog" aria-label="Donation options">
      <section className="donation-popover__header">
        <div>
          <p className="section-eyebrow">Support Saw Rent</p>
          <h3>Donations</h3>
          <p>Pick a payment option and send support in a few taps.</p>
        </div>
        <button type="button" className="button button-secondary donation-popover__close" onClick={onClose} aria-label="Close donations">
          Close
        </button>
      </section>

      {loadState === "error" ? (
        <div className="notice-banner">Crypto donation addresses could not be loaded. PayPal and Cash App are still available.</div>
      ) : null}
      {copyNotice ? <div className="notice-banner">{copyNotice}</div> : null}

      <section className="donation-quick-links" aria-label="Donation payment links">
        {DONATION_METHODS.map((method) => {
          if (method.type === "link") {
            const href = getDonationLink(donationConfig, method)
            return (
              <a key={method.key} className="donation-pay-link" href={href} target="_blank" rel="noreferrer">
                <span>{method.label}</span>
                <strong>Open {method.label}</strong>
                <small>{href}</small>
              </a>
            )
          }

          return null
        })}
      </section>

      <section className="donation-method-grid" aria-label="Crypto donation methods">
        {DONATION_METHODS.filter((method) => method.type === "crypto").map((method) => {
          const address = donationConfig.crypto[method.key]?.address || ""
          const source = donationConfig.crypto[method.key]?.source || ""
          const donationUri = buildCryptoDonationUri(method.key, address)

          return (
            <article key={method.key} className="donation-method-card">
              <span>{method.label}</span>
              <strong>{address ? `${method.label} donation address` : "Address not configured"}</strong>
              {address ? (
                <a className="donation-wallet-link" href={donationUri}>
                  Open wallet link
                </a>
              ) : null}
              {qrImages[method.key] ? (
                <img className="donation-qr" src={qrImages[method.key]} alt={`${method.label} donation QR code`} />
              ) : null}
              <code>{address || "Address not configured yet."}</code>
              {source ? <small>{normalizeStatusLabel(source)}</small> : null}
              <button
                type="button"
                className="button button-secondary"
                onClick={() => copyDonationAddress(method.key)}
                disabled={!address}
              >
                Copy {method.label}
              </button>
            </article>
          )
        })}
      </section>
    </aside>
  )
}

function EmailWindow() {
  const [draft, setDraft] = useState({
    fromName: "",
    fromEmail: "",
    subject: "Chainsaw rental question",
    message: "",
  })
  const [errors, setErrors] = useState({})
  const [sendState, setSendState] = useState({
    status: "idle",
    message: "",
  })

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: "" }))
    if (sendState.status !== "idle") {
      setSendState({ status: "idle", message: "" })
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validation = validateContactDraft(draft)
    if (!validation.ok) {
      setErrors(validation.errors)
      setSendState({
        status: "error",
        message: "Check the highlighted fields before sending.",
      })
      return
    }

    setSendState({
      status: "sending",
      message: "Preparing message...",
    })
    const result = await submitContactEmail(draft)
    setErrors(result.errors || {})
    setSendState({
      status: result.ok ? "sent" : result.status,
      message: result.message,
    })
  }

  const messageLength = draft.message.trim().length

  return (
    <div className="email-app">
      <section className="email-composer">
        <header className="email-toolbar">
          <div>
            <p className="section-eyebrow">EMAIL</p>
            <h3>New message</h3>
          </div>
          <div className="email-toolbar__actions" aria-label="Mail actions">
            <span className="email-dot email-dot--amber" />
            <span className="email-dot email-dot--green" />
            <span className="email-dot" />
          </div>
        </header>

        <form className="email-compose-form" onSubmit={handleSubmit} noValidate>
          <div className="email-field-row">
            <span>To</span>
            <input value={`${SAW_RENT_CONTACT.emailToLabel} / ${SAW_RENT_CONTACT.displayPhone}`} readOnly aria-label="To" />
          </div>
          <div className={`email-field-row ${errors.fromName ? "has-error" : ""}`}>
            <span>Name</span>
            <input
              value={draft.fromName}
              onChange={(event) => updateDraft("fromName", event.target.value)}
              placeholder="Your name"
              autoComplete="name"
              aria-label="From name"
            />
          </div>
          {errors.fromName ? <p className="email-field-error">{errors.fromName}</p> : null}
          <div className={`email-field-row ${errors.fromEmail ? "has-error" : ""}`}>
            <span>From</span>
            <input
              type="email"
              value={draft.fromEmail}
              onChange={(event) => updateDraft("fromEmail", event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-label="From email"
            />
          </div>
          {errors.fromEmail ? <p className="email-field-error">{errors.fromEmail}</p> : null}
          <div className={`email-field-row ${errors.subject ? "has-error" : ""}`}>
            <span>Subject</span>
            <input
              value={draft.subject}
              onChange={(event) => updateDraft("subject", event.target.value)}
              placeholder="Chainsaw rental question"
              aria-label="Subject"
            />
          </div>
          {errors.subject ? <p className="email-field-error">{errors.subject}</p> : null}

          <label className={`email-body ${errors.message ? "has-error" : ""}`}>
            <span>Message</span>
            <textarea
              value={draft.message}
              onChange={(event) => updateDraft("message", event.target.value)}
              rows={10}
              placeholder="Tell us which saw you need, the date, pickup timing, and the best way to reach you."
              aria-label="Message body"
            />
          </label>
          {errors.message ? <p className="email-field-error">{errors.message}</p> : null}

          <div className="email-meta-row">
            <span>{messageLength} characters</span>
            <span>SoFlipCo / Saw Rent contact draft</span>
          </div>

          {sendState.message ? (
            <div className={sendState.status === "error" ? "error-banner" : "notice-banner"}>
              {sendState.message}
            </div>
          ) : null}

          <div className="email-send-row">
            <button className="button button-primary" type="submit" disabled={sendState.status === "sending"}>
              {sendState.status === "sending" ? "Sending..." : "Send message"}
            </button>
            <span className="helper-copy">Email transport is isolated for later backend wiring.</span>
          </div>
        </form>
      </section>

      <aside className="email-side-panel">
        <div className="email-side-card email-side-card--accent">
          <p className="section-eyebrow">Fastest contact</p>
          <h3>Call or text</h3>
          <p>For faster contact about availability, pickup time, or a same-day rental, use the direct line.</p>
          <ContactActionLinks variant="stacked" />
        </div>

        <div className="email-attachment-card" aria-label="Message metadata">
          <span className="email-attachment-card__clip" aria-hidden="true" />
          <div>
            <strong>Rental details to include</strong>
            <small>Saw model, date, pickup window, payment preference, and job notes.</small>
          </div>
        </div>
      </aside>
    </div>
  )
}

export function PublicWorkspace({
  saws,
  availableSaws,
  selectedSaw,
  paymentsEnabled,
  cryptoPaymentsEnabled,
  settings,
  form,
  updateForm,
  handleSubmit,
  submitting,
  submittedRequest,
  checkoutBusy,
  cryptoBusy,
  startCardCheckout,
  startCryptoPayment,
  submitCryptoTxid,
  refreshSubmittedRequest,
  checkoutNotice,
  error,
  resetSubmittedRequest,
}) {
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [launcherQuery, setLauncherQuery] = useState("")
  const [donationsOpen, setDonationsOpen] = useState(false)
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
    definitions: PUBLIC_MODULES,
    defaultOpenKeys: DEFAULT_PUBLIC_WINDOWS,
    defaultActiveKey: "",
    restoreFromUrl: true,
    syncUrl: true,
    urlParamName: "module",
  })

  function closeLauncher() {
    setLauncherOpen(false)
    setLauncherQuery("")
  }

  function toggleLauncher() {
    setLauncherOpen((current) => !current)
    setDonationsOpen(false)
  }

  function runWorkspaceAction(action) {
    action()
    closeLauncher()
  }

  async function handleStartCryptoPayment(currency) {
    const request = await startCryptoPayment(currency)
    if (request?.cryptoAddress) {
      focusWindow("crypto")
    }
  }

  const launcherQueryValue = launcherQuery.trim().toLowerCase()
  const launcherItems = [
    {
      key: "dispatch",
      icon: "SAWS",
      label: "Chainsaws",
      description: "Saw photos and rental prices",
      group: "Apps",
      onSelect: () => {
        focusWindow("dispatch")
        closeLauncher()
      },
    },
    {
      key: "reservation",
      icon: "RENT",
      label: "Chainsaw Rentals",
      description: "Create a rental request and pay the deposit",
      group: "Apps",
      onSelect: () => {
        focusWindow("reservation")
        closeLauncher()
      },
    },
    {
      key: "crypto",
      icon: "CP",
      label: "Crypto Payment",
      description: "BTC and XMR rental deposit instructions",
      group: "Apps",
      onSelect: () => {
        focusWindow("crypto")
        closeLauncher()
      },
    },
    {
      key: "briefing",
      icon: "NOTES",
      label: "Pickup Notes",
      description: "Rates, process, and contact guidance",
      group: "Apps",
      onSelect: () => {
        focusWindow("briefing")
        closeLauncher()
      },
    },
    {
      key: "about",
      icon: "SFC",
      label: "ABOUT US",
      description: "Saw Rent and SoFlipCo business details",
      group: "Apps",
      onSelect: () => {
        focusWindow("about")
        closeLauncher()
      },
    },
    {
      key: "email",
      icon: "MAIL",
      label: "EMAIL",
      description: "Compose a message to Saw Rent",
      group: "Apps",
      onSelect: () => {
        focusWindow("email")
        closeLauncher()
      },
    },
    {
      key: "admin-link",
      icon: "AD",
      label: "Admin Console",
      description: "Open the operations workspace",
      group: "Actions",
      onSelect: () => {
        window.location.assign("/admin")
      },
    },
    {
      key: "restore-workspace",
      icon: "RW",
      label: "Restore Workspace",
      description: "Reopen the saved window layout on demand",
      group: "Workspace",
      onSelect: () => runWorkspaceAction(restoreWorkspace),
    },
    {
      key: "clear-workspace",
      icon: "CW",
      label: "Clear Workspace",
      description: "Close all app windows without changing data",
      group: "Workspace",
      onSelect: () => runWorkspaceAction(clearWorkspace),
    },
    {
      key: "tile-windows",
      icon: "TW",
      label: "Tile Windows",
      description: "Arrange visible windows into a practical grid",
      group: "Workspace",
      onSelect: () => runWorkspaceAction(tileVisibleWindows),
    },
    {
      key: "reset-window-positions",
      icon: "RP",
      label: "Reset Window Positions",
      description: "Move open windows back to safe default frames",
      group: "Workspace",
      onSelect: () => runWorkspaceAction(resetWindowPositions),
    },
  ].filter((item) => {
    if (!launcherQueryValue) return true
    return `${item.label} ${item.description}`.toLowerCase().includes(launcherQueryValue)
  })

  const launcherFeaturedItems = launcherItems.filter((item) => item.group === "Apps")
  const launcherRailItems = [
    {
      key: "reserve-rail",
      icon: "RENT",
      label: "Chainsaw Rentals",
      onSelect: () => {
        focusWindow("reservation")
        closeLauncher()
      },
    },
    {
      key: "fleet-rail",
      icon: "SAWS",
      label: "Chainsaws",
      onSelect: () => {
        focusWindow("dispatch")
        closeLauncher()
      },
    },
    {
      key: "notes-rail",
      icon: "NOTES",
      label: "Pickup Notes",
      onSelect: () => {
        focusWindow("briefing")
        closeLauncher()
      },
    },
    {
      key: "crypto-rail",
      icon: "CP",
      label: "Crypto Payment",
      onSelect: () => {
        focusWindow("crypto")
        closeLauncher()
      },
    },
    {
      key: "about-rail",
      icon: "SFC",
      label: "ABOUT US",
      onSelect: () => {
        focusWindow("about")
        closeLauncher()
      },
    },
    {
      key: "email-rail",
      icon: "MAIL",
      label: "EMAIL",
      onSelect: () => {
        focusWindow("email")
        closeLauncher()
      },
    },
    {
      key: "admin-rail",
      icon: "AD",
      label: "Admin Log in",
      onSelect: () => {
        window.location.assign("/admin")
      },
    },
  ]

  const desktopItems = [
    {
      key: "dispatch",
      icon: "SAWS",
      label: "Chainsaws",
      meta: `${availableSaws.length} available`,
      active: activeWindow === "dispatch",
      running: openWindows.includes("dispatch"),
      onSelect: () => focusWindow("dispatch"),
    },
    {
      key: "reservation",
      icon: "RENT",
      label: "Chainsaw Rentals",
      meta: submittedRequest ? "1 active request" : "Open intake",
      active: activeWindow === "reservation",
      running: openWindows.includes("reservation"),
      onSelect: () => focusWindow("reservation"),
    },
    {
      key: "briefing",
      icon: "NOTES",
      label: "Pickup Notes",
      meta: paymentsEnabled ? "Deposit live" : "Desk payments",
      active: activeWindow === "briefing",
      running: openWindows.includes("briefing"),
      onSelect: () => focusWindow("briefing"),
    },
    {
      key: "crypto",
      icon: "CP",
      label: "Crypto Payment",
      meta: submittedRequest?.paymentMethod === "crypto" ? normalizeStatusLabel(submittedRequest.paymentStatus) : "BTC / XMR",
      active: activeWindow === "crypto",
      running: openWindows.includes("crypto"),
      onSelect: () => focusWindow("crypto"),
    },
    {
      key: "about",
      icon: "SFC",
      label: "ABOUT US",
      meta: "SoFlipCo",
      active: activeWindow === "about",
      running: openWindows.includes("about"),
      onSelect: () => focusWindow("about"),
    },
    {
      key: "email",
      icon: "MAIL",
      label: "EMAIL",
      meta: "Contact form",
      active: activeWindow === "email",
      running: openWindows.includes("email"),
      side: "right",
      onSelect: () => focusWindow("email"),
    },
  ]

  const taskbarItems = windowOrder.map((key) => {
    const module = PUBLIC_MODULES.find((entry) => entry.key === key)
    return {
      key,
      icon: module?.icon || "SR",
      label: module?.label || key,
      appName: module?.label || key,
      active: activeWindow === key,
      minimized: minimizedWindows.includes(key),
      onSelect: () => toggleTaskbarWindow(key),
    }
  })

  return (
    <SawRentShell
      brand={settings.businessName || "SoFlipCo.com"}
      subtitle={settings.location || LOCATION_LABEL}
      shellLabel="Saw Rent"
      desktopItems={desktopItems}
      launcherItems={launcherItems}
      launcherFeaturedItems={launcherFeaturedItems}
      launcherRailItems={launcherRailItems}
      launcherOpen={launcherOpen}
      launcherQuery={launcherQuery}
      onLauncherQueryChange={setLauncherQuery}
      onToggleLauncher={toggleLauncher}
      taskbarItems={taskbarItems}
      taskbarActions={[
        {
          key: "donations",
          label: "Donations",
          tone: "donation",
          active: donationsOpen,
          onSelect: () => {
            setDonationsOpen((current) => !current)
            closeLauncher()
          },
        },
      ]}
      systemBadges={[
        { label: "Rent a chainsaw today!", tone: "success" },
        { label: "Crypto payment Optional", tone: "info" },
        { label: "SoFlipCo", tone: "neutral" },
      ]}
    >
      <div className="window-grid window-grid--public">
        {windowStates.map((windowState) => {
          if (windowState.key === "dispatch") {
            return (
              <WindowSurface
                key="dispatch"
                windowKey="dispatch"
                title="Chainsaws"
                subtitle="Visual saw catalog and pricing"
                icon="SAWS"
                size="wide"
                frame={windowState.frame}
                zIndex={windowState.zIndex}
                active={windowState.active}
                minimized={windowState.minimized}
                onFocus={() => focusWindow("dispatch")}
                onFrameChange={(nextFrame) => updateFrame("dispatch", nextFrame)}
                onMinimize={() => minimizeWindow("dispatch")}
                onToggleMaximize={() => toggleMaximizeWindow("dispatch")}
                onClose={() => closeWindow("dispatch")}
              >
                <SawCatalog saws={saws} />
              </WindowSurface>
            )
          }

          if (windowState.key === "reservation") {
            return (
              <WindowSurface
                key="reservation"
                windowKey="reservation"
                title="Chainsaw Rentals"
                subtitle="Submit a rental request and finalize the deposit"
                icon="RENT"
                size="tall"
                frame={windowState.frame}
                zIndex={windowState.zIndex}
                active={windowState.active}
                minimized={windowState.minimized}
                onFocus={() => focusWindow("reservation")}
                onFrameChange={(nextFrame) => updateFrame("reservation", nextFrame)}
                onMinimize={() => minimizeWindow("reservation")}
                onToggleMaximize={() => toggleMaximizeWindow("reservation")}
                onClose={() => closeWindow("reservation")}
              >
                <ReservationDesk
                  availableSaws={availableSaws}
                  form={form}
                  updateForm={updateForm}
                  handleSubmit={handleSubmit}
                  submitting={submitting}
                  selectedSaw={selectedSaw}
                  submittedRequest={submittedRequest}
                  paymentsEnabled={paymentsEnabled}
                  cryptoPaymentsEnabled={cryptoPaymentsEnabled}
                  checkoutBusy={checkoutBusy}
                  cryptoBusy={cryptoBusy}
                  startCardCheckout={startCardCheckout}
                  startCryptoPayment={handleStartCryptoPayment}
                  checkoutNotice={checkoutNotice}
                  error={error}
                  resetSubmittedRequest={resetSubmittedRequest}
                />
              </WindowSurface>
            )
          }

          if (windowState.key === "crypto") {
            return (
              <WindowSurface
                key="crypto"
                windowKey="crypto"
                title="Crypto Payment"
                subtitle="BTC and XMR rental deposit instructions"
                icon="CP"
                size="standard"
                frame={windowState.frame}
                zIndex={windowState.zIndex}
                active={windowState.active}
                minimized={windowState.minimized}
                onFocus={() => focusWindow("crypto")}
                onFrameChange={(nextFrame) => updateFrame("crypto", nextFrame)}
                onMinimize={() => minimizeWindow("crypto")}
                onToggleMaximize={() => toggleMaximizeWindow("crypto")}
                onClose={() => closeWindow("crypto")}
              >
                <CryptoPaymentWindow
                  key={`${submittedRequest?.cryptoPaymentId || "no-crypto"}:${submittedRequest?.customerSubmittedTxid || submittedRequest?.blockchainTxid || ""}`}
                  request={submittedRequest}
                  cryptoBusy={cryptoBusy}
                  startCryptoPayment={handleStartCryptoPayment}
                  submitCryptoTxid={submitCryptoTxid}
                  refreshSubmittedRequest={refreshSubmittedRequest}
                />
              </WindowSurface>
            )
          }

          if (windowState.key === "about") {
            return (
              <WindowSurface
                key="about"
                windowKey="about"
                title="ABOUT US"
                subtitle="Saw Rent and SoFlipCo"
                icon="SFC"
                size="wide"
                frame={windowState.frame}
                zIndex={windowState.zIndex}
                active={windowState.active}
                minimized={windowState.minimized}
                onFocus={() => focusWindow("about")}
                onFrameChange={(nextFrame) => updateFrame("about", nextFrame)}
                onMinimize={() => minimizeWindow("about")}
                onToggleMaximize={() => toggleMaximizeWindow("about")}
                onClose={() => closeWindow("about")}
              >
                <AboutUsWindow />
              </WindowSurface>
            )
          }

          if (windowState.key === "email") {
            return (
              <WindowSurface
                key="email"
                windowKey="email"
                title="EMAIL"
                subtitle="Compose a message to Saw Rent"
                icon="MAIL"
                size="wide"
                frame={windowState.frame}
                zIndex={windowState.zIndex}
                active={windowState.active}
                minimized={windowState.minimized}
                onFocus={() => focusWindow("email")}
                onFrameChange={(nextFrame) => updateFrame("email", nextFrame)}
                onMinimize={() => minimizeWindow("email")}
                onToggleMaximize={() => toggleMaximizeWindow("email")}
                onClose={() => closeWindow("email")}
              >
                <EmailWindow />
              </WindowSurface>
            )
          }

          return (
            <WindowSurface
              key="briefing"
              windowKey="briefing"
              title="Pickup Notes"
              subtitle="Rates, process, and current reservation context"
              icon="NOTES"
              size="standard"
              frame={windowState.frame}
              zIndex={windowState.zIndex}
              active={windowState.active}
              minimized={windowState.minimized}
              onFocus={() => focusWindow("briefing")}
              onFrameChange={(nextFrame) => updateFrame("briefing", nextFrame)}
              onMinimize={() => minimizeWindow("briefing")}
              onToggleMaximize={() => toggleMaximizeWindow("briefing")}
              onClose={() => closeWindow("briefing")}
            >
              <PickupBriefing
                paymentsEnabled={paymentsEnabled}
                selectedSaw={selectedSaw}
                availableSaws={availableSaws}
                submittedRequest={submittedRequest}
                settings={settings}
              />
            </WindowSurface>
          )
        })}
      </div>
      {donationsOpen ? <DonationPanel onClose={() => setDonationsOpen(false)} /> : null}
    </SawRentShell>
  )
}
