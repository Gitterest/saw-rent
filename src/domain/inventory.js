const BLOCKING_BOOKING_STATUSES = ["Pending", "Approved", "Out"];

export function hasBlockingBooking(bookings, sawId, excludeBookingId = null) {
  return bookings.some(
    (booking) =>
      booking.sawId === sawId &&
      booking.id !== excludeBookingId &&
      BLOCKING_BOOKING_STATUSES.includes(booking.status)
  );
}

export function reconcileSawStatusAfterBookingTransition({
  saw,
  bookings,
  bookingId,
  sawId,
  nextStatus,
}) {
  if (saw.id !== sawId) return saw;

  const shouldFreeSaw =
    !hasBlockingBooking(bookings, sawId, bookingId) &&
    ["Returned", "Declined"].includes(nextStatus);
  const shouldBlockSaw = BLOCKING_BOOKING_STATUSES.includes(nextStatus);

  if (saw.status === "Maintenance" && shouldFreeSaw) return saw;
  if (shouldBlockSaw) return { ...saw, status: "Out" };
  if (shouldFreeSaw) return { ...saw, status: "Available" };
  return saw;
}

export function reconcileSawStatusAfterMaintenance({ saw, sawId, hasBlocking }) {
  if (saw.id !== sawId) return saw;
  return { ...saw, status: hasBlocking ? "Out" : "Available", condition: "Ready" };
}
