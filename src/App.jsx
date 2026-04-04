import React, { useEffect, useMemo, useState } from "react"
import { setBookingStatus as applyBookingStatusTransition } from "./domain/bookingTransitions"
import { updateOrCreateCustomer } from "./domain/customers"
import { addMaintenanceItem as createMaintenanceItem, markMaintenanceDone as applyMaintenanceDone } from "./domain/maintenance"

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
const customerResult = updateOrCreateCustomer({
customers: prev.customers,
name: publicRequest.name.trim(),
phone: publicRequest.phone.trim(),
notes: publicRequest.notes.trim(),
rentalIncrease: 0,
spendIncrease: 0,
createId: uid,
});

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
const customerResult = updateOrCreateCustomer({
customers: prev.customers,
name: newBooking.customerName.trim(),
phone: newBooking.phone.trim(),
notes: newBooking.notes.trim(),
rentalIncrease: 1,
spendIncrease: getDurationPrice(saw, newBooking.duration),
createId: uid,
});

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
const next = applyBookingStatusTransition({
bookings: prev.bookings,
saws: prev.saws,
customers: prev.customers,
bookingId,
nextStatus,
});

if (!next) return prev;
return { ...prev, ...next };
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

setApp((prev) => {
const next = createMaintenanceItem({
maintenance: prev.maintenance,
saws: prev.saws,
draft: maintenanceDraft,
saw,
createId: uid,
date: today(),
});
return { ...prev, ...next };
});

setMaintenanceDraft({ sawId: app.saws[0]?.id || "", issue: "", priority: "Medium", notes: "" });
}

function markMaintenanceDone(id) {
setApp((prev) => {
const next = applyMaintenanceDone({
maintenance: prev.maintenance,
saws: prev.saws,
bookings: prev.bookings,
maintenanceId: id,
});
if (!next) return prev;
return { ...prev, ...next };
import React from "react";
import { PublicRequestPanel } from "./features/public/PublicRequestPanel";
import { AdminShell } from "./features/admin/AdminShell";
import { getQuickPrice, money } from "./lib/pricing";
import { getStatusClass } from "./lib/status";
import { useSawRentState } from "./state/useSawRentState";

export default function SawRentApp() {
  const state = useSawRentState();

  if (!state.booted) {
    return <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>Loading...</div>;
  }

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
              <div className="hero-badges"><span className="badge blue">{state.app.settings.businessName}</span><span className="badge dark">Admin Dashboard</span></div>
              <h1 style={{ margin: "16px 0 0", fontSize: 44, lineHeight: 1.05 }}>Run Saw Rent like a real rental desk.</h1>
              <p style={{ marginTop: 14, maxWidth: 840, color: "#cbd5e1", lineHeight: 1.6 }}>Upgraded to an AdminLTE-style layout with a dark ops sidebar, cleaner admin tables, stronger KPI blocks, tighter booking controls, and fixed business logic.</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}><button className="btn btn-primary" onClick={() => state.actions.setAdminOpen(true)}>Admin Login</button><button className="btn btn-outline-dark" onClick={() => window.alert(`${state.app.settings.businessName}\n${state.app.settings.phone}\n${state.app.settings.location}`)}>Business Contact</button></div>
            </div>
            <div className="hero-bottom">
              <div className="mini-panel"><div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Booking Mode</div><div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>Option A</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Request-to-book stays on.</div></div>
              <div className="mini-panel"><div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Channels</div><div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>4</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>App, call, text, walk-in.</div></div>
              <div className="mini-panel"><div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>Shop</div><div style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>La Porte, IN</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>136 Grand Ave.</div></div>
            </div>
          </div>

          <div className="stats-col">
            <div className="kpi"><div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Available Saws</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{state.stats.available}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Ready to rent</div></div><div className="kpi-side kpi-green">🪚</div></div>
            <div className="kpi"><div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Pending Requests</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{state.stats.pending}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Need approval</div></div><div className="kpi-side kpi-amber">📋</div></div>
            <div className="kpi"><div className="kpi-main"><div className="muted" style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase" }}>Deposits Held</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 10 }}>{money(state.stats.depositsHeld)}</div><div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Pending and active rentals</div></div><div className="kpi-side kpi-blue">💵</div></div>
            <div className="card-soft" style={{ padding: 20 }}>
              <div style={{ fontWeight: 800 }}>Quick Quote Panel</div><div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Use this for calls, texts, and walk-ins.</div>
              <div className="field" style={{ marginTop: 16 }}><label>Saw</label><select className="select" value={state.selectedSawId} onChange={(e) => state.actions.setSelectedSawId(e.target.value)}>{state.app.saws.map((saw) => <option key={saw.id} value={saw.id}>{saw.name}</option>)}</select></div>
              <div className="field" style={{ marginTop: 16 }}><label>Duration</label><select className="select" value={state.selectedDuration} onChange={(e) => state.actions.setSelectedDuration(e.target.value)}><option value="2h">2 hours</option><option value="4h">4 hours</option><option value="day">1 day</option><option value="weekend">Weekend</option><option value="week">1 week</option></select></div>
              <div className="mini-panel" style={{ marginTop: 16 }}><div className="info-row"><span className="muted">Rental</span><strong>{money(getQuickPrice(state.quickQuoteSaw, state.selectedDuration))}</strong></div><div className="info-row" style={{ marginTop: 8 }}><span className="muted">Deposit</span><strong>{money(state.quickQuoteSaw?.deposit)}</strong></div><div className="info-row" style={{ marginTop: 8 }}><span className="muted">Fuel</span><strong>{state.quickQuoteSaw?.fuel || "-"}</strong></div><div className="info-row" style={{ marginTop: 8 }}><span className="muted">Status</span><span className={getStatusClass(state.quickQuoteSaw?.status)}>{state.quickQuoteSaw?.status || "-"}</span></div></div>
            </div>
          </div>
        </div>

        <div className="section-grid">
          <PublicRequestPanel
            availablePublicSaws={state.availablePublicSaws}
            publicSearch={state.publicSearch}
            setPublicSearch={state.actions.setPublicSearch}
            publicRequest={state.publicRequest}
            setPublicRequest={state.actions.setPublicRequest}
            submitPublicRequest={state.submitPublicRequest}
          />

          <div className="card">
            {!state.adminOpen ? (
              <div className="locked"><div className="locked-box"><div style={{ width: 64, height: 64, borderRadius: 18, margin: "0 auto", background: "#0f172a", color: "#fff", display: "grid", placeItems: "center", fontSize: 30 }}>📊</div><div style={{ fontSize: 34, fontWeight: 900, marginTop: 20 }}>Admin dashboard locked</div><div className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>Open the operations side to manage inventory, bookings, customers, deposits, and maintenance.</div><button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => state.actions.setAdminOpen(true)}>Open Admin</button></div></div>
            ) : !state.adminUnlocked ? (
              <div className="locked"><div className="login-box"><div style={{ fontSize: 34, fontWeight: 900 }}>Enter Admin PIN</div><div className="muted" style={{ marginTop: 8 }}>Default demo PIN is 1234. Change it after login.</div><input type="password" className="input" style={{ marginTop: 18 }} value={state.pin} onChange={(e) => state.actions.setPin(e.target.value)} placeholder="PIN" /><div style={{ display: "flex", gap: 10, marginTop: 14 }}><button className="btn btn-primary" onClick={state.handleAdminUnlock}>Unlock</button><button className="btn btn-outline" onClick={() => { state.actions.setAdminOpen(false); state.actions.setPin(""); }}>Close</button></div></div></div>
            ) : (
              <AdminShell state={state} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
