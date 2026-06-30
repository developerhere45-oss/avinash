const MEDICINE_STORE_COMING_SOON = true;
const RENDER_API_BASE = "https://dishahealthq-c7gv.onrender.com";
const PUBLIC_WEBSITE_HOSTS = new Set(["dishahealthq.in", "www.dishahealthq.in"]);
const API_BASE = PUBLIC_WEBSITE_HOSTS.has(window.location.hostname) ? RENDER_API_BASE : "";

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

function apiCredentials() {
  return API_BASE ? "include" : "same-origin";
}

const defaultProducts = [
  { id: "dolo-650", name: "Dolo 650 Tablet", category: "daily", price: 19, mrp: 25, discount: "24% OFF", tag: "Paracetamol 650mg", prescription: false, icon: "pill" },
  { id: "crocin-advance", name: "Crocin Advance Tablet", category: "daily", price: 32, mrp: 42, discount: "24% OFF", tag: "Paracetamol 500mg", prescription: false, icon: "pill" },
  { id: "liv-52", name: "Himalaya Liv.52 Tablet", category: "ayurveda", price: 140, mrp: 165, discount: "15% OFF", tag: "Liver Protection", prescription: false, icon: "leaf" },
  { id: "ensure-vanilla", name: "Ensure Vanilla", category: "wellness", price: 780, mrp: 925, discount: "16% OFF", tag: "Nutrition Drink Powder", prescription: false, icon: "shield-plus" },
  { id: "ors-pack", name: "ORS Hydration Pack", category: "wellness", price: 28, mrp: 35, discount: "20% OFF", tag: "Electrolyte drink", prescription: false, icon: "droplets" },
  { id: "baby-lotion", name: "Baby Care Lotion", category: "baby", price: 145, mrp: 180, discount: "19% OFF", tag: "Baby skin care", prescription: false, icon: "baby" },
  { id: "digital-thermometer", name: "Digital Thermometer", category: "devices", price: 220, mrp: 299, discount: "26% OFF", tag: "Health device", prescription: false, icon: "thermometer" },
  { id: "first-aid-kit", name: "First Aid Kit", category: "personal", price: 399, mrp: 499, discount: "20% OFF", tag: "Emergency care", prescription: false, icon: "briefcase-medical" },
  { id: "diabetes-refill", name: "Diabetes Care Refill", category: "diabetes", price: 240, mrp: 300, discount: "20% OFF", tag: "Prescription required", prescription: true, icon: "heart-pulse" }
];
let products = [];

const state = {
  category: "all",
  query: "",
  showAll: false,
  cart: new Map(),
  prescriptionFile: null
};

const grid = document.querySelector("#medicineProductGrid");
const count = document.querySelector("#medicineResultCount");
const cartItems = document.querySelector("#medicineCartItems");
const subtotal = document.querySelector("#medicineSubtotal");
const toast = document.querySelector("#toast");

async function initMedicineStore() {
  await loadProducts();
  renderProducts();
  renderCart();
  bindMedicineEvents();
  if (window.lucide) {
    window.lucide.createIcons();
  } else {
    window.addEventListener("load", () => window.lucide && window.lucide.createIcons());
  }
}

async function loadProducts() {
  try {
    const response = await fetch(apiUrl("/api/medicine-products"), { credentials: apiCredentials() });
    if (!response.ok) throw new Error("Medicine backend unavailable");
    const payload = await response.json();
    const backendProducts = Array.isArray(payload.products) ? payload.products : [];
    products = backendProducts.length ? mergeDefaultProducts(backendProducts) : defaultProducts;
  } catch {
    products = defaultProducts;
    showToast("Showing preview medicines. Ordering is launching soon.");
  }
}

function mergeDefaultProducts(backendProducts) {
  const existing = new Set(backendProducts.map((product) => product.id));
  return [...backendProducts, ...defaultProducts.filter((product) => !existing.has(product.id))];
}

function filteredProducts() {
  return products.filter((product) => {
    const categoryOk = state.category === "all" || product.category === state.category;
    const queryOk = !state.query || `${product.name} ${product.tag}`.toLowerCase().includes(state.query);
    return categoryOk && queryOk;
  });
}

