import { useEffect, useMemo, useState } from "react";
import { getDurationPrice } from "../lib/pricing";
import { hasBlockingBooking } from "../lib/status";
import { clearState, createSeedData, getToday, getTomorrow, loadState, makeUid, saveState } from "../lib/storage";

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
    id: makeUid("cust"),
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

export function useSawRentState() {
  const [app, setApp] = useState(() => loadState());
  const [booted] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [adminAuthError, setAdminAuthError] = useState("");
  const [failedPinAttempts, setFailedPinAttempts] = useState(0);
  const [adminLockedUntil, setAdminLockedUntil] = useState(null);
  const [publicSearch, setPublicSearch] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [selectedDuration, setSelectedDuration] = useState("day");
  const [selectedSawId, setSelectedSawId] = useState(app.saws[0]?.id || "");
  const [adminTab, setAdminTab] = useState("overview");
  const [publicRequest, setPublicRequest] = useState({ name: "", phone: "", sawId: app.saws[0]?.id || "", startDate: getTomorrow(), duration: "1 day", notes: "" });
  const [newSaw, setNewSaw] = useState({ name: "", category: "Homeowner", barSize: '18"', fuel: "50:1 Mix", deposit: 150, rate2h: 25, rate4h: 35, rateDay: 55, weekend: 90, week: 180, condition: "Ready", notes: "" });
  const [newBooking, setNewBooking] = useState({ customerName: "", phone: "", channel: "Phone", sawId: app.saws[0]?.id || "", startDate: getToday(), endDate: getTomorrow(), duration: "1 day", notes: "" });
  const [maintenanceDraft, setMaintenanceDraft] = useState({ sawId: app.saws[0]?.id || "", issue: "", priority: "Medium", notes: "" });

  useEffect(() => {
    if (!booted) return;
    saveState(app);
  }, [app, booted]);

  const availablePublicSaws = useMemo(() => {
    const q = publicSearch.trim().toLowerCase();
    return app.saws.filter((saw) => {
      const matchesStatus = saw.status === "Available";
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

  const filteredBookings = useMemo(
    () => app.bookings.filter((booking) => bookingFilter === "all" || booking.status === bookingFilter),
    [app.bookings, bookingFilter]
  );

  const quickQuoteSaw = useMemo(
    () => app.saws.find((saw) => saw.id === selectedSawId) || app.saws[0] || null,
    [app.saws, selectedSawId]
  );

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

  const sidebarItems = [
    { key: "overview", label: "Overview", icon: "📊" },
    { key: "inventory", label: "Inventory", icon: "🪚" },
    { key: "bookings", label: "Bookings", icon: "📋" },
    { key: "customers", label: "Customers", icon: "👤" },
    { key: "maintenance", label: "Maintenance", icon: "🛠️" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  const isAdminAuthorized = adminOpen && adminUnlocked;

  function closeAdmin() {
    setAdminOpen(false);
    setAdminUnlocked(false);
    setPin("");
    setAdminAuthError("");
    setAdminTab("overview");
  }

  function openAdminLogin() {
    setAdminOpen(true);
    setAdminAuthError("");
  }

  const actions = {
    setPublicSearch,
    setInventorySearch,
    setInventoryFilter,
    setBookingFilter,
    setSelectedDuration,
    setSelectedSawId,
    setAdminTab,
    setPublicRequest,
    setNewSaw,
    setNewBooking,
    setMaintenanceDraft,
    setPin,
    closeAdmin,
    openAdminLogin,
  };

  function resetAllData() {
    const fresh = createSeedData();
    setApp(fresh);
    setSelectedSawId(fresh.saws[0]?.id || "");
    setPublicRequest({ name: "", phone: "", sawId: fresh.saws[0]?.id || "", startDate: getTomorrow(), duration: "1 day", notes: "" });
    setNewBooking({ customerName: "", phone: "", channel: "Phone", sawId: fresh.saws[0]?.id || "", startDate: getToday(), endDate: getTomorrow(), duration: "1 day", notes: "" });
    setMaintenanceDraft({ sawId: fresh.saws[0]?.id || "", issue: "", priority: "Medium", notes: "" });
    clearState();
  }

  function handleAdminUnlock() {
    const now = Date.now();
    if (adminLockedUntil && now < adminLockedUntil) {
      const seconds = Math.max(1, Math.ceil((adminLockedUntil - now) / 1000));
      setAdminAuthError(`Too many failed attempts. Try again in ${seconds}s.`);
      return;
    }

    if (!/^\d{4,8}$/.test(pin)) {
      setAdminAuthError("PIN must be 4-8 digits.");
      return;
    }

    if (pin === app.settings.adminPin) {
      setAdminUnlocked(true);
      setAdminAuthError("");
      setFailedPinAttempts(0);
      setAdminLockedUntil(null);
      setPin("");
      return;
    }
    const nextFailedAttempts = failedPinAttempts + 1;
    const shouldLock = nextFailedAttempts >= 5;
    setFailedPinAttempts(shouldLock ? 0 : nextFailedAttempts);
    setAdminLockedUntil(shouldLock ? now + 60_000 : null);
    setAdminAuthError(
      shouldLock
        ? "Too many failed attempts. Admin access locked for 60 seconds."
        : "Incorrect PIN."
    );
  }

  function handleAdminLock() {
    closeAdmin();
  }

  function submitPublicRequest(e) {
    e.preventDefault();
    const saw = app.saws.find((item) => item.id === publicRequest.sawId);
    if (!saw) return window.alert("Choose a saw first.");
    if (saw.status !== "Available") return window.alert("That saw is no longer available.");

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
        id: makeUid("book"),
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
        saws: prev.saws.map((item) => (item.id === saw.id ? { ...item, status: "Out" } : item)),
      };
    });

    setPublicRequest({ name: "", phone: "", sawId: app.saws[0]?.id || "", startDate: getTomorrow(), duration: "1 day", notes: "" });
    window.alert("Request submitted. Review it in Bookings.");
  }

  function addSaw(e) {
    e.preventDefault();
    if (!newSaw.name.trim()) return window.alert("Saw name is required.");

    const saw = {
      id: makeUid("saw"),
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

    setApp((prev) => ({ ...prev, saws: [saw, ...prev.saws] }));
    setNewSaw({ name: "", category: "Homeowner", barSize: '18"', fuel: "50:1 Mix", deposit: 150, rate2h: 25, rate4h: 35, rateDay: 55, weekend: 90, week: 180, condition: "Ready", notes: "" });
  }

  function createManualBooking(e) {
    e.preventDefault();
    const saw = app.saws.find((item) => item.id === newBooking.sawId);
    if (!saw) return window.alert("Choose a saw first.");
    if (saw.status !== "Available") return window.alert("That saw is not available.");
    if (!newBooking.customerName.trim() || !newBooking.phone.trim()) {
      return window.alert("Customer name and phone are required.");
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
        id: makeUid("book"),
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
        saws: prev.saws.map((item) => (item.id === saw.id ? { ...item, status: "Out" } : item)),
      };
    });

    setNewBooking({ customerName: "", phone: "", channel: "Phone", sawId: app.saws[0]?.id || "", startDate: getToday(), endDate: getTomorrow(), duration: "1 day", notes: "" });
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

      const shouldFreeSaw =
        !hasBlockingBooking(bookings, booking.sawId, bookingId) &&
        ["Returned", "Declined"].includes(nextStatus);
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
    if (!saw) return window.alert("Choose a saw first.");
    if (!maintenanceDraft.issue.trim()) return window.alert("Maintenance issue is required.");

    const item = {
      id: makeUid("mnt"),
      sawId: saw.id,
      sawName: saw.name,
      issue: maintenanceDraft.issue.trim(),
      priority: maintenanceDraft.priority,
      status: "Open",
      lastService: getToday(),
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
    if (field === "adminPin") {
      const nextPin = String(value).replace(/\D/g, "").slice(0, 8);
      if (nextPin.length < 4) {
        setAdminAuthError("Admin PIN must be at least 4 digits.");
      } else {
        setAdminAuthError("");
      }
      setApp((prev) => ({ ...prev, settings: { ...prev.settings, adminPin: nextPin } }));
      return;
    }

    setApp((prev) => ({ ...prev, settings: { ...prev.settings, [field]: value } }));
  }

  return {
    app,
    booted,
    adminOpen,
    adminUnlocked,
    isAdminAuthorized,
    pin,
    adminAuthError,
    publicSearch,
    inventorySearch,
    inventoryFilter,
    bookingFilter,
    selectedDuration,
    selectedSawId,
    adminTab,
    publicRequest,
    newSaw,
    newBooking,
    maintenanceDraft,
    availablePublicSaws,
    filteredInventory,
    filteredBookings,
    quickQuoteSaw,
    stats,
    sidebarItems,
    actions,
    handleAdminUnlock,
    handleAdminLock,
    submitPublicRequest,
    addSaw,
    createManualBooking,
    setBookingStatus,
    addMaintenanceItem,
    markMaintenanceDone,
    updateSetting,
    resetAllData,
  };
}
