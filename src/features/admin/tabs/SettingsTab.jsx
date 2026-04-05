import React from "react";
import { useAdminContext } from "../AdminContext";

export function SettingsTab() {
  const { app, updateSetting, handleAdminLock, resetAllData } = useAdminContext();

  return (
    <div className="card-soft" style={{ padding: 20 }}>
      <div style={{ fontSize: 22, fontWeight: 900 }}>Business Settings</div>
      <div className="muted" style={{ marginTop: 6 }}>Control public-facing details and secure admin access.</div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="field"><label>Business Name</label><input className="input" value={app.settings.businessName} onChange={(e) => updateSetting("businessName", e.target.value)} /></div>
        <div className="field"><label>Phone</label><input className="input" value={app.settings.phone} onChange={(e) => updateSetting("phone", e.target.value)} /></div>
        <div className="field"><label>Location</label><input className="input" value={app.settings.location} onChange={(e) => updateSetting("location", e.target.value)} /></div>
        <div className="field"><label>Admin PIN (4-8 digits)</label><input type="password" inputMode="numeric" className="input" value={app.settings.adminPin} onChange={(e) => updateSetting("adminPin", e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, flexWrap: "wrap" }}>
        <div><div style={{ fontWeight: 800 }}>Request-to-book only</div><div className="muted" style={{ marginTop: 4 }}>Keep manual approval on for every app request.</div></div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700 }}><input type="checkbox" checked={app.settings.requestModeOnly} onChange={(e) => updateSetting("requestModeOnly", e.target.checked)} />Enabled</label>
      </div>
      <div className="actions" style={{ marginTop: 16 }}><button className="btn btn-outline" onClick={handleAdminLock}>Lock Admin</button><button className="btn btn-danger" onClick={resetAllData}>Reset Demo Data</button></div>
    </div>
  );
}
