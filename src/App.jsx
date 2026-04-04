import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const durationOptions = [
  { label: '2 hours', value: 'twoHours' },
  { label: '4 hours', value: 'fourHours' },
  { label: '1 day', value: 'day' },
  { label: 'Weekend', value: 'weekend' },
  { label: '1 week', value: 'week' },
];

const statusOptions = ['requested', 'approved', 'checked_out', 'returned', 'closed', 'cancelled'];

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString() : '-');

function PublicView() {
  const [settings, setSettings] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ inventoryId: '', customerName: '', customerPhone: '', customerEmail: '', startDate: '', endDate: '', duration: 'day', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextSettings, nextInventory] = await Promise.all([api.getPublicSettings(), api.getPublicInventory()]);
      setSettings(nextSettings);
      setInventory(nextInventory);
      if (!form.inventoryId && nextInventory[0]) setForm((prev) => ({ ...prev, inventoryId: nextInventory[0].id }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [form.inventoryId]);

  useEffect(() => { load(); }, [load]);

  const selectedItem = useMemo(() => inventory.find((item) => item.id === form.inventoryId), [inventory, form.inventoryId]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await api.requestBooking(form);
      setMessage('Booking request submitted. We will confirm by phone shortly.');
      setForm((prev) => ({ ...prev, customerName: '', customerPhone: '', customerEmail: '', notes: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="container">Loading…</div>;

  return (
    <div className="container">
      <header className="hero">
        <h1>{settings?.businessName || 'Saw Rent'}</h1>
        <p>{settings?.headline}</p>
        <p>{settings?.about}</p>
        <div className="card-grid meta">
          <div><strong>Call:</strong> {settings?.phone}</div>
          <div><strong>Email:</strong> {settings?.email}</div>
          <div><strong>Address:</strong> {settings?.address}</div>
          <div><strong>Hours:</strong> {settings?.hours}</div>
        </div>
      </header>

      <section>
        <h2>Available Equipment</h2>
        {inventory.length === 0 ? <p className="empty">No equipment available yet.</p> : (
          <div className="card-grid">
            {inventory.map((item) => (
              <article className="card" key={item.id}>
                <h3>{item.name}</h3>
                <p>{item.category} • {item.barSize} • {item.fuel}</p>
                <p>Status: <span className={`badge ${item.state}`}>{item.state}</span></p>
                <p>Day rate: {formatMoney(item.pricing?.day)} | Deposit: {formatMoney(item.deposit)}</p>
                <p>{item.notes}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Request a Booking</h2>
        <form onSubmit={submit} className="panel">
          <div className="form-grid">
            <label>Equipment
              <select value={form.inventoryId} onChange={(e) => setForm((prev) => ({ ...prev, inventoryId: e.target.value }))} required>
                {inventory.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Duration
              <select value={form.duration} onChange={(e) => setForm((prev) => ({ ...prev, duration: e.target.value }))}>
                {durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>Start date<input type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} required /></label>
            <label>End date<input type="date" value={form.endDate} onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))} required /></label>
            <label>Name<input value={form.customerName} onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))} required /></label>
            <label>Phone<input value={form.customerPhone} onChange={(e) => setForm((prev) => ({ ...prev, customerPhone: e.target.value }))} required /></label>
            <label>Email<input type="email" value={form.customerEmail} onChange={(e) => setForm((prev) => ({ ...prev, customerEmail: e.target.value }))} /></label>
          </div>
          <label>Job details<textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={3} /></label>
          {selectedItem ? <p className="hint">Estimated rent {formatMoney(selectedItem.pricing?.[form.duration])}, refundable deposit {formatMoney(selectedItem.deposit)}.</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="success">{message}</p> : null}
          <button disabled={submitting}>{submitting ? 'Submitting…' : 'Submit booking request'}</button>
        </form>
      </section>
    </div>
  );
}

function InventoryTab({ db, reload }) {
  const [draft, setDraft] = useState({ name: '', category: '', barSize: '', fuel: '', deposit: 0, day: 0, notes: '' });

  const create = async (event) => {
    event.preventDefault();
    await api.createInventory({
      name: draft.name,
      category: draft.category,
      barSize: draft.barSize,
      fuel: draft.fuel,
      deposit: Number(draft.deposit),
      notes: draft.notes,
      pricing: { day: Number(draft.day), twoHours: Number(draft.day) * 0.5, fourHours: Number(draft.day) * 0.7, weekend: Number(draft.day) * 1.6, week: Number(draft.day) * 3.3 },
    });
    setDraft({ name: '', category: '', barSize: '', fuel: '', deposit: 0, day: 0, notes: '' });
    await reload();
  };

  return (
    <section className="panel">
      <h2>Inventory</h2>
      <form onSubmit={create} className="form-grid">
        <label>Name<input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} required /></label>
        <label>Category<input value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))} /></label>
        <label>Bar Size<input value={draft.barSize} onChange={(e) => setDraft((prev) => ({ ...prev, barSize: e.target.value }))} /></label>
        <label>Fuel<input value={draft.fuel} onChange={(e) => setDraft((prev) => ({ ...prev, fuel: e.target.value }))} /></label>
        <label>Day Rate<input type="number" value={draft.day} onChange={(e) => setDraft((prev) => ({ ...prev, day: e.target.value }))} /></label>
        <label>Deposit<input type="number" value={draft.deposit} onChange={(e) => setDraft((prev) => ({ ...prev, deposit: e.target.value }))} /></label>
        <label className="full">Notes<textarea rows={2} value={draft.notes} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} /></label>
        <button className="full">Add equipment</button>
      </form>

      <div className="card-grid">
        {db.inventory.map((item) => (
          <div className="card" key={item.id}>
            <strong>{item.name}</strong>
            <p>{item.category}</p>
            <p>Status: <span className={`badge ${item.state}`}>{item.state}</span></p>
            <p>{formatMoney(item.pricing?.day)} / day</p>
            <button onClick={async () => { await api.updateInventory(item.id, { maintenanceLock: !item.maintenanceLock, condition: item.maintenanceLock ? 'ready' : 'maintenance' }); await reload(); }}>
              {item.maintenanceLock ? 'Release from maintenance' : 'Lock for maintenance'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsTab({ settings, reload }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => { setDraft(settings); }, [settings]);

  const save = async (event) => {
    event.preventDefault();
    await api.updateSettings(draft);
    await reload();
  };

  return (
    <section className="panel">
      <h2>Business Settings</h2>
      <form onSubmit={save} className="form-grid">
        <label>Business Name<input value={draft.businessName || ''} onChange={(e) => setDraft((prev) => ({ ...prev, businessName: e.target.value }))} /></label>
        <label>Phone<input value={draft.phone || ''} onChange={(e) => setDraft((prev) => ({ ...prev, phone: e.target.value }))} /></label>
        <label>Email<input value={draft.email || ''} onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))} /></label>
        <label>Hours<input value={draft.hours || ''} onChange={(e) => setDraft((prev) => ({ ...prev, hours: e.target.value }))} /></label>
        <label className="full">Address<input value={draft.address || ''} onChange={(e) => setDraft((prev) => ({ ...prev, address: e.target.value }))} /></label>
        <label className="full">Headline<input value={draft.headline || ''} onChange={(e) => setDraft((prev) => ({ ...prev, headline: e.target.value }))} /></label>
        <label className="full">About<textarea rows={4} value={draft.about || ''} onChange={(e) => setDraft((prev) => ({ ...prev, about: e.target.value }))} /></label>
        <button className="full">Save settings</button>
      </form>
    </section>
  );
}

function AdminView() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('inventory');
  const [db, setDb] = useState({ inventory: [], bookings: [], customers: [], settings: {} });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminBootstrap();
      setDb(data);
      setAuthed(true);
      setError('');
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const login = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.adminLogin(password);
      setPassword('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="container">Loading admin…</div>;

  if (!authed) {
    return (
      <div className="container narrow">
        <h1>Owner Login</h1>
        <form className="panel" onSubmit={login}>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error ? <p className="error">{error}</p> : null}
          <button>Sign in</button>
        </form>
      </div>
    );
  }

  const updateBooking = async (bookingId, status) => {
    await api.updateBookingStatus(bookingId, status);
    await load();
  };

  return (
    <div className="container">
      <div className="admin-topbar">
        <h1>Admin Console</h1>
        <button onClick={async () => { await api.adminLogout(); setAuthed(false); }}>Logout</button>
      </div>
      <div className="tabs">
        {['inventory', 'bookings', 'customers', 'settings'].map((value) => (
          <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>
        ))}
      </div>

      {tab === 'inventory' && <InventoryTab db={db} reload={load} />}
      {tab === 'bookings' && (
        <section className="panel">
          <h2>Bookings Lifecycle</h2>
          {db.bookings.length === 0 ? <p className="empty">No bookings yet.</p> : db.bookings.map((booking) => (
            <div key={booking.id} className="row">
              <div>
                <strong>{booking.customerName}</strong> — {booking.status}<br />
                {formatDate(booking.startDate)} to {formatDate(booking.endDate)} · {formatMoney(booking.rentalPrice)}
              </div>
              <select value={booking.status} onChange={(e) => updateBooking(booking.id, e.target.value)}>
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          ))}
        </section>
      )}
      {tab === 'customers' && (
        <section className="panel">
          <h2>Customers</h2>
          {db.customers.length === 0 ? <p className="empty">No customer records yet.</p> : db.customers.map((customer) => (
            <div key={customer.id} className="row">
              <div>
                <strong>{customer.name}</strong> ({customer.phone})<br />
                Rentals: {customer.totalRentals || 0} · Lifetime spend: {formatMoney(customer.lifetimeSpend)}
              </div>
            </div>
          ))}
        </section>
      )}
      {tab === 'settings' && <SettingsTab settings={db.settings} reload={load} />}
    </div>
  );
}

export default function App() {
  return window.location.pathname.startsWith('/admin') ? <AdminView /> : <PublicView />;
}
