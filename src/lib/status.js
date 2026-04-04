export function getStatusClass(status) {
  if (status === "Available" || status === "Done") return "badge green";
  if (status === "Pending" || status === "Scheduled") return "badge amber";
  if (status === "Out") return "badge blue";
  if (status === "Approved" || status === "Returned") return "badge slate";
  if (status === "Maintenance" || status === "Open" || status === "Declined") return "badge red";
  return "badge slate";
}

export function hasBlockingBooking(bookings, sawId, excludeBookingId = null) {
  return bookings.some(
    (booking) =>
      booking.sawId === sawId &&
      booking.id !== excludeBookingId &&
      ["Pending", "Approved", "Out"].includes(booking.status)
  );
}
