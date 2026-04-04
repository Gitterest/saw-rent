import React from "react";
import { getStatusClass } from "../../../lib/status";
import { useAdminContext } from "../AdminContext";

export function MaintenanceTab() {
  const { app, maintenanceDraft, addMaintenanceItem, markMaintenanceDone, actions } = useAdminContext();

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="card-soft" style={{ padding: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Maintenance Log</div>
        <div className="muted" style={{ marginTop: 6 }}>Anything unsafe or questionable stays blocked.</div>
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          {app.maintenance.map((item) => (
            <div key={item.id} className="booking-card">
              <div style={{ display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
                <div><div style={{ fontWeight: 900, fontSize: 18 }}>{item.sawName}</div><div className="muted" style={{ marginTop: 6 }}>{item.issue}</div><div style={{ marginTop: 10, fontSize: 14 }}>{item.notes || "No notes"}</div></div>
                <div className="actions"><span className={item.priority === "High" ? "badge red" : "badge amber"}>{item.priority}</span><span className={getStatusClass(item.status)}>{item.status}</span></div>
              </div>
              <div className="actions"><button className="btn btn-outline btn-sm" onClick={() => markMaintenanceDone(item.id)}>Mark Done</button></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-soft" style={{ padding: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Add Maintenance Item</div>
        <div className="muted" style={{ marginTop: 6 }}>Lock the saw until the issue is handled.</div>
        <form onSubmit={addMaintenanceItem} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <select className="select" value={maintenanceDraft.sawId} onChange={(e) => actions.setMaintenanceDraft((prev) => ({ ...prev, sawId: e.target.value }))}>{app.saws.map((saw) => <option key={saw.id} value={saw.id}>{saw.name}</option>)}</select>
          <input className="input" placeholder="Issue" value={maintenanceDraft.issue} onChange={(e) => actions.setMaintenanceDraft((prev) => ({ ...prev, issue: e.target.value }))} required />
          <select className="select" value={maintenanceDraft.priority} onChange={(e) => actions.setMaintenanceDraft((prev) => ({ ...prev, priority: e.target.value }))}><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option></select>
          <textarea className="textarea" placeholder="Notes" value={maintenanceDraft.notes} onChange={(e) => actions.setMaintenanceDraft((prev) => ({ ...prev, notes: e.target.value }))} />
          <button type="submit" className="btn btn-primary">Add Maintenance Item</button>
        </form>
      </div>
    </div>
  );
}
