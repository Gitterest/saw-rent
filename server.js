import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'change-me';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
const SESSION_COOKIE = 'saw_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

app.use(express.json());
app.use(cookieParser());

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function dateRangeOverlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function signSession(payload) {
  const payload64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload64)
    .digest('base64url');
  return `${payload64}.${sig}`;
}

function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload64, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload64)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload64, 'base64url').toString('utf8'));
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function makeSeed() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const inventory = [
    {
      id: makeId('inv'),
      name: 'Husqvarna 350',
      category: 'Mid-size gas saw',
      barSize: '18"',
      fuel: '50:1 mix',
      condition: 'ready',
      maintenanceLock: false,
      notes: 'General-purpose rental saw.',
      pricing: { twoHours: 25, fourHours: 35, day: 55, weekend: 90, week: 180 },
      deposit: 175,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: makeId('inv'),
      name: 'Husqvarna 141',
      category: 'Light-duty gas saw',
      barSize: '16"',
      fuel: '50:1 mix',
      condition: 'ready',
      maintenanceLock: false,
      notes: 'Best for small cuts and yard jobs.',
      pricing: { twoHours: 20, fourHours: 30, day: 45, weekend: 75, week: 150 },
      deposit: 125,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];

  const customer = {
    id: makeId('cus'),
    name: 'Alex Carter',
    phone: '(219) 555-0199',
    email: 'alex@example.com',
    notes: 'Repeat customer',
    totalRentals: 1,
    lifetimeSpend: 55,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const booking = {
    id: makeId('bok'),
    inventoryId: inventory[0].id,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    startDate: tomorrow.toISOString().slice(0, 10),
    endDate: tomorrow.toISOString().slice(0, 10),
    duration: 'day',
    rentalPrice: 55,
    deposit: 175,
    status: 'requested',
    notes: 'Storm cleanup request.',
    source: 'public-web',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  return {
    settings: {
      businessName: 'Saw Rent',
      headline: 'Professional chainsaw rentals for homeowners, farms, and contractors.',
      phone: '219-851-9675',
      email: 'bookings@sawrent.example',
      address: '136 Grand Ave, La Porte, IN 46350',
      hours: 'Mon-Sat 7:30 AM - 6:00 PM',
      about:
        'We keep a ready-to-run fleet of serviced chainsaws with transparent pricing, safety-first checkouts, and rapid turnaround for emergency cleanup jobs.',
      updatedAt: nowIso(),
    },
    inventory,
    customers: [customer],
    bookings: [booking],
  };
}

async function ensureDbFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(makeSeed(), null, 2), 'utf8');
  }
}

async function readDb() {
  await ensureDbFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function computeInventoryState(item, bookings) {
  if (item.maintenanceLock || item.condition === 'maintenance') {
    return 'maintenance';
  }

  const active = bookings.find((booking) => booking.inventoryId === item.id && ['approved', 'checked_out'].includes(booking.status));
  if (active) {
    return active.status === 'checked_out' ? 'out' : 'booked';
  }

  return 'available';
}

function hasConflictingBooking(bookings, inventoryId, startDate, endDate, excludeBookingId = null) {
  return bookings.some((booking) => {
    if (booking.inventoryId !== inventoryId) return false;
    if (excludeBookingId && booking.id === excludeBookingId) return false;
    if (!['requested', 'approved', 'checked_out'].includes(booking.status)) return false;
    return dateRangeOverlaps(startDate, endDate, booking.startDate, booking.endDate);
  });
}

function adminOnly(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  const session = verifySession(token);
  if (!session || session.role !== 'owner') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: nowIso() });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== OWNER_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const session = {
    role: 'owner',
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const token = signSession(session);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  return res.json({ ok: true });
});

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/public/settings', async (_req, res) => {
  const db = await readDb();
  res.json(db.settings);
});

app.get('/api/public/inventory', async (_req, res) => {
  const db = await readDb();
  const list = db.inventory.map((item) => ({
    ...item,
    state: computeInventoryState(item, db.bookings),
  }));
  res.json(list);
});

