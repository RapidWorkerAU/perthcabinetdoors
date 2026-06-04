const formatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

const fallbackConfig = {
  product: {
    id: "fallback-18mm-thermolaminate",
    slug: "18mm-thermolaminate",
    title: "18mm Thermolaminate",
  },
  quoteTitle: "Online Quotation Request",
  quoteDescription:
    "Create a detailed quote request for your cabinet doors. Pricing is indicative and includes GST. We will confirm final details and lead time before production.",
  groups: {
    finish: { enabled: true, required: true, label: "Finish" },
    colour: { enabled: true, required: true, label: "Colour" },
    profileType: { enabled: true, required: true, label: "Profile Type" },
    profile: { enabled: true, required: true, label: "Profile" },
    edgeMould: { enabled: true, required: true, label: "Edge Mould" },
    hinge: { enabled: true, required: false, label: "Hinge Options" },
  },
  dimensions: {
    width: { min: 150, max: 1200 },
    height: { min: 150, max: 2400 },
    qty: { min: 1, max: 999 },
    hingeHoles: { min: 0, max: 12 },
    hingesQty: { min: 0, max: 12 },
  },
  optionSets: {
    finishes: ["Woodmatt", "Texture", "Smooth", "Ravine"],
    coloursByFinish: {
      Woodmatt: ["District Oak", "Notaio Walnut", "Boston Oak"],
      Texture: ["White Texture", "Grey Texture", "Black Texture"],
      Smooth: ["Polar White", "Classic White", "Storm Grey"],
      Ravine: ["Ravine Oak", "Ravine Walnut", "Ravine Ash"],
    },
    profileTypes: ["Minimal", "Soft", "Sharp", "Detailed"],
    profilesByProfileType: {
      Minimal: ["Oslo", "Capri", "Milan"],
      Soft: ["Verona", "Florence", "Como"],
      Sharp: ["Atlanta", "Soho", "Brooklyn"],
      Detailed: ["Hampton", "Provence", "Tudor"],
    },
    edgeMoulds: ["EM6 Roman Edge", "EM2 Square Edge", "EM4 Bevel Edge"],
    hinges: [
      { label: "Blum 110° Full Cover Soft Close Screw on", price: 9.05 },
      { label: "Blum 110° Half Crank Soft Close Screw on", price: 9.75 },
      { label: "Blum 155° Screw on by-fold", price: 14.85 },
      { label: "Blum 170° Corner Full Cover", price: 13.15 },
      { label: "Blum 170° Half Crank", price: 18.55 },
    ],
  },
  pricing: {
    baseFee: 45,
    drillingFeePerHole: 5,
    rules: [
      { finish: "Woodmatt", profileType: "Minimal", basePrice: 25.71, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Woodmatt", profileType: "Soft", basePrice: 28.23, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Woodmatt", profileType: "Sharp", basePrice: 32.58, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Woodmatt", profileType: "Detailed", basePrice: 39.41, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Texture", profileType: "Minimal", basePrice: 18.14, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Texture", profileType: "Soft", basePrice: 19.78, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Texture", profileType: "Sharp", basePrice: 22.59, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Texture", profileType: "Detailed", basePrice: 26.8, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Smooth", profileType: "Minimal", basePrice: 20.27, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Smooth", profileType: "Soft", basePrice: 21.34, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Smooth", profileType: "Sharp", basePrice: 24.44, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Smooth", profileType: "Detailed", basePrice: 29.04, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Ravine", profileType: "Minimal", basePrice: 25.71, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Ravine", profileType: "Soft", basePrice: 28.23, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Ravine", profileType: "Sharp", basePrice: 32.58, areaRate: 0.0002333, markup: 1.35 },
      { finish: "Ravine", profileType: "Detailed", basePrice: 39.41, areaRate: 0.0002333, markup: 1.35 },
    ],
  },
};

let quoteProducts = [fallbackConfig.product];
let quoteConfig = fallbackConfig;

const storageKey = "pcd-quote";

const form = document.getElementById("quote-form");
const productField = document.getElementById("quoteProduct");
const lineItemsContainer = document.getElementById("line-items");
const addLineButton = document.getElementById("add-line");
const sendButton = document.getElementById("send-quote");
const copyButton = document.getElementById("copy-quote");
const resetButton = document.getElementById("reset-quote");
const addLineIconButton = document.querySelector(".add-line-icon");
const messageEl = document.getElementById("quote-message");
const orderDateInput = document.getElementById("orderDate");
const leadTimeWarning = document.getElementById("leadtime-warning");
const leadTimeAck = document.getElementById("leadtime-ack");
const mobileLineItemsContainer = document.getElementById("line-items-mobile");
const lineOverlay = document.getElementById("quote-line-overlay");
const lineForm = document.getElementById("quote-line-form");
const lineMessage = document.getElementById("quote-line-message");
const heroEyebrow = document.querySelector(".quote-hero .eyebrow");
const heroTitle = document.querySelector(".quote-hero h1");
const heroLead = document.querySelector(".quote-hero .lead");

const mobileFields = {
  finish: document.getElementById("mobile-finish"),
  colour: document.getElementById("mobile-colour"),
  profileType: document.getElementById("mobile-profile-type"),
  profile: document.getElementById("mobile-profile"),
  edge: document.getElementById("mobile-edge"),
  width: document.getElementById("mobile-width"),
  height: document.getElementById("mobile-height"),
  qty: document.getElementById("mobile-qty"),
  holes: document.getElementById("mobile-holes"),
  hinge: document.getElementById("mobile-hinge"),
  hingesQty: document.getElementById("mobile-hingesqty"),
};

const totalsEls = {
  doors: document.getElementById("doors-total"),
  hinges: document.getElementById("hinge-total"),
  drilling: document.getElementById("drilling-total"),
  base: document.getElementById("base-total"),
  grand: document.getElementById("grand-total"),
};

const emptyStateText = "No line items yet. Add your first row to start the quote.";

