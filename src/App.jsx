import React, { useEffect, useMemo, useState } from "react"

const STORAGE_KEY = "saw-rent-v2"
const DEFAULT_PIN = "1234"

const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => {
const d = new Date();
d.setDate(d.getDate() + 1);
return d.toISOString().slice(0, 10);
};

function createSeedData() {
const saws = [
{
id: uid("saw"),
name: "Husqvarna 51",
category: "Mid-Size",
barSize: '18"',
fuel: "50:1 Mix",
deposit: 175,
rate2h: 25,
rate4h: 35,
rateDay: 55,
weekend: 90,
week: 180,
status: "Available",
condition: "Ready",
notes: "Solid general-use rental saw.",
},
{
id: uid("saw"),
name: "Husqvarna 350",
category: "Mid-Size",
barSize: '18"',
fuel: "50:1 Mix",
deposit: 175,
rate2h: 25,
rate4h: 35,
rateDay: 55,
weekend: 90,
week: 180,
status: "Available",
condition: "Ready",
notes: "Fast-moving everyday rental option.",
},
{
id: uid("saw"),
name: "Husqvarna 141",
category: "Light Duty",
barSize: '16"',
fuel: "50:1 Mix",
deposit: 125,
rate2h: 20,
rate4h: 30,
rateDay: 45,
weekend: 75,
week: 150,
status: "Available",
condition: "Ready",
notes: "Best for lighter cutting jobs.",
},
{
id: uid("saw"),
name: "Husqvarna 23 Compact",
category: "Compact",
barSize: '14"',
fuel: "50:1 Mix",
deposit: 100,
rate2h: 20,
rate4h: 25,
rateDay: 40,
weekend: 70,
week: 135,
status: "Available",
condition: "Ready",
notes: "Compact saw for smaller jobs.",
},
{
id: uid("saw"),
name: "McCulloch Pro Mac 610",
category: "Large / Vintage",
barSize: '20"',
fuel: "50:1 Mix",
deposit: 225,
rate2h: 35,
rate4h: 45,
rateDay: 70,
weekend: 115,
week: 230,
status: "Available",
condition: "Ready",
notes: "Heavier saw. Better for larger cuts and experienced users.",
},
{
id: uid("saw"),
name: "Poulan Wild Thing",
category: "Budget",
barSize: '18"',
fuel: "50:1 Mix",
deposit: 100,
rate2h: 20,
rate4h: 30,
rateDay: 45,
weekend: 75,
week: 150,
status: "Available",
condition: "Ready",
notes: "Budget rental option for light to medium work.",
},
];

return {
settings: {
businessName: "Saw Rent",
phone: "219-851-9675",
location: "136 Grand Ave, La Porte, IN 46350",
requestModeOnly: true,
adminPin: DEFAULT_PIN,
},
saws,
customers: [
{
id: uid("cust"),
name: "Mike Dawson",
phone: "(219) 555-0188",
notes: "Repeat renter",
rentals: 2,
totalSpent: 130,
},
],
bookings: [
{
id: uid("book"),
sawId: saws[1].id,
sawName: saws[1].name,
customerId: null,
customerName: "John Carter",
phone: "(219) 555-0142",
channel: "App Request",
startDate: tomorrow(),
endDate: tomorrow(),
duration: "1 day",
rentalPrice: saws[1].rateDay,
deposit: saws[1].deposit,
status: "Pending",
notes: "Storm cleanup request.",
createdAt: new Date().toISOString(),
},
],
maintenance: [
{
id: uid("mnt"),
sawId: saws[4].id,
sawName: saws[4].name,
issue: "Inspect chain brake before next rental",
priority: "High",
status: "Open",
lastService: today(),
notes: "Do not release until checked.",
},
],
};
}

function loadState() {
try {
const raw = localStorage.getItem(STORAGE_KEY);
if (!raw) return createSeedData();
const parsed = JSON.parse(raw);
return parsed;
} catch {
return createSeedData();
}
}

