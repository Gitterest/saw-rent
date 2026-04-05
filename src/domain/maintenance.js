import { hasBlockingBooking, reconcileSawStatusAfterMaintenance } from "./inventory";

export function addMaintenanceItem({ maintenance, saws, draft, saw, createId, date }) {
  const item = {
    id: createId("mnt"),
    sawId: saw.id,
    sawName: saw.name,
    issue: draft.issue.trim(),
    priority: draft.priority,
    status: "Open",
    lastService: date,
    notes: draft.notes.trim(),
  };

  return {
    maintenance: [item, ...maintenance],
    saws: saws.map((entry) =>
      entry.id === saw.id
        ? { ...entry, status: "Maintenance", condition: draft.issue.trim() }
        : entry
    ),
  };
}

export function markMaintenanceDone({ maintenance, saws, bookings, maintenanceId }) {
  const item = maintenance.find((entry) => entry.id === maintenanceId);
  if (!item) return null;

  const sawStillBooked = hasBlockingBooking(bookings, item.sawId, null);

  return {
    maintenance: maintenance.map((entry) =>
      entry.id === maintenanceId ? { ...entry, status: "Done" } : entry
    ),
    saws: saws.map((saw) =>
      reconcileSawStatusAfterMaintenance({
        saw,
        sawId: item.sawId,
        hasBlocking: sawStillBooked,
      })
    ),
  };
}