function createOption(value, label = value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function isMobileView() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function currentProductTitle() {
  return quoteConfig.product?.title || "Quote Product";
}

function groupConfig(key) {
  return quoteConfig.groups?.[key] || { enabled: true, required: false, label: key };
}

function groupEnabled(key) {
  return groupConfig(key).enabled !== false;
}

function groupRequired(key) {
  return groupEnabled(key) && groupConfig(key).required !== false;
}

function dimensionBounds(key) {
  return quoteConfig.dimensions?.[key] || { min: 0, max: 99999 };
}

function getHingeOptions() {
  return quoteConfig.optionSets?.hinges || [];
}

function getPricingRule(finish, profileType) {
  const rules = quoteConfig.pricing?.rules || [];
  return (
    rules.find(
      (rule) =>
        rule.finish === finish &&
        ((rule.profileType || "") === (profileType || "") || !groupEnabled("profileType"))
    ) ||
    rules.find((rule) => rule.finish === finish && !rule.profileType) ||
    null
  );
}

function selectedProductName() {
  const match = quoteProducts.find((item) => item.id === productField?.value);
  return match?.title || currentProductTitle();
}

function showEmptyState() {
  if (lineItemsContainer.querySelector(".line-item-empty-wrapper")) return;
  const wrapper = document.createElement("div");
  wrapper.className = "line-item-empty-wrapper";
  wrapper.innerHTML = `
    <div class="line-items-empty">${emptyStateText}</div>
    <div class="line-items-head-spacer" aria-hidden="true"></div>
  `;
  lineItemsContainer.appendChild(wrapper);
}

function clearEmptyState() {
  lineItemsContainer.querySelector(".line-item-empty-wrapper")?.remove();
}

function ensureEmptyState() {
  const rows = lineItemsContainer.querySelectorAll(".line-item-wrapper");
  if (rows.length === 0) showEmptyState();
  else clearEmptyState();
}

function applyHeroCopy() {
  if (heroEyebrow) heroEyebrow.textContent = currentProductTitle();
  if (heroTitle) heroTitle.textContent = quoteConfig.quoteTitle || "Online Quotation Request";
  if (heroLead) heroLead.textContent = quoteConfig.quoteDescription || fallbackConfig.quoteDescription;
}

function applyFieldAvailability(wrapper) {
  const mappings = [
    { key: "finish", selector: ".finish-select" },
    { key: "colour", selector: ".colour-select" },
    { key: "profileType", selector: ".profiletype-select" },
    { key: "profile", selector: ".profile-select" },
    { key: "edgeMould", selector: ".edge-select" },
    { key: "hinge", selector: ".holes-input" },
    { key: "hinge", selector: ".hingesqty-input" },
    { key: "hinge", selector: ".hinge-select" },
  ];

  mappings.forEach(({ key, selector }) => {
    const field = wrapper.querySelector(selector);
    if (!field) return;
    field.disabled = !groupEnabled(key);
    if (!groupEnabled(key)) {
      if (field.tagName === "SELECT") field.value = "";
      else field.value = 0;
    }
  });
}

function applyMobileAvailability() {
  const mappings = [
    { key: "finish", field: mobileFields.finish },
    { key: "colour", field: mobileFields.colour },
    { key: "profileType", field: mobileFields.profileType },
    { key: "profile", field: mobileFields.profile },
    { key: "edgeMould", field: mobileFields.edge },
    { key: "hinge", field: mobileFields.holes },
    { key: "hinge", field: mobileFields.hinge },
    { key: "hinge", field: mobileFields.hingesQty },
  ];

  mappings.forEach(({ key, field }) => {
    if (!field) return;
    field.disabled = !groupEnabled(key);
    if (!groupEnabled(key)) {
      field.value = field.tagName === "SELECT" ? "" : 0;
    }
  });
}

function populateProductSelect(selectedValue) {
  if (!productField) return;
  productField.innerHTML = "";
  quoteProducts.forEach((product) => {
    productField.appendChild(createOption(product.id, product.title));
  });
  productField.value = selectedValue || quoteProducts[0]?.id || quoteConfig.product.id;
}

async function loadQuoteConfig(productIdentifier) {
  try {
    const search = productIdentifier ? `?product=${encodeURIComponent(productIdentifier)}` : "";
    const response = await fetch(`/api/quote-config${search}`);
    if (!response.ok) throw new Error("Config request failed");
    const payload = await response.json();
    if (!payload?.config) throw new Error("Invalid config payload");
    quoteProducts = Array.isArray(payload.products) && payload.products.length ? payload.products : [fallbackConfig.product];
    quoteConfig = payload.config;
  } catch (error) {
    quoteProducts = [fallbackConfig.product];
    quoteConfig = fallbackConfig;
  }
}

function initMobileFormOptions() {
  if (!lineForm || !mobileFields.finish) return;

  mobileFields.finish.innerHTML = "";
  mobileFields.finish.appendChild(createOption("", "Select finish"));
  (quoteConfig.optionSets?.finishes || []).forEach((finish) => mobileFields.finish.appendChild(createOption(finish)));

  mobileFields.profileType.innerHTML = "";
  mobileFields.profileType.appendChild(createOption("", "Select profile type"));
  (quoteConfig.optionSets?.profileTypes || []).forEach((type) => mobileFields.profileType.appendChild(createOption(type)));

  mobileFields.edge.innerHTML = "";
  mobileFields.edge.appendChild(createOption("", "Select edge mould"));
  (quoteConfig.optionSets?.edgeMoulds || []).forEach((edge) => mobileFields.edge.appendChild(createOption(edge)));

  mobileFields.hinge.innerHTML = "";
  mobileFields.hinge.appendChild(createOption("", "Select"));
  getHingeOptions().forEach((hinge) => mobileFields.hinge.appendChild(createOption(hinge.label, hinge.label)));

  populateMobileColourSelect();
  populateMobileProfileSelect();
  applyMobileAvailability();
}

function populateMobileColourSelect(selectedValue) {
  if (!mobileFields.colour || !mobileFields.finish) return;
  const finish = mobileFields.finish.value;
  const colours = quoteConfig.optionSets?.coloursByFinish?.[finish] || [];
  mobileFields.colour.innerHTML = "";
  mobileFields.colour.appendChild(createOption("", "Select colour"));
  colours.forEach((colour) => mobileFields.colour.appendChild(createOption(colour)));
  mobileFields.colour.value = selectedValue ?? "";
}

function populateMobileProfileSelect(selectedValue) {
  if (!mobileFields.profile || !mobileFields.profileType) return;
  const profileType = mobileFields.profileType.value;
  const profiles = quoteConfig.optionSets?.profilesByProfileType?.[profileType] || [];
  mobileFields.profile.innerHTML = "";
  mobileFields.profile.appendChild(createOption("", "Select profile"));
  profiles.forEach((profile) => mobileFields.profile.appendChild(createOption(profile)));
  mobileFields.profile.value = selectedValue ?? "";
}

function getMobileData() {
  return {
    finish: mobileFields.finish?.value || "",
    colour: mobileFields.colour?.value || "",
    profileType: mobileFields.profileType?.value || "",
    profile: mobileFields.profile?.value || "",
    edgeMould: mobileFields.edge?.value || "",
    width: Number(mobileFields.width?.value || 0),
    height: Number(mobileFields.height?.value || 0),
    qty: Number(mobileFields.qty?.value || 0),
    hingeHoles: Number(mobileFields.holes?.value || 0),
    hingeType: mobileFields.hinge?.value || "",
    hingesQty: Number(mobileFields.hingesQty?.value || 0),
    hingesManual: mobileFields.hingesQty?.dataset.manual === "true",
  };
}

function getMissingMobileField() {
  const required = [
    { enabled: groupRequired("finish"), field: mobileFields.finish, label: "Finish" },
    { enabled: groupRequired("colour"), field: mobileFields.colour, label: "Colour" },
    { enabled: groupRequired("profileType"), field: mobileFields.profileType, label: "Profile type" },
    { enabled: groupRequired("profile"), field: mobileFields.profile, label: "Profile" },
    { enabled: groupRequired("edgeMould"), field: mobileFields.edge, label: "Edge mould" },
    { enabled: true, field: mobileFields.width, label: "Width (mm)" },
    { enabled: true, field: mobileFields.height, label: "Height (mm)" },
    { enabled: true, field: mobileFields.qty, label: "Qty" },
  ];

  for (const item of required) {
    if (item.enabled && (!item.field || !item.field.value)) return item.label;
  }
  return null;
}

function openLineOverlay(data, index) {
  if (!lineOverlay || !lineForm) return;
  lineOverlay.classList.add("is-open");
  lineOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("overlay-open");
  lineOverlay.dataset.editIndex = index != null ? String(index) : "";
  lineMessage.textContent = "";

  mobileFields.finish.value = data?.finish || "";
  populateMobileColourSelect(data?.colour);
  mobileFields.profileType.value = data?.profileType || "";
  populateMobileProfileSelect(data?.profile);
  mobileFields.edge.value = data?.edgeMould || "";
  mobileFields.width.value = data?.width || "";
  mobileFields.height.value = data?.height || "";
  mobileFields.qty.value = data?.qty || "";
  mobileFields.holes.value = data?.hingeHoles ?? 0;
  mobileFields.hinge.value = data?.hingeType || "";
  mobileFields.hingesQty.value = data?.hingesQty ?? 0;
  mobileFields.hingesQty.dataset.manual = data?.hingesManual === true ? "true" : "false";
  applyMobileAvailability();
}

function closeLineOverlay() {
  if (!lineOverlay) return;
  lineOverlay.classList.remove("is-open");
  lineOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overlay-open");
  lineOverlay.dataset.editIndex = "";
  lineForm?.reset();
  lineMessage.textContent = "";
}

function applyDataToLineItem(wrapper, data) {
  if (!wrapper) return;
  wrapper.querySelector(".finish-select").value = data.finish || "";
  wrapper.querySelector(".profiletype-select").value = data.profileType || "";
  wrapper.querySelector(".edge-select").value = data.edgeMould || "";
  wrapper.querySelector(".hinge-select").value = data.hingeType || "";
  wrapper.querySelector(".width-input").value = data.width || "";
  wrapper.querySelector(".height-input").value = data.height || "";
  wrapper.querySelector(".qty-input").value = data.qty || "";
  wrapper.querySelector(".holes-input").value = data.hingeHoles ?? 0;
  const hingesQtyInput = wrapper.querySelector(".hingesqty-input");
  hingesQtyInput.value = data.hingesQty ?? 0;
  hingesQtyInput.dataset.manual = data.hingesManual ? "true" : "false";
  populateColourSelect(wrapper, data.colour);
  populateProfileSelect(wrapper, data.profile);
  applyFieldAvailability(wrapper);
  updateLineItemPricing(wrapper);
}

function getLineItemData(wrapper) {
  return {
    finish: wrapper.querySelector(".finish-select").value,
    colour: wrapper.querySelector(".colour-select").value,
    profileType: wrapper.querySelector(".profiletype-select").value,
    profile: wrapper.querySelector(".profile-select").value,
    edgeMould: wrapper.querySelector(".edge-select").value,
    width: wrapper.querySelector(".width-input").value || "",
    height: wrapper.querySelector(".height-input").value || "",
    qty: wrapper.querySelector(".qty-input").value || "",
    hingeHoles: wrapper.querySelector(".holes-input").value || 0,
    hingeType: wrapper.querySelector(".hinge-select").value || "",
    hingesQty: wrapper.querySelector(".hingesqty-input").value || 0,
    lineTotal: wrapper.querySelector(".line-total").value || "Pending",
  };
}

function buildMobileCard(wrapper) {
  const data = getLineItemData(wrapper);
  const index = Number(wrapper.dataset.index || 0) + 1;
  const card = document.createElement("div");
  card.className = "line-item-card";
  card.dataset.index = wrapper.dataset.index;
  card.innerHTML = `
    <h3>Line ${index} • ${data.lineTotal}</h3>
    <div class="line-item-meta">
      <span><strong>Finish:</strong> ${data.finish || "—"}</span>
      <span><strong>Colour:</strong> ${data.colour || "—"}</span>
      <span><strong>Profile:</strong> ${data.profileType || "—"} ${data.profile ? `• ${data.profile}` : ""}</span>
      <span><strong>Edge:</strong> ${data.edgeMould || "—"}</span>
      <span><strong>Size:</strong> ${data.width || "—"} x ${data.height || "—"} mm • Qty ${data.qty || "—"}</span>
      <span><strong>Hinges:</strong> ${data.hingeHoles || 0} holes • ${data.hingesQty || 0} qty</span>
    </div>
    <div class="line-item-actions">
      <button class="button outline small" type="button" data-line-edit>Edit</button>
      <button class="button outline small" type="button" data-line-remove>Remove</button>
    </div>
  `;

  card.querySelector("[data-line-edit]").addEventListener("click", () => {
    openLineOverlay(getLineItemData(wrapper), wrapper.dataset.index);
  });

  card.querySelector("[data-line-remove]").addEventListener("click", () => {
    wrapper.remove();
    renumberLineItems();
    updateTotals();
    saveQuote();
    ensureEmptyState();
    renderMobileList();
  });

  return card;
}

function renderMobileList() {
  if (!mobileLineItemsContainer) return;
  mobileLineItemsContainer.innerHTML = "";
  const wrappers = Array.from(lineItemsContainer.querySelectorAll(".line-item-wrapper"));
  if (!wrappers.length) {
    const empty = document.createElement("div");
    empty.className = "line-items-empty";
    empty.textContent = emptyStateText;
    mobileLineItemsContainer.appendChild(empty);
    return;
  }
  wrappers.forEach((wrapper) => mobileLineItemsContainer.appendChild(buildMobileCard(wrapper)));
}

function createLineItem(index, data = {}) {
  const widthBounds = dimensionBounds("width");
  const heightBounds = dimensionBounds("height");
  const qtyBounds = dimensionBounds("qty");
  const holesBounds = dimensionBounds("hingeHoles");
  const hingesQtyBounds = dimensionBounds("hingesQty");

  const wrapper = document.createElement("div");
  wrapper.className = "line-item-wrapper";
  wrapper.dataset.index = index;
  wrapper.innerHTML = `
    <div class="line-item-row">
      <div class="line-item-cell line-item-cell-stack" data-label="Finish / Colour">
        <label class="sr-only">Finish</label>
        <select class="finish-select" aria-label="Finish"></select>
        <label class="sr-only">Colour</label>
        <select class="colour-select" aria-label="Colour"></select>
      </div>
      <div class="line-item-cell line-item-cell-stack" data-label="Profile Options">
        <label class="sr-only">Profile Type</label>
        <select class="profiletype-select" aria-label="Profile type"></select>
        <label class="sr-only">Profile</label>
        <select class="profile-select" aria-label="Profile"></select>
      </div>
      <div class="line-item-cell" data-label="Edge Mould">
        <label class="sr-only">Edge Mould</label>
        <select class="edge-select" aria-label="Edge mould"></select>
      </div>
      <div class="line-item-cell" data-label="Width (mm)">
        <label class="sr-only">Width (mm)</label>
        <input class="width-input" type="number" min="${widthBounds.min}" max="${widthBounds.max}" aria-label="Width in millimetres" value="${data.width ?? ""}" />
      </div>
      <div class="line-item-cell" data-label="Height (mm)">
        <label class="sr-only">Height (mm)</label>
        <input class="height-input" type="number" min="${heightBounds.min}" max="${heightBounds.max}" aria-label="Height in millimetres" value="${data.height ?? ""}" />
      </div>
      <div class="line-item-cell" data-label="Qty">
        <label class="sr-only">Qty</label>
        <input class="qty-input" type="number" min="${qtyBounds.min}" max="${qtyBounds.max}" aria-label="Quantity" value="${data.qty ?? ""}" />
      </div>
      <div class="line-item-cell line-item-cell-stack" data-label="Hinge Options">
        <label class="sr-only">Hinge Holes (qty)</label>
        <div class="line-item-inline-field">
          <span class="line-item-inline-label">Holes</span>
          <input class="holes-input" type="number" min="${holesBounds.min}" max="${holesBounds.max}" aria-label="Hinge holes quantity" value="${data.hingeHoles ?? 0}" />
        </div>
        <label class="sr-only">Hinges Qty</label>
        <div class="line-item-inline-field">
          <span class="line-item-inline-label">Qty</span>
          <input class="hingesqty-input" type="number" min="${hingesQtyBounds.min}" max="${hingesQtyBounds.max}" aria-label="Hinges quantity" value="${data.hingesQty ?? 0}" />
        </div>
        <label class="sr-only">Hinge Type</label>
        <div class="line-item-inline-field">
          <span class="line-item-inline-label">Type</span>
          <select class="hinge-select" aria-label="Hinge type"></select>
        </div>
      </div>
      <div class="line-item-cell has-hint unit-price-cell" data-label="Unit Price">
        <label class="sr-only">Unit Price</label>
        <input class="unit-price readonly-field" type="text" readonly />
        <span class="field-hint" hidden></span>
      </div>
      <div class="line-item-cell line-total-cell has-hint" data-label="Line Total">
        <label class="sr-only">Line Total</label>
        <input class="line-total readonly-field" type="text" readonly />
        <span class="field-hint" hidden></span>
      </div>
    </div>
    <button class="icon-button remove-line" type="button" aria-label="Remove line item">
      <span aria-hidden="true">🗑</span>
    </button>
  `;

  const finishSelect = wrapper.querySelector(".finish-select");
  finishSelect.appendChild(createOption("", "Select finish"));
  (quoteConfig.optionSets?.finishes || []).forEach((finish) => finishSelect.appendChild(createOption(finish)));

  const profileTypeSelect = wrapper.querySelector(".profiletype-select");
  profileTypeSelect.appendChild(createOption("", "Select profile type"));
  (quoteConfig.optionSets?.profileTypes || []).forEach((profileType) =>
    profileTypeSelect.appendChild(createOption(profileType))
  );

  const edgeSelect = wrapper.querySelector(".edge-select");
  edgeSelect.appendChild(createOption("", "Select edge mould"));
  (quoteConfig.optionSets?.edgeMoulds || []).forEach((edge) => edgeSelect.appendChild(createOption(edge)));

  const hingeSelect = wrapper.querySelector(".hinge-select");
  hingeSelect.appendChild(createOption("", "Select"));
  getHingeOptions().forEach((hinge) => hingeSelect.appendChild(createOption(hinge.label, hinge.label)));

  finishSelect.value = data.finish ?? "";
  profileTypeSelect.value = data.profileType ?? "";
  edgeSelect.value = data.edgeMould ?? "";
  hingeSelect.value = data.hingeType ?? "";

  const hingesQtyInput = wrapper.querySelector(".hingesqty-input");
  hingesQtyInput.dataset.manual = "false";
  if (data.hingesQty != null && data.hingeHoles != null && Number(data.hingesQty) !== Number(data.hingeHoles)) {
    hingesQtyInput.dataset.manual = "true";
  }

  populateColourSelect(wrapper, data.colour);
  populateProfileSelect(wrapper, data.profile);
  attachLineItemEvents(wrapper);
  applyFieldAvailability(wrapper);
  updateLineItemPricing(wrapper);

  return wrapper;
}

function getFirstMissingField(wrapper) {
  const widthValue = wrapper.querySelector(".width-input").value.trim();
  const heightValue = wrapper.querySelector(".height-input").value.trim();
  const qtyValue = wrapper.querySelector(".qty-input").value.trim();

  const required = [
    { enabled: groupRequired("finish"), selector: ".finish-select", label: "Finish" },
    { enabled: groupRequired("colour"), selector: ".colour-select", label: "Colour" },
    { enabled: groupRequired("profileType"), selector: ".profiletype-select", label: "Profile type" },
    { enabled: groupRequired("profile"), selector: ".profile-select", label: "Profile" },
    { enabled: groupRequired("edgeMould"), selector: ".edge-select", label: "Edge mould" },
    { enabled: true, selector: ".width-input", label: "Width (mm)", value: widthValue },
    { enabled: true, selector: ".height-input", label: "Height (mm)", value: heightValue },
    { enabled: true, selector: ".qty-input", label: "Qty", value: qtyValue },
  ];

  for (const field of required) {
    if (!field.enabled) continue;
    if (field.selector.endsWith("select")) {
      const value = wrapper.querySelector(field.selector).value.trim();
      if (!value) return field.label;
    } else if (!field.value) {
      return field.label;
    }
  }
  return null;
}

function updatePricingPlaceholders(wrapper, message) {
  const unitPrice = wrapper.querySelector(".unit-price");
  const lineTotal = wrapper.querySelector(".line-total");
  const hints = wrapper.querySelectorAll(".field-hint");
  if (message) {
    const prompt = `Enter ${message}`;
    unitPrice.value = "";
    lineTotal.value = "";
    hints.forEach((hint) => {
      hint.textContent = prompt;
      hint.hidden = false;
    });
  } else {
    hints.forEach((hint) => {
      hint.textContent = "";
      hint.hidden = true;
    });
  }
}

function populateColourSelect(wrapper, selectedValue) {
  const finish = wrapper.querySelector(".finish-select").value;
  const colours = quoteConfig.optionSets?.coloursByFinish?.[finish] || [];
  const colourSelect = wrapper.querySelector(".colour-select");
  colourSelect.innerHTML = "";
  colourSelect.appendChild(createOption("", "Select colour"));
  colours.forEach((colour) => colourSelect.appendChild(createOption(colour)));
  colourSelect.value = selectedValue ?? "";
}

function populateProfileSelect(wrapper, selectedValue) {
  const profileType = wrapper.querySelector(".profiletype-select").value;
  const profiles = quoteConfig.optionSets?.profilesByProfileType?.[profileType] || [];
  const profileSelect = wrapper.querySelector(".profile-select");
  profileSelect.innerHTML = "";
  profileSelect.appendChild(createOption("", "Select profile"));
  profiles.forEach((profile) => profileSelect.appendChild(createOption(profile)));
  profileSelect.value = selectedValue ?? "";
}

function attachLineItemEvents(wrapper) {
  wrapper.querySelector(".finish-select").addEventListener("change", () => {
    populateColourSelect(wrapper);
    updateLineItemPricing(wrapper);
  });

  wrapper.querySelector(".profiletype-select").addEventListener("change", () => {
    populateProfileSelect(wrapper);
    updateLineItemPricing(wrapper);
  });

  const holesInput = wrapper.querySelector(".holes-input");
  const hingesQtyInput = wrapper.querySelector(".hingesqty-input");
  const hingeSelect = wrapper.querySelector(".hinge-select");

  holesInput.addEventListener("input", () => {
    if (hingeSelect.value && hingesQtyInput.dataset.manual !== "true") {
      hingesQtyInput.value = holesInput.value || 0;
    }
    updateLineItemPricing(wrapper);
  });

  hingesQtyInput.addEventListener("input", () => {
    hingesQtyInput.dataset.manual = "true";
    updateLineItemPricing(wrapper);
  });

  hingeSelect.addEventListener("change", () => {
    if (!hingeSelect.value) {
      hingesQtyInput.dataset.manual = "false";
      hingesQtyInput.value = 0;
      updateLineItemPricing(wrapper);
      return;
    }
    if (hingesQtyInput.dataset.manual !== "true") {
      hingesQtyInput.value = holesInput.value || 0;
    }
    updateLineItemPricing(wrapper);
  });

  wrapper.querySelectorAll("input, select").forEach((input) => {
    if (!input.classList.contains("hingesqty-input") && !input.classList.contains("holes-input")) {
      input.addEventListener("input", () => updateLineItemPricing(wrapper));
      input.addEventListener("change", () => updateLineItemPricing(wrapper));
    }
  });

  wrapper.querySelector(".remove-line").addEventListener("click", () => {
    wrapper.remove();
    renumberLineItems();
    updateTotals();
    saveQuote();
    ensureEmptyState();
    renderMobileList();
  });
}

function updateLineItemPricing(wrapper) {
  const missingField = getFirstMissingField(wrapper);
  if (missingField) {
    updatePricingPlaceholders(wrapper, missingField);
    updateTotals();
    saveQuote();
    renderMobileList();
    return;
  }

  const widthBounds = dimensionBounds("width");
  const heightBounds = dimensionBounds("height");
  const qtyBounds = dimensionBounds("qty");
  const holesBounds = dimensionBounds("hingeHoles");
  const hingesQtyBounds = dimensionBounds("hingesQty");

  const width = clampNumber(wrapper.querySelector(".width-input").value, widthBounds.min, widthBounds.max);
  const height = clampNumber(wrapper.querySelector(".height-input").value, heightBounds.min, heightBounds.max);
  const qty = clampNumber(wrapper.querySelector(".qty-input").value, qtyBounds.min, qtyBounds.max);
  const hingeHoles = groupEnabled("hinge")
    ? clampNumber(wrapper.querySelector(".holes-input").value, holesBounds.min, holesBounds.max)
    : 0;
  const hingesQty = groupEnabled("hinge")
    ? clampNumber(wrapper.querySelector(".hingesqty-input").value, hingesQtyBounds.min, hingesQtyBounds.max)
    : 0;

  const finish = wrapper.querySelector(".finish-select").value;
  const profileType = groupEnabled("profileType") ? wrapper.querySelector(".profiletype-select").value : "";
  const hingeType = groupEnabled("hinge") ? wrapper.querySelector(".hinge-select").value : "";

  const rule = getPricingRule(finish, profileType);
  const basePrice = Number(rule?.basePrice || 0);
  const areaRate = Number(rule?.areaRate || 0);
  const markup = Number(rule?.markup || 1);
  const area = width * height;
  const baseDoorCost = (area * areaRate + basePrice) * markup;
  const hingeHolesFee = hingeHoles * Number(quoteConfig.pricing?.drillingFeePerHole || 0);
  const hingeData = getHingeOptions().find((hinge) => hinge.label === hingeType);
  const hingeHardwareCost = hingeData ? hingeData.price * hingesQty : 0;
  const baseFee = Number(quoteConfig.pricing?.baseFee || 0);
  const unitPrice = baseDoorCost + hingeHolesFee + hingeHardwareCost + baseFee;
  const lineTotal = unitPrice * qty;

  wrapper.querySelector(".unit-price").value = formatter.format(unitPrice);
  wrapper.querySelector(".line-total").value = formatter.format(lineTotal);
  updatePricingPlaceholders(wrapper, null);

  updateTotals();
  saveQuote();
  renderMobileList();
}

function updateTotals() {
  let doorsTotal = 0;
  let hingeTotal = 0;
  let drillingTotal = 0;
  let baseTotal = 0;
  let grandTotal = 0;

  Array.from(lineItemsContainer.querySelectorAll(".line-item-wrapper")).forEach((item) => {
    const missingField = getFirstMissingField(item);
    if (missingField) return;

    const width = Number(item.querySelector(".width-input").value || 0);
    const height = Number(item.querySelector(".height-input").value || 0);
    const qty = Number(item.querySelector(".qty-input").value || 0);
    const hingeHoles = groupEnabled("hinge") ? Number(item.querySelector(".holes-input").value || 0) : 0;
    const hingesQty = groupEnabled("hinge") ? Number(item.querySelector(".hingesqty-input").value || 0) : 0;
    const finish = item.querySelector(".finish-select").value;
    const profileType = groupEnabled("profileType") ? item.querySelector(".profiletype-select").value : "";
    const hingeType = groupEnabled("hinge") ? item.querySelector(".hinge-select").value : "";

    const rule = getPricingRule(finish, profileType);
    const basePrice = Number(rule?.basePrice || 0);
    const areaRate = Number(rule?.areaRate || 0);
    const markup = Number(rule?.markup || 1);
    const area = width * height;
    const baseDoorCost = (area * areaRate + basePrice) * markup;
    const hingeHolesFee = hingeHoles * Number(quoteConfig.pricing?.drillingFeePerHole || 0);
    const hingeData = getHingeOptions().find((hinge) => hinge.label === hingeType);
    const hingeHardwareCost = hingeData ? hingeData.price * hingesQty : 0;
    const baseFee = Number(quoteConfig.pricing?.baseFee || 0);

    doorsTotal += baseDoorCost * qty;
    hingeTotal += hingeHardwareCost * qty;
    drillingTotal += hingeHolesFee * qty;
    baseTotal += baseFee * qty;
    grandTotal += (baseDoorCost + hingeHolesFee + hingeHardwareCost + baseFee) * qty;
  });

  totalsEls.doors.textContent = formatter.format(doorsTotal);
  totalsEls.hinges.textContent = formatter.format(hingeTotal);
  totalsEls.drilling.textContent = formatter.format(drillingTotal);
  if (totalsEls.base) totalsEls.base.textContent = formatter.format(baseTotal);
  totalsEls.grand.textContent = formatter.format(grandTotal);
}

function clampNumber(value, min, max) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return min;
  return Math.min(Math.max(num, min), max);
}

