import React from "react";
import { money } from "../../../lib/pricing";
import { getStatusClass } from "../../../lib/status";
import { useAdminContext } from "../AdminContext";

export function BookingsTab() {
  const { filteredBookings, bookingFilter, setBookingStatus, actions } = useAdminContext();

  return (
    <div className="card-soft" style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 22, fontWeight: 900 }}>Bookings Manager</div><div className="muted" style={{ marginTop: 6 }}>Approve, mark out, return, or decline.</div></div>
        <select className="select" style={{ width: 200 }} value={bookingFilter} onChange={(e) => actions.setBookingFilter(e.target.value)}><option value="all">All bookings</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Out">Out</option><option value="Returned">Returned</option><option value="Declined">Declined</option></select>
      </div>

      <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
        {filteredBookings.map((booking) => (
          <div key={booking.id} className="booking-card">
            <div style={{ display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><div style={{ fontSize: 22, fontWeight: 900 }}>{booking.customerName}</div><span className={getStatusClass(booking.status)}>{booking.status}</span><span className="badge slate">{booking.channel}</span></div>
                <div className="muted" style={{ marginTop: 6 }}>{booking.sawName} · {booking.phone}</div>
                <div className="muted" style={{ marginTop: 6 }}>{booking.startDate} to {booking.endDate} · {booking.duration}</div>
                <div style={{ marginTop: 12, fontSize: 14 }}>{booking.notes || "No notes"}</div>
              </div>
              <div className="summary-grid"><div className="summary-box"><div className="muted" style={{ fontSize: 12 }}>Rental</div><div style={{ fontWeight: 900, marginTop: 6 }}>{money(booking.rentalPrice)}</div></div><div className="summary-box"><div className="muted" style={{ fontSize: 12 }}>Deposit</div><div style={{ fontWeight: 900, marginTop: 6 }}>{money(booking.deposit)}</div></div></div>
            </div>
            <div className="actions"><button className="btn btn-success btn-sm" onClick={() => setBookingStatus(booking.id, "Approved")}>Approve</button><button className="btn btn-outline btn-sm" onClick={() => setBookingStatus(booking.id, "Out")}>Mark Out</button><button className="btn btn-outline btn-sm" onClick={() => setBookingStatus(booking.id, "Returned")}>Mark Returned</button><button className="btn btn-danger btn-sm" onClick={() => setBookingStatus(booking.id, "Declined")}>Decline</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
