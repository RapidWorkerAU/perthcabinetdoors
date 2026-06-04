import { createSupabaseServerClient } from "./supabase/server";

const FALLBACK_PRODUCT = {
  id: "fallback-18mm-thermolaminate",
  slug: "18mm-thermolaminate",
  name: "18mm Thermolaminate",
  title: "18mm Thermolaminate",
};

const FALLBACK_CONFIG = {
  product: FALLBACK_PRODUCT,
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

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function listFromConfig(configJson) {
  return Array.isArray(configJson?.items)
    ? configJson.items.map((item) => normalizeText(item)).filter(Boolean)
    : [];
}

function mapFromConfig(configJson) {
  return configJson && typeof configJson === "object" && !Array.isArray(configJson?.map)
    ? {}
    : {};
}

function dependencyMapFromConfig(configJson) {
  const source = configJson?.map;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(source).map(([key, values]) => [
      key,
      Array.isArray(values) ? values.map((item) => normalizeText(item)).filter(Boolean) : [],
    ])
  );
}

function hingesFromConfig(configJson) {
  const items = Array.isArray(configJson?.items) ? configJson.items : [];
  return items
    .map((item) => ({
      label: normalizeText(item?.label),
      price: Number(item?.price || 0),
    }))
    .filter((item) => item.label);
}

function normalizeGroups(groupsJson = {}) {
  return {
    finish: { enabled: true, required: true, label: "Finish", ...(groupsJson.finish || {}) },
    colour: { enabled: true, required: true, label: "Colour", ...(groupsJson.colour || {}) },
    profileType: { enabled: true, required: true, label: "Profile Type", ...(groupsJson.profileType || {}) },
    profile: { enabled: true, required: true, label: "Profile", ...(groupsJson.profile || {}) },
    edgeMould: { enabled: true, required: true, label: "Edge Mould", ...(groupsJson.edgeMould || {}) },
    hinge: { enabled: true, required: false, label: "Hinge Options", ...(groupsJson.hinge || {}) },
  };
}

function normalizeDimensions(dimensionsJson = {}) {
  return {
    width: { min: 150, max: 1200, ...(dimensionsJson.width || {}) },
    height: { min: 150, max: 2400, ...(dimensionsJson.height || {}) },
    qty: { min: 1, max: 999, ...(dimensionsJson.qty || {}) },
    hingeHoles: { min: 0, max: 12, ...(dimensionsJson.hingeHoles || {}) },
    hingesQty: { min: 0, max: 12, ...(dimensionsJson.hingesQty || {}) },
  };
}

function normalizePricing(pricingJson = {}) {
  return {
    baseFee: Number(pricingJson.baseFee ?? 45),
    drillingFeePerHole: Number(pricingJson.drillingFeePerHole ?? 5),
    rules: Array.isArray(pricingJson.rules)
      ? pricingJson.rules.map((rule) => ({
          finish: normalizeText(rule.finish),
          profileType: normalizeText(rule.profileType),
          basePrice: Number(rule.basePrice || 0),
          areaRate: Number(rule.areaRate || 0),
          markup: Number(rule.markup || 1),
        }))
      : [],
  };
}

function optionSetMap(rows = []) {
  return rows.reduce((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});
}

function buildConfigFromRows(product, configRow, optionSetRows) {
  const sets = optionSetMap(optionSetRows);
  const finishSet = sets[configRow.finish_set_id];
  const colourSet = sets[configRow.colour_set_id];
  const profileTypeSet = sets[configRow.profile_type_set_id];
  const profileSet = sets[configRow.profile_set_id];
  const edgeSet = sets[configRow.edge_set_id];
  const hingeSet = sets[configRow.hinge_set_id];

  return {
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      title: product.card_title || product.name,
    },
    quoteTitle: configRow.quote_title || "Online Quotation Request",
    quoteDescription:
      configRow.quote_description ||
      "Create a detailed quote request for your product. Pricing is indicative and includes GST.",
    groups: normalizeGroups(configRow.groups_json || {}),
    dimensions: normalizeDimensions(configRow.dimensions_json || {}),
    optionSets: {
      finishes: listFromConfig(finishSet?.config_json || {}),
      coloursByFinish: dependencyMapFromConfig(colourSet?.config_json || {}),
      profileTypes: listFromConfig(profileTypeSet?.config_json || {}),
      profilesByProfileType: dependencyMapFromConfig(profileSet?.config_json || {}),
      edgeMoulds: listFromConfig(edgeSet?.config_json || {}),
      hinges: hingesFromConfig(hingeSet?.config_json || {}),
    },
    pricing: normalizePricing(configRow.pricing_json || {}),
  };
}

async function tableExistsQuery(queryFn) {
  try {
    return await queryFn();
  } catch (error) {
    return { error, data: null };
  }
}

export async function getQuoteProducts() {
  const supabase = await createSupabaseServerClient();
  const result = await tableExistsQuery(() =>
    supabase
      .from("product_quote_configs")
      .select("product_id,is_enabled,products!inner(id,slug,name,card_title,is_active)")
      .eq("is_enabled", true)
  );

  if (result.error || !Array.isArray(result.data)) {
    return [FALLBACK_PRODUCT];
  }

  const products = result.data
    .map((row) => row.products)
    .filter((product) => product?.is_active)
    .map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      title: product.card_title || product.name,
    }));

  return products.length ? products : [FALLBACK_PRODUCT];
}

export async function getQuoteConfig(identifier) {
  const supabase = await createSupabaseServerClient();
  const products = await getQuoteProducts();

  if (!identifier || identifier === FALLBACK_PRODUCT.id || identifier === FALLBACK_PRODUCT.slug) {
    return { products, config: FALLBACK_CONFIG };
  }

  let product = null;
  const productBySlug = await tableExistsQuery(() =>
    supabase.from("products").select("id,slug,name,card_title").eq("slug", identifier).maybeSingle()
  );

  if (productBySlug.data) {
    product = productBySlug.data;
  } else {
    const productById = await tableExistsQuery(() =>
      supabase.from("products").select("id,slug,name,card_title").eq("id", identifier).maybeSingle()
    );
    product = productById.data;
  }

  if (!product) {
    return { products, config: FALLBACK_CONFIG };
  }

  const configResult = await tableExistsQuery(() =>
    supabase
      .from("product_quote_configs")
      .select("*")
      .eq("product_id", product.id)
      .eq("is_enabled", true)
      .maybeSingle()
  );

  const configRow = configResult.data;
  if (configResult.error || !configRow) {
    return { products, config: FALLBACK_CONFIG };
  }

  const setIds = [
    configRow.finish_set_id,
    configRow.colour_set_id,
    configRow.profile_type_set_id,
    configRow.profile_set_id,
    configRow.edge_set_id,
    configRow.hinge_set_id,
  ].filter(Boolean);

  const optionSetResult = setIds.length
    ? await tableExistsQuery(() =>
        supabase.from("quote_option_sets").select("*").in("id", setIds)
      )
    : { data: [], error: null };

  const config = buildConfigFromRows(product, configRow, optionSetResult.data || []);

  return { products, config };
}

export async function getQuoteCtaUrlForProduct(productId, productSlug) {
  return null;
}

export { FALLBACK_CONFIG };
