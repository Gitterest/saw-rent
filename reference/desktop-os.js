(() => {
  const root = document.querySelector("[data-os]");
  if (!root) return;

  const accent = root.getAttribute("data-accent");
  if (accent) document.documentElement.style.setProperty("--pf-accent", accent);

  const $ = (sel, r=document) => r.querySelector(sel);
  const $$ = (sel, r=document) => Array.from(r.querySelectorAll(sel));

  const layer = $("[data-windowlayer]");
  const tasksEl = $("[data-tasks]");
  const startBtn = $("[data-start]");
  const startMenu = $("[data-startmenu]");
  const clockEl = $("[data-clock]");
  const cartBadge = $("[data-cartbadge]");
  const taskbarEl = root.querySelector("[data-taskbar]");
  const desktopEl = $("[data-desktop]");
  const iconsEl = $("[data-icons]");
  const wallpaperEl = root.querySelector(".pf-wallpaper");
  const isDesktop = () => window.matchMedia("(min-width: 1025px)").matches;
  const isTablet = () => window.matchMedia("(min-width: 768px) and (max-width: 1024px)").matches;
  const isPhone = () => window.matchMedia("(max-width: 767px)").matches;
  const setViewportClasses = () => {
    const phone = isPhone();
    const tablet = isTablet();
    document.documentElement.classList.toggle("is-mobile", phone);
    document.documentElement.classList.toggle("is-tablet", tablet);
    return { phone, tablet, desktop: !phone && !tablet };
  };
  setViewportClasses();

  const routes = {
    root: root.getAttribute("data-route-root") || "/",
    cart: root.getAttribute("data-route-cart") || "/cart",
    search: root.getAttribute("data-route-search") || "/search",
    collections: root.getAttribute("data-route-collections") || "/collections",
    storefront: root.getAttribute("data-route-storefront") || "/collections/all",
    account: root.getAttribute("data-route-account") || "/account",
    supportFallback: root.getAttribute("data-support-fallback") || "/pages/contact"
  };

  const customerLoggedIn = root.getAttribute("data-customer-logged-in") === "true";

  // Keep Settings launch metadata in sync between desktop and Start menu.
  // This ensures both entry points always open the same app context/title.
  const mirrorSettingsLaunchers = () => {
    const startSettings = startMenu?.querySelector('[data-osapp="settings"],[data-app-id="settings"]');
    const desktopSettings = root.querySelector('.pf-icon[data-osapp="settings"], .pf-icon[data-app-id="settings"]');
    if (!startSettings || !desktopSettings) return;

    const mirroredTitle =
      startSettings.getAttribute("data-title")
      || startSettings.getAttribute("title")
      || "Settings";

    desktopSettings.setAttribute("data-title", mirroredTitle);
    desktopSettings.setAttribute("aria-label", `Open ${mirroredTitle}`);

    if (!startSettings.getAttribute("data-title")) startSettings.setAttribute("data-title", mirroredTitle);
  };
  mirrorSettingsLaunchers();

  // ---- Desktop icon drag + drop
  const iconPositionKey = "pf_desktop_icon_positions_v1";
  let iconDragState = null;
  let lastIconDragAt = 0;

  const loadIconPositions = () => {
    try {
      const raw = localStorage.getItem(iconPositionKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const saveIconPositions = (positions) => {
    try {
      localStorage.setItem(iconPositionKey, JSON.stringify(positions));
    } catch {}
  };

  const getIconKey = (el, index) => (
    el.getAttribute("data-app-id")
    || el.getAttribute("data-osapp")
    || el.getAttribute("data-url")
    || el.getAttribute("data-title")
    || el.querySelector(".pf-iconlabel")?.textContent?.trim()
    || `icon-${index}`
  );

  const getGridMetrics = () => {
    if (!iconsEl) return { col: 92, row: 74, colGap: 10, rowGap: 10 };
    const styles = getComputedStyle(iconsEl);
    const col = parseFloat(styles.gridAutoColumns) || 92;
    const row = parseFloat(styles.gridAutoRows) || 74;
    const colGap = parseFloat(styles.columnGap) || 10;
    const rowGap = parseFloat(styles.rowGap) || 10;
    return { col, row, colGap, rowGap };
  };

  const hasSavedIconPosition = (pos) => (
    !!pos
    && typeof pos.x === "number"
    && typeof pos.y === "number"
    && Number.isFinite(pos.x)
    && Number.isFinite(pos.y)
  );

  const snapToGrid = (x, y, metrics) => {
    const stepX = metrics.col + metrics.colGap;
    const stepY = metrics.row + metrics.rowGap;
    return {
      x: Math.round(x / stepX) * stepX,
      y: Math.round(y / stepY) * stepY
    };
  };

  const clampPosition = (x, y, containerRect, size) => {
    const maxX = Math.max(0, containerRect.width - size.w);
    const maxY = Math.max(0, containerRect.height - size.h);
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY))
    };
  };

  const applyIconPosition = (icon, pos, containerRect, metrics, snap = true) => {
    const size = {
      w: icon.offsetWidth || metrics.col,
      h: icon.offsetHeight || metrics.row
    };
    const desired = snap ? snapToGrid(pos.x, pos.y, metrics) : pos;
    const clamped = clampPosition(desired.x, desired.y, containerRect, size);
    icon.style.position = "absolute";
    icon.style.left = `${clamped.x}px`;
    icon.style.top = `${clamped.y}px`;
    return clamped;
  };

  const autoLayoutIcons = (icons, stored, containerRect, metrics) => {
    const startX = 24;
    const startY = 24;
    const stepX = Math.max(1, metrics.col + metrics.colGap);
    const stepY = Math.max(1, metrics.row + metrics.rowGap);
    const edgePadding = 24;
    const maxY = Math.max(startY, containerRect.height - edgePadding);
    const rowsPerColumn = Math.max(1, Math.floor((maxY - startY) / stepY) + 1);
    const occupied = new Set();
    let row = 0;
    let col = 0;

    const cellKey = (cellCol, cellRow) => `${cellCol}:${cellRow}`;
    const cellFromPos = (pos) => ({
      col: Math.max(0, Math.round((pos.x - startX) / stepX)),
      row: Math.max(0, Math.round((pos.y - startY) / stepY))
    });
    const advanceCursor = () => {
      row += 1;
      if (row >= rowsPerColumn) {
        row = 0;
        col += 1;
      }
    };
    const moveToNextFreeCell = () => {
      while (occupied.has(cellKey(col, row))) {
        advanceCursor();
      }
    };

    const reserved = new Map();
    icons.forEach((icon, index) => {
      const key = icon.dataset.iconKey || getIconKey(icon, index);
      icon.dataset.iconKey = key;
      const saved = stored[key];
      if (!hasSavedIconPosition(saved)) return;
      const cell = cellFromPos(saved);
      const keyCell = cellKey(cell.col, cell.row);
      if (occupied.has(keyCell)) return;
      occupied.add(keyCell);
      reserved.set(icon, cell);
    });

    icons.forEach((icon, index) => {
      const key = icon.dataset.iconKey || getIconKey(icon, index);
      icon.dataset.iconKey = key;
      const saved = stored[key];
      if (hasSavedIconPosition(saved) && reserved.has(icon)) {
        const reservedCell = reserved.get(icon);
        let placed = applyIconPosition(icon, saved, containerRect, metrics, true);
        const placedCell = cellFromPos(placed);
        const reservedKey = cellKey(reservedCell.col, reservedCell.row);
        const placedKey = cellKey(placedCell.col, placedCell.row);
        if (placedKey !== reservedKey) {
          occupied.delete(reservedKey);
          if (occupied.has(placedKey)) {
            moveToNextFreeCell();
            placed = applyIconPosition(
              icon,
              { x: startX + col * stepX, y: startY + row * stepY },
              containerRect,
              metrics,
              false
            );
            stored[key] = placed;
            occupied.add(cellKey(col, row));
            advanceCursor();
            return;
          }
          occupied.add(placedKey);
        }
        stored[key] = placed;
        return;
      }

      moveToNextFreeCell();
      const placed = applyIconPosition(
        icon,
        {
          x: startX + col * stepX,
          y: startY + row * stepY
        },
        containerRect,
        metrics,
        false
      );
      stored[key] = placed;
      occupied.add(cellKey(col, row));
      advanceCursor();
    });
  };

  const initDesktopIconLayout = () => {
    if (!isDesktop()) return;
    if (!iconsEl || !desktopEl) return;
    const icons = Array.from(iconsEl.querySelectorAll(".pf-icon"));
    if (!icons.length) return;
    const layout = () => {
      const desktopRect = desktopEl.getBoundingClientRect();
      const metrics = getGridMetrics();
      const stored = loadIconPositions();

      iconsEl.style.position = "relative";
      iconsEl.style.display = "block";
      iconsEl.style.height = `${Math.max(iconsEl.getBoundingClientRect().height, desktopRect.height)}px`;
      const containerRect = iconsEl.getBoundingClientRect();
      if (!containerRect.width || !containerRect.height) {
        requestAnimationFrame(layout);
        return;
      }
      autoLayoutIcons(icons, stored, containerRect, metrics);
      saveIconPositions(stored);
    };
    layout();
  };

  const getAppManifest = () => {
    const el = root.querySelector("[data-app-manifest]");
    if (!el) return { apps: [] };
    try {
      return JSON.parse(el.textContent || "{}");
    } catch {
      return { apps: [] };
    }
  };

  const getAppEntitlements = () => {
    const el = root.querySelector("[data-app-entitlements]");
    if (!el) return {};
    try {
      const parsed = JSON.parse(el.textContent || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      if (typeof parsed === "string") {
        const nested = JSON.parse(parsed);
        if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested;
      }
    } catch {}
    return {};
  };

  const entitlementMap = getAppEntitlements();
  const proPassKey = "pro_pass";

  // ---- Utilities
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  const isInternal = (url) => {
    try {
      const u = new URL(url, window.location.origin);
      return u.origin === window.location.origin;
    } catch { return false; }
  };

  const isHomeUrl = (url) => {
    try {
      const u = new URL(url, window.location.origin);
      return u.origin === window.location.origin && (u.pathname === "/" || u.pathname === "/index");
    } catch {
      return url === "/" || url === "/index";
    }
  };

  const normalizeTitle = (t) => (t || "Window").trim().slice(0, 80);

  // ---- Settings engine bridge
  const settingsEngine = window.PhiasFabOSSettings || null;
  const settingsManifestUrl = root.getAttribute("data-settings-manifest") || "";
  if (settingsEngine && typeof settingsEngine.initSettings === "function") {
    settingsEngine.initSettings({ root, manifestUrl: settingsManifestUrl }).catch(() => {});
  }

  const getOSSetting = (id, fallback) => {
    try {
      if (!settingsEngine || typeof settingsEngine.getSetting !== "function") return fallback;
      const value = settingsEngine.getSetting(id);
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const isSettingEnabled = (id, fallback = false) => {
    const value = getOSSetting(id, fallback);
    return value === true || value === "on" || value === "true";
  };

  let uiAudioCtx = null;
  const playUiSound = (type = "click") => {
    if (!isSettingEnabled("uiSounds", false)) return;
    try {
      if (!uiAudioCtx) uiAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const duration = type === "close" ? 0.08 : 0.05;
      const frequency = type === "open" ? 680 : type === "close" ? 280 : 520;
      const osc = uiAudioCtx.createOscillator();
      const gain = uiAudioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, uiAudioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, uiAudioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, uiAudioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(uiAudioCtx.destination);
      osc.start();
      osc.stop(uiAudioCtx.currentTime + duration);
    } catch {}
  };

  // ---- Vanta background
  let vantaEffect = null;
  const initVanta = () => {
    if (!wallpaperEl || vantaEffect || !window.VANTA || !window.VANTA.DOTS) return;
    root.setAttribute("data-vanta", "dots");
    vantaEffect = window.VANTA.DOTS({
      el: wallpaperEl,
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200.0,
      minWidth: 200.0,
      scale: 1.0,
      scaleMobile: 1.0,
      color: 0xf68937,
      color2: 0xfb823d,
      backgroundColor: 0x0,
      size: 2.8,
      spacing: 29.0
    });
  };
  window.addEventListener("load", initVanta);

  // Routes and hosts that should never be opened inside OS windows.  
  // Shopify's protected pages (account, orders, checkout and cart) trigger
  // content-security-policy frame-ancestor restrictions when embedded.  
  // Additionally, any cross‑origin URL (host not matching the current store)
  // is considered protected because it will either fail CORS fetch or be
  // blocked from being framed.  
  const protectedRoutes = [
    "/account",
    "/orders",
    "/checkout",
    "/cart/checkout",
    "/cart"
  ];

  /**
   * Returns true if the given URL should not be loaded inside an OS window.
   * Protected pages include Shopify account/checkout routes and any URL
   * whose host differs from the current window's host.  If the URL is
   * external (different origin) then it is opened in the top‑level window.
   */
  const isProtected = (url) => {
    try {
      const u = new URL(url, window.location.origin);
      // Block cross‑origin destinations (e.g. shop.app, accounts.shopify.com)
      if (u.host !== window.location.host) return true;
      // Block specific paths on the same origin
      return protectedRoutes.some((p) => u.pathname.startsWith(p));
    } catch {
      return false;
    }
  };

  // ---- Clock
  const tick = () => {
    const d = new Date();
    const use12h = String(getOSSetting("clockFormat", "24h")) === "12h";
    const h24 = d.getHours();
    const hh = use12h
      ? String(((h24 + 11) % 12) + 1).padStart(2, "0")
      : String(h24).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    const suffix = use12h ? (h24 >= 12 ? " PM" : " AM") : "";
    clockEl && (clockEl.textContent = `${hh}:${mm}${suffix}`);
  };
  tick(); setInterval(tick, 10_000);
  window.addEventListener("pf:os-setting-changed", (e) => {
    if (e?.detail?.id === "clockFormat") tick();
    if (e?.detail?.id) playUiSound("click");
  });
  window.addEventListener("pf:os-feedback", (e) => {
    playUiSound(e?.detail?.type || "click");
  });

  // ---- Start menu
  function closeStart() { 
    startMenu?.setAttribute("hidden","");
    startBtn?.classList.remove("pf-startbtn--active");
  }
  function openStart() { 
    startMenu?.removeAttribute("hidden");
    startBtn?.classList.add("pf-startbtn--active");
  }
  function toggleStartMenu() {
    if (!startMenu) return;
    const hidden = startMenu.hasAttribute("hidden");
    hidden ? openStart() : closeStart();
  }
  function resetDesktop() {
    if (window.location.pathname !== "/" && window.location.pathname !== "/index") {
      window.location.href = routes.root || "/";
      return;
    }
    closeStart();
    const ids = Array.from(windows.keys());
    ids.forEach((id) => closeWindow(id));
    iconsEl?.focus();
  }
  startBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleStartMenu();
  });

  function closeDescendantFlyouts(node){
    $$("[data-flyout]", node).forEach(f => f.setAttribute("hidden",""));
  }

  // Close start when clicking outside
  document.addEventListener("mousedown", (e) => {
    if (!startMenu || startMenu.hasAttribute("hidden")) return;
    if (startMenu.contains(e.target) || startBtn === e.target || startBtn?.contains(e.target)) return;
    closeStart();
  });

  // Close start menu on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && startMenu && !startMenu.hasAttribute("hidden")) {
      closeStart();
    }
  });
  document.addEventListener("focusin", (e) => {
    if (!startMenu || startMenu.hasAttribute("hidden")) return;
    if (startMenu.contains(e.target) || startBtn?.contains(e.target)) return;
    closeStart();
  });
  window.addEventListener("blur", closeStart);

  // ---- OS core: windows + taskbar
  let z = 2001;
  let seq = 0;
  const windows = new Map(); // id -> {el, taskEl, minimized, maximized, url, title, restoreState}
  let dragState = null;
  let viewportMode = "";
  const applyViewportMode = () => {
    const { phone, tablet, desktop } = setViewportClasses();
    const next = desktop ? "desktop" : (phone ? "phone" : "tablet");
    if (next === viewportMode) return;
    viewportMode = next;
    const minLabel = desktop ? "Minimize" : "Back";
    root.querySelectorAll(".pf-win__ctrl[data-min]").forEach((btn) => {
      btn.setAttribute("aria-label", minLabel);
      btn.setAttribute("title", minLabel);
    });
    if (desktop) {
      initDesktopIconLayout();
      refreshDesktopIconBounds();
    }
    dragState = null;
    iconDragState = null;
  };

  const getTaskbarPosition = () => String(getOSSetting("taskbarPosition", "bottom"));
  const getTaskbarThickness = () => {
    const rect = taskbarEl?.getBoundingClientRect();
    if (!rect) return 48;
    return getTaskbarPosition() === "left" ? Math.max(44, Math.round(rect.width)) : Math.max(40, Math.round(rect.height));
  };
  const getWorkArea = () => {
    const pos = getTaskbarPosition();
    const thickness = getTaskbarThickness();
    return {
      left: pos === "left" ? thickness + 6 : 6,
      top: pos === "top" ? thickness + 6 : 6,
      right: 6,
      bottom: pos === "bottom" ? thickness + 6 : 6
    };
  };

  const applySnapLayout = (winId, side) => {
    const w = windows.get(winId);
    if (!w) return;
    const area = getWorkArea();
    const width = Math.max(320, Math.floor((window.innerWidth - area.left - area.right - 6) / 2));
    const height = Math.max(220, window.innerHeight - area.top - area.bottom);
    if (w.maximized) toggleMaximize(winId);
    w.el.style.width = `${width}px`;
    w.el.style.height = `${height}px`;
    w.el.style.top = `${area.top}px`;
    w.el.style.left = side === "right" ? `${window.innerWidth - area.right - width}px` : `${area.left}px`;
    setActive(winId);
  };

  const maybeSnapWindow = (winId) => {
    if (!isSettingEnabled("snapWindows", true)) return;
    const w = windows.get(winId);
    if (!w || w.minimized) return;
    const rect = w.el.getBoundingClientRect();
    const threshold = 24;
    if (rect.top <= threshold) {
      if (!w.maximized) toggleMaximize(winId);
      return;
    }
    if (rect.left <= threshold) {
      applySnapLayout(winId, "left");
      return;
    }
    if (rect.right >= window.innerWidth - threshold) {
      applySnapLayout(winId, "right");
    }
  };

  window.addEventListener("mousemove", (e) => {
    if (!dragState) return;
    if (!isDesktop()) { dragState = null; return; }
    const state = dragState;
    const w = windows.get(state.winId);
    if (!w) return;
    if (state.wasMaximized) {
      state.wasMaximized = false;
      toggleMaximize(state.winId);
      const r = w.el.getBoundingClientRect();
      state.sl = r.left;
      state.st = r.top;
      state.sx = e.clientX;
      state.sy = e.clientY;
    }
    const r = w.el.getBoundingClientRect();
    const dx = e.clientX - state.sx;
    const dy = e.clientY - state.sy;
    const area = getWorkArea();
    const maxLeft = Math.max(area.left, window.innerWidth - r.width - area.right);
    const maxTop = Math.max(area.top, window.innerHeight - r.height - area.bottom);
    w.el.style.left = `${Math.max(area.left, Math.min(state.sl + dx, maxLeft))}px`;
    w.el.style.top = `${Math.max(area.top, Math.min(state.st + dy, maxTop))}px`;
  });

  window.addEventListener("mouseup", () => {
    if (!dragState) return;
    if (!isDesktop()) { dragState = null; return; }
    maybeSnapWindow(dragState.winId);
    dragState = null;
  });

  function setActive(winId){
    const target = windows.get(winId);
    if (!target || target.minimized) return;
    windows.forEach((w, id) => {
      if (id === winId) {
        w.el.style.zIndex = String(++z);
        w.taskEl?.setAttribute("aria-selected", "true");
        w.el.classList.add("pf-win--active");
      } else {
        w.taskEl?.setAttribute("aria-selected", "false");
        w.el.classList.remove("pf-win--active");
      }
    });
    scheduleRecentsRender();
  }

  const findWindowByApp = (appId) => {
    for (const [id, w] of windows.entries()) {
      if (w?.appId === appId) return id;
    }
    return null;
  };

  const focusWindow = (winId) => {
    const w = windows.get(winId);
    if (!w) return;
    if (w.minimized) restoreWindow(winId);
    setActive(winId);
  };

  function activateLastVisible(excludeId){
    const ids = Array.from(windows.keys());
    for (let i = ids.length - 1; i >= 0; i -= 1){
      const id = ids[i];
      const w = windows.get(id);
      if (!w || w.minimized || id === excludeId) continue;
      setActive(id);
      return;
    }
    windows.forEach((w) => w.taskEl?.setAttribute("aria-selected", "false"));
  }

  function addTaskButton(winId, title){
    const li = document.createElement("li");
    li.className = "pf-task";
    li.setAttribute("role","button");
    li.setAttribute("tabindex","0");
    li.setAttribute("aria-selected","true");
    li.innerHTML = `<span class="pf-task__title">${escapeHtml(title)}</span><span class="pf-task__min">—</span>`;
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      const w = windows.get(winId);
      if (!w) return;
      if (w.minimized) {
        restoreWindow(winId);
      } else if (w.el.classList.contains("pf-win--active")) {
        minimizeWindow(winId);
      } else {
        setActive(winId);
      }
    });
    li.addEventListener("keydown", (e) => { 
      if (e.key === "Enter") {
        const w = windows.get(winId);
        if (w?.minimized) restoreWindow(winId);
        else if (w?.el.classList.contains("pf-win--active")) minimizeWindow(winId);
        else setActive(winId);
      }
    });
    tasksEl?.appendChild(li);
    return li;
  }

  function minimizeWindow(winId){
    const w = windows.get(winId);
    if (!w || w.minimized) return;
    w.minimized = true;
    w.el.style.transition = "transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s ease";
    const rect = w.el.getBoundingClientRect();
    const taskRect = w.taskEl.getBoundingClientRect();
    const targetX = taskRect.left + taskRect.width / 2 - rect.width / 2;
    const targetY = taskRect.top - rect.height;
    const scaleX = taskRect.width / rect.width;
    const scaleY = 0.1;
    
    w.el.style.transformOrigin = "top center";
    w.el.style.transform = `translate(${targetX - rect.left}px, ${targetY - rect.top}px) scale(${scaleX}, ${scaleY})`;
    w.el.style.opacity = "0";
    
    setTimeout(() => {
      w.el.setAttribute("aria-hidden","true");
      w.el.style.transition = "";
      w.el.style.transform = "";
      w.el.style.opacity = "";
      w.el.style.transformOrigin = "";
      w.taskEl?.setAttribute("aria-selected","false");
      activateLastVisible(winId);
      scheduleRecentsRender();
    }, 200);
  }

  function restoreWindow(winId){
    const w = windows.get(winId);
    if (!w || !w.minimized) return;
    w.minimized = false;
    w.el.removeAttribute("aria-hidden");
    w.el.style.transition = "transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s ease";
    w.el.style.opacity = "0";
    w.el.style.transform = "scale(0.95)";
    
    requestAnimationFrame(() => {
      w.el.style.opacity = "1";
      w.el.style.transform = "scale(1)";
      setTimeout(() => {
        w.el.style.transition = "";
        w.el.style.opacity = "";
        w.el.style.transform = "";
        setActive(winId);
      }, 200);
    });
  }

  function toggleMinimize(winId){
    const w = windows.get(winId);
    if (!w) return;
    if (w.minimized) {
      restoreWindow(winId);
      playUiSound("open");
    } else {
      minimizeWindow(winId);
      playUiSound("close");
    }
  }

  function toggleMaximize(winId){
    const w = windows.get(winId);
    if (!w) return;
    
    if (w.maximized) {
      // Restore
      w.maximized = false;
      w.el.classList.remove("pf-win--maximized");
      w.el.removeAttribute("data-max");
      const restore = w.restoreState;
      w.el.style.width = restore.width;
      w.el.style.height = restore.height;
      w.el.style.left = restore.left;
      w.el.style.top = restore.top;
      w.el.style.transition = "all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)";
      setTimeout(() => { w.el.style.transition = ""; }, 200);
    } else {
      // Maximize
      w.maximized = true;
      w.el.classList.add("pf-win--maximized");
      w.el.setAttribute("data-max","true");
      const rect = w.el.getBoundingClientRect();
      w.restoreState = {
        width: w.el.style.width || `${rect.width}px`,
        height: w.el.style.height || `${rect.height}px`,
        left: w.el.style.left || `${rect.left}px`,
        top: w.el.style.top || `${rect.top}px`
      };
      w.el.style.transition = "all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)";
      const area = getWorkArea();
      w.el.style.width = `${Math.max(320, window.innerWidth - area.left - area.right)}px`;
      w.el.style.height = `${Math.max(220, window.innerHeight - area.top - area.bottom)}px`;
      w.el.style.left = `${area.left}px`;
      w.el.style.top = `${area.top}px`;
      setTimeout(() => { w.el.style.transition = ""; }, 200);
    }
    setActive(winId);
    playUiSound(w.maximized ? "open" : "close");
  }

  function closeWindow(winId){
    const w = windows.get(winId);
    if (!w) return;

    // Optional per-window cleanup hook (apps can register listeners/URLs).
    try { if (typeof w.cleanup === "function") w.cleanup(); } catch {}
    
    // Animate close
    w.el.style.transition = "opacity 0.15s ease, transform 0.15s ease";
    w.el.style.opacity = "0";
    w.el.style.transform = "scale(0.95)";
    playUiSound("close");
    
    setTimeout(() => {
      w.el.remove();
      w.taskEl?.remove();
      windows.delete(winId);
      activateLastVisible();
      scheduleRecentsRender();
    }, 150);
  }

  function createWindow({ title, url, html, appId }){
    const winId = `w${Date.now()}_${++seq}`;
    const el = document.createElement("div");
    el.className = "pf-win";
    el.dataset.winid = winId;
    el.dataset.appid = appId || "";
    el.style.zIndex = String(++z);

    const safeTitle = normalizeTitle(title);

    el.innerHTML = `
      <div class="pf-win__bar" data-dragbar>
        <div class="pf-win__title">${escapeHtml(safeTitle)}</div>
        <div class="pf-win__controls">
          <button class="pf-win__ctrl" type="button" data-min aria-label="Minimize" title="Minimize">—</button>
          <button class="pf-win__ctrl" type="button" data-max aria-label="Maximize" title="Maximize">▢</button>
          <button class="pf-win__ctrl pf-win__ctrl--menu" type="button" data-menu aria-label="Menu" title="Menu">☰</button>
          <button class="pf-win__ctrl pf-win__ctrl--close" type="button" data-close aria-label="Close" title="Close">✕</button>
        </div>
      </div>
      <div class="pf-win__body" data-body>${html || `<div class="pf-windesc">Loading…</div>`}</div>
    `;

    // position stagger
    const area = getWorkArea();
    const left = area.left + 40 + (seq % 7) * 18;
    const top = area.top + 36 + (seq % 7) * 16;
    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;

    const sizePreset = String(getOSSetting("defaultWindowSize", "medium"));
    const sizeMap = {
      compact: { w: 720, h: 500 },
      medium: { w: 900, h: 600 },
      large: { w: 1120, h: 740 }
    };
    const nextSize = sizeMap[sizePreset] || sizeMap.medium;
    el.style.width = `min(${nextSize.w}px, calc(100vw - 24px))`;
    el.style.height = `min(${nextSize.h}px, calc(100vh - 24px))`;

    // Initial animation state
    el.style.opacity = "0";
    el.style.transform = "scale(0.95) translateY(-10px)";
    
    layer.appendChild(el);

    const taskEl = addTaskButton(winId, safeTitle);
    const w = { el, taskEl, minimized:false, maximized:false, url:url || null, title:safeTitle, appId:appId || null, restoreState:null };
    windows.set(winId, w);
    setActive(winId);
    scheduleRecentsRender();

    // Animate window in
    requestAnimationFrame(() => {
      el.style.transition = "opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)";
      el.style.opacity = "1";
      el.style.transform = "scale(1) translateY(0)";
      setTimeout(() => {
        el.style.transition = "";
      }, 200);
    });
    playUiSound("open");

    el.addEventListener("mousedown", () => setActive(winId));
    el.querySelector("[data-min]")?.addEventListener("click", (e) => { e.stopPropagation(); toggleMinimize(winId); });
    el.querySelector("[data-max]")?.addEventListener("click", (e) => { e.stopPropagation(); toggleMaximize(winId); });
    el.querySelector("[data-menu]")?.addEventListener("click", (e) => { e.stopPropagation(); toggleStartMenu(); });
    el.querySelector("[data-close]")?.addEventListener("click", (e) => { e.stopPropagation(); closeWindow(winId); });

    // drag
    const bar = el.querySelector("[data-dragbar]");
    bar?.addEventListener("mousedown", (e) => {
      if (!isDesktop()) return;
      if (e.target.closest(".pf-win__controls")) return;
      const r = el.getBoundingClientRect();
      dragState = {
        winId,
        sx: e.clientX,
        sy: e.clientY,
        sl: r.left,
        st: r.top,
        wasMaximized: windows.get(winId)?.maximized
      };
      e.preventDefault();
    });

    bar?.addEventListener("dblclick", (e) => {
      if (!isDesktop()) return;
      if (e.target.closest(".pf-win__controls")) return;
      toggleMaximize(winId);
    });

    if (url) loadUrlIntoWindow(winId, url, safeTitle);
    return winId;
  }

  async function loadUrlIntoWindow(winId, url, fallbackTitle){
    const w = windows.get(winId);
    if (!w) return;
    const body = $("[data-body]", w.el);
    try {
      const u = new URL(url, window.location.origin);
      // Use ?view=window for internal routes
      if (u.origin === window.location.origin) {
        if (!u.searchParams.get("view")) u.searchParams.set("view","window");
      }
      const res = await fetch(u.toString(), { credentials:"same-origin" });
      const html = await res.text();
      body.innerHTML = html;

      // bind open-url buttons inside loaded content
      bindWindowInternalActions(body);

      // AJAX add-to-cart from product window
      bindProductAddToCart(body);

      // cart mount window
      const cartMount = body.querySelector("[data-cartmount]");
      if (cartMount) mountCart(cartMount);

      // search form predictive binding
      const searchForm = body.querySelector("[data-searchform]");
      if (searchForm) bindSearchWindow(searchForm, body);

    } catch (err){
      body.innerHTML = `<div class="pf-windesc">Couldn’t load content.</div>`;
    }
  }

  function bindWindowInternalActions(scope){
    // Event delegation now handles window content actions globally.
    // Keep this for backward compatibility with existing calls.
    if (!scope) return;
  }

  // Delegated OS actions (links, buttons, menu commands)
  const actionSelector = "[data-oscmd],[data-app-id],[data-osapp],[data-openapp],[data-open-url],[data-open],[data-url],a[href]";
  root.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    const target = e.target.closest(actionSelector);
    if (!target || !root.contains(target)) return;
    if (target.closest(".pf-icon")) return; // desktop icons handle double-click
    if (target.hasAttribute("data-no-os")) return;

    const href = target.getAttribute("href");
    if (href && (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))) return;
    if (href && !isInternal(href)) return;

    const cmd = target.getAttribute("data-oscmd");
    if (cmd === "home") {
      e.preventDefault();
      resetDesktop();
      return;
    }

    const osapp = target.getAttribute("data-app-id") || target.getAttribute("data-osapp") || target.getAttribute("data-openapp");
    const url = target.getAttribute("data-url")
      || target.getAttribute("data-open-url")
      || target.getAttribute("data-open")
      || href;
    const title = target.getAttribute("data-title") || target.textContent?.trim() || "Window";

    if (osapp) {
      e.preventDefault();
      closeStart();
      launchApp(osapp, url, title);
      return;
    }

    if (url) {
      e.preventDefault();
      closeStart();
      openUrl(url, title);
    }
  });

  // Desktop icon activation
  function activateIcon(el){
    const osapp = el.getAttribute("data-app-id") || el.getAttribute("data-osapp");
    const url = el.getAttribute("data-url");
    const title = el.getAttribute("data-title") || el.querySelector(".pf-iconlabel")?.textContent || "Window";
    if (osapp) return launchApp(osapp);
    if (url) return openUrl(url, title);
  }

  const refreshDesktopIconBounds = () => {
    if (!isDesktop()) return;
    if (!iconsEl || !desktopEl) return;
    const icons = Array.from(iconsEl.querySelectorAll(".pf-icon"));
    if (!icons.length) return;
    const containerRect = iconsEl.getBoundingClientRect();
    const desktopRect = desktopEl.getBoundingClientRect();
    const metrics = getGridMetrics();
    iconsEl.style.height = `${Math.max(containerRect.height, desktopRect.height)}px`;
    icons.forEach((icon) => {
      const x = parseFloat(icon.style.left);
      const y = parseFloat(icon.style.top);
      if (Number.isNaN(x) || Number.isNaN(y)) return;
      applyIconPosition(icon, { x, y }, containerRect, metrics, true);
    });
  };

  requestAnimationFrame(() => {
    applyViewportMode();
  });

  let resizeTimer = null;
  const handleResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyViewportMode();
      if (isDesktop()) requestAnimationFrame(refreshDesktopIconBounds);
    }, 200);
  };
  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);

  let lastClick = 0;
  let lastClickTarget = null;
  root.querySelectorAll(".pf-icon").forEach(icon => {
    icon.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!isDesktop()) return;
      if (dragState) return;
      if (!iconsEl) return;
      const containerRect = iconsEl.getBoundingClientRect();
      const rect = icon.getBoundingClientRect();
      iconDragState = {
        icon,
        key: icon.dataset.iconKey || getIconKey(icon, 0),
        sx: e.clientX,
        sy: e.clientY,
        ox: rect.left - containerRect.left,
        oy: rect.top - containerRect.top,
        containerRect,
        metrics: getGridMetrics(),
        moved: false
      };
      icon.classList.add("is-dragging");
      e.preventDefault();
    });
    icon.addEventListener("click", (e) => {
      if (Date.now() - lastIconDragAt < 250) return;
      if (!isDesktop()) {
        activateIcon(icon);
        lastClickTarget = null;
        return;
      }
      const now = Date.now();
      const sameTarget = lastClickTarget === icon;
      const dbl = sameTarget && now - lastClick < 500;
      lastClick = now;
      lastClickTarget = icon;
      if (dbl) {
        activateIcon(icon);
        lastClickTarget = null;
      }
    });
    icon.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateIcon(icon);
      }
    });
  });

  window.addEventListener("mousemove", (e) => {
    if (!iconDragState) return;
    if (!isDesktop()) { 
      iconDragState.icon.classList.remove("is-dragging");
      iconDragState = null;
      return;
    }
    const dx = e.clientX - iconDragState.sx;
    const dy = e.clientY - iconDragState.sy;
    if (!iconDragState.moved && Math.hypot(dx, dy) > 4) {
      iconDragState.moved = true;
    }
    const pos = clampPosition(
      iconDragState.ox + dx,
      iconDragState.oy + dy,
      iconDragState.containerRect,
      {
        w: iconDragState.icon.offsetWidth || iconDragState.metrics.col,
        h: iconDragState.icon.offsetHeight || iconDragState.metrics.row
      }
    );
    iconDragState.icon.style.left = `${pos.x}px`;
    iconDragState.icon.style.top = `${pos.y}px`;
  });

  window.addEventListener("mouseup", () => {
    if (!iconDragState) return;
    if (!isDesktop()) {
      iconDragState.icon.classList.remove("is-dragging");
      iconDragState = null;
      return;
    }
    const { icon, key, moved, containerRect, metrics } = iconDragState;
    const current = {
      x: parseFloat(icon.style.left) || 0,
      y: parseFloat(icon.style.top) || 0
    };
    const snapped = applyIconPosition(icon, current, containerRect, metrics, true);
    icon.classList.remove("is-dragging");
    if (moved) {
      const positions = loadIconPositions();
      positions[key] = snapped;
      saveIconPositions(positions);
      lastIconDragAt = Date.now();
    }
    iconDragState = null;
  });

  window.addEventListener("blur", () => {
    if (!iconDragState) return;
    iconDragState.icon.classList.remove("is-dragging");
    iconDragState = null;
  });

  // Make cascading flyouts open on focus/hover for second/third levels too
  startMenu?.querySelectorAll("[data-menuitem]").forEach(item => {
    const btn = item.querySelector("[data-flyoutbtn]");
    const flyout = item.querySelector(":scope > [data-flyout]");
    if (!btn || !flyout) return;
    const show = () => flyout.removeAttribute("hidden");
    const hide = () => { flyout.setAttribute("hidden",""); closeDescendantFlyouts(flyout); };
    item.addEventListener("mouseenter", show);
    item.addEventListener("mouseleave", hide);
    btn.addEventListener("focus", show);
  });
  startMenu?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-win-focus]");
    if (!btn) return;
    const winId = btn.getAttribute("data-win-focus");
    if (!winId) return;
    focusWindow(winId);
    closeStart();
  });

  // ---- App Registry
  const OS = {
    apps: new Map(),
    registerApp(id, def){ this.apps.set(id, def); },
    launch(id, ctx={}) {
      const def = this.apps.get(id);
      if (!def) return openUrl(ctx.url || "/", ctx.title || id);
      if (def.singleton) {
        const existing = findWindowByApp(id);
        if (existing) {
          focusWindow(existing);
          return existing;
        }
      }
      return def.launch(ctx);
    }
  };

  window.PFDesktopOS = {
    registerApp: (id, def) => OS.registerApp(id, def),
    launch: (id, ctx = {}) => OS.launch(id, ctx),
    createWindow: (cfg) => createWindow(cfg),
    getWindowEl: (winId) => windows.get(winId)?.el || null,
    closeStartMenu: () => closeStart(),
    openUrl: (url, title) => openUrl(url, title),
    refreshCartBadge: () => refreshCartBadge(),
    escapeHtml: (value) => escapeHtml(value)
  };

  function launchApp(id, url, title){
    // allow /?osapp=cart style links too
    const state = loadAppState();
    state.lastUsed[id] = Date.now();
    saveAppState(state);
    return OS.launch(id, { url, title });
  }

  function openUrl(url, title){
    if (!url) return;
    if (isHomeUrl(url)) { resetDesktop(); return; }
    if (isProtected(url)) { window.location.href = url; return; }
    createWindow({ title: title || "Window", url, appId:"url" });
  }

  const shortcutMatchesEvent = (shortcut, event) => {
    const raw = String(shortcut || "").trim().toLowerCase();
    if (!raw) return false;
    const keys = raw.split("+").map((x) => x.trim()).filter(Boolean);
    const expected = {
      ctrl: keys.includes("ctrl") || keys.includes("control"),
      shift: keys.includes("shift"),
      alt: keys.includes("alt"),
      meta: keys.includes("meta") || keys.includes("cmd") || keys.includes("command")
    };
    const key = keys.find((k) => !["ctrl", "control", "shift", "alt", "meta", "cmd", "command"].includes(k));
    if (!key) return false;
    if (expected.ctrl !== event.ctrlKey) return false;
    if (expected.shift !== event.shiftKey) return false;
    if (expected.alt !== event.altKey) return false;
    if (expected.meta !== event.metaKey) return false;
    return event.key.toLowerCase() === key;
  };

  document.addEventListener("keydown", (e) => {
    const target = e.target;
    if (target instanceof HTMLElement) {
      if (target.isContentEditable) return;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
    }
    const shortcut = getOSSetting("quickSearchShortcut", "Ctrl+K");
    if (!shortcutMatchesEvent(shortcut, e)) return;
    e.preventDefault();
    launchApp("search");
  });

  function getTemplateHtml(id){
    const tpl = document.getElementById(id);
    return tpl ? tpl.innerHTML.trim() : "";
  }

  function bindSupportForm(scope){
    const wrap = scope?.querySelector("[data-support-form]");
    const form = wrap?.querySelector("form");
    if (!form || form.dataset.supportBound) return;
    form.dataset.supportBound = "true";

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const success = form.querySelector("[data-support-success]");
      const error = form.querySelector("[data-support-error]");
      if (success) success.hidden = true;
      if (error) error.hidden = true;

      try {
        const action = form.getAttribute("action") || routes.supportFallback || "/contact";
        const res = await fetch(action, {
          method: "POST",
          credentials: "same-origin",
          body: new FormData(form)
        });
        if (res.ok) {
          if (success) success.hidden = false;
          form.reset();
          return;
        }
      } catch {}

      if (error) error.hidden = false;
    });
  }

  function bindSettingsApp(scope){
    if (!scope || scope.dataset.settingsBound) return;
    scope.dataset.settingsBound = "true";
    if (settingsEngine && typeof settingsEngine.mountSettingsUI === "function") {
      settingsEngine.mountSettingsUI(scope);
      return;
    }
    const fallback = scope.querySelector("[data-settings-root]");
    if (fallback) {
      fallback.innerHTML = `<div class="pf-windesc">Settings engine unavailable.</div>`;
    }
  }

  const appStateKey = "pf_appstore_state_v1";
  const loadAppState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(appStateKey) || "{}");
      return Object.assign({ installed: {}, pinned: {}, lastUsed: {} }, saved);
    } catch {
      return { installed: {}, pinned: {}, lastUsed: {} };
    }
  };
  const saveAppState = (state) => localStorage.setItem(appStateKey, JSON.stringify(state));

  // Entitlement placeholder: use customer metafields now, replace with real backend later.
  const isEntitled = (app, manifest) => {
    if (!app || !app.premium) return true;
    const passKey = app.entitlementKey
      || manifest?.proPass?.entitlementKey
      || proPassKey;
    return customerLoggedIn && Boolean(entitlementMap?.[passKey]);
  };

  const getAppStatus = (app, state, manifest) => {
    const installed = Boolean(app.preinstalled) || Boolean(state.installed[app.id]);
    const pinnedState = state.pinned[app.id];
    const pinned = pinnedState === undefined ? Boolean(app.pinnedDefault) : Boolean(pinnedState);
    const entitled = isEntitled(app, manifest);
    const locked = Boolean(app.premium) && !entitled;
    return { installed, pinned, locked, entitled };
  };

  const renderAppCard = (app, state, manifest) => {
    const status = getAppStatus(app, state, manifest);
    const badges = [];
    if (app.featured) badges.push("Featured");
    badges.push(app.premium ? (status.locked ? "Locked" : "Pro Pass") : "Free");
    if (status.locked && !customerLoggedIn) badges.push("Sign in");
    if (status.installed) badges.push("Installed");
    if (status.pinned) badges.push("Pinned");

    const primaryLabel = status.locked
      ? (manifest?.proPass?.ctaLabel || "Start Pro Pass")
      : (status.installed || app.actionType || app.osAppId || app.url ? "Open" : "Install");
    const primaryAction = status.locked ? "unlock" : (status.installed || app.actionType || app.osAppId || app.url ? "open" : "install");
    const pinLabel = status.pinned ? "Unpin" : "Pin";
    const canPin = app.pinnable !== false;

    return `
      <article class="pf-appcard ${status.locked ? "pf-appcard--locked" : ""}" data-app-id="${escapeHtml(app.id)}">
        <div class="pf-appcard__icon" aria-hidden="true">${escapeHtml(app.icon || "🧩")}</div>
        <div class="pf-appcard__meta">
          <div class="pf-appcard__title">${escapeHtml(app.name || "App")}</div>
          <div class="pf-appcard__desc">${escapeHtml(app.description || "")}</div>
          <div class="pf-appcard__badges">
            ${badges.map(b => `<span class="pf-appbadge">${escapeHtml(b)}</span>`).join("")}
          </div>
        </div>
        <div class="pf-appcard__actions">
          <button class="pf-winbtn" type="button" data-app-action="${primaryAction}" data-app-id="${escapeHtml(app.id)}">${primaryLabel}</button>
          ${canPin ? `<button class="pf-winbtn pf-winbtn--ghost" type="button" data-app-action="pin" data-app-id="${escapeHtml(app.id)}">${pinLabel}</button>` : ""}
        </div>
      </article>
    `;
  };

  const ensureStartMenuExtras = () => {
    if (!startMenu) return;
    const appsWrap = startMenu.querySelector(".pf-startmenu__apps");
    if (appsWrap && !appsWrap.querySelector("[data-startmenu-search]")) {
      appsWrap.insertAdjacentHTML("afterbegin", `
        <div class="pf-startmenu__search">
          <input class="pf-wininput pf-startmenu__searchinput" type="search" data-startmenu-search placeholder="Search apps" aria-label="Search apps">
        </div>
      `);
    }
    if (appsWrap && !appsWrap.querySelector("[data-startmenu-recents]")) {
      appsWrap.insertAdjacentHTML("beforeend", `
        <div class="pf-startmenu__recents" data-startmenu-recents>
          <div class="pf-startmenu__title">Recents</div>
          <ul class="pf-recents" data-recents-list></ul>
        </div>
      `);
    }
  };

  const bindStartMenuSearch = () => {
    if (!startMenu) return;
    const input = startMenu.querySelector("[data-startmenu-search]");
    if (!input || input.dataset.bound) return;
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      startMenu.querySelectorAll(".pf-menu__item--app").forEach((item) => {
        const label = item.querySelector(".pf-menu__label")?.textContent?.toLowerCase() || "";
        item.hidden = Boolean(q) && !label.includes(q);
      });
    });
  };

  const renderStartMenuRecents = () => {
    if (!startMenu) return;
    const list = startMenu.querySelector("[data-recents-list]");
    if (!list) return;
    const entries = Array.from(windows.entries()).map(([id, w]) => ({
      id,
      title: w?.title || "Window",
      active: w?.el?.classList?.contains("pf-win--active"),
      minimized: Boolean(w?.minimized)
    }));
    if (!entries.length) {
      list.innerHTML = `<li class="pf-startmenu__empty">No open apps yet.</li>`;
      return;
    }
    entries.sort((a, b) => {
      if (a.active === b.active) return 0;
      return a.active ? -1 : 1;
    });
    list.innerHTML = entries.map((entry) => `
      <li class="pf-recents__item">
        <button class="pf-recents__btn ${entry.active ? "is-active" : ""} ${entry.minimized ? "is-minimized" : ""}" type="button" data-win-focus="${escapeHtml(entry.id)}">
          ${escapeHtml(entry.title)}
        </button>
      </li>
    `).join("");
  };

  let recentsRaf = null;
  const scheduleRecentsRender = () => {
    if (recentsRaf) return;
    recentsRaf = requestAnimationFrame(() => {
      recentsRaf = null;
      renderStartMenuRecents();
    });
  };

  const openAppFromStore = (app, status, manifest) => {
    if (status.locked) {
      const unlockUrl = app.unlockUrl || manifest?.proPass?.unlockUrl || routes.storefront;
      if (unlockUrl) return openUrl(unlockUrl, app.name);
      return createWindow({ title: app.name || "App", html: `<div class="pf-wincontent"><div class="pf-windesc">This app is locked.</div></div>` });
    }

    if (app.actionType === "command" && app.actionValue === "home") {
      resetDesktop();
      return;
    }
    if (app.actionType === "osapp") return launchApp(app.actionValue || app.osAppId);
    if (app.actionType === "url") return openUrl(app.actionValue || app.url, app.name || "App");
    if (app.actionType === "placeholder") {
      return createWindow({ title: app.actionValue || app.name || "App", html: `<div class="pf-wincontent"><div class="pf-windesc">This app shell is ready for integration.</div></div>` });
    }

    if (app.osAppId) return launchApp(app.osAppId);
    if (app.url) return openUrl(app.url, app.name || "App");
    return createWindow({ title: app.name || "App", html: `<div class="pf-wincontent"><div class="pf-windesc">Coming soon.</div></div>` });
  };

  const renderStartMenuApps = () => {
    const manifest = getAppManifest();
    const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
    const state = loadAppState();
    const pinnedWrap = root.querySelector("[data-startmenu-pinned]");
    const featuredWrap = root.querySelector("[data-startmenu-featured]");
    if (!pinnedWrap && !featuredWrap) return;
    ensureStartMenuExtras();
    bindStartMenuSearch();
    scheduleRecentsRender();

    const pinnedApps = apps.filter((app) => {
      if (app.pinnable === false) return false;
      const pinnedState = state.pinned[app.id];
      const isPinned = pinnedState === undefined ? Boolean(app.pinnedDefault) : Boolean(pinnedState);
      return isPinned;
    });

    const featuredApps = apps.filter((app) => app.featured);

    const renderTile = (app) => {
      const status = getAppStatus(app, state, manifest);
      const locked = status.locked;
      const classes = ["pf-tile"];
      if (locked) classes.push("pf-tile--locked");
      if (app.wide) classes.push("pf-tile--wide");

      const attrs = [];
      attrs.push(`data-app-id="${escapeHtml(app.id)}"`);
      if (!locked) {
        if (app.actionType === "command") {
          attrs.push(`data-oscmd="${escapeHtml(app.actionValue || "")}"`);
        } else if (app.actionType === "osapp") {
          attrs.push(`data-osapp="${escapeHtml(app.actionValue || "")}"`);
        } else if (app.actionType === "url") {
          attrs.push(`data-url="${escapeHtml(app.actionValue || app.url || "")}"`);
        } else if (app.actionType === "placeholder") {
          attrs.push(`data-osapp="app-store"`);
        } else if (app.osAppId) {
          attrs.push(`data-osapp="${escapeHtml(app.osAppId)}"`);
        }
      } else {
        const unlockUrl = app.unlockUrl || manifest?.proPass?.unlockUrl || routes.storefront;
        attrs.push(`data-url="${escapeHtml(unlockUrl)}"`);
        attrs.push(`data-title="${escapeHtml(manifest?.proPass?.ctaLabel || "Start Pro Pass")}"`);
      }

      const badge = locked ? `<span class="pf-tile__badge">Locked</span>` : "";
      return `
        <button class="${classes.join(" ")}" type="button" ${attrs.join(" ")}>
          <span class="pf-tile__icon">${escapeHtml(app.icon || "🧩")}</span>
          <span class="pf-tile__label">${escapeHtml(app.name || "App")}</span>
          ${badge}
        </button>
      `;
    };

    if (featuredWrap) {
      featuredWrap.innerHTML = featuredApps.length
        ? featuredApps.map(renderTile).join("")
        : `<div class="pf-startmenu__empty">No featured apps yet.</div>`;
    }
    if (pinnedWrap) {
      pinnedWrap.innerHTML = pinnedApps.length
        ? pinnedApps.map(renderTile).join("")
        : `<div class="pf-startmenu__empty">Pin apps from the App Store.</div>`;
    }
  };

  const initAppStore = (scope) => {
    if (!scope || scope.dataset.appstoreBound) return;
    scope.dataset.appstoreBound = "true";

    const manifest = getAppManifest();
    const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
    const searchInput = scope.querySelector("[data-appstore-search]");
    const filterSelect = scope.querySelector("[data-appstore-filter]");
    const resetBtn = scope.querySelector("[data-appstore-reset]");
    const featuredGrid = scope.querySelector("[data-appstore-featured-grid]");
    const allGrid = scope.querySelector("[data-appstore-grid]");

    let state = loadAppState();

    const filterApps = () => {
      const q = (searchInput?.value || "").trim().toLowerCase();
      const filter = (filterSelect?.value || "all").trim().toLowerCase();
      return apps.filter((app) => {
        const name = String(app.name || "").toLowerCase();
        const desc = String(app.description || "").toLowerCase();
        const cat = String(app.category || "").toLowerCase();
      const tier = app.premium ? "premium" : "free";
        if (q && !name.includes(q) && !desc.includes(q)) return false;
        if (filter === "featured") return Boolean(app.featured);
        if (filter === "free") return tier === "free";
        if (filter === "premium") return tier === "premium";
        if (filter !== "all") return cat === filter;
        return true;
      });
    };

    const render = () => {
      state = loadAppState();
      const featured = apps.filter((app) => app.featured);
      const filtered = filterApps();

      if (featuredGrid) {
        featuredGrid.innerHTML = featured.length
          ? featured.map((app) => renderAppCard(app, state, manifest)).join("")
          : `<div class="pf-appstore__empty">No featured apps yet.</div>`;
      }

      if (allGrid) {
        allGrid.innerHTML = filtered.length
          ? filtered.map((app) => renderAppCard(app, state, manifest)).join("")
          : `<div class="pf-appstore__empty">No apps match your filters.</div>`;
      }
      renderStartMenuApps();
    };

    scope.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-app-action]");
      if (!btn) return;
      const appId = btn.getAttribute("data-app-id");
      const action = btn.getAttribute("data-app-action");
      const app = apps.find((a) => a.id === appId);
      if (!app) return;
      const status = getAppStatus(app, state, manifest);

      if (action === "install") {
        state.installed[appId] = true;
        state.lastUsed[appId] = Date.now();
        saveAppState(state);
        render();
        return;
      }
      if (action === "pin") {
        state.pinned[appId] = !state.pinned[appId];
        saveAppState(state);
        render();
        return;
      }
      if (action === "unlock") {
        openAppFromStore(app, status, manifest);
        state.lastUsed[appId] = Date.now();
        saveAppState(state);
        return;
      }
      if (action === "open") {
        openAppFromStore(app, status, manifest);
        state.lastUsed[appId] = Date.now();
        saveAppState(state);
      }
    });

    searchInput?.addEventListener("input", render);
    filterSelect?.addEventListener("change", render);
    resetBtn?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (filterSelect) filterSelect.value = "all";
      render();
    });

    render();
  };

  renderStartMenuApps();

  // Special: parse osapp query (so nav can point to /?osapp=cart)
  (function(){
    const sp = new URLSearchParams(window.location.search);
    const osapp = sp.get("osapp");
    const open = sp.get("open");
    if (open) {
      const decoded = decodeURIComponent(open);
      openUrl(decoded, "Window");
      window.history.replaceState({}, "", "/");
      return;
    }
    if (osapp) {
      launchApp(osapp);
      window.history.replaceState({}, "", "/");
      return;
    }
    // If user lands on non-root path (direct visit), open that content in a window and reset to /
    if (window.location.pathname !== "/" && window.location.pathname !== "/index") {
      const here = window.location.pathname + window.location.search + window.location.hash;
      // Don't window-wrap protected routes (account/checkout/etc.)
      if (isProtected(here)) return;
      window.history.replaceState({}, "", "/");
      openUrl(here, document.title || "Window");
    }
  })();

  // ---- Apps

  OS.registerApp("cart", {
    launch(){
      return createWindow({ title:"Cart", url: routes.cart, appId:"cart" });
    }
  });

  OS.registerApp("search", {
    launch(){
      return createWindow({ title:"Search", url: routes.search, appId:"search" });
    }
  });

  // Collections is retired in favor of Shop (registered in os-shop.js).
  OS.registerApp("collections", {
    launch(ctx){
      if (OS.apps.has("shop")) return OS.launch("shop", ctx);
      return createWindow({ title: ctx?.title || "Shop", url: routes.collections, appId:"shop" });
    }
  });

  OS.registerApp("storefront", {
    launch(ctx){
      return createWindow({ title: ctx.title || "Storefront", url: ctx.url || routes.storefront, appId:"storefront" });
    }
  });

  OS.registerApp("app-store", {
    singleton: true,
    launch(ctx){
      const html = getTemplateHtml("pf-appstore-template");
      const winId = createWindow({ title: ctx.title || "App Store", html, appId:"app-store" });
      const win = windows.get(winId);
      if (win) initAppStore(win.el);
      return winId;
    }
  });

  
  OS.registerApp("files", {
    launch(ctx){
      const html = `
        <div class="pf-wincontent">
          <h2 class="pf-wintitle">File Manager</h2>
          <div class="pf-windesc">Browse by file type, compatibility, and licenses. (Storefront-powered)</div>

          <div class="pf-winrow" style="gap:10px;flex-wrap:wrap;margin-top:12px;">
            <button class="pf-winbtn" type="button" data-open="${routes.storefront}?filter.p.tag=file-svg" data-title="SVG Files">SVG</button>
            <button class="pf-winbtn" type="button" data-open="${routes.storefront}?filter.p.tag=file-stl" data-title="STL Files">STL</button>
            <button class="pf-winbtn" type="button" data-open="${routes.storefront}?filter.p.tag=file-pdf" data-title="PDF Files">PDF</button>
            <button class="pf-winbtn" type="button" data-open="${routes.storefront}?filter.p.tag=file-bundle" data-title="Bundles">Bundles</button>
            <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.storefront}" data-title="All Files">All</button>
          </div>

          <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="border:1px solid var(--pf-border);border-radius:2px;padding:12px;background:var(--pf-panel);">
              <div class="pf-windesc" style="margin-bottom:10px;">Compatibility</div>
              <div class="pf-winrow" style="gap:8px;flex-wrap:wrap;">
                <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.storefront}?filter.p.tag=compat-cricut" data-title="Cricut Compatible">Cricut</button>
                <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.storefront}?filter.p.tag=compat-silhouette" data-title="Silhouette Compatible">Silhouette</button>
                <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.storefront}?filter.p.tag=compat-3dprint" data-title="3D Print Ready">3D Print</button>
                <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.storefront}?filter.p.tag=compat-cnc" data-title="CNC Ready">CNC</button>
              </div>
            </div>

            <div style="border:1px solid var(--pf-border);border-radius:2px;padding:12px;background:var(--pf-panel);">
              <div class="pf-windesc" style="margin-bottom:10px;">Licenses</div>
              <div class="pf-winrow" style="gap:8px;flex-wrap:wrap;">
                <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.storefront}?filter.p.tag=lic-personal" data-title="Personal License">Personal</button>
                <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.storefront}?filter.p.tag=lic-commercial" data-title="Commercial License">Commercial</button>
                <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.storefront}?filter.p.tag=lic-extended" data-title="Extended License">Extended</button>
              </div>
            </div>
          </div>

          <div style="margin-top:14px;">
            <div class="pf-windesc">Purchased downloads are typically shown in your order details. Use Account → Orders for exact download links.</div>
            <div class="pf-winrow" style="gap:10px;margin-top:10px;flex-wrap:wrap;">
              <button class="pf-winbtn" type="button" data-open="${routes.account}" data-title="Account">Open Account</button>
              <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open="${routes.account}/orders" data-title="Orders">Open Orders</button>
            </div>
          </div>
        </div>
      `;
      const winId = createWindow({ title: ctx.title || "File Manager", html, appId:"files" });
      const win = windows.get(winId);
      if (!win) return winId;
      win.el.addEventListener("click", (e)=>{
        const btn = e.target.closest("[data-open]");
        if (!btn) return;
        openUrl(btn.getAttribute("data-open"), btn.getAttribute("data-title") || "Window");
      });
      return winId;
    }
  });

  OS.registerApp("settings", {
    singleton: true,
    launch(ctx){
      const html = getTemplateHtml("pf-settings-template");
      const winId = createWindow({ title: ctx.title || "Settings", html, appId:"settings" });
      const win = windows.get(winId);
      if (win) bindSettingsApp(win.el);
      return winId;
    }
  });

  // Support Center app: render from template; fall back to contact page route when needed.
  OS.registerApp("support-center", {
    singleton: true,
    launch(ctx){
      const html = getTemplateHtml("pf-support-template");
      if (html) {
        const winId = createWindow({ title: ctx.title || "Support Center", html, appId:"support-center" });
        const win = windows.get(winId);
        if (win) bindSupportForm(win.el);
        return winId;
      }
      return createWindow({ title: ctx.title || "Support Center", url: ctx.url || routes.supportFallback, appId:"support-center" });
    }
  });

  // Backward compatibility for existing support icons.
  OS.registerApp("support", {
    launch(ctx){
      return OS.launch("support-center", ctx);
    }
  });

  OS.registerApp("system", {
    launch(ctx){
      return createWindow({ title: ctx.title || "Account", url: ctx.url || routes.account, appId:"system" });
    }
  });

  OS.registerApp("studio", {
    launch(ctx){
      const productUrl = ctx?.url || "";
      const productTitle = ctx?.title || ctx?.productTitle || "Studio";
      const html = `
        <div class="pf-wincontent">
          <h2 class="pf-wintitle">Studio</h2>
          <div class="pf-windesc">Quick tools for digital products. (v2.2.2)</div>

          ${productUrl ? `<div class="pf-windesc" style="margin-top:8px;">Working on: <strong>${escapeHtml(productTitle)}</strong></div>` : ``}

          <div class="pf-tabs" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
            <button class="pf-winbtn pf-winbtn--ghost" type="button" data-tab="text">Text → SVG</button>
            <button class="pf-winbtn pf-winbtn--ghost" type="button" data-tab="svg">SVG Preview</button>
            <button class="pf-winbtn pf-winbtn--ghost" type="button" data-tab="notes">Notes</button>
            ${productUrl ? `<button class="pf-winbtn" type="button" data-open-url="${productUrl}" data-title="${escapeHtml(productTitle)}">Open Product</button>` : ``}
          </div>

          
          <div data-panel="text" style="margin-top:12px;">
            <div class="pf-windesc">Design text-based SVGs with quick styling controls, export presets, and one-click download.</div>

            <div style="margin-top:10px;display:grid;grid-template-columns: 1.2fr .8fr; gap:12px; align-items:start;">
              <div style="border:1px solid var(--pf-border);border-radius:2px;padding:12px;background:var(--pf-panel);">
                <div class="pf-winrow" style="gap:10px;align-items:flex-end;flex-wrap:wrap;">
                  <div style="flex:1;min-width:220px;">
                    <label class="pf-winlabel">Text</label>
                    <input class="pf-wininput" type="text" value="${productUrl ? escapeHtml(productTitle) : "PHIA'S FAB"}" data-text>
                  </div>
                  <div style="width:160px;min-width:140px;">
                    <label class="pf-winlabel">Font</label>
                    <select class="pf-wininput" data-font>
                      <option value="Arial">Arial</option>
                      <option value="Segoe UI">Segoe UI</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Trebuchet MS">Trebuchet MS</option>
                      <option value="Impact">Impact</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                    </select>
                  </div>
                  <div style="width:120px;">
                    <label class="pf-winlabel">Font size</label>
                    <input class="pf-wininput" type="number" value="96" min="10" max="400" step="1" data-size>
                  </div>
                </div>

                <div class="pf-winrow" style="gap:10px;margin-top:10px;align-items:flex-end;flex-wrap:wrap;">
                  <div style="width:140px;">
                    <label class="pf-winlabel">Fill</label>
                    <input class="pf-wininput" type="color" value="#ffffff" data-fill>
                  </div>
                  <div style="width:140px;">
                    <label class="pf-winlabel">Stroke</label>
                    <input class="pf-wininput" type="color" value="#00e5ff" data-stroke>
                  </div>
                  <div style="width:120px;">
                    <label class="pf-winlabel">Stroke width</label>
                    <input class="pf-wininput" type="number" value="3" min="0" max="30" step="0.5" data-strokew>
                  </div>
                  <div style="width:140px;">
                    <label class="pf-winlabel">Letter spacing</label>
                    <input class="pf-wininput" type="number" value="0" min="-20" max="60" step="0.5" data-spacing>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <label class="pf-winlabel">Curve (0 = straight)</label>
                  <input class="pf-wininput" type="range" min="-100" max="100" value="0" data-curve>
                  <div class="pf-windesc" style="margin-top:6px;">Negative curves downward, positive curves upward.</div>
                </div>

                <div class="pf-winrow" style="gap:10px;margin-top:12px;align-items:flex-end;flex-wrap:wrap;">
                  <div style="width:160px;">
                    <label class="pf-winlabel">Canvas preset</label>
                    <select class="pf-wininput" data-preset>
                      <option value="12x12">12x12 in</option>
                      <option value="8.5x11">8.5x11 in</option>
                      <option value="A4">A4</option>
                      <option value="square">Square 2000px</option>
                      <option value="wide">Wide 3000x1500</option>
                    </select>
                  </div>
                  <div style="width:150px;">
                    <label class="pf-winlabel">Padding</label>
                    <input class="pf-wininput" type="number" value="120" min="0" max="800" step="5" data-pad>
                  </div>
                  <div style="width:160px;">
                    <label class="pf-winlabel">Background</label>
                    <input class="pf-wininput" type="color" value="#000000" data-bg>
                  </div>
                  <button class="pf-winbtn" type="button" data-generate>Generate</button>
                  <button class="pf-winbtn pf-winbtn--ghost" type="button" data-download disabled>Save SVG</button>
                </div>

                <div style="margin-top:12px;border:1px solid var(--pf-border);border-radius:2px;padding:10px;background:var(--pf-panel);">
                  <div class="pf-windesc" style="margin-bottom:6px;">Preview</div>
                  <div data-preview style="overflow:auto;max-height:320px;"></div>
                </div>
              </div>

              <div style="border:1px solid var(--pf-border);border-radius:2px;padding:12px;background:var(--pf-panel);">
                <div class="pf-windesc">Quick actions</div>
                <div class="pf-winrow" style="gap:10px;flex-wrap:wrap;margin-top:10px;">
                  <button class="pf-winbtn pf-winbtn--ghost" type="button" data-save-preset>Save preset</button>
                  <button class="pf-winbtn pf-winbtn--ghost" type="button" data-load-preset>Load preset</button>
                  <button class="pf-winbtn pf-winbtn--ghost" type="button" data-copy>Copy SVG</button>
                </div>
                <div class="pf-windesc" style="margin-top:12px;">Saved presets are stored locally in this browser.</div>
              </div>
            </div>
          </div>
<div data-panel="svg" hidden style="margin-top:12px;">
            <div class="pf-windesc">Paste SVG markup to preview it.</div>
            <textarea class="pf-wininput" style="height:160px;white-space:pre;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" data-svginput></textarea>
            <div class="pf-winrow" style="margin-top:8px;">
              <button class="pf-winbtn" type="button" data-render>Render</button>
              <button class="pf-winbtn pf-winbtn--ghost" type="button" data-clearsvg>Clear</button>
            </div>
            <div style="margin-top:12px;border:1px solid var(--pf-border);border-radius:2px;padding:10px;background:var(--pf-panel);">
              <div class="pf-windesc" style="margin-bottom:6px;">Preview</div>
              <div data-svgpreview style="overflow:auto;max-height:280px;"></div>
            </div>
          </div>

          <div data-panel="notes" hidden style="margin-top:12px;">
            <div class="pf-windesc">Scratchpad (stored only in this browser).</div>
            <textarea class="pf-wininput" style="height:180px;" data-notes placeholder="Notes…"></textarea>
          </div>

          <div class="pf-statusbar" role="status" aria-live="polite" data-studio-status>Ready.</div>
        </div>`;
      const winId = createWindow({ title: productUrl ? `Studio — ${productTitle}` : "Studio", html, appId:"studio" });

      const w = windows.get(winId);
      const body = w?.el?.querySelector("[data-body]");
      if (!body) return winId;

      bindWindowInternalActions(body);

      const panels = {
        text: body.querySelector('[data-panel="text"]'),
        svg: body.querySelector('[data-panel="svg"]'),
        notes: body.querySelector('[data-panel="notes"]')
      };
      const setTab = (name) => {
        Object.entries(panels).forEach(([k, el]) => {
          if (!el) return;
          if (k === name) el.removeAttribute("hidden");
          else el.setAttribute("hidden","");
        });
      };
      body.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.getAttribute("data-tab"))));

      // Notes persistence
      const notes = body.querySelector("[data-notes]");
      const notesKey = "pf_studio_notes";
      if (notes){
        try { notes.value = localStorage.getItem(notesKey) || ""; } catch { notes.value = ""; }
        notes.addEventListener("input", () => {
          try { localStorage.setItem(notesKey, notes.value); }
          catch { setStatus("Warning: notes could not be saved (storage blocked).", "error"); }
        });
      }
      // Text -> SVG designer (advanced)
      const tIn = body.querySelector("[data-text]");
      const fontSel = body.querySelector("[data-font]");
      const sizeIn = body.querySelector("[data-size]");
      const fillIn = body.querySelector("[data-fill]");
      const strokeIn = body.querySelector("[data-stroke]");
      const swIn = body.querySelector("[data-strokew]");
      const spIn = body.querySelector("[data-spacing]");
      const curveIn = body.querySelector("[data-curve]");
      const presetSel = body.querySelector("[data-preset]");
      const padIn = body.querySelector("[data-pad]");
      const bgIn = body.querySelector("[data-bg]");
      const genBtn = body.querySelector("[data-generate]");
      const dlBtn = body.querySelector("[data-download]");
      const prev = body.querySelector("[data-preview]");
      const btnSavePreset = body.querySelector("[data-save-preset]");
      const btnLoadPreset = body.querySelector("[data-load-preset]");
      const btnCopy = body.querySelector("[data-copy]");
      const statusEl = body.querySelector("[data-studio-status]");

      let lastSvg = "";
      let lastDesign = null;

      const presets = {
        "12x12": { w: 3600, h: 3600 },
        "8.5x11": { w: 2550, h: 3300 },
        "A4": { w: 2480, h: 3508 },
        "square": { w: 2000, h: 2000 },
        "wide": { w: 3000, h: 1500 }
      };

      // ---- Studio SVG Generator (hardened)
      const EOL = "\r\n";
      const escAttr = (s) => String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const escText = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const safeLSGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
      const safeLSSet = (k,v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

      function setStatus(msg, kind){
        if (!statusEl) return;
        statusEl.textContent = String(msg || "Ready.");
        statusEl.classList.toggle("pf-statusbar--error", kind === "error");
      }

      function openStudioAlert(message, title){
        const t = title || "Studio";
        const safeMsg = escapeHtml(String(message || "An error occurred."));
        const html = `
          <div class="pf-wincontent">
            <div class="pf-wintitle" style="font-size:16px;margin:0 0 10px 0;">${escapeHtml(t)}</div>
            <div style="display:flex;gap:12px;align-items:flex-start;">
              <div style="width:32px;height:32px;border:1px solid var(--pf-border);background:var(--pf-panel2);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">!</div>
              <div class="pf-windesc" style="margin:0;white-space:pre-wrap;">${safeMsg}</div>
            </div>
            <div class="pf-winrow" style="justify-content:flex-end;margin-top:14px;">
              <button class="pf-winbtn" type="button" data-alert-ok>OK</button>
            </div>
          </div>`;
        const alertId = createWindow({ title: t, html, appId: "studio-alert" });
        const aw = windows.get(alertId);
        if (aw?.el){
          // Message boxes shouldn't clutter the taskbar (XP-ish).
          aw.taskEl?.remove();
          aw.taskEl = null;

          aw.el.style.width = "420px";
          aw.el.style.height = "190px";
          // center-ish
          const r = body.getBoundingClientRect();
          aw.el.style.left = `${Math.max(12, Math.round(r.left + (r.width - 420) / 2))}px`;
          aw.el.style.top = `${Math.max(12, Math.round(r.top + (r.height - 190) / 2))}px`;
          aw.el.querySelector("[data-alert-ok]")?.addEventListener("click", () => closeWindow(alertId));
        }
        return alertId;
      }

      function stripInvalidXmlChars(s){
        // XML 1.0 disallowed control chars (keep \t \n \r)
        return String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
      }

      function clampNum(n, min, max, fallback){
        const x = Number(n);
        if (!Number.isFinite(x)) return fallback;
        return Math.max(min, Math.min(max, x));
      }

      function sanitizeText(raw){
        const s = stripInvalidXmlChars(raw);
        const trimmed = s.replace(/\s+/g, " ").trim();
        if (!trimmed) return "PHIA'S FAB";
        return trimmed.slice(0, 180);
      }

      function sanitizeFont(raw){
        const allowed = new Set(Array.from(fontSel?.options || []).map(o => o.value).filter(Boolean));
        const candidate = String(raw || "").trim();
        if (allowed.size && allowed.has(candidate)) return candidate;
        return "Segoe UI";
      }

      function sanitizeHexColor(raw, fallback){
        const s = String(raw || "").trim();
        if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(s)) return s.toLowerCase();
        return fallback;
      }

      function fmtNum(n){
        if (!Number.isFinite(n)) return "0";
        const rounded = Math.round(n * 1000) / 1000;
        if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
        return String(rounded);
      }

      function stableHash32(str){
        // FNV-1a 32-bit
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++){
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0);
      }

      function validateSvgMarkup(svg){
        const s = String(svg || "");
        if (!s.trim()) return { ok:false, error:"SVG is empty." };
        const p = new DOMParser();
        const doc = p.parseFromString(s, "image/svg+xml");
        if (doc.getElementsByTagName("parsererror").length) return { ok:false, error:"SVG is not valid XML." };
        const root = doc.documentElement;
        if (!root || root.nodeName.toLowerCase() !== "svg") return { ok:false, error:"Root element must be <svg>." };
        const w = root.getAttribute("width");
        const h = root.getAttribute("height");
        const vb = root.getAttribute("viewBox");
        if (!w || !h || !vb) return { ok:false, error:"SVG must include width, height, and viewBox." };
        return { ok:true, doc };
      }

      function getDesign(){
        const preset = String(presetSel?.value || "12x12");
        const dim = presets[preset] || presets["12x12"];
        const w = clampNum(dim?.w, 64, 12000, 3600);
        const h = clampNum(dim?.h, 64, 12000, 3600);

        const text = sanitizeText(tIn?.value || "PHIA'S FAB");
        const font = sanitizeFont(fontSel?.value || "Segoe UI");
        const size = clampNum(sizeIn?.value, 10, 400, 96);
        const fill = sanitizeHexColor(fillIn?.value, "#ffffff");
        const stroke = sanitizeHexColor(strokeIn?.value, "#00e5ff");
        const strokeW = clampNum(swIn?.value, 0, 40, 3);
        const spacing = clampNum(spIn?.value, -30, 120, 0);
        const curve = clampNum(curveIn?.value, -100, 100, 0);
        const padMax = Math.max(0, Math.floor(Math.min(w, h) / 2) - 1);
        const pad = clampNum(padIn?.value, 0, padMax, 120);
        const bg = sanitizeHexColor(bgIn?.value, "#000000");

        return {
          text, font, size, fill, stroke, strokeW, spacing, curve, preset,
          pad, bg,
          w: Math.round(w),
          h: Math.round(h)
        };
      }

      function makeSvg(design){
        const normalized = JSON.stringify({
          text: design.text,
          font: design.font,
          size: Number(design.size),
          fill: design.fill,
          stroke: design.stroke,
          strokeW: Number(design.strokeW),
          spacing: Number(design.spacing),
          curve: Number(design.curve),
          pad: Number(design.pad),
          bg: design.bg,
          w: Number(design.w),
          h: Number(design.h)
        });
        const id = "pfpath_" + stableHash32(normalized).toString(16).padStart(8, "0");
        const safeText = escText(design.text);

        // baseline and curve geometry
        const cx = design.w / 2;
        const cy = design.h / 2;
        const amp = (design.h * 0.18) * (design.curve / 100); // amplitude
        const x0 = design.pad;
        const x1 = design.w - design.pad;

        // Quadratic curve: M x0,cy Q cx,cy-amp x1,cy
        const qy = cy - amp;
        const d = `M ${fmtNum(x0)} ${fmtNum(cy)} Q ${fmtNum(cx)} ${fmtNum(qy)} ${fmtNum(x1)} ${fmtNum(cy)}`;

        const letterSpacing = fmtNum(design.spacing); // px-ish
        const textAttrs = `font-family="${escAttr(design.font)}, system-ui, sans-serif" font-size="${fmtNum(design.size)}" letter-spacing="${letterSpacing}"`;

        const bgRect = design.bg && design.bg !== "transparent"
          ? `<rect width="100%" height="100%" fill="${escAttr(design.bg)}"/>`
          : `<rect width="100%" height="100%" fill="transparent"/>`;

        const usePath = Math.abs(design.curve) > 0.5;

        const textEl = usePath
          ? `<text ${textAttrs} fill="${escAttr(design.fill)}" ${design.strokeW>0 ? `stroke="${escAttr(design.stroke)}" stroke-width="${fmtNum(design.strokeW)}" paint-order="stroke"` : ""}>${EOL}    <textPath href="#${id}" xlink:href="#${id}" startOffset="50%" text-anchor="middle">${safeText}</textPath>${EOL}  </text>`
          : `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
                 ${textAttrs}
                 fill="${escAttr(design.fill)}"
                 ${design.strokeW>0 ? `stroke="${escAttr(design.stroke)}" stroke-width="${fmtNum(design.strokeW)}" paint-order="stroke"` : ""}>${safeText}</text>`;

        const defs = usePath ? `<defs><path id="${id}" d="${d}" /></defs>` : "";

        return [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${fmtNum(design.w)}" height="${fmtNum(design.h)}" viewBox="0 0 ${fmtNum(design.w)} ${fmtNum(design.h)}" preserveAspectRatio="xMidYMid meet">`,
          `  ${bgRect}`,
          `  ${defs}`,
          `  ${textEl}`,
          `</svg>`
        ].join(EOL);
      }

      function renderSvg(svg, opts){
        const silent = Boolean(opts?.silent);
        const res = validateSvgMarkup(svg);
        if (!res.ok){
          lastSvg = "";
          lastDesign = null;
          if (prev) prev.innerHTML = "";
          if (dlBtn) dlBtn.disabled = true;
          setStatus(`Error: ${res.error}`, "error");
          if (!silent) openStudioAlert(res.error, "Studio — SVG Generator");
          return false;
        }
        lastSvg = String(svg);
        if (prev){
          try{
            const svgEl = res.doc.documentElement;
            const imported = document.importNode(svgEl, true);
            prev.replaceChildren(imported);
          }catch{
            // fallback to markup if import fails for any reason
            prev.innerHTML = String(svg);
          }
        }
        if (dlBtn) dlBtn.disabled = false;
        setStatus("Ready. SVG generated.");
        return true;
      }

      function nextSvgFileName(){
        const key = "pf_svggen_icon_counter_v1";
        const raw = safeLSGet(key);
        let n = Number(raw);
        if (!Number.isFinite(n) || n < 1) n = 1;
        const name = `icon_${String(n).padStart(3, "0")}.svg`;
        safeLSSet(key, String(n + 1));
        return name;
      }

      function exportSvgToFile(svg, filename){
        const blob = new Blob([String(svg)], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Delay revoke so the download reliably starts (some browsers need a tick).
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1500);
      }

      function downloadSvg(){
        if (!lastSvg){
          setStatus("Error: Nothing to save yet.", "error");
          openStudioAlert("Nothing to save yet. Click Generate first.", "Studio — SVG Generator");
          return;
        }
        const res = validateSvgMarkup(lastSvg);
        if (!res.ok){
          setStatus(`Error: ${res.error}`, "error");
          openStudioAlert(res.error, "Studio — SVG Generator");
          return;
        }
        try{
          const filename = nextSvgFileName();
          exportSvgToFile(lastSvg, filename);
          setStatus(`Saved: ${filename}`);
        }catch(e){
          setStatus("Error: Save failed.", "error");
          openStudioAlert("Save failed. Please try again.", "Studio — SVG Generator");
        }
      }

      function copySvg(){
        if (!lastSvg){
          setStatus("Error: Nothing to copy yet.", "error");
          openStudioAlert("Nothing to copy yet. Click Generate first.", "Studio — SVG Generator");
          return;
        }
        const done = () => setStatus("Copied SVG to clipboard.");
        const fail = () => {
          setStatus("Error: Copy failed.", "error");
          openStudioAlert("Copy failed. Your browser may block clipboard access here.", "Studio — SVG Generator");
        };
        try{
          const p = navigator.clipboard?.writeText ? navigator.clipboard.writeText(lastSvg) : null;
          if (p && typeof p.then === "function") p.then(done).catch(fail);
          else {
            // fallback
            const ta = document.createElement("textarea");
            ta.value = lastSvg;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            ok ? done() : fail();
          }
        }catch{
          fail();
        }
      }

      const presetKey = "pf_studio_design_preset_v1";
      function savePreset(){
        try{
          const d = getDesign();
          safeLSSet(presetKey, JSON.stringify(d));
          setStatus("Preset saved.");
        }catch{
          setStatus("Error: Could not save preset.", "error");
          openStudioAlert("Could not save preset (storage blocked or full).", "Studio — SVG Generator");
        }
      }
      function loadPreset(){
        try{
          const raw = safeLSGet(presetKey);
          if (!raw){
            setStatus("No saved preset found.");
            return;
          }
          const d = JSON.parse(raw);
          if (tIn && d.text != null) tIn.value = String(d.text);
          if (fontSel && d.font) fontSel.value = String(d.font);
          if (sizeIn && d.size != null) sizeIn.value = String(d.size);
          if (fillIn && d.fill) fillIn.value = String(d.fill);
          if (strokeIn && d.stroke) strokeIn.value = String(d.stroke);
          if (swIn && d.strokeW != null) swIn.value = String(d.strokeW);
          if (spIn && d.spacing != null) spIn.value = String(d.spacing);
          if (curveIn && d.curve != null) curveIn.value = String(d.curve);
          if (presetSel && d.preset) presetSel.value = String(d.preset);
          if (padIn && d.pad != null) padIn.value = String(d.pad);
          if (bgIn && d.bg) bgIn.value = String(d.bg);
          setStatus("Preset loaded.");
          regenerate({ silent:true });
        }catch{
          setStatus("Error: Preset is corrupted.", "error");
          openStudioAlert("The saved preset could not be read (it may be corrupted).", "Studio — SVG Generator");
        }
      }

      function regenerate(opts){
        try{
          const d = getDesign();
          lastDesign = d;
          const svg = makeSvg(d);
          return renderSvg(svg, opts);
        }catch(e){
          lastSvg = "";
          lastDesign = null;
          if (prev) prev.innerHTML = "";
          if (dlBtn) dlBtn.disabled = true;
          setStatus("Error: Could not generate SVG.", "error");
          if (!opts?.silent) openStudioAlert("Could not generate SVG. Please check your inputs.", "Studio — SVG Generator");
          return false;
        }
      }

      genBtn?.addEventListener("click", () => regenerate({ silent:false }));
      dlBtn?.addEventListener("click", downloadSvg);
      btnCopy?.addEventListener("click", copySvg);
      btnSavePreset?.addEventListener("click", savePreset);
      btnLoadPreset?.addEventListener("click", loadPreset);

      // auto-regenerate on changes (lightweight)
      const autoInputs = [tIn,fontSel,sizeIn,fillIn,strokeIn,swIn,spIn,curveIn,presetSel,padIn,bgIn].filter(Boolean);
      let regenTimer = 0;
      function scheduleRegen(){
        if (regenTimer) window.clearTimeout(regenTimer);
        regenTimer = window.setTimeout(() => { regenerate({ silent:true }); }, 60);
      }
      autoInputs.forEach(el => {
        el.addEventListener("input", scheduleRegen);
        el.addEventListener("change", scheduleRegen);
      });

      // initial render
      regenerate({ silent:true });



      // SVG preview panel
      const svgIn = body.querySelector("[data-svginput]");
      const svgPrev = body.querySelector("[data-svgpreview]");
      function sanitizeExternalSvgAndImport(svg){
        const res = validateSvgMarkup(svg);
        if (!res.ok) return { ok:false, error: res.error };
        const root = res.doc.documentElement;
        // Remove scripts/foreignObject and inline event handlers.
        root.querySelectorAll("script, foreignObject").forEach(n => n.remove());
        root.querySelectorAll("*").forEach(el => {
          Array.from(el.attributes || []).forEach(a => {
            const name = a.name || "";
            const val = String(a.value || "");
            if (/^on/i.test(name)) el.removeAttribute(name);
            if ((name === "href" || name === "xlink:href") && /^javascript:/i.test(val)) el.removeAttribute(name);
          });
        });
        return { ok:true, svgEl: root };
      }

      body.querySelector("[data-render]")?.addEventListener("click", () => {
        const svg = svgIn?.value || "";
        if (!svgPrev) return;
        const res = sanitizeExternalSvgAndImport(svg);
        if (!res.ok){
          svgPrev.innerHTML = "";
          setStatus(`Error: ${res.error}`, "error");
          openStudioAlert(res.error, "Studio — SVG Preview");
          return;
        }
        try{
          const imported = document.importNode(res.svgEl, true);
          svgPrev.replaceChildren(imported);
          setStatus("Preview rendered.");
        }catch{
          svgPrev.innerHTML = "";
          setStatus("Error: Could not render preview.", "error");
          openStudioAlert("Could not render preview.", "Studio — SVG Preview");
        }
      });
      body.querySelector("[data-clearsvg]")?.addEventListener("click", () => {
        if (svgIn) svgIn.value = "";
        if (svgPrev) svgPrev.innerHTML = "";
        setStatus("Preview cleared.");
      });

      return winId;
    }
  });

  OS.registerApp("compressor", {
    launch(){
      // Single-instance behavior: focus existing window if already open.
      for (const [id, w] of windows.entries()){
        if (w?.appId === "compressor"){
          if (w.minimized) restoreWindow(id);
          setActive(id);
          return id;
        }
      }

      const html = `
        <div class="pf-wincontent pf-compressor" data-compressor>
          <h2 class="pf-wintitle">Image Compressor</h2>
          <div class="pf-windesc">Compress images locally using your browser. No uploads.</div>

          <div class="pf-compressor__layout" style="margin-top:12px;">
            <div class="pf-compressor__col">
              <div class="pf-compressor__panel">
                <div class="pf-windesc" style="margin-bottom:8px;">Input</div>

                <div class="pf-compressor__drop" data-drop role="button" tabindex="0" aria-label="Drop image here or browse">
                  <div style="font-size:13px;font-weight:650;margin-bottom:4px;">Drop an image here</div>
                  <div class="pf-windesc" style="margin:0 0 8px 0;">PNG, JPG/JPEG, WEBP</div>
                  <div class="pf-winrow" style="margin:0;gap:8px;flex-wrap:wrap;">
                    <input class="pf-wininput" type="file" accept="image/png,image/jpeg,image/webp" data-file>
                    <button class="pf-winbtn pf-winbtn--ghost" type="button" data-clear disabled>Clear</button>
                  </div>
                </div>

                <div class="pf-windesc" style="margin:12px 0 8px 0;">Options</div>

                <div class="pf-winrow" style="gap:10px;align-items:flex-end;flex-wrap:wrap;">
                  <div style="min-width:200px;flex:1;">
                    <label class="pf-winlabel">Quality: <strong data-qval>80</strong></label>
                    <input class="pf-wininput" type="range" min="0" max="100" value="80" data-quality>
                    <div class="pf-windesc" style="margin-top:6px;">Quality affects JPG/WEBP only.</div>
                  </div>
                  <div style="width:160px;min-width:160px;">
                    <label class="pf-winlabel">Output format</label>
                    <select class="pf-wininput" data-format>
                      <option value="image/jpeg">JPG</option>
                      <option value="image/png">PNG</option>
                      <option value="image/webp">WEBP</option>
                    </select>
                  </div>
                </div>

                <div class="pf-compressor__resize">
                  <div class="pf-winrow" style="gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0 8px 0;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--pf-text);">
                      <input type="checkbox" data-resize> Resize
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--pf-text);">
                      <input type="checkbox" data-keep checked> Maintain aspect ratio
                    </label>
                  </div>
                  <div class="pf-winrow" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin:0;">
                    <div style="width:140px;">
                      <label class="pf-winlabel">Width</label>
                      <input class="pf-wininput" type="number" min="1" max="12000" step="1" data-w disabled>
                    </div>
                    <div style="width:140px;">
                      <label class="pf-winlabel">Height</label>
                      <input class="pf-wininput" type="number" min="1" max="12000" step="1" data-h disabled>
                    </div>
                    <button class="pf-winbtn" type="button" data-run disabled>Compress</button>
                  </div>
                </div>

                <div class="pf-winrow" style="justify-content:flex-end;margin-top:10px;">
                  <button class="pf-winbtn" type="button" data-download disabled>Download</button>
                </div>
              </div>
            </div>

            <div class="pf-compressor__col">
              <div class="pf-compressor__panel">
                <div class="pf-windesc" style="margin-bottom:8px;">Preview</div>

                <div class="pf-compressor__previews">
                  <div class="pf-compressor__previewbox">
                    <div style="font-size:13px;font-weight:650;margin-bottom:6px;">Original</div>
                    <div class="pf-compressor__imgwrap">
                      <img class="pf-compressor__img" alt="Original image preview" data-origimg>
                    </div>
                    <div class="pf-compressor__stats" data-origstats>—</div>
                  </div>
                  <div class="pf-compressor__previewbox">
                    <div style="font-size:13px;font-weight:650;margin-bottom:6px;">Compressed</div>
                    <div class="pf-compressor__imgwrap">
                      <img class="pf-compressor__img" alt="Compressed image preview" data-outimg>
                    </div>
                    <div class="pf-compressor__stats" data-outstats>—</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="pf-statusbar" role="status" aria-live="polite" data-status>Ready.</div>
        </div>`;

      const winId = createWindow({ title:"Image Compressor", html, appId:"compressor" });
      const w = windows.get(winId);
      const body = w?.el?.querySelector("[data-body]");
      const appRoot = body?.querySelector("[data-compressor]");
      if (!body || !appRoot) return winId;

      const statusEl = appRoot.querySelector("[data-status]");
      const drop = appRoot.querySelector("[data-drop]");
      const fileIn = appRoot.querySelector("[data-file]");
      const clearBtn = appRoot.querySelector("[data-clear]");
      const qIn = appRoot.querySelector("[data-quality]");
      const qVal = appRoot.querySelector("[data-qval]");
      const fmtSel = appRoot.querySelector("[data-format]");
      const resizeChk = appRoot.querySelector("[data-resize]");
      const keepChk = appRoot.querySelector("[data-keep]");
      const wIn = appRoot.querySelector("[data-w]");
      const hIn = appRoot.querySelector("[data-h]");
      const runBtn = appRoot.querySelector("[data-run]");
      const dlBtn = appRoot.querySelector("[data-download]");
      const origImg = appRoot.querySelector("[data-origimg]");
      const outImg = appRoot.querySelector("[data-outimg]");
      const origStats = appRoot.querySelector("[data-origstats]");
      const outStats = appRoot.querySelector("[data-outstats]");

      const listeners = [];
      const on = (el, ev, fn, opts) => {
        if (!el) return;
        el.addEventListener(ev, fn, opts);
        listeners.push(() => el.removeEventListener(ev, fn, opts));
      };

      let origFile = null;
      let origUrl = "";
      let outUrl = "";
      let outBlob = null;
      let decoded = null; // ImageBitmap or HTMLImageElement
      let origW = 0;
      let origH = 0;
      let ratio = 1;
      let job = 0;

      function setStatus(msg, kind){
        if (!statusEl) return;
        statusEl.textContent = String(msg || "Ready.");
        statusEl.classList.toggle("pf-statusbar--error", kind === "error");
      }

      function fmtBytes(n){
        const b = Number(n) || 0;
        if (b < 1024) return `${b} B`;
        const kb = b / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        return `${mb.toFixed(2)} MB`;
      }

      function extForMime(m){
        if (m === "image/png") return "png";
        if (m === "image/webp") return "webp";
        return "jpg";
      }

      function safeStem(name){
        const base = String(name || "image").replace(/\.[^.]+$/,"");
        const cleaned = base.replace(/[^a-zA-Z0-9_\- ]+/g, "").trim().replace(/\s+/g, "_");
        return (cleaned || "image").slice(0, 48);
      }

      function revokeUrl(u){
        if (!u) return;
        try { URL.revokeObjectURL(u); } catch {}
      }

      function resetOutput(){
        if (outImg) outImg.removeAttribute("src");
        if (outStats) outStats.textContent = "—";
        if (dlBtn) dlBtn.disabled = true;
        outBlob = null;
        if (outUrl){ revokeUrl(outUrl); outUrl = ""; }
      }

      function resetAll(){
        job += 1;
        resetOutput();
        if (origImg) origImg.removeAttribute("src");
        if (origStats) origStats.textContent = "—";
        if (origUrl){ revokeUrl(origUrl); origUrl = ""; }
        origFile = null;
        origW = 0; origH = 0; ratio = 1;
        try { decoded?.close?.(); } catch {}
        decoded = null;
        if (runBtn) runBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        if (wIn) wIn.value = "";
        if (hIn) hIn.value = "";
        setStatus("Ready.");
      }

      async function decodeFile(file){
        if (window.createImageBitmap){
          try { return await createImageBitmap(file); } catch {}
        }
        return await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Image decode failed."));
          img.src = origUrl;
        });
      }

      function clampInt(n, min, max, fallback){
        const x = Math.round(Number(n));
        if (!Number.isFinite(x)) return fallback;
        return Math.max(min, Math.min(max, x));
      }

      function currentTargetSize(){
        const resizeOn = Boolean(resizeChk?.checked);
        const tw = resizeOn ? clampInt(wIn?.value, 1, 12000, origW) : origW;
        const th = resizeOn ? clampInt(hIn?.value, 1, 12000, origH) : origH;
        return { tw, th };
      }

      function syncResizeEnabled(){
        const onResize = Boolean(resizeChk?.checked);
        if (wIn) wIn.disabled = !onResize;
        if (hIn) hIn.disabled = !onResize;
      }

      let syncing = false;
      function syncOtherDimension(changed){
        if (syncing) return;
        if (!keepChk?.checked) return;
        if (!resizeChk?.checked) return;
        if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return;
        syncing = true;
        if (changed === "w"){
          const tw = clampInt(wIn?.value, 1, 12000, origW);
          if (hIn) hIn.value = String(clampInt(Math.round(tw / ratio), 1, 12000, origH));
        } else {
          const th = clampInt(hIn?.value, 1, 12000, origH);
          if (wIn) wIn.value = String(clampInt(Math.round(th * ratio), 1, 12000, origW));
        }
        syncing = false;
      }

      function setFile(file){
        resetAll();
        if (!file) return;
        const okType = ["image/png","image/jpeg","image/webp"].includes(file.type);
        if (!okType){
          setStatus("Error: Unsupported file type.", "error");
          return;
        }
        origFile = file;
        origUrl = URL.createObjectURL(file);
        if (origImg) origImg.src = origUrl;
        if (origStats) origStats.textContent = `${fmtBytes(file.size)} • ${file.type || "image"}`;
        if (clearBtn) clearBtn.disabled = false;
        setStatus("Loading image…");

        const myJob = ++job;
        decodeFile(file).then((img) => {
          if (myJob !== job) return;
          decoded = img;
          origW = img.width || img.naturalWidth || 0;
          origH = img.height || img.naturalHeight || 0;
          if (!origW || !origH) throw new Error("Invalid image dimensions.");
          ratio = origW / origH;

          if (wIn) wIn.value = String(origW);
          if (hIn) hIn.value = String(origH);
          syncResizeEnabled();
          if (runBtn) runBtn.disabled = false;
          setStatus("Ready. Click Compress.");
        }).catch(() => {
          if (myJob !== job) return;
          setStatus("Error: Could not read image.", "error");
          resetAll();
        });
      }

      function toBlob(canvas, mime, q){
        return new Promise((resolve, reject) => {
          try{
            if (mime === "image/png") canvas.toBlob(b => b ? resolve(b) : reject(new Error("PNG export failed.")), mime);
            else canvas.toBlob(b => b ? resolve(b) : reject(new Error("Export failed.")), mime, q);
          }catch(e){
            reject(e);
          }
        });
      }

      async function runCompression(){
        if (!origFile || !decoded) return;
        resetOutput();

        const myJob = ++job;
        const mime = String(fmtSel?.value || "image/jpeg");
        const q = Math.max(0, Math.min(1, Number(qIn?.value || 80) / 100));
        const { tw, th } = currentTargetSize();
        if (!tw || !th){
          setStatus("Error: Invalid output size.", "error");
          return;
        }
        if (tw * th > 70_000_000){
          setStatus("Error: Output image is too large.", "error");
          return;
        }

        setStatus("Compressing…");
        try{
          const canvas = document.createElement("canvas");
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext("2d", { alpha: true });
          if (!ctx) throw new Error("Canvas unavailable.");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          if (mime === "image/jpeg"){
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, tw, th);
          }

          ctx.drawImage(decoded, 0, 0, tw, th);
          const blob = await toBlob(canvas, mime, q);
          if (myJob !== job) return;

          outBlob = blob;
          outUrl = URL.createObjectURL(blob);
          if (outImg) outImg.src = outUrl;

          const origSize = origFile.size || 0;
          const outSize = blob.size || 0;
          const saved = origSize > 0 ? Math.max(0, (1 - outSize / origSize) * 100) : 0;

          if (outStats){
            outStats.textContent = `${fmtBytes(outSize)} • ${mime} • ${tw}×${th} • Saved ${saved.toFixed(1)}%`;
          }
          if (origStats){
            origStats.textContent = `${fmtBytes(origSize)} • ${origFile.type || "image"} • ${origW}×${origH}`;
          }
          if (dlBtn) dlBtn.disabled = false;
          setStatus("Done.");
        }catch{
          if (myJob !== job) return;
          setStatus("Error: Compression failed.", "error");
          resetOutput();
        }
      }

      function download(){
        if (!outBlob || !origFile) return;
        const mime = String(fmtSel?.value || "image/jpeg");
        const ext = extForMime(mime);
        const name = `compressed_${safeStem(origFile.name)}.${ext}`;
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => revokeUrl(url), 1500);
        setStatus(`Saved: ${name}`);
      }

      // UI wiring
      on(drop, "click", () => fileIn?.click());
      on(drop, "keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn?.click(); } });

      on(drop, "dragover", (e) => { e.preventDefault(); drop?.classList.add("pf-compressor__drop--over"); });
      on(drop, "dragleave", () => drop?.classList.remove("pf-compressor__drop--over"));
      on(drop, "drop", (e) => {
        e.preventDefault();
        drop?.classList.remove("pf-compressor__drop--over");
        const f = e.dataTransfer?.files?.[0];
        if (f) setFile(f);
      });

      on(fileIn, "change", () => {
        const f = fileIn.files?.[0];
        if (f) setFile(f);
      });
      on(clearBtn, "click", resetAll);

      on(qIn, "input", () => { if (qVal) qVal.textContent = String(qIn.value); });
      on(resizeChk, "change", () => { syncResizeEnabled(); resetOutput(); setStatus("Ready. Click Compress."); });
      on(keepChk, "change", () => { resetOutput(); setStatus("Ready. Click Compress."); });
      on(wIn, "input", () => { syncOtherDimension("w"); resetOutput(); });
      on(hIn, "input", () => { syncOtherDimension("h"); resetOutput(); });
      on(fmtSel, "change", () => { resetOutput(); setStatus("Ready. Click Compress."); });

      on(runBtn, "click", runCompression);
      on(dlBtn, "click", download);

      // cleanup on close
      w.cleanup = () => {
        listeners.splice(0).forEach(off => { try { off(); } catch {} });
        resetAll();
      };

      // Initialize quality label
      if (qVal && qIn) qVal.textContent = String(qIn.value);
      syncResizeEnabled();
      setStatus("Ready.");
      return winId;
    }
  });

  OS.registerApp("converter", {
    launch(){
      // Single-instance behavior: focus existing window if already open.
      for (const [id, w] of windows.entries()){
        if (w?.appId === "converter"){
          if (w.minimized) restoreWindow(id);
          setActive(id);
          return id;
        }
      }

      const html = `
        <div class="pf-wincontent pf-converter" data-converter>
          <h2 class="pf-wintitle">File Converter</h2>
          <div class="pf-windesc">Convert images locally (PNG/JPG/WEBP/SVG → PNG/JPG/WEBP). No uploads.</div>

          <div class="pf-converter__layout" style="margin-top:12px;">
            <div class="pf-converter__col">
              <div class="pf-converter__panel">
                <div class="pf-windesc" style="margin-bottom:8px;">Input</div>

                <div class="pf-converter__drop" data-drop role="button" tabindex="0" aria-label="Drop file here or browse">
                  <div style="font-size:13px;font-weight:650;margin-bottom:4px;">Drop a file here</div>
                  <div class="pf-windesc" style="margin:0 0 8px 0;">PNG, JPG/JPEG, WEBP, SVG</div>
                  <div class="pf-winrow" style="margin:0;gap:8px;flex-wrap:wrap;">
                    <input class="pf-wininput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-file>
                    <button class="pf-winbtn pf-winbtn--ghost" type="button" data-clear disabled>Clear</button>
                  </div>
                </div>

                <div class="pf-windesc" style="margin:12px 0 8px 0;">Options</div>

                <div class="pf-winrow" style="gap:10px;align-items:flex-end;flex-wrap:wrap;">
                  <div style="min-width:200px;flex:1;">
                    <label class="pf-winlabel">Quality: <strong data-qval>90</strong></label>
                    <input class="pf-wininput" type="range" min="0" max="100" value="90" data-quality>
                    <div class="pf-windesc" style="margin-top:6px;">Quality affects JPG/WEBP only.</div>
                  </div>
                  <div style="width:160px;min-width:160px;">
                    <label class="pf-winlabel">Output format</label>
                    <select class="pf-wininput" data-format>
                      <option value="image/png">PNG</option>
                      <option value="image/jpeg">JPG</option>
                      <option value="image/webp">WEBP</option>
                    </select>
                  </div>
                </div>

                <div class="pf-winrow" style="gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;">
                  <div style="width:160px;min-width:160px;">
                    <label class="pf-winlabel">JPG background</label>
                    <input class="pf-wininput" type="color" value="#ffffff" data-bg>
                    <div class="pf-windesc" style="margin-top:6px;">Used only when output is JPG.</div>
                  </div>
                </div>

                <div class="pf-converter__resize">
                  <div class="pf-winrow" style="gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0 8px 0;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--pf-text);">
                      <input type="checkbox" data-resize> Resize
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--pf-text);">
                      <input type="checkbox" data-keep checked> Maintain aspect ratio
                    </label>
                  </div>
                  <div class="pf-winrow" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin:0;">
                    <div style="width:140px;">
                      <label class="pf-winlabel">Width</label>
                      <input class="pf-wininput" type="number" min="1" max="12000" step="1" data-w disabled>
                    </div>
                    <div style="width:140px;">
                      <label class="pf-winlabel">Height</label>
                      <input class="pf-wininput" type="number" min="1" max="12000" step="1" data-h disabled>
                    </div>
                    <button class="pf-winbtn" type="button" data-run disabled>Convert</button>
                  </div>
                </div>

                <div class="pf-winrow" style="justify-content:flex-end;margin-top:10px;">
                  <button class="pf-winbtn" type="button" data-download disabled>Download</button>
                </div>
              </div>
            </div>

            <div class="pf-converter__col">
              <div class="pf-converter__panel">
                <div class="pf-windesc" style="margin-bottom:8px;">Preview</div>
                <div class="pf-converter__previews">
                  <div class="pf-converter__previewbox">
                    <div style="font-size:13px;font-weight:650;margin-bottom:6px;">Original</div>
                    <div class="pf-converter__imgwrap">
                      <img class="pf-converter__img" alt="Original file preview" data-origimg>
                    </div>
                    <div class="pf-converter__stats" data-origstats>—</div>
                  </div>
                  <div class="pf-converter__previewbox">
                    <div style="font-size:13px;font-weight:650;margin-bottom:6px;">Converted</div>
                    <div class="pf-converter__imgwrap">
                      <img class="pf-converter__img" alt="Converted file preview" data-outimg>
                    </div>
                    <div class="pf-converter__stats" data-outstats>—</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="pf-statusbar" role="status" aria-live="polite" data-status>Ready.</div>
        </div>`;

      const winId = createWindow({ title:"File Converter", html, appId:"converter" });
      const w = windows.get(winId);
      const body = w?.el?.querySelector("[data-body]");
      const appRoot = body?.querySelector("[data-converter]");
      if (!body || !appRoot) return winId;

      const statusEl = appRoot.querySelector("[data-status]");
      const drop = appRoot.querySelector("[data-drop]");
      const fileIn = appRoot.querySelector("[data-file]");
      const clearBtn = appRoot.querySelector("[data-clear]");
      const qIn = appRoot.querySelector("[data-quality]");
      const qVal = appRoot.querySelector("[data-qval]");
      const fmtSel = appRoot.querySelector("[data-format]");
      const bgIn = appRoot.querySelector("[data-bg]");
      const resizeChk = appRoot.querySelector("[data-resize]");
      const keepChk = appRoot.querySelector("[data-keep]");
      const wIn = appRoot.querySelector("[data-w]");
      const hIn = appRoot.querySelector("[data-h]");
      const runBtn = appRoot.querySelector("[data-run]");
      const dlBtn = appRoot.querySelector("[data-download]");
      const origImg = appRoot.querySelector("[data-origimg]");
      const outImg = appRoot.querySelector("[data-outimg]");
      const origStats = appRoot.querySelector("[data-origstats]");
      const outStats = appRoot.querySelector("[data-outstats]");

      const listeners = [];
      const on = (el, ev, fn, opts) => {
        if (!el) return;
        el.addEventListener(ev, fn, opts);
        listeners.push(() => el.removeEventListener(ev, fn, opts));
      };

      let origFile = null;
      let origUrl = "";
      let outUrl = "";
      let outBlob = null;
      let decoded = null; // ImageBitmap or HTMLImageElement
      let origW = 0;
      let origH = 0;
      let ratio = 1;
      let job = 0;
      let isSvg = false;
      let svgRenderUrl = "";

      function setStatus(msg, kind){
        if (!statusEl) return;
        statusEl.textContent = String(msg || "Ready.");
        statusEl.classList.toggle("pf-statusbar--error", kind === "error");
      }

      function fmtBytes(n){
        const b = Number(n) || 0;
        if (b < 1024) return `${b} B`;
        const kb = b / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        return `${mb.toFixed(2)} MB`;
      }

      function safeStem(name){
        const base = String(name || "file").replace(/\.[^.]+$/,"");
        const cleaned = base.replace(/[^a-zA-Z0-9_\- ]+/g, "").trim().replace(/\s+/g, "_");
        return (cleaned || "file").slice(0, 48);
      }

      function extForMime(m){
        if (m === "image/png") return "png";
        if (m === "image/webp") return "webp";
        return "jpg";
      }

      function revokeUrl(u){
        if (!u) return;
        try { URL.revokeObjectURL(u); } catch {}
      }

      function sanitizeHexColor(raw, fallback){
        const s = String(raw || "").trim();
        if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(s)) return s.toLowerCase();
        return fallback;
      }

      function stripInvalidXmlChars(s){
        return String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
      }

      function sanitizeSvgText(svgText){
        const src = stripInvalidXmlChars(svgText);
        const p = new DOMParser();
        const doc = p.parseFromString(src, "image/svg+xml");
        if (doc.getElementsByTagName("parsererror").length) throw new Error("SVG is not valid XML.");
        const root = doc.documentElement;
        if (!root || root.nodeName.toLowerCase() !== "svg") throw new Error("Root element must be <svg>.");

        // Remove scripts/foreignObject and inline event handlers.
        root.querySelectorAll("script, foreignObject").forEach(n => n.remove());
        root.querySelectorAll("*").forEach(el => {
          Array.from(el.attributes || []).forEach(a => {
            const name = a.name || "";
            const val = String(a.value || "");
            if (/^on/i.test(name)) el.removeAttribute(name);
            if ((name === "href" || name === "xlink:href") && /^javascript:/i.test(val)) el.removeAttribute(name);
          });
        });

        // Ensure namespaces
        if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        if (!root.getAttribute("xmlns:xlink")) root.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

        return new XMLSerializer().serializeToString(root);
      }

      function parseSvgSize(svgMarkup){
        const p = new DOMParser();
        const doc = p.parseFromString(svgMarkup, "image/svg+xml");
        const root = doc.documentElement;
        const vb = root.getAttribute("viewBox");
        if (vb){
          const parts = vb.trim().split(/[\s,]+/).map(Number);
          if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0){
            return { w: Math.round(parts[2]), h: Math.round(parts[3]) };
          }
        }
        const wAttr = root.getAttribute("width");
        const hAttr = root.getAttribute("height");
        const w = wAttr ? parseFloat(String(wAttr)) : NaN;
        const h = hAttr ? parseFloat(String(hAttr)) : NaN;
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0){
          return { w: Math.round(w), h: Math.round(h) };
        }
        return { w: 1024, h: 1024 };
      }

      function resetOutput(){
        if (outImg) outImg.removeAttribute("src");
        if (outStats) outStats.textContent = "—";
        if (dlBtn) dlBtn.disabled = true;
        outBlob = null;
        if (outUrl){ revokeUrl(outUrl); outUrl = ""; }
      }

      function resetAll(){
        job += 1;
        resetOutput();
        if (origImg) origImg.removeAttribute("src");
        if (origStats) origStats.textContent = "—";
        if (origUrl){ revokeUrl(origUrl); origUrl = ""; }
        if (svgRenderUrl){ revokeUrl(svgRenderUrl); svgRenderUrl = ""; }
        origFile = null;
        origW = 0; origH = 0; ratio = 1;
        isSvg = false;
        try { decoded?.close?.(); } catch {}
        decoded = null;
        if (runBtn) runBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        if (wIn) wIn.value = "";
        if (hIn) hIn.value = "";
        setStatus("Ready.");
      }

      function clampInt(n, min, max, fallback){
        const x = Math.round(Number(n));
        if (!Number.isFinite(x)) return fallback;
        return Math.max(min, Math.min(max, x));
      }

      function currentTargetSize(){
        const resizeOn = Boolean(resizeChk?.checked);
        const tw = resizeOn ? clampInt(wIn?.value, 1, 12000, origW) : origW;
        const th = resizeOn ? clampInt(hIn?.value, 1, 12000, origH) : origH;
        return { tw, th };
      }

      function syncResizeEnabled(){
        const onResize = Boolean(resizeChk?.checked);
        if (wIn) wIn.disabled = !onResize;
        if (hIn) hIn.disabled = !onResize;
      }

      let syncing = false;
      function syncOtherDimension(changed){
        if (syncing) return;
        if (!keepChk?.checked) return;
        if (!resizeChk?.checked) return;
        if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return;
        syncing = true;
        if (changed === "w"){
          const tw = clampInt(wIn?.value, 1, 12000, origW);
          if (hIn) hIn.value = String(clampInt(Math.round(tw / ratio), 1, 12000, origH));
        } else {
          const th = clampInt(hIn?.value, 1, 12000, origH);
          if (wIn) wIn.value = String(clampInt(Math.round(th * ratio), 1, 12000, origW));
        }
        syncing = false;
      }

      async function decodeRasterUrl(url){
        if (window.createImageBitmap){
          const res = await fetch(url);
          const blob = await res.blob();
          return await createImageBitmap(blob);
        }
        return await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Image decode failed."));
          img.src = url;
        });
      }

      async function decodeFile(file){
        if (window.createImageBitmap){
          try { return await createImageBitmap(file); } catch {}
        }
        return await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Image decode failed."));
          img.src = origUrl;
        });
      }

      function setFile(file){
        resetAll();
        if (!file) return;
        const type = String(file.type || "");
        isSvg = type === "image/svg+xml" || /\.svg$/i.test(file.name || "");
        const okType = ["image/png","image/jpeg","image/webp","image/svg+xml"].includes(type) || isSvg;
        if (!okType){
          setStatus("Error: Unsupported file type.", "error");
          return;
        }
        origFile = file;
        origUrl = URL.createObjectURL(file);
        if (clearBtn) clearBtn.disabled = false;
        setStatus("Loading file…");

        const myJob = ++job;
        (async () => {
          if (isSvg){
            const text = await file.text();
            const sanitized = sanitizeSvgText(text);
            const { w, h } = parseSvgSize(sanitized);
            origW = w;
            origH = h;
            ratio = origW / origH;
            if (wIn) wIn.value = String(origW);
            if (hIn) hIn.value = String(origH);

            const blob = new Blob([sanitized], { type: "image/svg+xml;charset=utf-8" });
            svgRenderUrl = URL.createObjectURL(blob);
            if (origImg) origImg.src = svgRenderUrl;
            if (origStats) origStats.textContent = `${fmtBytes(file.size)} • image/svg+xml • ${origW}×${origH}`;
            decoded = await decodeRasterUrl(svgRenderUrl);
          } else {
            if (origImg) origImg.src = origUrl;
            if (origStats) origStats.textContent = `${fmtBytes(file.size)} • ${type || "image"}`;
            decoded = await decodeFile(file);
            origW = decoded.width || decoded.naturalWidth || 0;
            origH = decoded.height || decoded.naturalHeight || 0;
            if (!origW || !origH) throw new Error("Invalid image dimensions.");
            ratio = origW / origH;
            if (wIn) wIn.value = String(origW);
            if (hIn) hIn.value = String(origH);
            if (origStats) origStats.textContent = `${fmtBytes(file.size)} • ${type || "image"} • ${origW}×${origH}`;
          }

          if (myJob !== job) return;
          syncResizeEnabled();
          if (runBtn) runBtn.disabled = false;
          setStatus("Ready. Click Convert.");
        })().catch(() => {
          if (myJob !== job) return;
          setStatus("Error: Could not read file.", "error");
          resetAll();
        });
      }

      function toBlob(canvas, mime, q){
        return new Promise((resolve, reject) => {
          try{
            if (mime === "image/png") canvas.toBlob(b => b ? resolve(b) : reject(new Error("PNG export failed.")), mime);
            else canvas.toBlob(b => b ? resolve(b) : reject(new Error("Export failed.")), mime, q);
          }catch(e){
            reject(e);
          }
        });
      }

      function nextOutName(mime){
        const key = "pf_fileconv_counter_v1";
        let n = 1;
        try{
          const raw = localStorage.getItem(key);
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed >= 1) n = parsed;
        }catch{}
        try{ localStorage.setItem(key, String(n + 1)); }catch{}
        return `converted_${String(n).padStart(3,"0")}.${extForMime(mime)}`;
      }

      async function runConvert(){
        if (!origFile || !decoded) return;
        resetOutput();

        const myJob = ++job;
        const mime = String(fmtSel?.value || "image/png");
        const q = Math.max(0, Math.min(1, Number(qIn?.value || 90) / 100));
        const { tw, th } = currentTargetSize();
        if (!tw || !th){
          setStatus("Error: Invalid output size.", "error");
          return;
        }
        if (tw * th > 70_000_000){
          setStatus("Error: Output image is too large.", "error");
          return;
        }

        setStatus("Converting…");
        try{
          const canvas = document.createElement("canvas");
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext("2d", { alpha: mime !== "image/jpeg" });
          if (!ctx) throw new Error("Canvas unavailable.");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          if (mime === "image/jpeg"){
            ctx.fillStyle = sanitizeHexColor(bgIn?.value, "#ffffff");
            ctx.fillRect(0, 0, tw, th);
          }

          ctx.drawImage(decoded, 0, 0, tw, th);
          const blob = await toBlob(canvas, mime, q);
          if (myJob !== job) return;

          outBlob = blob;
          outUrl = URL.createObjectURL(blob);
          if (outImg) outImg.src = outUrl;

          const origSize = origFile.size || 0;
          const outSize = blob.size || 0;
          const saved = origSize > 0 ? Math.max(0, (1 - outSize / origSize) * 100) : 0;
          if (outStats) outStats.textContent = `${fmtBytes(outSize)} • ${mime} • ${tw}×${th} • Saved ${saved.toFixed(1)}%`;
          if (dlBtn) dlBtn.disabled = false;
          setStatus("Done.");
        }catch{
          if (myJob !== job) return;
          setStatus("Error: Convert failed.", "error");
          resetOutput();
        }
      }

      function download(){
        if (!outBlob) return;
        const mime = String(fmtSel?.value || "image/png");
        const filename = nextOutName(mime);
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => revokeUrl(url), 1500);
        setStatus(`Saved: ${filename}`);
      }

      // UI wiring
      on(drop, "click", () => fileIn?.click());
      on(drop, "keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn?.click(); } });
      on(drop, "dragover", (e) => { e.preventDefault(); drop?.classList.add("pf-converter__drop--over"); });
      on(drop, "dragleave", () => drop?.classList.remove("pf-converter__drop--over"));
      on(drop, "drop", (e) => {
        e.preventDefault();
        drop?.classList.remove("pf-converter__drop--over");
        const f = e.dataTransfer?.files?.[0];
        if (f) setFile(f);
      });
      on(fileIn, "change", () => {
        const f = fileIn.files?.[0];
        if (f) setFile(f);
      });
      on(clearBtn, "click", resetAll);

      on(qIn, "input", () => { if (qVal) qVal.textContent = String(qIn.value); resetOutput(); });
      on(fmtSel, "change", () => { resetOutput(); setStatus("Ready. Click Convert."); });
      on(bgIn, "input", () => { if ((fmtSel?.value || "") === "image/jpeg") resetOutput(); });
      on(resizeChk, "change", () => { syncResizeEnabled(); resetOutput(); setStatus("Ready. Click Convert."); });
      on(keepChk, "change", () => { resetOutput(); setStatus("Ready. Click Convert."); });
      on(wIn, "input", () => { syncOtherDimension("w"); resetOutput(); });
      on(hIn, "input", () => { syncOtherDimension("h"); resetOutput(); });

      on(runBtn, "click", runConvert);
      on(dlBtn, "click", download);

      // cleanup on close
      w.cleanup = () => {
        listeners.splice(0).forEach(off => { try { off(); } catch {} });
        resetAll();
      };

      // Initialize
      if (qVal && qIn) qVal.textContent = String(qIn.value);
      syncResizeEnabled();
      setStatus("Ready.");
      return winId;
    }
  });