function renumberLineItems() {
  Array.from(lineItemsContainer.querySelectorAll(".line-item-wrapper")).forEach((item, index) => {
    item.dataset.index = index;
    item.querySelector(".remove-line").hidden = false;
  });
  renderMobileList();
}

function collectFormData() {
  const formData = new FormData(form);
  const customerDetails = Object.fromEntries(formData.entries());
  const lines = Array.from(lineItemsContainer.children)
    .map((item) => {
      if (!item.classList.contains("line-item-wrapper")) return null;
      return {
        finish: item.querySelector(".finish-select").value,
        colour: item.querySelector(".colour-select").value,
        profileType: item.querySelector(".profiletype-select").value,
        profile: item.querySelector(".profile-select").value,
        edgeMould: item.querySelector(".edge-select").value,
        width: Number(item.querySelector(".width-input").value || 0),
        height: Number(item.querySelector(".height-input").value || 0),
        qty: Number(item.querySelector(".qty-input").value || 0),
        hingeHoles: Number(item.querySelector(".holes-input").value || 0),
        hingeType: item.querySelector(".hinge-select").value,
        hingesQty: Number(item.querySelector(".hingesqty-input").value || 0),
        unitPrice: item.querySelector(".unit-price").value,
        lineTotal: item.querySelector(".line-total").value,
      };
    })
    .filter(Boolean);

  return {
    product: {
      id: productField?.value || quoteConfig.product.id,
      slug: quoteConfig.product.slug,
      name: selectedProductName(),
    },
    customerDetails,
    lines,
  };
}

