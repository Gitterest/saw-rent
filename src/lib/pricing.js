export const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export function getDurationPrice(saw, duration) {
  if (!saw) return 0;
  if (duration === "2 hours") return Number(saw.rate2h);
  if (duration === "4 hours") return Number(saw.rate4h);
  if (duration === "Weekend") return Number(saw.weekend);
  if (duration === "1 week") return Number(saw.week);
  return Number(saw.rateDay);
}

export function getQuickPrice(saw, durationKey) {
  if (!saw) return 0;
  if (durationKey === "2h") return Number(saw.rate2h);
  if (durationKey === "4h") return Number(saw.rate4h);
  if (durationKey === "weekend") return Number(saw.weekend);
  if (durationKey === "week") return Number(saw.week);
  return Number(saw.rateDay);
}
