import React from "react";
import { OverviewTab } from "./tabs/OverviewTab";
import { InventoryTab } from "./tabs/InventoryTab";
import { BookingsTab } from "./tabs/BookingsTab";
import { CustomersTab } from "./tabs/CustomersTab";
import { MaintenanceTab } from "./tabs/MaintenanceTab";
import { SettingsTab } from "./tabs/SettingsTab";

import { AdminContext } from "./AdminContext";

export function AdminShell({ state }) {
  const { app, adminTab, sidebarItems, handleAdminLock, isAdminAuthorized } = state;

  if (!isAdminAuthorized) {
    return null;
  }

  return (
    <AdminContext.Provider value={state}>
      <div className="admin-shell">
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="brand-row">
              <div className="brand-icon">🪚</div>
              <div><div style={{ color: "#fff", fontWeight: 900 }}>{app.settings.businessName}</div><div style={{ color: "#94a3b8", fontSize: 12 }}>Rental Ops Console</div></div>
            </div>
          </div>
          <div className="nav-block">
            <div className="nav-label">Main Navigation</div>
            <div className="nav-list">
              {sidebarItems.map((item) => (
                <button key={item.key} className={`nav-btn ${adminTab === item.key ? "active" : ""}`} onClick={() => state.actions.setAdminTab(item.key)}><span>{item.icon}</span><span>{item.label}</span></button>
              ))}
            </div>
          </div>
          <div className="sidebar-footer">
            <div className="sidebar-card"><div style={{ color: "#fff", fontWeight: 800 }}>Shop Contact</div><div style={{ color: "#cbd5e1", marginTop: 10 }}>{app.settings.phone}</div><div style={{ color: "#94a3b8", marginTop: 6 }}>{app.settings.location}</div></div>
          </div>
        </aside>

        <main className="main-area">
          <div className="topbar">
            <div><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Operations Dashboard</div><div style={{ fontSize: 32, fontWeight: 900, marginTop: 6 }}>{sidebarItems.find((item) => item.key === adminTab)?.label || "Overview"}</div></div>
            <div className="actions"><span className="badge slate">Admin</span><span className="badge slate">Request-to-book {app.settings.requestModeOnly ? "On" : "Off"}</span><button className="btn btn-outline btn-sm" onClick={handleAdminLock}>Lock</button></div>
          </div>

          <div className="content-pad">
            {adminTab === "overview" && <OverviewTab />}
            {adminTab === "inventory" && <InventoryTab />}
            {adminTab === "bookings" && <BookingsTab />}
            {adminTab === "customers" && <CustomersTab />}
            {adminTab === "maintenance" && <MaintenanceTab />}
            {adminTab === "settings" && <SettingsTab />}
          </div>
        </main>
      </div>
    </AdminContext.Provider>
  );
}
