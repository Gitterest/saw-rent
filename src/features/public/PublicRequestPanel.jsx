import React from "react";
import { money } from "../../lib/pricing";
import { getStatusClass } from "../../lib/status";

export function PublicRequestPanel({
  availablePublicSaws,
  publicSearch,
  setPublicSearch,
  publicRequest,
  setPublicRequest,
  submitPublicRequest,
}) {
  return (
    <div className="card section-pad">
      <div style={{ fontSize: 24, fontWeight: 900 }}>Customer Booking Page</div>
      <div className="muted" style={{ marginTop: 6 }}>Public side. Clean, simple, request-to-book only.</div>

      <div className="search-icon-wrap" style={{ marginTop: 18 }}>
        <span className="search-icon">🔎</span>
        <input className="input search-pad" value={publicSearch} onChange={(e) => setPublicSearch(e.target.value)} placeholder="Search available saws..." />
      </div>

      <div className="saw-list" style={{ marginTop: 18 }}>
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
              <div className="mini-panel"><div className="muted" style={{ fontSize: 13 }}>1 day</div><div style={{ fontWeight: 900, marginTop: 6 }}>{money(saw.rateDay)}</div></div>
              <div className="mini-panel"><div className="muted" style={{ fontSize: 13 }}>Deposit</div><div style={{ fontWeight: 900, marginTop: 6 }}>{money(saw.deposit)}</div></div>
            </div>
            <div className="muted" style={{ marginTop: 14, fontSize: 14 }}>Fuel: {saw.fuel}</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Condition: {saw.condition}</div>
          </div>
        ))}
      </div>

      <form onSubmit={submitPublicRequest} className="mini-panel" style={{ marginTop: 18 }}>
        <div className="grid-2">
          <div className="field"><label>Name</label><input className="input" value={publicRequest.name} onChange={(e) => setPublicRequest((prev) => ({ ...prev, name: e.target.value }))} required /></div>
          <div className="field"><label>Phone</label><input className="input" value={publicRequest.phone} onChange={(e) => setPublicRequest((prev) => ({ ...prev, phone: e.target.value }))} required /></div>
          <div className="field"><label>Saw</label><select className="select" value={publicRequest.sawId} onChange={(e) => setPublicRequest((prev) => ({ ...prev, sawId: e.target.value }))}>{availablePublicSaws.map((saw) => <option key={saw.id} value={saw.id}>{saw.name}</option>)}</select></div>
          <div className="field"><label>Requested Date</label><input type="date" className="input" value={publicRequest.startDate} onChange={(e) => setPublicRequest((prev) => ({ ...prev, startDate: e.target.value }))} required /></div>
          <div className="field"><label>Duration</label><select className="select" value={publicRequest.duration} onChange={(e) => setPublicRequest((prev) => ({ ...prev, duration: e.target.value }))}><option value="2 hours">2 hours</option><option value="4 hours">4 hours</option><option value="1 day">1 day</option><option value="Weekend">Weekend</option><option value="1 week">1 week</option></select></div>
          <div className="field"><label>Notes</label><textarea className="textarea" value={publicRequest.notes} onChange={(e) => setPublicRequest((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Job notes, wood size, questions..." /></div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}>
          <span className="muted" style={{ fontSize: 14 }}>Customers can still call, text, or stop by the shop instead of using this form.</span>
          <button type="submit" className="btn btn-primary">Submit Request</button>
        </div>
      </form>
    </div>
  );
}