function renderProducts() {
  const items = filteredProducts();
  const shouldLimit = !state.showAll && state.category === "all" && !state.query;
  const visibleItems = shouldLimit ? items.slice(0, 3) : items;
  count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  if (!items.length) {
    grid.innerHTML = `<article class="doctor-empty"><h3>No medicine products found</h3><p>Backend catalog is empty or unavailable.</p></article>`;
    const viewAllButton = document.querySelector("#viewAllMedicineProducts");
    if (viewAllButton) viewAllButton.hidden = true;
    refreshIcons();
    return;
  }
  const viewAllButton = document.querySelector("#viewAllMedicineProducts");
  if (viewAllButton) viewAllButton.hidden = visibleItems.length >= items.length;
  grid.innerHTML = visibleItems.map((product) => {
    const cartItem = state.cart.get(product.id);
    const qty = cartItem?.qty || 1;
    return `
    <article class="store-product-card">
      <span class="store-product-icon ${escapeHtml(product.category)}">
        <i data-lucide="${product.icon}"></i>
      </span>
      <div class="store-product-copy">
        <span>${escapeHtml(product.tag)}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <small>${product.prescription ? "Prescription required" : "No prescription required"}</small>
      </div>
      <div class="store-product-bottom">
        <strong>Rs ${product.price}</strong>
        ${product.mrp ? `<small class="medicine-mrp">Rs ${product.mrp}</small>` : ""}
        ${product.discount ? `<small class="medicine-discount">${escapeHtml(product.discount)}</small>` : ""}
        <div class="product-stepper" aria-label="Quantity for ${escapeHtml(product.name)}">
          <button type="button" data-card-dec="${product.id}" aria-label="Decrease ${escapeHtml(product.name)}">-</button>
          <span>${qty}</span>
          <button type="button" data-card-inc="${product.id}" aria-label="Increase ${escapeHtml(product.name)}">+</button>
        </div>
        <button type="button" data-add-product="${product.id}">
          <i data-lucide="shopping-cart"></i>
          Add
        </button>
      </div>
    </article>
  `;
  }).join("");
  grid.querySelectorAll("[data-add-product]").forEach((button) => {
    button.addEventListener("click", () => addProduct(button.dataset.addProduct));
  });
  grid.querySelectorAll(".store-product-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const id = card.querySelector("[data-add-product]")?.dataset.addProduct;
      const product = products.find((item) => item.id === id);
      if (product) showLaunchPopup(product);
    });
  });
  grid.querySelectorAll("[data-card-inc]").forEach((button) => {
    button.addEventListener("click", () => addProduct(button.dataset.cardInc));
  });
  grid.querySelectorAll("[data-card-dec]").forEach((button) => {
    button.addEventListener("click", () => decrementProduct(button.dataset.cardDec));
  });
  refreshIcons();
}

function renderCart() {
  const items = [...state.cart.values()];
  if (!items.length) {
    cartItems.innerHTML = `
      <div class="cart-empty">
        <i data-lucide="file-plus-2"></i>
        <span>Ordering is coming soon. Join the launch alert below.</span>
      </div>
    `;
  } else {
    cartItems.innerHTML = items.map(({ product, qty }) => `
      <article class="cart-item">
        <div>
          <strong>${escapeHtml(product.name)}</strong>
          <small>Rs ${product.price} x ${qty}</small>
        </div>
        <div class="cart-stepper">
          <button type="button" data-dec-product="${product.id}">-</button>
          <span>${qty}</span>
          <button type="button" data-inc-product="${product.id}">+</button>
        </div>
      </article>
    `).join("");
  }
  const total = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  subtotal.textContent = `Rs ${total}`;
  cartItems.querySelectorAll("[data-inc-product]").forEach((button) => button.addEventListener("click", () => addProduct(button.dataset.incProduct)));
  cartItems.querySelectorAll("[data-dec-product]").forEach((button) => button.addEventListener("click", () => decrementProduct(button.dataset.decProduct)));
  refreshIcons();
}

function addProduct(id) {
  if (MEDICINE_STORE_COMING_SOON) {
    const product = products.find((item) => item.id === id);
    showLaunchPopup(product);
    return;
  }
  const product = products.find((item) => item.id === id);
  if (!product) return;
  const current = state.cart.get(id) || { product, qty: 0 };
  current.qty += 1;
  state.cart.set(id, current);
  renderCart();
  renderProducts();
  showToast(`${product.name} added to cart.`);
}

function decrementProduct(id) {
  if (MEDICINE_STORE_COMING_SOON) {
    showToast("Cart quantity will work when medicine ordering launches.");
    return;
  }
  const current = state.cart.get(id);
  if (!current) return;
  current.qty -= 1;
  if (current.qty <= 0) state.cart.delete(id);
  renderCart();
  renderProducts();
}

