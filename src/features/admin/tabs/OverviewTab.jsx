import React from "react";
import { getStatusClass } from "../../../lib/status";
import { useAdminContext } from "../AdminContext";

export function OverviewTab() {
  const { app, stats, newBooking, createManualBooking, actions } = useAdminContext();

  return (
    <>
      <div className="grid-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi"><div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Saws Out</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{stats.out}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Currently with customers</div></div><div className="kpi-side kpi-blue">📦</div></div>
        <div className="kpi"><div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Pending</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{stats.pending}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Approval queue</div></div><div className="kpi-side kpi-amber">📋</div></div>
        <div className="kpi"><div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Customers</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{app.customers.length}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Saved renter records</div></div><div className="kpi-side kpi-violet">👤</div></div>
        <div className="kpi"><div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Maintenance</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{stats.maintenanceOpen}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Needs attention</div></div><div className="kpi-side kpi-rose">🛠️</div></div>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card-soft" style={{ padding: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Recent Bookings</div>
          <div className="muted" style={{ marginTop: 6 }}>Fast view of what just came in.</div>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table><thead><tr><th>Customer</th><th>Saw</th><th>Channel</th><th>Status</th></tr></thead><tbody>{app.bookings.slice(0, 6).map((booking) => <tr key={booking.id}><td style={{ fontWeight: 700 }}>{booking.customerName}</td><td>{booking.sawName}</td><td>{booking.channel}</td><td><span className={getStatusClass(booking.status)}>{booking.status}</span></td></tr>)}</tbody></table>
          </div>
        </div>

        <div className="card-soft" style={{ padding: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Quick Manual Booking</div>
          <div className="muted" style={{ marginTop: 6 }}>For phone, text, and walk-in customers.</div>
          <form onSubmit={createManualBooking} style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <input className="input" placeholder="Customer name" value={newBooking.customerName} onChange={(e) => actions.setNewBooking((prev) => ({ ...prev, customerName: e.target.value }))} required />
            <input className="input" placeholder="Phone" value={newBooking.phone} onChange={(e) => actions.setNewBooking((prev) => ({ ...prev, phone: e.target.value }))} required />
            <div className="grid-2"><select className="select" value={newBooking.channel} onChange={(e) => actions.setNewBooking((prev) => ({ ...prev, channel: e.target.value }))}><option value="Phone">Phone</option><option value="Text">Text</option><option value="Walk-In">Walk-In</option></select><select className="select" value={newBooking.sawId} onChange={(e) => actions.setNewBooking((prev) => ({ ...prev, sawId: e.target.value }))}>{app.saws.filter((saw) => saw.status === "Available").map((saw) => <option key={saw.id} value={saw.id}>{saw.name}</option>)}</select></div>
            <div className="grid-2"><input type="date" className="input" value={newBooking.startDate} onChange={(e) => actions.setNewBooking((prev) => ({ ...prev, startDate: e.target.value }))} /><input type="date" className="input" value={newBooking.endDate} onChange={(e) => actions.setNewBooking((prev) => ({ ...prev, endDate: e.target.value }))} /></div>
            <select className="select" value={newBooking.duration} onChange={(e) => actions.setNewBooking((prev) => ({ ...prev, duration: e.target.value }))}><option value="2 hours">2 hours</option><option value="4 hours">4 hours</option><option value="1 day">1 day</option><option value="Weekend">Weekend</option><option value="1 week">1 week</option></select>
            <textarea className="textarea" placeholder="Notes" value={newBooking.notes} onChange={(e) => actions.setNewBooking((prev) => ({ ...prev, notes: e.target.value }))} />
            <button type="submit" className="btn btn-primary">Create Booking</button>
          </form>
        </div>
      </div>
    </>
  );
}
