import { reconcileSawStatusAfterBookingTransition } from "./inventory";

export function setBookingStatus({ bookings, saws, customers, bookingId, nextStatus }) {
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) return null;

  const wasNotBillable = ["Pending", "Declined"].includes(booking.status);
  const becomesBillable = ["Approved", "Out", "Returned"].includes(nextStatus);

  const nextCustomers = wasNotBillable && becomesBillable
    ? customers.map((customer) =>
        customer.id === booking.customerId
          ? {
              ...customer,
              rentals: Number(customer.rentals || 0) + 1,
              totalSpent: Number(customer.totalSpent || 0) + Number(booking.rentalPrice || 0),
            }
          : customer
      )
    : customers;

  const nextBookings = bookings.map((item) =>
    item.id === bookingId ? { ...item, status: nextStatus } : item
  );

  const nextSaws = saws.map((saw) =>
    reconcileSawStatusAfterBookingTransition({
      saw,
      bookings: nextBookings,
      bookingId,
      sawId: booking.sawId,
      nextStatus,
    })
  );

  return { customers: nextCustomers, bookings: nextBookings, saws: nextSaws };
}