function saveState(state) {
localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getDurationPrice(saw, duration) {
if (!saw) return 0;
if (duration === "2 hours") return Number(saw.rate2h);
if (duration === "4 hours") return Number(saw.rate4h);
if (duration === "Weekend") return Number(saw.weekend);
if (duration === "1 week") return Number(saw.week);
return Number(saw.rateDay);
}

function getQuickPrice(saw, durationKey) {
if (!saw) return 0;
if (durationKey === "2h") return Number(saw.rate2h);
if (durationKey === "4h") return Number(saw.rate4h);
if (durationKey === "weekend") return Number(saw.weekend);
if (durationKey === "week") return Number(saw.week);
return Number(saw.rateDay);
}

function getStatusClass(status) {
if (status === "Available" || status === "Done") return "badge green"
if (status === "Pending" || status === "Scheduled") return "badge amber"
if (status === "Out") return "badge blue"
if (status === "Approved" || status === "Returned") return "badge slate"
if (status === "Maintenance" || status === "Open" || status === "Declined") return "badge red"
return "badge slate"
}

function hasBlockingBooking(bookings, sawId, excludeBookingId = null) {
return bookings.some(
(booking) =>
booking.sawId === sawId &&
booking.id !== excludeBookingId &&
["Pending", "Approved", "Out"].includes(booking.status)
);
}

function updateOrCreateCustomer(customers, name, phone, notes, rentalIncrease = 0, spendIncrease = 0) {
const normalizedName = name.trim().toLowerCase();
const index = customers.findIndex(
(customer) => customer.phone === phone || customer.name.trim().toLowerCase() === normalizedName
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
id: uid("cust"),
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

export default function SawRentApp() {
const [app, setApp] = useState(createSeedData());
const [booted, setBooted] = useState(false);
const [adminOpen, setAdminOpen] = useState(false);
const [adminUnlocked, setAdminUnlocked] = useState(false);
const [pin, setPin] = useState("");
const [publicSearch, setPublicSearch] = useState("");
const [inventorySearch, setInventorySearch] = useState("");
const [inventoryFilter, setInventoryFilter] = useState("all");
const [bookingFilter, setBookingFilter] = useState("all");
const [selectedDuration, setSelectedDuration] = useState("day");
const [selectedSawId, setSelectedSawId] = useState("");
const [adminTab, setAdminTab] = useState("overview");
const [publicRequest, setPublicRequest] = useState({
name: "",
phone: "",
sawId: "",
startDate: tomorrow(),
duration: "1 day",
notes: "",
});
const [newSaw, setNewSaw] = useState({
name: "",
category: "Homeowner",
barSize: '18"',
fuel: "50:1 Mix",
deposit: 150,
rate2h: 25,
rate4h: 35,
rateDay: 55,
weekend: 90,
week: 180,
condition: "Ready",
notes: "",
});
const [newBooking, setNewBooking] = useState({
customerName: "",
phone: "",
channel: "Phone",
sawId: "",
startDate: today(),
endDate: tomorrow(),
duration: "1 day",
notes: "",
});
const [maintenanceDraft, setMaintenanceDraft] = useState({
sawId: "",
issue: "",
priority: "Medium",
notes: "",
});

useEffect(() => {
const state = loadState();
setApp(state);
setSelectedSawId(state.saws[0]?.id || "");
setPublicRequest((prev) => ({ ...prev, sawId: state.saws[0]?.id || "" }));
setNewBooking((prev) => ({ ...prev, sawId: state.saws[0]?.id || "" }));
setMaintenanceDraft((prev) => ({ ...prev, sawId: state.saws[0]?.id || "" }));
setBooted(true);
}, []);

useEffect(() => {
if (!booted) return;
saveState(app);
}, [app, booted]);

const availablePublicSaws = useMemo(() => {
const q = publicSearch.trim().toLowerCase();
return app.saws.filter((saw) => {
const matchesStatus = saw.status === "Available"
const matchesSearch =
!q ||
[saw.name, saw.category, saw.barSize, saw.condition, saw.notes]
.join(" ")
.toLowerCase()
.includes(q);
return matchesStatus && matchesSearch;
});
}, [app.saws, publicSearch]);

const filteredInventory = useMemo(() => {
const q = inventorySearch.trim().toLowerCase();
return app.saws.filter((saw) => {
const matchesText =
!q ||
[saw.name, saw.category, saw.barSize, saw.status, saw.condition, saw.notes]
.join(" ")
.toLowerCase()
.includes(q);
const matchesFilter = inventoryFilter === "all" || saw.status === inventoryFilter;
return matchesText && matchesFilter;
});
}, [app.saws, inventorySearch, inventoryFilter]);

const filteredBookings = useMemo(() => {
return app.bookings.filter((booking) => bookingFilter === "all" || booking.status === bookingFilter);
}, [app.bookings, bookingFilter]);

const quickQuoteSaw = useMemo(() => {
return app.saws.find((saw) => saw.id === selectedSawId) || app.saws[0] || null;
}, [app.saws, selectedSawId]);

const stats = useMemo(() => {
const available = app.saws.filter((saw) => saw.status === "Available").length;
const pending = app.bookings.filter((booking) => booking.status === "Pending").length;
const out = app.bookings.filter((booking) => booking.status === "Out").length;
const maintenanceOpen = app.maintenance.filter((item) => item.status !== "Done").length;
const depositsHeld = app.bookings
.filter((booking) => ["Pending", "Approved", "Out"].includes(booking.status))
.reduce((sum, booking) => sum + Number(booking.deposit || 0), 0);
return { available, pending, out, maintenanceOpen, depositsHeld };
}, [app]);

function resetAllData() {
const fresh = createSeedData();
setApp(fresh);
setSelectedSawId(fresh.saws[0]?.id || "");
setPublicRequest({ name: "", phone: "", sawId: fresh.saws[0]?.id || "", startDate: tomorrow(), duration: "1 day", notes: "" });
setNewBooking({ customerName: "", phone: "", channel: "Phone", sawId: fresh.saws[0]?.id || "", startDate: today(), endDate: tomorrow(), duration: "1 day", notes: "" });
setMaintenanceDraft({ sawId: fresh.saws[0]?.id || "", issue: "", priority: "Medium", notes: "" });
localStorage.removeItem(STORAGE_KEY);
}

function handleAdminUnlock() {
if (pin === app.settings.adminPin) {
setAdminUnlocked(true);
return;
}
window.alert("Wrong PIN.");
}

function handleAdminLock() {
setAdminUnlocked(false);
setAdminOpen(false);
setPin("");
setAdminTab("overview");
}

function submitPublicRequest(e) {
e.preventDefault();
const saw = app.saws.find((item) => item.id === publicRequest.sawId);
if (!saw) {
window.alert("Choose a saw first.");
return;
}
if (saw.status !== "Available") {
window.alert("That saw is no longer available.");
return;
}

setApp((prev) => {
const customerResult = updateOrCreateCustomer(
prev.customers,
publicRequest.name.trim(),
publicRequest.phone.trim(),
publicRequest.notes.trim(),
0,
0
);

const booking = {
id: uid("book"),
sawId: saw.id,
sawName: saw.name,
customerId: customerResult.customerId,
customerName: publicRequest.name.trim(),
phone: publicRequest.phone.trim(),
channel: "App Request",
startDate: publicRequest.startDate,
endDate: publicRequest.startDate,
duration: publicRequest.duration,
rentalPrice: getDurationPrice(saw, publicRequest.duration),
deposit: saw.deposit,
status: "Pending",
notes: publicRequest.notes.trim(),
createdAt: new Date().toISOString(),
};

return {
...prev,
customers: customerResult.customers,
bookings: [booking, ...prev.bookings],
saws: prev.saws.map((item) =>
item.id === saw.id ? { ...item, status: "Out" } : item
),
};
});

setPublicRequest({
name: "",
phone: "",
sawId: app.saws[0]?.id || "",
startDate: tomorrow(),
duration: "1 day",
notes: "",
});
window.alert("Request submitted. Review it in Bookings.");
}

function addSaw(e) {
e.preventDefault();
if (!newSaw.name.trim()) {
window.alert("Saw name is required.");
return;
}

const saw = {
id: uid("saw"),
name: newSaw.name.trim(),
category: newSaw.category.trim(),
barSize: newSaw.barSize.trim(),
fuel: newSaw.fuel.trim(),
deposit: Number(newSaw.deposit),
rate2h: Number(newSaw.rate2h),
rate4h: Number(newSaw.rate4h),
rateDay: Number(newSaw.rateDay),
weekend: Number(newSaw.weekend),
week: Number(newSaw.week),
status: "Available",
condition: newSaw.condition.trim(),
notes: newSaw.notes.trim(),
};

setApp((prev) => ({
...prev,
saws: [saw, ...prev.saws],
}));

setNewSaw({
name: "",
category: "Homeowner",
barSize: '18"',
fuel: "50:1 Mix",
deposit: 150,
rate2h: 25,
rate4h: 35,
rateDay: 55,
weekend: 90,
week: 180,
condition: "Ready",
notes: "",
});
}

function createManualBooking(e) {
e.preventDefault();
const saw = app.saws.find((item) => item.id === newBooking.sawId);
if (!saw) {
window.alert("Choose a saw first.");
return;
}
if (saw.status !== "Available") {
window.alert("That saw is not available.");
return;
}
if (!newBooking.customerName.trim() || !newBooking.phone.trim()) {
window.alert("Customer name and phone are required.");
return;
}

setApp((prev) => {
const customerResult = updateOrCreateCustomer(
prev.customers,
newBooking.customerName.trim(),
newBooking.phone.trim(),
newBooking.notes.trim(),
1,
getDurationPrice(saw, newBooking.duration)
);

const booking = {
id: uid("book"),
sawId: saw.id,
sawName: saw.name,
customerId: customerResult.customerId,
customerName: newBooking.customerName.trim(),
phone: newBooking.phone.trim(),
channel: newBooking.channel,
startDate: newBooking.startDate,
endDate: newBooking.endDate,
duration: newBooking.duration,
rentalPrice: getDurationPrice(saw, newBooking.duration),
deposit: saw.deposit,
status: "Out",
notes: newBooking.notes.trim(),
createdAt: new Date().toISOString(),
};

return {
...prev,
customers: customerResult.customers,
bookings: [booking, ...prev.bookings],
saws: prev.saws.map((item) =>
item.id === saw.id ? { ...item, status: "Out" } : item
),
};
});

setNewBooking({
customerName: "",
phone: "",
channel: "Phone",
sawId: app.saws[0]?.id || "",
startDate: today(),
endDate: tomorrow(),
duration: "1 day",
notes: "",
});
}

function setBookingStatus(bookingId, nextStatus) {
setApp((prev) => {
const booking = prev.bookings.find((item) => item.id === bookingId);
if (!booking) return prev;

let customers = prev.customers;
const wasNotBillable = ["Pending", "Declined"].includes(booking.status);
const becomesBillable = ["Approved", "Out", "Returned"].includes(nextStatus);

if (wasNotBillable && becomesBillable) {
customers = prev.customers.map((customer) =>
customer.id === booking.customerId
? {
...customer,
rentals: Number(customer.rentals || 0) + 1,
totalSpent: Number(customer.totalSpent || 0) + Number(booking.rentalPrice || 0),
}
: customer
);
}

const bookings = prev.bookings.map((item) =>
item.id === bookingId ? { ...item, status: nextStatus } : item
);

const shouldFreeSaw = !hasBlockingBooking(bookings, booking.sawId, bookingId) && ["Returned", "Declined"].includes(nextStatus);
const shouldBlockSaw = ["Pending", "Approved", "Out"].includes(nextStatus);

const saws = prev.saws.map((saw) => {
if (saw.id !== booking.sawId) return saw;
if (saw.status === "Maintenance" && shouldFreeSaw) return saw;
if (shouldBlockSaw) return { ...saw, status: "Out" };
if (shouldFreeSaw) return { ...saw, status: "Available" };
return saw;
});

return { ...prev, customers, bookings, saws };
});
}

function addMaintenanceItem(e) {
e.preventDefault();
const saw = app.saws.find((item) => item.id === maintenanceDraft.sawId);
if (!saw) {
window.alert("Choose a saw first.");
return;
}
if (!maintenanceDraft.issue.trim()) {
window.alert("Maintenance issue is required.");
return;
}

const item = {
id: uid("mnt"),
sawId: saw.id,
sawName: saw.name,
issue: maintenanceDraft.issue.trim(),
priority: maintenanceDraft.priority,
status: "Open",
lastService: today(),
notes: maintenanceDraft.notes.trim(),
};

setApp((prev) => ({
...prev,
maintenance: [item, ...prev.maintenance],
saws: prev.saws.map((entry) =>
entry.id === saw.id
? { ...entry, status: "Maintenance", condition: maintenanceDraft.issue.trim() }
: entry
),
}));

setMaintenanceDraft({ sawId: app.saws[0]?.id || "", issue: "", priority: "Medium", notes: "" });
}

function markMaintenanceDone(id) {
setApp((prev) => {
const item = prev.maintenance.find((entry) => entry.id === id);
if (!item) return prev;

const sawStillBooked = hasBlockingBooking(prev.bookings, item.sawId, null);

return {
...prev,
maintenance: prev.maintenance.map((entry) =>
entry.id === id ? { ...entry, status: "Done" } : entry
),
saws: prev.saws.map((saw) =>
saw.id === item.sawId
? { ...saw, status: sawStillBooked ? "Out" : "Available", condition: "Ready" }
: saw
),
};
});
}

function updateSetting(field, value) {
setApp((prev) => ({
...prev,
settings: {
...prev.settings,
[field]: value,
},
}));
}

if (!booted) {
return <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>Loading...</div>
}

const sidebarItems = [
{ key: "overview", label: "Overview", icon: "📊" },
{ key: "inventory", label: "Inventory", icon: "🪚" },
{ key: "bookings", label: "Bookings", icon: "📋" },
{ key: "customers", label: "Customers", icon: "👤" },
{ key: "maintenance", label: "Maintenance", icon: "🛠️" },
{ key: "settings", label: "Settings", icon: "⚙️" },
];

return (
<div className="app-shell">
<style>{`
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f1f5f9; color: #0f172a; }
.app-shell { min-height: 100vh; background: #f1f5f9; color: #0f172a; }
.page-wrap { max-width: 1600px; margin: 0 auto; padding: 24px; }
.hero-grid { display: grid; grid-template-columns: 1.05fr 1.35fr; gap: 24px; }
.card { background: #fff; border-radius: 24px; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08); overflow: hidden; }
.card-soft { background: #fff; border-radius: 18px; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06); }
.hero-top { background: linear-gradient(90deg, #0f172a 0%, #1e293b 50%, #0f172a 100%); color: #fff; padding: 32px; }
.hero-bottom { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 24px 32px; }
.mini-panel { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 16px; }
.hero-badges { display: flex; gap: 12px; flex-wrap: wrap; }
.badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 700; }
.badge.green { background: #16a34a; color: #fff; }
.badge.amber { background: #f59e0b; color: #fff; }
.badge.blue { background: #0284c7; color: #fff; }
.badge.red { background: #dc2626; color: #fff; }
.badge.slate { background: #e2e8f0; color: #334155; }
.badge.dark { background: rgba(255,255,255,0.1); color: #fff; }
.btn { border: none; cursor: pointer; border-radius: 14px; padding: 12px 16px; font-weight: 700; transition: 0.18s ease; }
.btn:hover { transform: translateY(-1px); }
.btn-primary { background: #0284c7; color: #fff; }
.btn-primary:hover { background: #0369a1; }
.btn-outline { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }
.btn-outline-dark { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.2); }
.btn-success { background: #16a34a; color: #fff; }
.btn-danger { background: #dc2626; color: #fff; }
.btn-sm { padding: 10px 12px; border-radius: 12px; font-size: 13px; }
.stats-col { display: grid; gap: 16px; }
.kpi { display: grid; grid-template-columns: 1fr 80px; background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06); }
.kpi-main { padding: 20px; }
.kpi-side { display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px; font-weight: 800; }
.kpi-green { background: #16a34a; }
.kpi-amber { background: #f59e0b; }
.kpi-blue { background: #0284c7; }
.kpi-violet { background: #7c3aed; }
.kpi-rose { background: #e11d48; }
.section-grid { display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 24px; margin-top: 24px; }
.section-pad { padding: 24px; }
.field { display: grid; gap: 8px; }
.field label { font-size: 13px; font-weight: 700; color: #334155; }
.input, .select, .textarea { width: 100%; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; border-radius: 14px; padding: 12px 14px; font-size: 14px; }
.textarea { min-height: 96px; resize: vertical; }
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.saw-list { display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); }
.saw-tile { border: 1px solid #e2e8f0; border-radius: 18px; padding: 20px; background: #fff; }
.saw-meta { color: #64748b; font-size: 13px; }
.table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 18px; background: #fff; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 14px 16px; border-top: 1px solid #e2e8f0; vertical-align: top; }
thead th { border-top: none; background: #f8fafc; color: #475569; font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em; }
.admin-shell { display: grid; min-height: 920px; grid-template-columns: 250px 1fr; }
.sidebar { background: #0f172a; color: #e2e8f0; display: flex; flex-direction: column; }
.sidebar-top { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.brand-row { display: flex; align-items: center; gap: 12px; }
.brand-icon { width: 42px; height: 42px; border-radius: 14px; background: #0284c7; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.nav-block { padding: 16px; }
.nav-label { background: rgba(255,255,255,0.05); color: #94a3b8; border-radius: 16px; padding: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.nav-list { display: grid; gap: 6px; margin-top: 12px; }
.nav-btn { width: 100%; text-align: left; border: none; cursor: pointer; background: transparent; color: #cbd5e1; padding: 12px 14px; border-radius: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
.nav-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.nav-btn.active { background: #0284c7; color: #fff; }
.sidebar-footer { margin-top: auto; padding: 16px; }
.sidebar-card { background: rgba(255,255,255,0.05); border-radius: 18px; padding: 16px; }
.main-area { background: #f1f5f9; }
.topbar { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 18px 20px; display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.content-pad { padding: 20px; display: grid; gap: 20px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.booking-card { border: 1px solid #e2e8f0; border-radius: 18px; background: #fff; padding: 20px; display: grid; gap: 16px; }
.summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; min-width: 260px; }
.summary-box { background: #f8fafc; border-radius: 14px; padding: 12px; }
.muted { color: #64748b; }
.locked { min-height: 780px; display: grid; place-items: center; padding: 32px; text-align: center; }
.locked-box { max-width: 420px; }
.login-box { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 24px; padding: 32px; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08); }
.info-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.search-icon-wrap { position: relative; }
.search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
.search-pad { padding-left: 34px; }
@media (max-width: 1200px) {
.hero-grid, .section-grid { grid-template-columns: 1fr; }
.admin-shell { grid-template-columns: 1fr; }
.sidebar { min-height: auto; }
}
@media (max-width: 900px) {
.hero-bottom, .grid-2, .grid-3, .saw-list { grid-template-columns: 1fr; }
.summary-grid { grid-template-columns: 1fr; min-width: 0; }
}
`}</style>

<div className="page-wrap">
<div className="hero-grid">
<div className="card">
<div className="hero-top">
<div className="hero-badges">
<span className="badge blue">{app.settings.businessName}</span>
<span className="badge dark">Admin Dashboard</span>
</div>
<h1 style={{ margin: "16px 0 0", fontSize: 44, lineHeight: 1.05 }}>Run Saw Rent like a real rental desk.</h1>
<p style={{ marginTop: 14, maxWidth: 840, color: "#cbd5e1", lineHeight: 1.6 }}>
Upgraded to an AdminLTE-style layout with a dark ops sidebar, cleaner admin tables, stronger KPI blocks,
tighter booking controls, and fixed business logic.
</p>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
<button className="btn btn-primary" onClick={() => setAdminOpen(true)}>Admin Login</button>
<button className="btn btn-outline-dark" onClick={() => window.alert(`${app.settings.businessName}\n${app.settings.phone}\n${app.settings.location}`)}>Business Contact</button>
</div>
</div>
<div className="hero-bottom">
<div className="mini-panel">
<div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Booking Mode</div>
<div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>Option A</div>
<div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Request-to-book stays on.</div>
</div>
<div className="mini-panel">
<div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Channels</div>
<div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>4</div>
<div className="muted" style={{ marginTop: 6, fontSize: 14 }}>App, call, text, walk-in.</div>
</div>
<div className="mini-panel">
<div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Shop</div>
<div style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>La Porte, IN</div>
<div className="muted" style={{ marginTop: 6, fontSize: 14 }}>136 Grand Ave.</div>
</div>
</div>
</div>

<div className="stats-col">
<div className="kpi">
<div className="kpi-main">
<div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Available Saws</div>
<div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{stats.available}</div>
<div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Ready to rent</div>
</div>
<div className="kpi-side kpi-green">🪚</div>
</div>
<div className="kpi">
<div className="kpi-main">
<div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Pending Requests</div>
<div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{stats.pending}</div>
<div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Need approval</div>
</div>
<div className="kpi-side kpi-amber">📋</div>
</div>
<div className="kpi">
<div className="kpi-main">
<div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Deposits Held</div>
<div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{money(stats.depositsHeld)}</div>
<div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Pending and active rentals</div>
</div>
<div className="kpi-side kpi-blue">💵</div>
</div>
<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontWeight: 800 }}>Quick Quote Panel</div>
<div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Use this for calls, texts, and walk-ins.</div>
<div className="field" style={{ marginTop: 16 }}>
<label>Saw</label>
<select className="select" value={selectedSawId} onChange={(e) => setSelectedSawId(e.target.value)}>
{app.saws.map((saw) => (
<option key={saw.id} value={saw.id}>{saw.name}</option>
))}
</select>
</div>
<div className="field" style={{ marginTop: 16 }}>
<label>Duration</label>
<select className="select" value={selectedDuration} onChange={(e) => setSelectedDuration(e.target.value)}>
<option value="2h">2 hours</option>
<option value="4h">4 hours</option>
<option value="day">1 day</option>
<option value="weekend">Weekend</option>
<option value="week">1 week</option>
</select>
</div>
<div className="mini-panel" style={{ marginTop: 16 }}>
<div className="info-row"><span className="muted">Rental</span><strong>{money(getQuickPrice(quickQuoteSaw, selectedDuration))}</strong></div>
<div className="info-row" style={{ marginTop: 8 }}><span className="muted">Deposit</span><strong>{money(quickQuoteSaw?.deposit)}</strong></div>
<div className="info-row" style={{ marginTop: 8 }}><span className="muted">Fuel</span><strong>{quickQuoteSaw?.fuel || "-"}</strong></div>
<div className="info-row" style={{ marginTop: 8 }}><span className="muted">Status</span><span className={getStatusClass(quickQuoteSaw?.status)}>{quickQuoteSaw?.status || "-"}</span></div>
</div>
</div>
</div>
</div>

<div className="section-grid">
<div className="card section-pad">
<div style={{ fontSize: 24, fontWeight: 900 }}>Customer Booking Page</div>
<div className="muted" style={{ marginTop: 6 }}>Public side. Clean, simple, request-to-book only.</div>

<div className="search-icon-wrap" style={{ marginTop: 18 }}>
<span className="search-icon">🔎</span>
<input className="input search-pad" value={publicSearch} onChange={(e) => setPublicSearch(e.target.value)} placeholder="Search available saws..." />
</div>

<div className="saw-list" style={{ marginTop: 18 }}>
{availablePublicSaws.map((saw) => (
<div key={saw.id} className="saw-tile">
<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
<div>
<div style={{ fontSize: 20, fontWeight: 900 }}>{saw.name}</div>
<div className="saw-meta">{saw.category} · {saw.barSize}</div>
</div>
<span className={getStatusClass(saw.status)}>{saw.status}</span>
</div>
<div className="grid-2" style={{ marginTop: 16 }}>
<div className="mini-panel">
<div className="muted" style={{ fontSize: 13 }}>1 day</div>
<div style={{ fontWeight: 900, marginTop: 6 }}>{money(saw.rateDay)}</div>
</div>
<div className="mini-panel">
<div className="muted" style={{ fontSize: 13 }}>Deposit</div>
<div style={{ fontWeight: 900, marginTop: 6 }}>{money(saw.deposit)}</div>
</div>
</div>
<div className="muted" style={{ marginTop: 14, fontSize: 14 }}>Fuel: {saw.fuel}</div>
<div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Condition: {saw.condition}</div>
</div>
))}
</div>

<form onSubmit={submitPublicRequest} className="mini-panel" style={{ marginTop: 18 }}>
<div className="grid-2">
<div className="field">
<label>Name</label>
<input className="input" value={publicRequest.name} onChange={(e) => setPublicRequest((prev) => ({ ...prev, name: e.target.value }))} required />
</div>
<div className="field">
<label>Phone</label>
<input className="input" value={publicRequest.phone} onChange={(e) => setPublicRequest((prev) => ({ ...prev, phone: e.target.value }))} required />
</div>
<div className="field">
<label>Saw</label>
<select className="select" value={publicRequest.sawId} onChange={(e) => setPublicRequest((prev) => ({ ...prev, sawId: e.target.value }))}>
{availablePublicSaws.map((saw) => (
<option key={saw.id} value={saw.id}>{saw.name}</option>
))}
</select>
</div>
<div className="field">
<label>Requested Date</label>
<input type="date" className="input" value={publicRequest.startDate} onChange={(e) => setPublicRequest((prev) => ({ ...prev, startDate: e.target.value }))} required />
</div>
<div className="field">
<label>Duration</label>
<select className="select" value={publicRequest.duration} onChange={(e) => setPublicRequest((prev) => ({ ...prev, duration: e.target.value }))}>
<option value="2 hours">2 hours</option>
<option value="4 hours">4 hours</option>
<option value="1 day">1 day</option>
<option value="Weekend">Weekend</option>
<option value="1 week">1 week</option>
</select>
</div>
<div className="field">
<label>Notes</label>
<textarea className="textarea" value={publicRequest.notes} onChange={(e) => setPublicRequest((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Job notes, wood size, questions..." />
</div>
</div>
<div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}>
<span className="muted" style={{ fontSize: 14 }}>Customers can still call, text, or stop by the shop instead of using this form.</span>
<button type="submit" className="btn btn-primary">Submit Request</button>
</div>
</form>
</div>

<div className="card">
{!adminOpen ? (
<div className="locked">
<div className="locked-box">
<div style={{ width: 64, height: 64, borderRadius: 18, margin: "0 auto", background: "#0f172a", color: "#fff", display: "grid", placeItems: "center", fontSize: 30 }}>📊</div>
<div style={{ fontSize: 34, fontWeight: 900, marginTop: 20 }}>Admin dashboard locked</div>
<div className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>Open the operations side to manage inventory, bookings, customers, deposits, and maintenance.</div>
<button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setAdminOpen(true)}>Open Admin</button>
</div>
</div>
) : !adminUnlocked ? (
<div className="locked">
<div className="login-box">
<div style={{ fontSize: 34, fontWeight: 900 }}>Enter Admin PIN</div>
<div className="muted" style={{ marginTop: 8 }}>Default demo PIN is 1234. Change it after login.</div>
<input type="password" className="input" style={{ marginTop: 18 }} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
<div style={{ display: "flex", gap: 10, marginTop: 14 }}>
<button className="btn btn-primary" onClick={handleAdminUnlock}>Unlock</button>
<button className="btn btn-outline" onClick={() => { setAdminOpen(false); setPin(""); }}>Close</button>
</div>
</div>
</div>
) : (
<div className="admin-shell">
<aside className="sidebar">
<div className="sidebar-top">
<div className="brand-row">
<div className="brand-icon">🪚</div>
<div>
<div style={{ color: "#fff", fontWeight: 900 }}>{app.settings.businessName}</div>
<div style={{ color: "#94a3b8", fontSize: 12 }}>Rental Ops Console</div>
</div>
</div>
</div>
<div className="nav-block">
<div className="nav-label">Main Navigation</div>
<div className="nav-list">
{sidebarItems.map((item) => (
<button key={item.key} className={`nav-btn ${adminTab === item.key ? "active" : ""}`} onClick={() => setAdminTab(item.key)}>
<span>{item.icon}</span>
<span>{item.label}</span>
</button>
))}
</div>
</div>
<div className="sidebar-footer">
<div className="sidebar-card">
<div style={{ color: "#fff", fontWeight: 800 }}>Shop Contact</div>
<div style={{ color: "#cbd5e1", marginTop: 10 }}>{app.settings.phone}</div>
<div style={{ color: "#94a3b8", marginTop: 6 }}>{app.settings.location}</div>
</div>
</div>
</aside>

<main className="main-area">
<div className="topbar">
<div>
<div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Operations Dashboard</div>
<div style={{ fontSize: 32, fontWeight: 900, marginTop: 6 }}>{sidebarItems.find((item) => item.key === adminTab)?.label || "Overview"}</div>
</div>
<div className="actions">
<span className="badge slate">Admin</span>
<span className="badge slate">Request-to-book {app.settings.requestModeOnly ? "On" : "Off"}</span>
<button className="btn btn-outline btn-sm" onClick={handleAdminLock}>Lock</button>
</div>
</div>

<div className="content-pad">
{adminTab === "overview" && (
<>
<div className="grid-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
<div className="kpi">
<div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Saws Out</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{stats.out}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Currently with customers</div></div>
<div className="kpi-side kpi-blue">📦</div>
</div>
<div className="kpi">
<div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Pending</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{stats.pending}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Approval queue</div></div>
<div className="kpi-side kpi-amber">📋</div>
</div>
<div className="kpi">
<div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Customers</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{app.customers.length}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Saved renter records</div></div>
<div className="kpi-side kpi-violet">👤</div>
</div>
<div className="kpi">
<div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Maintenance</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{stats.maintenanceOpen}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Needs attention</div></div>
<div className="kpi-side kpi-rose">🛠️</div>
</div>
</div>

<div className="grid-2" style={{ alignItems: "start" }}>
<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>Recent Bookings</div>
<div className="muted" style={{ marginTop: 6 }}>Fast view of what just came in.</div>
<div className="table-wrap" style={{ marginTop: 16 }}>
<table>
<thead>
<tr>
<th>Customer</th>
<th>Saw</th>
<th>Channel</th>
<th>Status</th>
</tr>
</thead>
<tbody>
{app.bookings.slice(0, 6).map((booking) => (
<tr key={booking.id}>
<td style={{ fontWeight: 700 }}>{booking.customerName}</td>
<td>{booking.sawName}</td>
<td>{booking.channel}</td>
<td><span className={getStatusClass(booking.status)}>{booking.status}</span></td>
</tr>
))}
</tbody>
</table>
</div>
</div>

<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>Quick Manual Booking</div>
<div className="muted" style={{ marginTop: 6 }}>For phone, text, and walk-in customers.</div>
<form onSubmit={createManualBooking} style={{ display: "grid", gap: 12, marginTop: 16 }}>
<input className="input" placeholder="Customer name" value={newBooking.customerName} onChange={(e) => setNewBooking((prev) => ({ ...prev, customerName: e.target.value }))} required />
<input className="input" placeholder="Phone" value={newBooking.phone} onChange={(e) => setNewBooking((prev) => ({ ...prev, phone: e.target.value }))} required />
<div className="grid-2">
<select className="select" value={newBooking.channel} onChange={(e) => setNewBooking((prev) => ({ ...prev, channel: e.target.value }))}>
<option value="Phone">Phone</option>
<option value="Text">Text</option>
<option value="Walk-In">Walk-In</option>
</select>
<select className="select" value={newBooking.sawId} onChange={(e) => setNewBooking((prev) => ({ ...prev, sawId: e.target.value }))}>
{app.saws.filter((saw) => saw.status === "Available").map((saw) => (
<option key={saw.id} value={saw.id}>{saw.name}</option>
))}
</select>
</div>
<div className="grid-2">
<input type="date" className="input" value={newBooking.startDate} onChange={(e) => setNewBooking((prev) => ({ ...prev, startDate: e.target.value }))} />
<input type="date" className="input" value={newBooking.endDate} onChange={(e) => setNewBooking((prev) => ({ ...prev, endDate: e.target.value }))} />
</div>
<select className="select" value={newBooking.duration} onChange={(e) => setNewBooking((prev) => ({ ...prev, duration: e.target.value }))}>
<option value="2 hours">2 hours</option>
<option value="4 hours">4 hours</option>
<option value="1 day">1 day</option>
<option value="Weekend">Weekend</option>
<option value="1 week">1 week</option>
</select>
<textarea className="textarea" placeholder="Notes" value={newBooking.notes} onChange={(e) => setNewBooking((prev) => ({ ...prev, notes: e.target.value }))} />
<button type="submit" className="btn btn-primary">Create Booking</button>
</form>
</div>
</div>
</>
)}

{adminTab === "inventory" && (
<div className="grid-2" style={{ alignItems: "start" }}>
<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>Inventory Manager</div>
<div className="muted" style={{ marginTop: 6 }}>Clean list view with corrected saw status logic.</div>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
<select className="select" style={{ maxWidth: 180 }} value={inventoryFilter} onChange={(e) => setInventoryFilter(e.target.value)}>
<option value="all">All statuses</option>
<option value="Available">Available</option>
<option value="Out">Out</option>
<option value="Maintenance">Maintenance</option>
</select>
<div className="search-icon-wrap" style={{ flex: 1, minWidth: 220 }}>
<span className="search-icon">🔎</span>
<input className="input search-pad" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder="Search inventory..." />
</div>
</div>
<div className="table-wrap" style={{ marginTop: 16 }}>
<table>
<thead>
<tr>
<th>Saw</th>
<th>Category</th>
<th>Rate</th>
<th>Deposit</th>
<th>Status</th>
</tr>
</thead>
<tbody>
{filteredInventory.map((saw) => (
<tr key={saw.id}>
<td>
<div style={{ fontWeight: 800 }}>{saw.name}</div>
<div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{saw.barSize} · {saw.fuel}</div>
<div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{saw.condition}</div>
</td>
<td>{saw.category}</td>
<td style={{ fontWeight: 700 }}>{money(saw.rateDay)}/day</td>
<td>{money(saw.deposit)}</td>
<td><span className={getStatusClass(saw.status)}>{saw.status}</span></td>
</tr>
))}
</tbody>
</table>
</div>
</div>

<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>Add Saw</div>
<div className="muted" style={{ marginTop: 6 }}>Add a new unit to your fleet.</div>
<form onSubmit={addSaw} style={{ display: "grid", gap: 12, marginTop: 16 }}>
<input className="input" placeholder="Saw name" value={newSaw.name} onChange={(e) => setNewSaw((prev) => ({ ...prev, name: e.target.value }))} required />
<div className="grid-2">
<input className="input" placeholder="Category" value={newSaw.category} onChange={(e) => setNewSaw((prev) => ({ ...prev, category: e.target.value }))} />
<input className="input" placeholder="Bar size" value={newSaw.barSize} onChange={(e) => setNewSaw((prev) => ({ ...prev, barSize: e.target.value }))} />
</div>
<input className="input" placeholder="Fuel" value={newSaw.fuel} onChange={(e) => setNewSaw((prev) => ({ ...prev, fuel: e.target.value }))} />
<div className="grid-3">
<input type="number" className="input" placeholder="2h" value={newSaw.rate2h} onChange={(e) => setNewSaw((prev) => ({ ...prev, rate2h: e.target.value }))} />
<input type="number" className="input" placeholder="4h" value={newSaw.rate4h} onChange={(e) => setNewSaw((prev) => ({ ...prev, rate4h: e.target.value }))} />
<input type="number" className="input" placeholder="Day" value={newSaw.rateDay} onChange={(e) => setNewSaw((prev) => ({ ...prev, rateDay: e.target.value }))} />
</div>
<div className="grid-3">
<input type="number" className="input" placeholder="Weekend" value={newSaw.weekend} onChange={(e) => setNewSaw((prev) => ({ ...prev, weekend: e.target.value }))} />
<input type="number" className="input" placeholder="Week" value={newSaw.week} onChange={(e) => setNewSaw((prev) => ({ ...prev, week: e.target.value }))} />
<input type="number" className="input" placeholder="Deposit" value={newSaw.deposit} onChange={(e) => setNewSaw((prev) => ({ ...prev, deposit: e.target.value }))} />
</div>
<input className="input" placeholder="Condition" value={newSaw.condition} onChange={(e) => setNewSaw((prev) => ({ ...prev, condition: e.target.value }))} />
<textarea className="textarea" placeholder="Notes" value={newSaw.notes} onChange={(e) => setNewSaw((prev) => ({ ...prev, notes: e.target.value }))} />
<button type="submit" className="btn btn-primary">Add Saw</button>
</form>
</div>
</div>
)}

{adminTab === "bookings" && (
<div className="card-soft" style={{ padding: 20 }}>
<div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
<div>
<div style={{ fontSize: 22, fontWeight: 900 }}>Bookings Manager</div>
<div className="muted" style={{ marginTop: 6 }}>Approve, mark out, return, or decline.</div>
</div>
<select className="select" style={{ width: 200 }} value={bookingFilter} onChange={(e) => setBookingFilter(e.target.value)}>
<option value="all">All bookings</option>
<option value="Pending">Pending</option>
<option value="Approved">Approved</option>
<option value="Out">Out</option>
<option value="Returned">Returned</option>
<option value="Declined">Declined</option>
</select>
</div>

<div style={{ display: "grid", gap: 16, marginTop: 18 }}>
{filteredBookings.map((booking) => (
<div key={booking.id} className="booking-card">
<div style={{ display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
<div>
<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>{booking.customerName}</div>
<span className={getStatusClass(booking.status)}>{booking.status}</span>
<span className="badge slate">{booking.channel}</span>
</div>
<div className="muted" style={{ marginTop: 6 }}>{booking.sawName} · {booking.phone}</div>
<div className="muted" style={{ marginTop: 6 }}>{booking.startDate} to {booking.endDate} · {booking.duration}</div>
<div style={{ marginTop: 12, fontSize: 14 }}>{booking.notes || "No notes"}</div>
</div>
<div className="summary-grid">
<div className="summary-box"><div className="muted" style={{ fontSize: 12 }}>Rental</div><div style={{ fontWeight: 900, marginTop: 6 }}>{money(booking.rentalPrice)}</div></div>
<div className="summary-box"><div className="muted" style={{ fontSize: 12 }}>Deposit</div><div style={{ fontWeight: 900, marginTop: 6 }}>{money(booking.deposit)}</div></div>
</div>
</div>
<div className="actions">
<button className="btn btn-success btn-sm" onClick={() => setBookingStatus(booking.id, "Approved")}>Approve</button>
<button className="btn btn-outline btn-sm" onClick={() => setBookingStatus(booking.id, "Out")}>Mark Out</button>
<button className="btn btn-outline btn-sm" onClick={() => setBookingStatus(booking.id, "Returned")}>Mark Returned</button>
<button className="btn btn-danger btn-sm" onClick={() => setBookingStatus(booking.id, "Declined")}>Decline</button>
</div>
</div>
))}
</div>
</div>
)}

{adminTab === "customers" && (
<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>Customer Records</div>
<div className="muted" style={{ marginTop: 6 }}>Track repeat renters and total spend.</div>
<div className="table-wrap" style={{ marginTop: 16 }}>
<table>
<thead>
<tr>
<th>Customer</th>
<th>Phone</th>
<th>Rentals</th>
<th>Total Spent</th>
<th>Notes</th>
</tr>
</thead>
<tbody>
{app.customers.map((customer) => (
<tr key={customer.id}>
<td style={{ fontWeight: 700 }}>{customer.name}</td>
<td>{customer.phone}</td>
<td>{customer.rentals}</td>
<td style={{ fontWeight: 700 }}>{money(customer.totalSpent)}</td>
<td>{customer.notes || "No notes"}</td>
</tr>
))}
</tbody>
</table>
</div>
</div>
)}

{adminTab === "maintenance" && (
<div className="grid-2" style={{ alignItems: "start" }}>
<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>Maintenance Log</div>
<div className="muted" style={{ marginTop: 6 }}>Anything unsafe or questionable stays blocked.</div>
<div style={{ display: "grid", gap: 16, marginTop: 16 }}>
{app.maintenance.map((item) => (
<div key={item.id} className="booking-card">
<div style={{ display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
<div>
<div style={{ fontWeight: 900, fontSize: 18 }}>{item.sawName}</div>
<div className="muted" style={{ marginTop: 6 }}>{item.issue}</div>
<div style={{ marginTop: 10, fontSize: 14 }}>{item.notes || "No notes"}</div>
</div>
<div className="actions">
<span className={item.priority === "High" ? "badge red" : "badge amber"}>{item.priority}</span>
<span className={getStatusClass(item.status)}>{item.status}</span>
</div>
</div>
<div className="actions">
<button className="btn btn-outline btn-sm" onClick={() => markMaintenanceDone(item.id)}>Mark Done</button>
</div>
</div>
))}
</div>
</div>

<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>Add Maintenance Item</div>
<div className="muted" style={{ marginTop: 6 }}>Lock the saw until the issue is handled.</div>
<form onSubmit={addMaintenanceItem} style={{ display: "grid", gap: 12, marginTop: 16 }}>
<select className="select" value={maintenanceDraft.sawId} onChange={(e) => setMaintenanceDraft((prev) => ({ ...prev, sawId: e.target.value }))}>
{app.saws.map((saw) => (
<option key={saw.id} value={saw.id}>{saw.name}</option>
))}
</select>
<input className="input" placeholder="Issue" value={maintenanceDraft.issue} onChange={(e) => setMaintenanceDraft((prev) => ({ ...prev, issue: e.target.value }))} required />
<select className="select" value={maintenanceDraft.priority} onChange={(e) => setMaintenanceDraft((prev) => ({ ...prev, priority: e.target.value }))}>
<option value="Low">Low</option>
<option value="Medium">Medium</option>
<option value="High">High</option>
</select>
<textarea className="textarea" placeholder="Notes" value={maintenanceDraft.notes} onChange={(e) => setMaintenanceDraft((prev) => ({ ...prev, notes: e.target.value }))} />
<button type="submit" className="btn btn-primary">Add Maintenance Item</button>
</form>
</div>
</div>
)}

{adminTab === "settings" && (
<div className="card-soft" style={{ padding: 20 }}>
<div style={{ fontSize: 22, fontWeight: 900 }}>Business Settings</div>
<div className="muted" style={{ marginTop: 6 }}>Local storage demo settings for now.</div>
<div className="grid-2" style={{ marginTop: 16 }}>
<div className="field">
<label>Business Name</label>
<input className="input" value={app.settings.businessName} onChange={(e) => updateSetting("businessName", e.target.value)} />
</div>
<div className="field">
<label>Phone</label>
<input className="input" value={app.settings.phone} onChange={(e) => updateSetting("phone", e.target.value)} />
</div>
<div className="field">
<label>Location</label>
<input className="input" value={app.settings.location} onChange={(e) => updateSetting("location", e.target.value)} />
</div>
<div className="field">
<label>Admin PIN</label>
<input className="input" value={app.settings.adminPin} onChange={(e) => updateSetting("adminPin", e.target.value)} />
</div>
</div>
<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, flexWrap: "wrap" }}>
<div>
<div style={{ fontWeight: 800 }}>Request-to-book only</div>
<div className="muted" style={{ marginTop: 4 }}>Keep manual approval on for every app request.</div>
</div>
<label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
<input type="checkbox" checked={app.settings.requestModeOnly} onChange={(e) => updateSetting("requestModeOnly", e.target.checked)} />
Enabled
</label>
</div>
<div className="actions" style={{ marginTop: 16 }}>
<button className="btn btn-outline" onClick={handleAdminLock}>Lock Admin</button>
<button className="btn btn-danger" onClick={resetAllData}>Reset Demo Data</button>
</div>
</div>
)}
</div>
</main>
</div>
)}
</div>
</div>
</div>
</div>
);
}