function bindMedicineEvents() {
  document.querySelector("#medicineSearchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = document.querySelector("#medicineSearch").value.trim().toLowerCase();
    state.category = document.querySelector("#medicineCategory").value;
    state.showAll = false;
    syncCategoryButtons();
    renderProducts();
  });

  document.querySelector("#medicineCategory")?.addEventListener("change", (event) => {
    state.category = event.target.value;
    state.showAll = false;
    syncCategoryButtons();
    renderProducts();
  });

  document.querySelector("#medicineSearch")?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.showAll = false;
    renderProducts();
  });

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      state.showAll = false;
      document.querySelector("#medicineCategory").value = state.category;
      syncCategoryButtons();
      renderProducts();
    });
  });

  document.querySelector("#medicinePrescription")?.addEventListener("change", (event) => {
    state.prescriptionFile = event.target.files?.[0] || null;
    document.querySelector("#medicineFileName").textContent = state.prescriptionFile ? state.prescriptionFile.name : "Upload Prescription";
    if (state.prescriptionFile) showToast("Prescription selected.");
  });

  document.querySelector("#clearMedicineCart")?.addEventListener("click", () => {
    state.cart.clear();
    renderCart();
    renderProducts();
    showToast("Cart cleared.");
  });

  document.querySelector("#viewAllMedicineProducts")?.addEventListener("click", () => {
    state.category = "all";
    state.query = "";
    state.showAll = true;
    document.querySelector("#medicineSearch").value = "";
    document.querySelector("#medicineCategory").value = "all";
    syncCategoryButtons();
    renderProducts();
  });

  document.querySelector("#medicineCheckoutForm")?.addEventListener("submit", submitMedicineRequest);
  document.querySelector("[data-login-choice]")?.addEventListener("click", openLoginChoice);
  document.querySelectorAll("[data-location-request]").forEach((button) => button.addEventListener("click", requestLocation));
}

function syncCategoryButtons() {
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.category);
  });
}

function showLaunchPopup(product = {}) {
  let modal = document.querySelector("#medicineLaunchModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "medicineLaunchModal";
    modal.className = "medicine-launch-modal";
    modal.innerHTML = `
      <div class="medicine-launch-dialog" role="dialog" aria-modal="true" aria-labelledby="medicineLaunchTitle">
        <button class="medicine-launch-close" type="button" aria-label="Close"><i data-lucide="x"></i></button>
        <span class="store-product-icon daily"><i data-lucide="pill"></i></span>
        <h2 id="medicineLaunchTitle">Medicine ordering launching soon</h2>
        <p data-launch-copy></p>
        <button class="medicine-submit-button" type="button">Okay, notify me</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest(".medicine-launch-close") || event.target.closest(".medicine-submit-button")) {
        modal.classList.remove("show");
      }
    });
  }
  const productName = product?.name ? product.name : "This medicine";
  modal.querySelector("[data-launch-copy]").textContent = `${productName} is available in preview. Ordering, payment, and delivery will open after pharmacy partner verification.`;
  modal.classList.add("show");
  refreshIcons();
}

async function submitMedicineRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (MEDICINE_STORE_COMING_SOON) {
    const phone = document.querySelector("#medicineCustomerPhone").value.replace(/\D/g, "");
    if (phone.length < 10) {
      showToast("Enter a valid mobile number for launch alert.");
      return;
    }
    showToast("Medicine launch alert saved. Ordering will open soon.");
    try {
      localStorage.setItem("dhq:medicineLaunchAlert", JSON.stringify({
        name: document.querySelector("#medicineCustomerName").value.trim() || "Guest User",
        phone,
        note: document.querySelector("#medicineOrderNote").value.trim(),
        createdAt: new Date().toISOString()
      }));
      form.reset();
    } catch {
      // Local storage is optional for launch alerts.
    }
    return;
  }
  const items = [...state.cart.values()];
  if (!items.length) {
    showToast("Add at least one medicine.");
    return;
  }
  const requiresPrescription = items.some((item) => item.product.prescription);
  if (requiresPrescription && !state.prescriptionFile) {
    showToast("Prescription required for selected medicine.");
    return;
  }

  const payload = {
    serviceId: "medicine",
    serviceTitle: "Medicine Store",
    name: document.querySelector("#medicineCustomerName").value.trim(),
    phone: document.querySelector("#medicineCustomerPhone").value.trim(),
    note: [
      document.querySelector("#medicineOrderNote").value.trim(),
      `Items: ${items.map((item) => `${item.product.name} x${item.qty}`).join(", ")}`,
      state.prescriptionFile ? `Prescription: ${state.prescriptionFile.name}` : "Prescription: not required"
    ].filter(Boolean).join(" | ")
  };

  try {
    const response = await fetch(apiUrl("/api/service-requests"), {
      method: "POST",
      credentials: apiCredentials(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Request failed");
    const result = await response.json();
    showToast(`Medicine request sent. Tracking ID: ${result.request?.trackingId || "created"}`);
    state.cart.clear();
    form.reset();
    state.prescriptionFile = null;
    document.querySelector("#medicineFileName").textContent = "Upload Prescription";
    renderCart();
    renderProducts();
  } catch {
    showToast("Backend unavailable. Try again after server starts.");
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    showToast("Location not supported.");
    return;
  }
  showToast("Please allow location permission.");
  navigator.geolocation.getCurrentPosition(() => {
    document.querySelector("[data-location-label]").textContent = "Location Allowed";
    showToast("Location allowed for nearby pharmacy search.");
  }, () => showToast("Location permission not allowed."));
}

function openLoginChoice() {
  window.location.href = "index.html#home";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

initMedicineStore();