function buildEmailBody(data, totals) {
  const lines = [];
  lines.push("Perth Cabinet Doors — Quote Request");
  lines.push("");
  lines.push(`Product: ${data.product?.name || currentProductTitle()}`);
  lines.push("");
  lines.push("Customer Details:");
  lines.push(`Customer/Company: ${data.customerDetails.customerName || ""}`);
  lines.push(`Customer Email: ${data.customerDetails.customerEmail || ""}`);
  lines.push(`Order Date: ${data.customerDetails.orderDate || ""}`);
  lines.push(`Project/Job: ${data.customerDetails.project || ""}`);
  lines.push(`Contact Phone: ${data.customerDetails.phone || ""}`);
  lines.push(`Delivery Address: ${data.customerDetails.address || ""}`);
  lines.push(`PO/Reference: ${data.customerDetails.po || ""}`);
  lines.push("");
  lines.push("Line Items:");

  data.lines.forEach((line, index) => {
    lines.push(`Line ${index + 1}`);
    lines.push(`Finish: ${line.finish}`);
    lines.push(`Colour: ${line.colour}`);
    lines.push(`Profile Type: ${line.profileType}`);
    lines.push(`Profile: ${line.profile}`);
    lines.push(`Edge Mould: ${line.edgeMould}`);
    lines.push(`Width (mm): ${line.width}`);
    lines.push(`Height (mm): ${line.height}`);
    lines.push(`Qty: ${line.qty}`);
    lines.push(`Hinge Holes (qty): ${line.hingeHoles}`);
    lines.push(`Hinge Type: ${line.hingeType || "Not selected"}`);
    lines.push(`Hinges Qty: ${line.hingesQty}`);
    lines.push(`Unit Price: ${line.unitPrice}`);
    lines.push(`Line Total: ${line.lineTotal}`);
    lines.push("-");
  });

  lines.push("");
  lines.push("Totals:");
  lines.push(`Doors Total: ${totals.doors}`);
  lines.push(`Hinge Hardware Total: ${totals.hinges}`);
  lines.push(`Hinge Drilling Total: ${totals.drilling}`);
  lines.push(`$45 Base Total: ${totals.base}`);
  lines.push(`Grand Total: ${totals.grand}`);
  lines.push("");
  lines.push("Indicative pricing only. Please confirm final quote.");
  return lines.join("\n");
}

