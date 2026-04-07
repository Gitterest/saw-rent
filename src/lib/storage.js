const DEFAULT_PIN = "1234";
export const STORAGE_KEY = "saw-rent-v2";

const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function createSeedData() {
  const saws = [
    { id: uid("saw"), name: "Husqvarna 51", category: "Mid-Size", barSize: '18"', fuel: "50:1 Mix", deposit: 175, rate2h: 25, rate4h: 35, rateDay: 55, weekend: 90, week: 180, status: "Available", condition: "Ready", notes: "Solid general-use rental saw." },
    { id: uid("saw"), name: "Husqvarna 350", category: "Mid-Size", barSize: '18"', fuel: "50:1 Mix", deposit: 175, rate2h: 25, rate4h: 35, rateDay: 55, weekend: 90, week: 180, status: "Available", condition: "Ready", notes: "Fast-moving everyday rental option." },
    { id: uid("saw"), name: "Husqvarna 141", category: "Light Duty", barSize: '16"', fuel: "50:1 Mix", deposit: 125, rate2h: 20, rate4h: 30, rateDay: 45, weekend: 75, week: 150, status: "Available", condition: "Ready", notes: "Best for lighter cutting jobs." },
    { id: uid("saw"), name: "Husqvarna 23 Compact", category: "Compact", barSize: '14"', fuel: "50:1 Mix", deposit: 100, rate2h: 20, rate4h: 25, rateDay: 40, weekend: 70, week: 135, status: "Available", condition: "Ready", notes: "Compact saw for smaller jobs." },
    { id: uid("saw"), name: "McCulloch Pro Mac 610", category: "Large / Vintage", barSize: '20"', fuel: "50:1 Mix", deposit: 225, rate2h: 35, rate4h: 45, rateDay: 70, weekend: 115, week: 230, status: "Available", condition: "Ready", notes: "Heavier saw. Better for larger cuts and experienced users." },
    { id: uid("saw"), name: "Poulan Wild Thing", category: "Budget", barSize: '18"', fuel: "50:1 Mix", deposit: 100, rate2h: 20, rate4h: 30, rateDay: 45, weekend: 75, week: 150, status: "Available", condition: "Ready", notes: "Budget rental option for light to medium work." },
  ];

  return {
    settings: { businessName: "Saw Rent", phone: "219-851-9675", location: "136 Grand Ave, La Porte, IN 46350", requestModeOnly: true, adminPin: DEFAULT_PIN },
    saws,
    customers: [{ id: uid("cust"), name: "Mike Dawson", phone: "(219) 555-0188", notes: "Repeat renter", rentals: 2, totalSpent: 130 }],
    bookings: [{ id: uid("book"), sawId: saws[1].id, sawName: saws[1].name, customerId: null, customerName: "John Carter", phone: "(219) 555-0142", channel: "App Request", startDate: tomorrow(), endDate: tomorrow(), duration: "1 day", rentalPrice: saws[1].rateDay, deposit: saws[1].deposit, status: "Pending", notes: "Storm cleanup request.", createdAt: new Date().toISOString() }],
    maintenance: [{ id: uid("mnt"), sawId: saws[4].id, sawName: saws[4].name, issue: "Inspect chain brake before next rental", priority: "High", status: "Open", lastService: today(), notes: "Do not release until checked." }],
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeObjectArray(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const next = value.filter((entry) => isRecord(entry));
  return next.length > 0 ? next : fallback;
}

function sanitizeState(candidate) {
  const seed = createSeedData();
  if (!isRecord(candidate)) return seed;

  return {
    settings: isRecord(candidate.settings) ? { ...seed.settings, ...candidate.settings } : seed.settings,
    saws: sanitizeObjectArray(candidate.saws, seed.saws),
    customers: sanitizeObjectArray(candidate.customers, seed.customers),
    bookings: sanitizeObjectArray(candidate.bookings, seed.bookings),
    maintenance: sanitizeObjectArray(candidate.maintenance, seed.maintenance),
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedData();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return createSeedData();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export const makeUid = uid;
export const getToday = today;
export const getTomorrow = tomorrow;
