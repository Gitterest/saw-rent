import React from "react";
import { money } from "../../../lib/pricing";
import { getStatusClass } from "../../../lib/status";
import { useAdminContext } from "../AdminContext";

export function InventoryTab() {
  const { filteredInventory, inventoryFilter, inventorySearch, newSaw, addSaw, actions } = useAdminContext();

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="card-soft" style={{ padding: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Inventory Manager</div>
        <div className="muted" style={{ marginTop: 6 }}>Clean list view with corrected saw status logic.</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <select className="select" style={{ maxWidth: 180 }} value={inventoryFilter} onChange={(e) => actions.setInventoryFilter(e.target.value)}><option value="all">All statuses</option><option value="Available">Available</option><option value="Out">Out</option><option value="Maintenance">Maintenance</option></select>
          <div className="search-icon-wrap" style={{ flex: 1, minWidth: 220 }}><span className="search-icon">🔎</span><input className="input search-pad" value={inventorySearch} onChange={(e) => actions.setInventorySearch(e.target.value)} placeholder="Search inventory..." /></div>
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table><thead><tr><th>Saw</th><th>Category</th><th>Rate</th><th>Deposit</th><th>Status</th></tr></thead><tbody>{filteredInventory.map((saw) => <tr key={saw.id}><td><div style={{ fontWeight: 800 }}>{saw.name}</div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{saw.barSize} · {saw.fuel}</div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{saw.condition}</div></td><td>{saw.category}</td><td style={{ fontWeight: 700 }}>{money(saw.rateDay)}/day</td><td>{money(saw.deposit)}</td><td><span className={getStatusClass(saw.status)}>{saw.status}</span></td></tr>)}</tbody></table>
        </div>
      </div>

      <div className="card-soft" style={{ padding: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Add Saw</div>
        <div className="muted" style={{ marginTop: 6 }}>Add a new unit to your fleet.</div>
        <form onSubmit={addSaw} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <input className="input" placeholder="Saw name" value={newSaw.name} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, name: e.target.value }))} required />
          <div className="grid-2"><input className="input" placeholder="Category" value={newSaw.category} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, category: e.target.value }))} /><input className="input" placeholder="Bar size" value={newSaw.barSize} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, barSize: e.target.value }))} /></div>
          <input className="input" placeholder="Fuel" value={newSaw.fuel} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, fuel: e.target.value }))} />
          <div className="grid-3"><input type="number" className="input" placeholder="2h" value={newSaw.rate2h} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, rate2h: e.target.value }))} /><input type="number" className="input" placeholder="4h" value={newSaw.rate4h} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, rate4h: e.target.value }))} /><input type="number" className="input" placeholder="Day" value={newSaw.rateDay} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, rateDay: e.target.value }))} /></div>
          <div className="grid-3"><input type="number" className="input" placeholder="Weekend" value={newSaw.weekend} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, weekend: e.target.value }))} /><input type="number" className="input" placeholder="Week" value={newSaw.week} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, week: e.target.value }))} /><input type="number" className="input" placeholder="Deposit" value={newSaw.deposit} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, deposit: e.target.value }))} /></div>
          <input className="input" placeholder="Condition" value={newSaw.condition} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, condition: e.target.value }))} />
          <textarea className="textarea" placeholder="Notes" value={newSaw.notes} onChange={(e) => actions.setNewSaw((prev) => ({ ...prev, notes: e.target.value }))} />
          <button type="submit" className="btn btn-primary">Add Saw</button>
        </form>
      </div>
    </div>
  );
}