function getTotalsText() {
  return {
    doors: totalsEls.doors.textContent,
    hinges: totalsEls.hinges.textContent,
    drilling: totalsEls.drilling.textContent,
    base: totalsEls.base?.textContent || formatter.format(0),
    grand: totalsEls.grand.textContent,
  };
}

function buildMailtoLink(data) {
  const today = new Date().toISOString().slice(0, 10);
  const customer = data.customerDetails.customerName || "Website";
  const subject = `Perth Cabinet Doors — Quote Request — ${data.product?.name || currentProductTitle()} — ${customer} — ${today}`;
  const body = buildEmailBody(data, getTotalsText());
  const params = new URLSearchParams({ subject, body });
  if (data.customerDetails.customerEmail) params.append("cc", data.customerDetails.customerEmail);
  return `mailto:sales@perthcabinetdoors.com?${params.toString()}`;
}

function showMessage(text) {
  messageEl.textContent = text;
}

function saveQuote() {
  localStorage.setItem(storageKey, JSON.stringify(collectFormData()));
}

async function restoreQuote() {
  const stored = localStorage.getItem(storageKey);
  if (!stored) {
    ensureEmptyState();
    setDefaultOrderDate();
    if (orderDateInput) orderDateInput.dataset.touched = "false";
    updateLeadTimeWarning();
    return;
  }

  try {
    const data = JSON.parse(stored);
    if (data.product?.id) {
      await handleProductChange(data.product.id, false);
    }

    if (data.customerDetails) {
      Object.entries(data.customerDetails).forEach(([key, value]) => {
        const field = document.querySelector(`[name="${key}"]`);
        if (field) field.value = value;
      });
    }

    if (Array.isArray(data.lines) && data.lines.length) {
      lineItemsContainer.innerHTML = "";
      data.lines.forEach((line, index) => {
        const item = createLineItem(index, line);
        lineItemsContainer.appendChild(item);
      });
    }
  } catch (error) {
    localStorage.removeItem(storageKey);
  }

  renumberLineItems();
  updateTotals();
  ensureEmptyState();
  if (orderDateInput) orderDateInput.dataset.touched = "false";
  updateLeadTimeWarning();
}

