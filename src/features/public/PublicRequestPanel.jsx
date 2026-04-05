import React, { useMemo } from "react";
import { money } from "../../lib/pricing";
import { getStatusClass } from "../../lib/status";

const REQUEST_STEPS = [
  {
    title: "Choose a saw",
    detail: "Compare available models, day rate, deposit, and condition.",
  },
  {
    title: "Submit request",
    detail: "Share rental date and contact details so we can confirm availability.",
  },
  {
    title: "Get confirmation",
    detail: "Our team will call or text to confirm pickup details and payment.",
  },
];

export function PublicRequestPanel({
  availablePublicSaws,
  publicSearch,
  setPublicSearch,
  publicRequest,
  setPublicRequest,
  publicRequestConfirmation,
  clearPublicRequestConfirmation,
  submitPublicRequest,
}) {
  const selectedSaw = useMemo(
    () => availablePublicSaws.find((saw) => saw.id === publicRequest.sawId) || null,
    [availablePublicSaws, publicRequest.sawId]
  );

  const hasAvailableSaws = availablePublicSaws.length > 0;
  const hasConfirmation = Boolean(publicRequestConfirmation);

  function updateRequestField(field, value) {
    if (hasConfirmation) {
      clearPublicRequestConfirmation();
    }
    setPublicRequest((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="card section-pad public-panel">
      <div className="public-header">
        <div>
          <p className="section-eyebrow">Renter booking</p>
          <h2 className="public-title">Reserve a saw in minutes</h2>
          <p className="muted public-subtitle">
            Browse ready-to-rent saws, send a request, and get a quick confirmation from our team.
          </p>
        </div>
        <div className="request-steps" aria-label="How requests work">
          {REQUEST_STEPS.map((step, index) => (
            <div key={step.title} className="step-item">
              <span className="step-index">{index + 1}</span>
              <div>
                <div className="step-title">{step.title}</div>
                <div className="step-detail">{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="search-icon-wrap" style={{ marginTop: 20 }}>
        <span className="search-icon">🔎</span>
        <input
          className="input search-pad"
          value={publicSearch}
          onChange={(e) => setPublicSearch(e.target.value)}
          placeholder="Search by saw name, category, or bar size"
          aria-label="Search available saws"
        />
      </div>

      <div className="inventory-headline" style={{ marginTop: 16 }}>
        <strong>{availablePublicSaws.length}</strong>
        <span className="muted">saws currently available for request</span>
      </div>

      {hasAvailableSaws ? (
        <div className="saw-list" style={{ marginTop: 16 }}>
          {availablePublicSaws.map((saw) => (
            <div key={saw.id} className="saw-tile">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{saw.name}</div>
                  <div className="saw-meta">{saw.category} · {saw.barSize}</div>
                </div>
                <span className={getStatusClass(saw.status)}>{saw.status}</span>
              </div>
              <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="mini-panel">
                  <div className="muted" style={{ fontSize: 13 }}>Day rate</div>
                  <div style={{ fontWeight: 900, marginTop: 6 }}>{money(saw.rateDay)}</div>
                </div>
                <div className="mini-panel">
                  <div className="muted" style={{ fontSize: 13 }}>Refundable deposit</div>
                  <div style={{ fontWeight: 900, marginTop: 6 }}>{money(saw.deposit)}</div>
                </div>
              </div>
              <div className="muted" style={{ marginTop: 14, fontSize: 14 }}>Fuel: {saw.fuel}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Condition: {saw.condition}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="public-empty" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800 }}>No available saws match your search.</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Call the shop for same-day options or clear the search to view all available inventory.
          </div>
        </div>
      )}

      <form onSubmit={submitPublicRequest} className="mini-panel public-form" style={{ marginTop: 20 }}>
        <div className="form-title-row">
          <div>
            <h3 className="form-title">Request rental</h3>
            <p className="muted" style={{ margin: "4px 0 0" }}>No payment required now. We will confirm before pickup.</p>
          </div>
          {selectedSaw ? (
            <div className="selected-saw-summary">
              <div className="muted">Selected saw</div>
              <strong>{selectedSaw.name}</strong>
              <div className="muted">{money(selectedSaw.rateDay)} / day · {money(selectedSaw.deposit)} deposit</div>
            </div>
          ) : null}
        </div>

        {publicRequestConfirmation ? (
          <div className="public-success-card" style={{ marginTop: 14 }}>
            <div className="success-icon" aria-hidden="true">✓</div>
            <div>
              <div className="success-title">Request received</div>
              <div className="muted" style={{ marginTop: 4 }}>
                Reference <strong>{publicRequestConfirmation.requestRef}</strong> · {publicRequestConfirmation.sawName}
              </div>
              <ul className="success-list">
                <li>We will call or text {publicRequestConfirmation.contactPhone} to confirm availability.</li>
                <li>Requested start date: {publicRequestConfirmation.startDate} ({publicRequestConfirmation.duration}).</li>
                <li>Bring ID at pickup. Deposit is collected only after confirmation.</li>
              </ul>
            </div>
          </div>
        ) : null}

        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field"><label>Name</label><input className="input" value={publicRequest.name} onChange={(e) => updateRequestField("name", e.target.value)} required /></div>
          <div className="field"><label>Phone</label><input className="input" value={publicRequest.phone} onChange={(e) => updateRequestField("phone", e.target.value)} required /></div>
          <div className="field"><label>Saw</label><select className="select" value={publicRequest.sawId} onChange={(e) => updateRequestField("sawId", e.target.value)} disabled={!hasAvailableSaws}>{hasAvailableSaws ? availablePublicSaws.map((saw) => <option key={saw.id} value={saw.id}>{saw.name}</option>) : <option value="">No saws available</option>}</select></div>
          <div className="field"><label>Requested Date</label><input type="date" className="input" value={publicRequest.startDate} onChange={(e) => updateRequestField("startDate", e.target.value)} required /></div>
          <div className="field"><label>Duration</label><select className="select" value={publicRequest.duration} onChange={(e) => updateRequestField("duration", e.target.value)}><option value="2 hours">2 hours</option><option value="4 hours">4 hours</option><option value="1 day">1 day</option><option value="Weekend">Weekend</option><option value="1 week">1 week</option></select></div>
          <div className="field"><label>Notes</label><textarea className="textarea" value={publicRequest.notes} onChange={(e) => updateRequestField("notes", e.target.value)} placeholder="Cut type, project notes, or pickup timing preferences" /></div>
        </div>
        <div className="public-form-footer" style={{ marginTop: 16 }}>
          <span className="muted" style={{ fontSize: 14 }}>
            Prefer to book offline? Call, text, or visit the shop and we can reserve it for you.
          </span>
          <button type="submit" className="btn btn-primary" disabled={!hasAvailableSaws}>Submit Request</button>
        </div>
      </form>
    </div>
  );
}
