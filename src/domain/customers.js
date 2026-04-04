export function updateOrCreateCustomer({
  customers,
  name,
  phone,
  notes,
  rentalIncrease = 0,
  spendIncrease = 0,
  createId,
}) {
  const normalizedName = name.trim().toLowerCase();
  const index = customers.findIndex(
    (customer) =>
      customer.phone === phone || customer.name.trim().toLowerCase() === normalizedName
  );

  if (index >= 0) {
    const existing = customers[index];
    const updated = {
      ...existing,
      notes: notes || existing.notes,
      rentals: Number(existing.rentals || 0) + rentalIncrease,
      totalSpent: Number(existing.totalSpent || 0) + spendIncrease,
    };
    const nextCustomers = [...customers];
    nextCustomers[index] = updated;
    return { customerId: existing.id, customers: nextCustomers };
  }

  const newCustomer = {
    id: createId("cust"),
    name,
    phone,
    notes,
    rentals: rentalIncrease,
    totalSpent: spendIncrease,
  };

  return {
    customerId: newCustomer.id,
    customers: [newCustomer, ...customers],
  };
}