function setDefaultOrderDate() {
  if (!orderDateInput || orderDateInput.value) return;
  const today = new Date();
  today.setDate(today.getDate() + 28);
  orderDateInput.value = today.toISOString().slice(0, 10);
}

function getLeadTimeCutoff() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 28);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function updateLeadTimeWarning() {
  if (!orderDateInput || !leadTimeWarning || !leadTimeAck) return;
  const touched = orderDateInput.dataset.touched === "true";
  const value = orderDateInput.value;
  if (!value) {
    leadTimeWarning.hidden = true;
    leadTimeAck.checked = false;
    return;
  }
  const selected = new Date(`${value}T00:00:00`);
  const cutoff = getLeadTimeCutoff();
  const needsAck = selected < cutoff && touched;
  leadTimeWarning.hidden = !needsAck;
  if (!needsAck) leadTimeAck.checked = false;
}

function requireLeadTimeAck() {
  if (!leadTimeWarning || leadTimeWarning.hidden) return true;
  if (leadTimeAck?.checked) return true;
  showMessage("Please acknowledge the standard 3-4 week lead time.");
  leadTimeAck?.focus();
  return false;
}

function resetQuote() {
  form.reset();
  if (productField) productField.value = quoteConfig.product.id;
  lineItemsContainer.innerHTML = "";
  showEmptyState();
  renumberLineItems();
  updateTotals();
  localStorage.removeItem(storageKey);
  if (orderDateInput) orderDateInput.dataset.touched = "false";
  updateLeadTimeWarning();
}