app.post('/api/public/bookings/request', async (req, res) => {
  const { inventoryId, customerName, customerPhone, customerEmail, notes, startDate, endDate, duration } = req.body || {};
  if (!inventoryId || !customerName || !customerPhone || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required booking fields' });
  }

  const normalizedStart = normalizeDateInput(startDate);
  const normalizedEnd = normalizeDateInput(endDate);
  if (!normalizedStart || !normalizedEnd || normalizedStart > normalizedEnd) {
    return res.status(400).json({ error: 'Invalid date range' });
  }

  const db = await readDb();
  const item = db.inventory.find((candidate) => candidate.id === inventoryId);
  if (!item) return res.status(404).json({ error: 'Inventory item not found' });
  if (item.maintenanceLock || item.condition === 'maintenance') {
    return res.status(409).json({ error: 'Item unavailable due to maintenance' });
  }
  if (hasConflictingBooking(db.bookings, inventoryId, normalizedStart, normalizedEnd)) {
    return res.status(409).json({ error: 'Item already has an overlapping booking' });
  }

  const priceKey = duration === 'week' ? 'week' : duration === 'weekend' ? 'weekend' : duration === 'fourHours' ? 'fourHours' : duration === 'twoHours' ? 'twoHours' : 'day';
  const booking = {
    id: makeId('bok'),
    inventoryId: item.id,
    customerId: null,
    customerName: String(customerName).trim(),
    customerPhone: String(customerPhone).trim(),
    customerEmail: customerEmail ? String(customerEmail).trim() : '',
    startDate: normalizedStart,
    endDate: normalizedEnd,
    duration: priceKey,
    rentalPrice: safeNumber(item.pricing?.[priceKey], 0),
    deposit: safeNumber(item.deposit, 0),
    status: 'requested',
    notes: notes ? String(notes).trim() : '',
    source: 'public-web',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  db.bookings.unshift(booking);
  await writeDb(db);
  res.status(201).json({ ok: true, booking });
});

app.use('/api/admin', adminOnly);

app.get('/api/admin/bootstrap', async (_req, res) => {
  const db = await readDb();
  const inventory = db.inventory.map((item) => ({ ...item, state: computeInventoryState(item, db.bookings) }));
  res.json({ ...db, inventory });
});

app.put('/api/admin/settings', async (req, res) => {
  const db = await readDb();
  db.settings = { ...db.settings, ...req.body, updatedAt: nowIso() };
  await writeDb(db);
  res.json(db.settings);
});

app.post('/api/admin/inventory', async (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: 'Inventory name is required' });

  const item = {
    id: makeId('inv'),
    name: String(body.name).trim(),
    category: body.category || '',
    barSize: body.barSize || '',
    fuel: body.fuel || '',
    condition: body.condition || 'ready',
    maintenanceLock: Boolean(body.maintenanceLock),
    notes: body.notes || '',
    pricing: {
      twoHours: safeNumber(body.pricing?.twoHours, 0),
      fourHours: safeNumber(body.pricing?.fourHours, 0),
      day: safeNumber(body.pricing?.day, 0),
      weekend: safeNumber(body.pricing?.weekend, 0),
      week: safeNumber(body.pricing?.week, 0),
    },
    deposit: safeNumber(body.deposit, 0),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const db = await readDb();
  db.inventory.unshift(item);
  await writeDb(db);
  res.status(201).json(item);
});

app.put('/api/admin/inventory/:id', async (req, res) => {
  const db = await readDb();
  const idx = db.inventory.findIndex((item) => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Inventory item not found' });

  const current = db.inventory[idx];
  const next = {
    ...current,
    ...req.body,
    pricing: {
      ...current.pricing,
      ...(req.body.pricing || {}),
    },
    updatedAt: nowIso(),
  };

  db.inventory[idx] = next;
  await writeDb(db);
  res.json(next);
});

app.delete('/api/admin/inventory/:id', async (req, res) => {
  const db = await readDb();
  db.inventory = db.inventory.filter((item) => item.id !== req.params.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.put('/api/admin/bookings/:id/status', async (req, res) => {
  const { status } = req.body || {};
  const allowed = ['requested', 'approved', 'checked_out', 'returned', 'closed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid booking status' });
  }

  const db = await readDb();
  const idx = db.bookings.findIndex((booking) => booking.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found' });

  const booking = db.bookings[idx];
  const inventory = db.inventory.find((item) => item.id === booking.inventoryId);

  if (status === 'approved') {
    if (!inventory) return res.status(404).json({ error: 'Inventory item missing' });
    if (inventory.maintenanceLock || inventory.condition === 'maintenance') {
      return res.status(409).json({ error: 'Cannot approve while item is in maintenance' });
    }

    if (hasConflictingBooking(db.bookings, booking.inventoryId, booking.startDate, booking.endDate, booking.id)) {
      return res.status(409).json({ error: 'Cannot approve due to conflicting active booking' });
    }
  }

  db.bookings[idx] = { ...booking, status, updatedAt: nowIso() };

  if ((status === 'returned' || status === 'closed') && inventory) {
    inventory.updatedAt = nowIso();
  }

  if (status === 'closed') {
    const normalizedPhone = booking.customerPhone?.replace(/\D/g, '') || '';
    let customer = db.customers.find((c) => c.name.toLowerCase() === booking.customerName.toLowerCase() || c.phone.replace(/\D/g, '') === normalizedPhone);

    if (!customer) {
      customer = {
        id: makeId('cus'),
        name: booking.customerName,
        phone: booking.customerPhone,
        email: booking.customerEmail || '',
        notes: '',
        totalRentals: 0,
        lifetimeSpend: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.customers.unshift(customer);
    }

    customer.totalRentals += 1;
    customer.lifetimeSpend = safeNumber(customer.lifetimeSpend) + safeNumber(booking.rentalPrice);
    customer.updatedAt = nowIso();
  }

  await writeDb(db);
  res.json(db.bookings[idx]);
});

app.listen(PORT, async () => {
  await ensureDbFile();
  console.log(`Saw Rent API running on http://localhost:${PORT}`);
});
