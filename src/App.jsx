import React from "react";
import { PublicRequestPanel } from "./features/public/PublicRequestPanel";
import { AdminShell } from "./features/admin/AdminShell";
import { getQuickPrice, money } from "./lib/pricing";
import { getStatusClass } from "./lib/status";
import { useSawRentState } from "./state/useSawRentState";

export default function SawRentApp() {
  const state = useSawRentState();

  if (!state.booted) {
    return <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>Loading...</div>;
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        <div className="hero-grid">
          <div className="card">
            <div className="hero-top">
              <div className="hero-badges">
                <span className="badge blue">{state.app.settings.businessName}</span>
                <span className="badge dark">Admin Dashboard</span>
              </div>
              <h1 style={{ margin: "16px 0 0", fontSize: 44, lineHeight: 1.05 }}>
                Run Saw Rent like a real rental desk.
              </h1>
              <p style={{ marginTop: 14, maxWidth: 840, color: "#cbd5e1", lineHeight: 1.6 }}>
                Upgraded to an AdminLTE-style layout with a dark ops sidebar,
                cleaner admin tables, stronger KPI blocks, tighter booking controls,
                and fixed business logic.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
                <button className="btn btn-primary" onClick={state.actions.openAdminLogin}>
                  Admin Login
                </button>
                <button
                  className="btn btn-outline-dark"
                  onClick={() =>
                    window.alert(
                      `${state.app.settings.businessName}\n${state.app.settings.phone}\n${state.app.settings.location}`
                    )
                  }
                >
                  Business Contact
                </button>
              </div>
            </div>
            <div className="hero-bottom">
              <div className="mini-panel">
                <div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Booking Mode</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>Option A</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Request-to-book stays on.</div>
              </div>
              <div className="mini-panel">
                <div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Channels</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>4</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>App, call, text, walk-in.</div>
              </div>
              <div className="mini-panel">
                <div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Shop</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>La Porte, IN</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>136 Grand Ave.</div>
              </div>
            </div>
          </div>

          <div className="stats-col">
            <div className="kpi">
              <div className="kpi-main">
                <div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>
                  Available Saws
                </div>
                <div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{state.stats.available}</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Ready to rent</div>
              </div>
              <div className="kpi-side kpi-green">🪚</div>
            </div>
            <div className="kpi">
              <div className="kpi-main">
                <div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>
                  Pending Requests
                </div>
                <div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{state.stats.pending}</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Need approval</div>
              </div>
              <div className="kpi-side kpi-amber">📋</div>
            </div>
            <div className="kpi">
              <div className="kpi-main">
                <div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>
                  Deposits Held
                </div>
                <div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{money(state.stats.depositsHeld)}</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Pending and active rentals</div>
              </div>
              <div className="kpi-side kpi-blue">💵</div>
            </div>
            <div className="card-soft" style={{ padding: 20 }}>
              <div style={{ fontWeight: 800 }}>Quick Quote Panel</div>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                Use this for calls, texts, and walk-ins.
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label>Saw</label>
                <select className="select" value={state.selectedSawId} onChange={(e) => state.actions.setSelectedSawId(e.target.value)}>
                  {state.app.saws.map((saw) => (
                    <option key={saw.id} value={saw.id}>{saw.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label>Duration</label>
                <select className="select" value={state.selectedDuration} onChange={(e) => state.actions.setSelectedDuration(e.target.value)}>
                  <option value="2h">2 hours</option>
                  <option value="4h">4 hours</option>
                  <option value="day">1 day</option>
                  <option value="weekend">Weekend</option>
                  <option value="week">1 week</option>
                </select>
              </div>
              <div className="mini-panel" style={{ marginTop: 16 }}>
                <div className="info-row"><span className="muted">Rental</span><strong>{money(getQuickPrice(state.quickQuoteSaw, state.selectedDuration))}</strong></div>
                <div className="info-row" style={{ marginTop: 8 }}><span className="muted">Deposit</span><strong>{money(state.quickQuoteSaw?.deposit)}</strong></div>
                <div className="info-row" style={{ marginTop: 8 }}><span className="muted">Fuel</span><strong>{state.quickQuoteSaw?.fuel || "-"}</strong></div>
                <div className="info-row" style={{ marginTop: 8 }}><span className="muted">Status</span><span className={getStatusClass(state.quickQuoteSaw?.status)}>{state.quickQuoteSaw?.status || "-"}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="section-grid">
          <PublicRequestPanel
            availablePublicSaws={state.availablePublicSaws}
            publicSearch={state.publicSearch}
            setPublicSearch={state.actions.setPublicSearch}
            publicRequest={state.publicRequest}
            setPublicRequest={state.actions.setPublicRequest}
            submitPublicRequest={state.submitPublicRequest}
          />

          <div className="card">
            {!state.adminOpen ? (
              <div className="locked">
                <div className="locked-box">
                  <div style={{ width: 64, height: 64, borderRadius: 18, margin: "0 auto", background: "#0f172a", color: "#fff", display: "grid", placeItems: "center", fontSize: 30 }}>📊</div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginTop: 20 }}>Admin dashboard locked</div>
                  <div className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
                    Open the operations side to manage inventory, bookings, customers, deposits, and maintenance.
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={state.actions.openAdminLogin}>
                    Open Admin
                  </button>
                </div>
              </div>
            ) : !state.isAdminAuthorized ? (
              <div className="locked">
                <div className="login-box">
                  <div style={{ fontSize: 34, fontWeight: 900 }}>Enter Admin PIN</div>
                  <div className="muted" style={{ marginTop: 8 }}>Use your admin credentials to continue.</div>
                  <input
                    type="password"
                    className="input"
                    style={{ marginTop: 18 }}
                    value={state.pin}
                    onChange={(e) => state.actions.setPin(e.target.value)}
                    placeholder="4-8 digit PIN"
                  />
                  {state.adminAuthError ? (
                    <div style={{ marginTop: 12, color: "#b91c1c", fontWeight: 700 }}>{state.adminAuthError}</div>
                  ) : null}
                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button className="btn btn-primary" onClick={state.handleAdminUnlock}>Unlock</button>
                    <button
                      className="btn btn-outline"
                      onClick={state.actions.closeAdmin}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <AdminShell state={state} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