async function handleSendQuote() {
  if (!requireLeadTimeAck()) return;
  const data = collectFormData();
  const payload = { ...data, totals: getTotalsText() };
  sendButton.disabled = true;
  showMessage("Sending quote request...");
  try {
    const response = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Quote API request failed");
    showMessage("Quote request sent successfully.");
    setTimeout(() => {
      resetQuote();
      showMessage("");
    }, 1200);
  } catch (error) {
    window.location.href = buildMailtoLink(data);
    showMessage("API unavailable. Opened your email app as fallback.");
  } finally {
    sendButton.disabled = false;
  }
}

async function handleCopyQuote() {
  if (!requireLeadTimeAck()) return;
  const data = collectFormData();
  const body = buildEmailBody(data, getTotalsText());
  try {
    await navigator.clipboard.writeText(body);
    showMessage("Quote copied to clipboard.");
  } catch (error) {
    showMessage("Unable to copy. Please send the email manually.");
  }
}

async function handleProductChange(productId, clearLines = true) {
  await loadQuoteConfig(productId);
  populateProductSelect(quoteConfig.product.id);
  applyHeroCopy();
  initMobileFormOptions();
  if (clearLines) {
    lineItemsContainer.innerHTML = "";
    showEmptyState();
    renumberLineItems();
    updateTotals();
  } else {
    Array.from(lineItemsContainer.querySelectorAll(".line-item-wrapper")).forEach((wrapper) => {
      const data = getLineItemData(wrapper);
      const newWrapper = createLineItem(Number(wrapper.dataset.index || 0), data);
      wrapper.replaceWith(newWrapper);
    });
    renumberLineItems();
    updateTotals();
  }
  saveQuote();
}