OS.registerApp("tools", {
    launch(){
      const tpl = document.querySelector("#pf-tools-template");
      const html = tpl?.innerHTML?.trim() || `
        <div class="pf-wincontent">
          <h2 class="pf-wintitle">Tools</h2>
          <div class="pf-windesc">Paid tools unlock via purchase.</div>
          <div class="pf-grid" style="margin-top:12px;">
            <div class="pf-card pf-toolcard" aria-live="polite">
              <div class="pf-card__meta pf-toolcard__meta">
                <div class="pf-toolicon" aria-hidden="true"><span class="pf-toolicon__glyph">🧰</span></div>
                <div class="pf-toolcard__text">
                  <div class="pf-card__title">Tools UI not loaded.</div>
                  <div class="pf-card__price">Check theme template markup.</div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      const winId = createWindow({ title:"Tools", html, appId:"tools" });
      const b = windows.get(winId)?.el?.querySelector("[data-body]");
      if (b) {
        bindWindowInternalActions(b);
        if (window.PFTools && typeof window.PFTools.init === "function") {
          window.PFTools.init(b);
        }
      }
      return winId;
    }
  });

  OS.registerApp("vault", {
    singleton: true,
    launch(ctx){
      const html = getTemplateHtml("pf-vault-template");
      const winId = createWindow({ title: ctx.title || "Digital Vault", html, appId:"vault" });
      return winId;
    }
  });

  // ---- Cart + badge
  async function refreshCartBadge(){
    try{
      const res = await fetch("/cart.js", { credentials:"same-origin" });
      const data = await res.json();
      if (cartBadge) cartBadge.textContent = String(data.item_count || 0);
    } catch {}
  }
  refreshCartBadge();
  setInterval(refreshCartBadge, 20_000);

  async function mountCart(mountEl){
    async function render(){
      mountEl.innerHTML = `<div class="pf-windesc">Loading…</div>`;
      const res = await fetch("/cart.js", { credentials:"same-origin" });
      const cart = await res.json();
      if (!cart.items || cart.items.length === 0){
        mountEl.innerHTML = `
          <div class="pf-windesc">Your cart is empty.</div>
          <div class="pf-winrow"><button class="pf-winbtn" type="button" data-open-url="${routes.storefront}" data-title="Storefront">Browse Storefront</button></div>`;
        bindWindowInternalActions(mountEl);
        return;
      }

      const rows = cart.items.map(item => {
        const title = escapeHtml(item.product_title || item.title || "Item");
        const line = item.key;
        const qty = item.quantity;
        const price = (item.final_line_price / 100).toFixed(2);
        const img = item.image ? `<img src="${item.image}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:2px;">` : `<div style="width:52px;height:52px;border-radius:2px;background:var(--pf-panel2);border:1px solid var(--pf-border);"></div>`;
        return `
          <div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--pf-border);">
            ${img}
            <div style="flex:1; min-width:0;">
              <div style="font-weight:650;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
              <div style="color:var(--pf-muted);font-size:12px;">$${price}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="pf-winbtn pf-winbtn--ghost" type="button" data-qtyminus="${line}">−</button>
              <div style="min-width:22px;text-align:center;">${qty}</div>
              <button class="pf-winbtn pf-winbtn--ghost" type="button" data-qtyplus="${line}">+</button>
              <button class="pf-winbtn pf-winbtn--ghost" type="button" data-remove="${line}">Remove</button>
            </div>
          </div>
        `;
      }).join("");

      const subtotal = (cart.total_price / 100).toFixed(2);

      mountEl.innerHTML = `
        <div>${rows}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
          <div style="font-weight:700;">Subtotal</div>
          <div style="font-weight:700;">$${subtotal}</div>
        </div>
        <div class="pf-winrow" style="justify-content:flex-end;">
          <a class="pf-winbtn" href="/checkout" data-no-os>Checkout</a>
        </div>
      `;

      mountEl.querySelectorAll("[data-qtyminus]").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.qtyminus, -1)));
      mountEl.querySelectorAll("[data-qtyplus]").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.qtyplus, +1)));
      mountEl.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => setQty(b.dataset.remove, 0)));
    }

    async function changeQty(lineKey, delta){
      const res = await fetch("/cart.js", { credentials:"same-origin" });
      const cart = await res.json();
      const item = cart.items.find(i => i.key === lineKey);
      const next = Math.max(0, (item?.quantity || 0) + delta);
      await setQty(lineKey, next);
    }

    async function setQty(lineKey, quantity){
      await fetch("/cart/change.js", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify({ id: lineKey, quantity })
      });
      await refreshCartBadge();
      await render();
    }

    await render();
  }

  // Product window AJAX add-to-cart
  function bindProductAddToCart(scope){
    const form = scope.querySelector('form[action^="/cart/add"]');
    const btn = scope.querySelector("[data-addtocart]");
    if (!form || !btn) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = "Adding…";
      const fd = new FormData(form);
      const payload = {
        id: fd.get("id"),
        quantity: Number(fd.get("quantity") || 1)
      };
      try{
        const res = await fetch("/cart/add.js", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          credentials:"same-origin",
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("add failed");
        await refreshCartBadge();
        btn.textContent = "Added ✓";
        setTimeout(() => { btn.textContent = "Add to cart"; btn.disabled = false; }, 900);
      } catch {
        btn.textContent = "Error";
        setTimeout(() => { btn.textContent = "Add to cart"; btn.disabled = false; }, 1000);
      }
    });
  }

  // Predictive search inside search window
  function bindSearchWindow(form, scope){
    const input = scope.querySelector("[data-searchinput]");
    if (!input) return;

    let t = null;
    let last = "";
    const resultsId = "pf-predictive";
    let results = scope.querySelector("#"+resultsId);
    if (!results){
      results = document.createElement("div");
      results.id = resultsId;
      results.style.marginTop = "12px";
      scope.appendChild(results);
    }

    const render = (items=[]) => {
      if (!items.length){
        results.innerHTML = `<div class="pf-windesc">Type to search products…</div>`;
        return;
      }
      results.innerHTML = `
        <div class="pf-grid">
          ${items.map(p => `
            <button class="pf-card" type="button" data-open-url="${p.url}" data-title="${escapeHtml(p.title)}">
              ${p.image ? `<img src="${p.image}" alt="">` : ``}
              <div class="pf-card__meta">
                <div class="pf-card__title">${escapeHtml(p.title)}</div>
                <div class="pf-card__price">${p.price || ""}</div>
              </div>
            </button>
          `).join("")}
        </div>
      `;
      bindWindowInternalActions(results);
    };

    async function fetchSuggest(q){
      const u = new URL("/search/suggest.json", window.location.origin);
      u.searchParams.set("q", q);
      u.searchParams.set("resources[type]", "product");
      u.searchParams.set("resources[limit]", "12");
      u.searchParams.set("resources[options][unavailable_products]", "last");
      const res = await fetch(u.toString(), { credentials:"same-origin" });
      const data = await res.json();
      const products = data?.resources?.results?.products || [];
      return products.map(p => ({
        title: p.title,
        url: p.url,
        image: p.featured_image?.url || "",
        price: ""
      }));
    }

    const onInput = () => {
      const q = input.value.trim();
      if (q === last) return;
      last = q;
      if (t) clearTimeout(t);
      if (q.length < 2){ render([]); return; }
      t = setTimeout(async () => {
        try{
          const items = await fetchSuggest(q);
          render(items);
        } catch {
          results.innerHTML = `<div class="pf-windesc">Search failed.</div>`;
        }
      }, 160);
    };

    input.addEventListener("input", onInput);
    render([]);
  }

})();
