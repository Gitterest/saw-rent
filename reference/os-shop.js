(() => {
  const osRoot = document.querySelector("[data-os]");
  if (!osRoot) return;

  const os = window.PFDesktopOS;
  if (!os || typeof os.registerApp !== "function" || typeof os.createWindow !== "function") return;

  const COLLECTIONS_ENDPOINT = "/collections.json?limit=250";
  const PRODUCTS_ENDPOINT = (handle) => `/collections/${encodeURIComponent(handle)}/products.json?limit=250`;

  const createState = () => ({
    mode: null,
    view: "landing",
    scope: "root",
    currentRoot: null,
    currentCategory: null,
    collections: [],
    products: [],
    activeCollection: null,
    search: "",
    loading: false,
    error: "",
    initialized: false,
    quantities: {},
    classByHandle: {},
    sort: "newest",
    ownedOnly: false,
    viewMode: "grid",
    selectedProductId: 0,
    history: []
  });

  const appState = createState();
  let toastTimer = null;
  const customerTags = new Set(
    String(osRoot.getAttribute("data-customer-tags") || "")
      .toLowerCase()
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  );

  const parseShopConfig = () => {
    const el = osRoot.querySelector("[data-shop-config]");
    if (!el) return { digital: [], goods: [] };
    try {
      const parsed = JSON.parse(el.textContent || "{}");
      const normalize = (items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => {
          const handle = String(item?.handle || "").trim();
          const label = String(item?.label || "").trim() || handle;
          return { handle, label };
        }).filter((entry) => entry.handle && entry.label);
      };
      return {
        digital: normalize(parsed.digital),
        goods: normalize(parsed.goods)
      };
    } catch (error) {
      console.warn("[shop] Failed to parse shop config", error);
      return { digital: [], goods: [] };
    }
  };

  const shopConfig = parseShopConfig();

  const getRootLabel = (root) => (root === "goods" ? "Fab Goods" : "Digital Drops");
  const getConfigForRoot = (root) => (root === "goods" ? shopConfig.goods : shopConfig.digital);

  const escapeHtml = (value) => {
    if (typeof os.escapeHtml === "function") return os.escapeHtml(value);
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  };

  const stripHtml = (html) => {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = String(html);
    return (div.textContent || "").replace(/\s+/g, " ").trim();
  };

  const truncate = (text, max = 120) => {
    const safe = String(text || "").trim();
    if (safe.length <= max) return safe;
    return `${safe.slice(0, max - 1).trim()}...`;
  };

  const formatMoney = (raw) => {
    const num = Number(raw);
    if (!Number.isFinite(num)) return "$0.00";
    const cents = Math.round(num * 100);
    const dollars = cents / 100;
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);
    } catch {
      return `$${dollars.toFixed(2)}`;
    }
  };

  const FILE_TYPE_MAP = {
    "file-svg": "SVG",
    "file-stl": "STL",
    "file-pdf": "PDF",
    "file-plr": "PLR",
    "file-ebook": "EBOOK",
    "file-tutorial": "GUIDE",
    "file-art": "ART",
    "file-print": "PRINT",
    "file-template": "DOCX",
    "file-wallpaper": "PNG",
    "file-bundle": "BUNDLE"
  };

  const inferFileType = (tags, title) => {
    const source = Array.isArray(tags) ? tags : [];
    for (const tag of source) {
      const key = String(tag || "").toLowerCase();
      if (FILE_TYPE_MAP[key]) return FILE_TYPE_MAP[key];
    }
    const t = String(title || "").toLowerCase();
    if (t.includes("resume") || t.includes("template")) return "DOCX";
    if (t.includes("wallpaper") || t.includes("art")) return "PNG";
    if (t.includes("3d") || t.includes("stl")) return "STL";
    return "FILE";
  };

  const getLicenses = (tags) => {
    const source = Array.isArray(tags) ? tags : [];
    const licenses = [];
    if (source.includes("lic-commercial")) licenses.push("Commercial");
    if (source.includes("lic-personal")) licenses.push("Personal");
    if (source.includes("lic-extended")) licenses.push("Extended");
    if (!licenses.length) licenses.push("Standard");
    return licenses;
  };

  const classifyByHandleTitle = (collection) => {
    const handle = String(collection?.handle || "").toLowerCase();
    const title = String(collection?.title || "").toLowerCase();
    if (handle.startsWith("digital-")) return "digital";
    if (handle.startsWith("goods-")) return "goods";
    if (title.includes("digital")) return "digital";
    if (title.includes("goods") || title.includes("physical")) return "goods";
    return null;
  };

  const classifyByProducts = (products) => {
    if (!Array.isArray(products) || !products.length) return "goods";
    const hasDigital = products.some((p) => String(p?.product_type || "").toLowerCase().includes("digital"));
    return hasDigital ? "digital" : "goods";
  };

  const parseCollections = (payload) => {
    const source = Array.isArray(payload?.collections) ? payload.collections : [];
    return source.map((collection) => {
      const image = collection?.image?.src || collection?.image?.url || "";
      return {
        id: collection?.id || 0,
        handle: String(collection?.handle || ""),
        title: String(collection?.title || "Untitled Collection"),
        image,
        productsCount: Number.isFinite(Number(collection?.products_count)) ? Number(collection.products_count) : null,
        classification: classifyByHandleTitle(collection)
      };
    }).filter((c) => Boolean(c.handle));
  };

  const parseShippingInfo = (tags) => {
    const source = Array.isArray(tags) ? tags : [];
    let shippingPrice = "";
    let shippingMethod = "";
    source.forEach((tag) => {
      const raw = String(tag || "");
      const lower = raw.toLowerCase();
      if (lower.startsWith("ship-price:")) shippingPrice = raw.slice(raw.indexOf(":") + 1).trim();
      if (lower.startsWith("ship-method:")) shippingMethod = raw.slice(raw.indexOf(":") + 1).trim();
    });
    return {
      shippingPrice: shippingPrice || "Calculated at checkout",
      shippingMethod: shippingMethod || "Carrier rates"
    };
  };

  const parseProducts = (payload) => {
    const source = Array.isArray(payload?.products) ? payload.products : [];
    return source.map((product) => {
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      const fallbackVariant = variants.find((v) => v && v.available) || variants[0] || null;
      const image = product?.images?.[0]?.src || product?.image?.src || "";
      const excerpt = truncate(stripHtml(product?.body_html || ""), 140);
      const shipping = parseShippingInfo(product?.tags);
      return {
        id: Number(product?.id || 0),
        handle: String(product?.handle || ""),
        title: String(product?.title || "Untitled Product"),
        image,
        excerpt,
        tags: Array.isArray(product?.tags) ? product.tags.map((tag) => String(tag || "").toLowerCase()) : [],
        productType: String(product?.product_type || ""),
        variants: variants.map((v) => ({
          id: Number(v?.id || 0),
          title: String(v?.title || "Default"),
          price: Number(v?.price || 0),
          available: Boolean(v?.available)
        })).filter((v) => Boolean(v.id)),
        selectedVariantId: fallbackVariant ? Number(fallbackVariant.id) : 0,
        price: Number(fallbackVariant?.price || 0),
        shippingPrice: shipping.shippingPrice,
        shippingMethod: shipping.shippingMethod,
        fileType: inferFileType(product?.tags, product?.title),
        licenses: getLicenses(product?.tags),
        url: product?.handle ? `/products/${encodeURIComponent(product.handle)}` : ""
      };
    }).filter((p) => p.id > 0 && p.variants.length > 0);
  };

  const fetchJson = async (url) => {
    const res = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  };

  const getModeCollections = () => {
    const mode = appState.currentRoot || appState.mode;
    if (!mode) return [];
    const q = appState.search.trim().toLowerCase();
    return resolveCategoryRows(mode).filter((row) => {
      if (!q) return true;
      return row.title.toLowerCase().includes(q) || row.handle.toLowerCase().includes(q);
    });
  };

  const getFilteredProducts = () => {
    const q = appState.search.trim().toLowerCase();
    const rows = appState.products.filter((product) => {
      if (appState.ownedOnly && !isOwnedProduct(product)) return false;
      if (!q) return true;
      const bucket = `${product.title} ${product.excerpt} ${product.productType}`.toLowerCase();
      return bucket.includes(q);
    });
    if (appState.sort === "price-low") rows.sort((a, b) => a.price - b.price);
    if (appState.sort === "price-high") rows.sort((a, b) => b.price - a.price);
    if (appState.sort === "name") rows.sort((a, b) => a.title.localeCompare(b.title));
    if (appState.sort === "newest") rows.sort((a, b) => b.id - a.id);
    return rows;
  };

  const isOwnedProduct = (product) => {
    const handle = String(product?.handle || "").toLowerCase();
    const id = Number(product?.id || 0);
    if (!id && !handle) return false;
    return customerTags.has(`owned-${id}`)
      || customerTags.has(`owned-product-${id}`)
      || (handle && (customerTags.has(`owned-${handle}`) || customerTags.has(`owned:${handle}`)));
  };

  const resolveCategoryRows = (root) => {
    const configRows = getConfigForRoot(root);
    return configRows.map((row) => {
      const collection = appState.collections.find((c) => c.handle === row.handle);
      const productsCount = Number.isFinite(Number(collection?.productsCount))
        ? Number(collection.productsCount)
        : Number.isFinite(Number(collection?.products_count))
          ? Number(collection.products_count)
          : null;
      return {
        ...row,
        title: collection?.title || row.label,
        handle: row.handle,
        image: collection?.image || "",
        productsCount,
        collection
      };
    });
  };

  const renderCategoryChildren = (rootId, categories, level = 1) => categories.map((cat) => `
      <div class="pf-shop-tree__row ${cat.handle === appState.currentCategory ? "is-active" : ""}" style="--pf-tree-level:${level}">
        <button class="pf-shop-tree__btn" type="button" data-shop-category="${escapeHtml(cat.handle)}" data-shop-root-id="${escapeHtml(rootId)}">
          <span class="pf-shop-tree__icon" aria-hidden="true">${level > 0 ? "📄" : "📁"}</span>
          <span class="pf-shop-tree__label">${escapeHtml(cat.title)}</span>
        </button>
      </div>
    `).join("");

  const renderExplorerSidebar = () => {
    const roots = [
      { id: "digital", label: getRootLabel("digital") },
      { id: "goods", label: getRootLabel("goods") }
    ];
    return `
      <aside class="pf-shop-sidebar" aria-label="Shop folders">
        <div class="pf-shop-sidebar__head">Folders</div>
        <div class="pf-shop-tree">
          ${roots.map((root) => {
            const isActiveRoot = appState.currentRoot === root.id;
            const categories = resolveCategoryRows(root.id);
            return `
              <div class="pf-shop-tree__row ${isActiveRoot ? "is-active" : ""}" style="--pf-tree-level:0">
                <button class="pf-shop-tree__btn" type="button" data-shop-root-id="${escapeHtml(root.id)}">
                  <span class="pf-shop-tree__icon" aria-hidden="true">📁</span>
                  <span class="pf-shop-tree__label">${escapeHtml(root.label)}</span>
                </button>
                ${categories.length && isActiveRoot ? `<div class="pf-shop-tree__children">${renderCategoryChildren(root.id, categories)}</div>` : ""}
              </div>
            `;
          }).join("")}
        </div>
      </aside>
    `;
  };

  const setLoading = (on, error = "") => {
    appState.loading = on;
    appState.error = error;
  };

  const showToast = (scope, message, kind = "ok") => {
    const host = scope.querySelector("[data-shop-toast]");
    if (!host) return;
    host.className = `pf-shop-toast ${kind === "error" ? "pf-shop-toast--error" : ""}`;
    host.textContent = message;
    host.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      host.hidden = true;
    }, 1800);
  };

  const getCrumbs = () => {
    const crumbs = [{ id: "shop", label: "Shop" }];
    const root = appState.currentRoot || appState.mode;
    if (root) crumbs.push({ id: root, label: getRootLabel(root) });
    if (appState.view === "products" && appState.activeCollection) {
      crumbs.push({ id: "collection", label: appState.activeCollection.title });
    }
    return crumbs;
  };

  const renderLanding = () => `
    <div class="pf-shop-shell">
      ${renderExplorerSidebar()}
      <div class="pf-shop-mainpane">
        <div class="pf-shop-landing">
      <button class="pf-shop-modecard" type="button" data-shop-root-id="digital">
        <div class="pf-shop-modeicon" aria-hidden="true">💾</div>
        <div class="pf-shop-modetitle">Digital Drops</div>
        <div class="pf-shop-modesub">Browse digital downloads in an explorer-style vault window.</div>
      </button>
      <button class="pf-shop-modecard" type="button" data-shop-root-id="goods">
        <div class="pf-shop-modeicon" aria-hidden="true">📦</div>
        <div class="pf-shop-modetitle">Fab Goods</div>
        <div class="pf-shop-modesub">Browse physical products with shipping details and cart-ready checkout.</div>
      </button>
    </div>
      </div>
    </div>
  `;

  const renderCategories = () => {
    if (appState.loading) return `<div class="pf-shop-state">Loading categories...</div>`;
    if (appState.error) return `<div class="pf-shop-state pf-shop-state--error">${escapeHtml(appState.error)}</div>`;
    const root = appState.currentRoot || appState.mode;
    if (!root) {
      return `
        <div class="pf-shop-shell">
          ${renderExplorerSidebar()}
          <div class="pf-shop-mainpane">
            <div class="pf-shop-state">Choose Digital Drops or Fab Goods to view folders.</div>
          </div>
        </div>
      `;
    }
    const rows = getModeCollections();
    if (!rows.length) {
      return `
        <div class="pf-shop-shell">
          ${renderExplorerSidebar()}
          <div class="pf-shop-mainpane">
            <div class="pf-shop-state">
              No categories configured for ${escapeHtml(getRootLabel(root))}.<br>
              Add folders in the theme editor (Shop categories).
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="pf-shop-shell">
        ${renderExplorerSidebar()}
        <div class="pf-shop-mainpane">
      <div class="pf-shop-grid">
        ${rows.map((collection) => `
          <button class="pf-shop-collection ${collection.handle === appState.currentCategory ? "is-active" : ""}" type="button" data-shop-category="${escapeHtml(collection.handle)}" data-shop-root-id="${escapeHtml(root)}">
            <div class="pf-shop-collection__media">
              ${collection.image ? `<img src="${escapeHtml(collection.image)}" alt="">` : `<div class="pf-shop-collection__placeholder">No image</div>`}
            </div>
            <div class="pf-shop-collection__meta">
              <div class="pf-shop-collection__title">${escapeHtml(collection.title)}</div>
              <div class="pf-shop-collection__count">${collection.productsCount === null ? "—" : `${collection.productsCount} items`}</div>
            </div>
          </button>
        `).join("")}
      </div>
        </div>
      </div>
    `;
  };

  const renderProductCard = (product) => {
    const qty = Math.max(1, Number(appState.quantities[product.id] || 1));
    const isGoods = (appState.currentRoot || appState.mode) === "goods";
    const owned = isOwnedProduct(product);
    const variantOptions = product.variants.map((variant) => `
      <option value="${variant.id}" ${variant.id === product.selectedVariantId ? "selected" : ""}>
        ${escapeHtml(variant.title)} - ${escapeHtml(formatMoney(variant.price))}
      </option>
    `).join("");
    return `
      <article class="pf-shop-product ${owned ? "is-owned" : ""}" data-product-id="${product.id}">
        <div class="pf-shop-product__media">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : `<div class="pf-shop-product__placeholder">No image</div>`}
          <span class="pf-shop-product__file">${escapeHtml(product.fileType)}</span>
          ${owned ? `<span class="pf-shop-product__owned">✓ Owned</span>` : ""}
        </div>
        <div class="pf-shop-product__meta">
          <h4 class="pf-shop-product__title">${escapeHtml(product.title)}</h4>
          <div class="pf-shop-product__price">${escapeHtml(formatMoney(product.price))}</div>
          ${isGoods ? `<div class="pf-shop-product__ship"><strong>Shipping:</strong> ${escapeHtml(product.shippingPrice)} · ${escapeHtml(product.shippingMethod)}</div>` : ""}
          <div class="pf-shop-product__controls">
            ${product.variants.length > 1 ? `
              <label class="pf-shop-label">
                <span>Variant</span>
                <select class="pf-wininput" data-shop-variant="${product.id}">
                  ${variantOptions}
                </select>
              </label>
            ` : ""}
            <div class="pf-shop-qty" data-shop-qty-wrap="${product.id}">
              <button class="pf-winbtn pf-winbtn--ghost" type="button" data-shop-qty-dec="${product.id}" aria-label="Decrease quantity">-</button>
              <div class="pf-shop-qty__value">${qty}</div>
              <button class="pf-winbtn pf-winbtn--ghost" type="button" data-shop-qty-inc="${product.id}" aria-label="Increase quantity">+</button>
            </div>
            <button class="pf-winbtn" type="button" data-shop-add="${product.id}">Add to cart</button>
            <button class="pf-winbtn pf-winbtn--ghost" type="button" data-shop-view="${product.id}">View Details</button>
            ${owned ? `<button class="pf-winbtn pf-winbtn--ghost" type="button" data-open-url="${escapeHtml(product.url)}" data-title="${escapeHtml(product.title)}">Download</button>` : ""}
            ${owned ? `<button class="pf-winbtn pf-winbtn--ghost" type="button" data-open-url="${escapeHtml(product.url)}" data-title="${escapeHtml(product.title)}">Re-Download</button>` : ""}
          </div>
        </div>
      </article>
    `;
  };

  const renderProductDetail = (product) => {
    if (!product) return "";
    const qty = Math.max(1, Number(appState.quantities[product.id] || 1));
    const variantOptions = product.variants.map((variant) => `
      <option value="${variant.id}" ${variant.id === product.selectedVariantId ? "selected" : ""}>
        ${escapeHtml(variant.title)} - ${escapeHtml(formatMoney(variant.price))}
      </option>
    `).join("");
    return `
      <section class="pf-shop-detail" data-shop-detail="${product.id}">
        <div class="pf-shop-detail__preview">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : `<div class="pf-shop-product__placeholder">No preview</div>`}
        </div>
        <div class="pf-shop-detail__meta">
          <h3 class="pf-shop-detail__title">${escapeHtml(product.title)}</h3>
          <div class="pf-shop-detail__price">${escapeHtml(formatMoney(product.price))}</div>
          <div class="pf-shop-detail__specs">
            <div><strong>Type:</strong> ${escapeHtml(product.fileType)}</div>
            <div><strong>Format:</strong> Instant download</div>
            <div><strong>Collection:</strong> ${escapeHtml(appState.activeCollection?.title || getRootLabel(appState.currentRoot || appState.mode) || "Shop")}</div>
          </div>
          <label class="pf-shop-label">
            <span>License</span>
            <select class="pf-wininput">
              ${product.licenses.map((license) => `<option>${escapeHtml(license)}</option>`).join("")}
            </select>
          </label>
          <div class="pf-shop-detail__actions">
            ${product.variants.length > 1 ? `
              <label class="pf-shop-label">
                <span>Variant</span>
                <select class="pf-wininput" data-shop-variant="${product.id}">
                  ${variantOptions}
                </select>
              </label>
            ` : ""}
            <label class="pf-shop-label pf-shop-label--qty">
              <span>Quantity</span>
              <input class="pf-wininput" type="number" min="1" value="${qty}" data-shop-qty-input="${product.id}">
            </label>
            <button class="pf-winbtn" type="button" data-shop-add="${product.id}">Add to cart</button>
            <button class="pf-winbtn pf-winbtn--ghost" type="button" data-open-url="${escapeHtml(product.url)}" data-title="${escapeHtml(product.title)}">Buy now</button>
          </div>
        </div>
        <div class="pf-shop-detail__tabs" role="tablist" aria-label="Product details tabs">
          <button class="pf-shop-tab is-active" type="button">Overview</button>
          <button class="pf-shop-tab" type="button">What's Included</button>
          <button class="pf-shop-tab" type="button">Instructions</button>
          <button class="pf-shop-tab" type="button">License</button>
        </div>
        <div class="pf-shop-detail__panel">
          ${escapeHtml(product.excerpt || "No description available.")}
        </div>
      </section>
    `;
  };

  const renderProducts = () => {
    if (appState.loading) return `<div class="pf-shop-state">Loading products...</div>`;
    if (appState.error) return `<div class="pf-shop-state pf-shop-state--error">${escapeHtml(appState.error)}</div>`;
    const rows = getFilteredProducts();
    if (!rows.length) {
      const emptyMsg = appState.search.trim()
        ? "No products matched your search."
        : "No items here yet.";
      return `<div class="pf-shop-state">${escapeHtml(emptyMsg)}</div>`;
    }
    const selected = rows.find((product) => product.id === appState.selectedProductId) || rows[0];
    return `
      <div class="pf-shop-shell">
        ${renderExplorerSidebar()}
        <div class="pf-shop-mainpane">
          <div class="pf-shop-products pf-shop-products--${appState.viewMode}">${rows.map(renderProductCard).join("")}</div>
          ${renderProductDetail(selected)}
        </div>
      </div>
    `;
  };

  const render = (scope) => {
    const crumbs = getCrumbs();
    const breadcrumbHtml = crumbs.map((crumb, idx) => {
      const isLast = idx === crumbs.length - 1;
      if (isLast) return `<span class="pf-shop-crumb is-current">${escapeHtml(crumb.label)}</span>`;
      return `<button class="pf-shop-crumb" type="button" data-shop-crumb="${crumb.id}">${escapeHtml(crumb.label)}</button>`;
    }).join(`<span class="pf-shop-crumb-sep">›</span>`);

    const backDisabled = appState.scope === "root" && appState.history.length === 0;
    const body = appState.view === "landing"
      ? renderLanding()
      : appState.view === "categories"
        ? renderCategories()
        : renderProducts();

    scope.innerHTML = `
      <div class="pf-shop" data-shop-app>
        <header class="pf-shop-topbar">
          <button class="pf-winbtn pf-winbtn--ghost" type="button" data-shop-back ${backDisabled ? "disabled" : ""}>←</button>
          <div class="pf-shop-breadcrumbs">${breadcrumbHtml}</div>
          <label class="pf-shop-search">
            <input class="pf-wininput" type="search" data-shop-search value="${escapeHtml(appState.search)}" placeholder="${appState.view === "products" ? "Search digital vault" : "Search folders"}">
            <span class="pf-shop-search__icon" aria-hidden="true">🔍</span>
          </label>
          <label class="pf-shop-sort">
            <span class="pf-winlabel">Sort</span>
            <select class="pf-wininput" data-shop-sort>
              <option value="newest" ${appState.sort === "newest" ? "selected" : ""}>Newest</option>
              <option value="name" ${appState.sort === "name" ? "selected" : ""}>Name</option>
              <option value="price-low" ${appState.sort === "price-low" ? "selected" : ""}>Price: Low to High</option>
              <option value="price-high" ${appState.sort === "price-high" ? "selected" : ""}>Price: High to Low</option>
            </select>
          </label>
          <div class="pf-shop-viewtoggles" role="group" aria-label="View toggles">
            <button class="pf-winbtn pf-winbtn--ghost ${appState.viewMode === "grid" ? "is-active" : ""}" type="button" data-shop-viewmode="grid">▦</button>
            <button class="pf-winbtn pf-winbtn--ghost ${appState.viewMode === "list" ? "is-active" : ""}" type="button" data-shop-viewmode="list">☰</button>
          </div>
          <label class="pf-shop-owned">
            <span>Owned Files</span>
            <input type="checkbox" data-shop-owned ${appState.ownedOnly ? "checked" : ""}>
          </label>
        </header>
        <section class="pf-shop-body">${body}</section>
        <div class="pf-shop-toast" data-shop-toast hidden></div>
      </div>
    `;
  };

  const snapshotState = () => ({
    mode: appState.mode,
    view: appState.view,
    scope: appState.scope,
    currentRoot: appState.currentRoot,
    currentCategory: appState.currentCategory,
    activeCollection: appState.activeCollection,
    products: appState.products,
    search: appState.search,
    selectedProductId: appState.selectedProductId,
    ownedOnly: appState.ownedOnly,
    sort: appState.sort,
    viewMode: appState.viewMode,
    quantities: { ...appState.quantities }
  });

  const pushHistory = () => {
    appState.history.push(snapshotState());
  };

  const resetToRoot = () => {
    appState.mode = null;
    appState.scope = "root";
    appState.view = "landing";
    appState.history = [];
    appState.currentRoot = null;
    appState.currentCategory = null;
    appState.activeCollection = null;
    appState.products = [];
    appState.search = "";
    appState.selectedProductId = 0;
    appState.quantities = {};
  };

  const ensureCollectionsLoaded = async () => {
    if (appState.initialized && appState.collections.length) return;
    setLoading(true);
    try {
      const payload = await fetchJson(COLLECTIONS_ENDPOINT);
      appState.collections = parseCollections(payload);
      appState.classByHandle = {};
      appState.collections.forEach((collection) => {
        appState.classByHandle[collection.handle] = collection.classification;
      });
      appState.initialized = true;
      setLoading(false);
    } catch {
      setLoading(false, "Could not load collections. Try again.");
    }
  };

  const openRoot = async (scope, root) => {
    if (!root) return;
    pushHistory();
    appState.mode = root;
    appState.currentRoot = root;
    appState.scope = "categories";
    appState.view = "categories";
    appState.currentCategory = null;
    appState.activeCollection = null;
    appState.products = [];
    appState.search = "";
    appState.selectedProductId = 0;
    await ensureCollectionsLoaded();
    render(scope);
  };

  const openCollection = async (scope, handle) => {
    if (!handle) return;
    pushHistory();
    const collection = appState.collections.find((row) => row.handle === handle) || { handle, title: handle, image: "" };
    appState.currentRoot = appState.currentRoot || appState.mode;
    appState.mode = appState.currentRoot;
    appState.currentCategory = handle;
    await ensureCollectionsLoaded();
    appState.activeCollection = collection;
    appState.products = [];
    appState.scope = "products";
    appState.view = "products";
    appState.search = "";
    setLoading(true);
    render(scope);
    try {
      const payload = await fetchJson(PRODUCTS_ENDPOINT(handle));
      const products = parseProducts(payload);
      appState.products = products;
      appState.selectedProductId = products[0]?.id || 0;
      const fallbackClass = appState.classByHandle[handle] || classifyByProducts(products);
      appState.classByHandle[handle] = fallbackClass;
      if (fallbackClass && appState.mode !== fallbackClass) appState.mode = fallbackClass;
      setLoading(false);
    } catch {
      setLoading(false, "Could not load products for this category.");
    }
    render(scope);
  };

  const stepQty = (productId, delta) => {
    const current = Math.max(1, Number(appState.quantities[productId] || 1));
    appState.quantities[productId] = Math.max(1, current + delta);
  };

  const setVariant = (productId, variantId) => {
    const id = Number(productId);
    const vId = Number(variantId);
    const product = appState.products.find((item) => item.id === id);
    if (!product) return;
    const variant = product.variants.find((v) => v.id === vId) || product.variants[0];
    if (!variant) return;
    product.selectedVariantId = variant.id;
    product.price = variant.price;
  };

  const addToCart = async (scope, productId) => {
    const id = Number(productId);
    const product = appState.products.find((item) => item.id === id);
    if (!product) return;
    const variantId = Number(product.selectedVariantId || product.variants[0]?.id || 0);
    const qty = Math.max(1, Number(appState.quantities[id] || 1));
    if (!variantId) {
      showToast(scope, "No variant available for this product.", "error");
      return;
    }
    try {
      const res = await fetch("/cart/add.js", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ id: variantId, quantity: qty })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.description || err?.message || "Could not add to cart.";
        throw new Error(msg);
      }
      showToast(scope, "Added to cart", "ok");
      if (typeof os.refreshCartBadge === "function") {
        os.refreshCartBadge().catch?.(() => {});
      } else {
        window.dispatchEvent(new CustomEvent("pf:cart-updated"));
      }
    } catch (error) {
      showToast(scope, error?.message || "Add to cart failed.", "error");
    }
  };

  const onBack = (scope) => {
    if (appState.history.length) {
      const previous = appState.history.pop();
      Object.assign(appState, previous);
      render(scope);
      return;
    }
    resetToRoot();
    render(scope);
  };

  const onCrumb = async (scope, crumb) => {
    if (crumb === "shop") {
      appState.history = [];
      resetToRoot();
      render(scope);
      return;
    }
    if (crumb === "digital" || crumb === "goods") {
      appState.history = [];
      await openRoot(scope, crumb);
    }
  };

  const bindEvents = (scope) => {
    if (!scope || scope.dataset.shopBound === "true") return;
    scope.dataset.shopBound = "true";

    scope.addEventListener("click", async (event) => {
      const rootBtn = event.target.closest("[data-shop-root-id]");
      if (rootBtn) {
        const root = rootBtn.getAttribute("data-shop-root-id");
        await openRoot(scope, root);
        return;
      }

      const categoryBtn = event.target.closest("[data-shop-category]");
      if (categoryBtn) {
        const handle = categoryBtn.getAttribute("data-shop-category");
        const root = categoryBtn.getAttribute("data-shop-root-id");
        if (root && root !== appState.currentRoot) {
          await openRoot(scope, root);
        }
        await openCollection(scope, handle);
        return;
      }

      const backBtn = event.target.closest("[data-shop-back]");
      if (backBtn) {
        onBack(scope);
        return;
      }

      const crumbBtn = event.target.closest("[data-shop-crumb]");
      if (crumbBtn) {
        const crumb = crumbBtn.getAttribute("data-shop-crumb");
        await onCrumb(scope, crumb);
        return;
      }

      const decBtn = event.target.closest("[data-shop-qty-dec]");
      if (decBtn) {
        stepQty(decBtn.getAttribute("data-shop-qty-dec"), -1);
        render(scope);
        return;
      }
      const incBtn = event.target.closest("[data-shop-qty-inc]");
      if (incBtn) {
        stepQty(incBtn.getAttribute("data-shop-qty-inc"), +1);
        render(scope);
        return;
      }

      const addBtn = event.target.closest("[data-shop-add]");
      if (addBtn) {
        await addToCart(scope, addBtn.getAttribute("data-shop-add"));
        return;
      }

      const viewBtn = event.target.closest("[data-shop-view]");
      if (viewBtn) {
        appState.selectedProductId = Number(viewBtn.getAttribute("data-shop-view") || 0);
        render(scope);
      }
    });

    scope.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const variantSelect = target.closest("[data-shop-variant]");
      if (variantSelect && variantSelect instanceof HTMLSelectElement) {
        const productId = variantSelect.getAttribute("data-shop-variant");
        setVariant(productId, variantSelect.value);
        render(scope);
        return;
      }
      const sortSelect = target.closest("[data-shop-sort]");
      if (sortSelect && sortSelect instanceof HTMLSelectElement) {
        appState.sort = sortSelect.value || "newest";
        render(scope);
        return;
      }
      const ownedToggle = target.closest("[data-shop-owned]");
      if (ownedToggle && ownedToggle instanceof HTMLInputElement) {
        appState.ownedOnly = Boolean(ownedToggle.checked);
        render(scope);
      }
    });

    scope.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.matches("[data-shop-search]")) return;
      appState.search = target.value || "";
      render(scope);
    });

    scope.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.matches("[data-shop-qty-input]")) return;
      const productId = Number(target.getAttribute("data-shop-qty-input") || 0);
      if (!productId) return;
      const next = Math.max(1, Number(target.value || 1));
      appState.quantities[productId] = next;
    });

    scope.addEventListener("click", (event) => {
      const modeBtn = event.target.closest("[data-shop-viewmode]");
      if (!modeBtn) return;
      const mode = modeBtn.getAttribute("data-shop-viewmode");
      if (mode !== "grid" && mode !== "list") return;
      appState.viewMode = mode;
      render(scope);
    });
  };

  const mountShop = async (scope) => {
    Object.assign(appState, createState());
    render(scope);
    bindEvents(scope);
    await ensureCollectionsLoaded();
    render(scope);
  };

  os.registerApp("shop", {
    singleton: true,
    launch(ctx = {}) {
      const html = `<div class="pf-wincontent pf-shop-root" data-shop-root></div>`;
      const winId = os.createWindow({
        title: ctx.title || "Digital Drops",
        html,
        appId: "shop"
      });
      const winEl = os.getWindowEl(winId);
      const scope = winEl?.querySelector("[data-shop-root]");
      if (scope) mountShop(scope).catch(() => {
        scope.innerHTML = `<div class="pf-shop-state pf-shop-state--error">Shop failed to load.</div>`;
      });
      return winId;
    }
  });

  // Backward compatibility: opening "collections" now opens Shop.
  os.registerApp("collections", {
    launch(ctx = {}) {
      return os.launch("shop", { ...ctx, title: ctx.title || "Shop" });
    }
  });
})();