async function initializeQuoteForm() {
  const urlProduct = new URLSearchParams(window.location.search).get("product");
  await loadQuoteConfig(urlProduct);
  populateProductSelect(quoteConfig.product.id);
  applyHeroCopy();
  initMobileFormOptions();
  showEmptyState();
  renumberLineItems();
  updateTotals();
  await restoreQuote();
  setDefaultOrderDate();
  updateLeadTimeWarning();
  renderMobileList();
}

addLineButton.addEventListener("click", () => {
  if (isMobileView() && lineOverlay) {
    initMobileFormOptions();
    openLineOverlay({}, null);
    return;
  }
  clearEmptyState();
  const index = lineItemsContainer.querySelectorAll(".line-item-wrapper").length;
  const item = createLineItem(index);
  lineItemsContainer.appendChild(item);
  renumberLineItems();
  saveQuote();
});

addLineIconButton?.addEventListener("click", () => addLineButton.click());
sendButton.addEventListener("click", handleSendQuote);
copyButton.addEventListener("click", handleCopyQuote);
resetButton.addEventListener("click", resetQuote);
form.addEventListener("input", () => saveQuote());

productField?.addEventListener("change", async (event) => {
  await handleProductChange(event.target.value);
});

orderDateInput?.addEventListener("change", () => {
  orderDateInput.dataset.touched = "true";
  updateLeadTimeWarning();
});

orderDateInput?.addEventListener("input", () => {
  orderDateInput.dataset.touched = "true";
  updateLeadTimeWarning();
});

leadTimeAck?.addEventListener("change", saveQuote);

if (lineOverlay) {
  lineOverlay.addEventListener("click", (event) => {
    if (event.target === lineOverlay) closeLineOverlay();
  });
  lineOverlay.querySelectorAll("[data-quote-overlay-close]").forEach((button) =>
    button.addEventListener("click", closeLineOverlay)
  );
}

if (lineForm) {
  mobileFields.finish?.addEventListener("change", () => populateMobileColourSelect());
  mobileFields.profileType?.addEventListener("change", () => populateMobileProfileSelect());

  mobileFields.holes?.addEventListener("input", () => {
    if (mobileFields.hinge?.value && mobileFields.hingesQty?.dataset.manual !== "true") {
      mobileFields.hingesQty.value = mobileFields.holes.value || 0;
    }
  });

  mobileFields.hingesQty?.addEventListener("input", () => {
    mobileFields.hingesQty.dataset.manual = "true";
  });

  mobileFields.hinge?.addEventListener("change", () => {
    if (!mobileFields.hinge.value) {
      mobileFields.hingesQty.dataset.manual = "false";
      mobileFields.hingesQty.value = 0;
      return;
    }
    if (mobileFields.hingesQty.dataset.manual !== "true") {
      mobileFields.hingesQty.value = mobileFields.holes.value || 0;
    }
  });

  lineForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const missing = getMissingMobileField();
    if (missing) {
      lineMessage.textContent = `Please enter ${missing}.`;
      return;
    }

    const data = getMobileData();
    if (!data.hingeType) {
      data.hingesQty = 0;
      data.hingesManual = false;
    }

    const editIndex = lineOverlay?.dataset.editIndex;
    let wrapper = null;
    if (editIndex) {
      wrapper = lineItemsContainer.querySelector(`.line-item-wrapper[data-index="${editIndex}"]`);
    }

    if (!wrapper) {
      clearEmptyState();
      const index = lineItemsContainer.querySelectorAll(".line-item-wrapper").length;
      wrapper = createLineItem(index);
      lineItemsContainer.appendChild(wrapper);
    }

    applyDataToLineItem(wrapper, data);
    renumberLineItems();
    updateTotals();
    saveQuote();
    ensureEmptyState();
    renderMobileList();
    closeLineOverlay();
  });
}

initializeQuoteForm();
