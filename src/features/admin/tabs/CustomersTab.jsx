import React from "react";
import { money } from "../../../lib/pricing";
import { useAdminContext } from "../AdminContext";

export function CustomersTab() {
  const { app } = useAdminContext();

  return (
    <div className="card-soft" style={{ padding: 20 }}>
      <div style={{ fontSize: 22, fontWeight: 900 }}>Customer Records</div>
      <div className="muted" style={{ marginTop: 6 }}>Track repeat renters and total spend.</div>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Customer</th><th>Phone</th><th>Rentals</th><th>Total Spent</th><th>Notes</th></tr></thead>
          <tbody>{app.customers.map((customer) => <tr key={customer.id}><td style={{ fontWeight: 700 }}>{customer.name}</td><td>{customer.phone}</td><td>{customer.rentals}</td><td style={{ fontWeight: 700 }}>{money(customer.totalSpent)}</td><td>{customer.notes || "No notes"}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
