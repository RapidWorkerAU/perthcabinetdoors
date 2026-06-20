export const DEFAULT_TYPES = ["door", "drawer-front", "panel", "table-top"];
export const DEFAULT_MATERIALS = ["thermolaminate", "16mm", "18mm", "compact"];
export const DEFAULT_IKEA = ["besta", "pax", "metod"];

const COLOUR_FAMILIES = {
  thermolaminate_mirror: {
    label: "Thermolaminate",
    note: "Thermolaminate colours suitable for wrapped door and drawer front profiles.",
    finishes: [
      {
        label: "Gloss",
        folder: "gloss",
        items: [
          "alabaster.jpg",
          "amaro.jpg",
          "classic-white-gloss.jpg",
          "malt-gloss.jpg",
          "new-antique-white.jpg",
          "porcelain.jpg",
          "regal-white-pearl.jpg",
          "silver-metallic.jpg",
          "stone-grey.jpg",
          "ultra-white.jpg",
          "vittoria-pearl.jpg",
        ],
      },
      { label: "Ravine", folder: "ravine", items: ["chateau-oak.jpg", "light-oak.jpg"] },
      {
        label: "Smooth",
        folder: "smooth",
        items: [
          "adriatic.jpg",
          "agave.jpg",
          "alabaster.jpg",
          "amaro.jpg",
          "aston-white.jpg",
          "black.jpg",
          "blossom-white.jpg",
          "botanic.jpg",
          "cafe-cream-smooth.jpg",
          "canterbury-grey.jpg",
          "cinder.jpg",
          "elemental-grey.jpg",
          "ferro.jpg",
          "forage.jpg",
          "gossamer-white.jpg",
          "greige.jpg",
          "habitat.jpg",
          "malt.jpg",
          "mercurio-grey.jpg",
          "nouveau-grey.jpg",
          "oasis.jpg",
          "oyster-grey.jpg",
          "pallido.jpg",
          "porcelain.jpg",
          "stone-grey.jpg",
          "strata-grey.jpg",
          "taupe.jpg",
          "topiary.jpg",
          "verdelho.jpg",
        ],
      },
      {
        label: "Texture",
        folder: "texture",
        items: [
          "classic-white-texture.jpg",
          "designer-white.jpg",
          "malt-texture.jpg",
          "new-antique-white.jpg",
          "porcelain.jpg",
          "ultra-white.jpg",
        ],
      },
      {
        label: "Woodmatt",
        folder: "woodmatt",
        items: [
          "blackened-oak.jpg",
          "blonde-oak.jpg",
          "boston-oak.jpg",
          "botany-oak.jpg",
          "bottega-oak.jpg",
          "bronzed-oak.jpg",
          "coastal-oak.jpg",
          "district-oak.jpg",
          "ecru-oak.jpg",
          "estella-oak.jpg",
          "florentine-walnut.jpg",
          "hazel-oak.jpg",
          "laurel-oak.jpg",
          "ligurian-walnut.jpg",
          "manor-oak.jpg",
          "prime-oak.jpg",
          "rubra-oak.jpg",
          "society-oak.jpg",
          "tasmanian-oak.jpg",
        ],
      },
    ],
  },
  decorative_board_18: {
    label: "Decorative board",
    note: "Decorative board colours for 16mm and 18mm board products.",
    finishes: [
      {
        label: "Gloss",
        folder: "gloss",
        items: [
          "black-wenge -Gloss.jpg",
          "black.jpg",
          "cavia-lini.jpg",
          "cinder-gloss.jpg",
          "jamaican-walnut.jpg",
          "new-ultra-white.jpg",
          "ochre-figured-wood.jpg",
          "onyx-figured-wood.jpg",
          "royal-oyster.jpg",
          "sienna-figured-wood.jpg",
        ],
      },
      {
        label: "Legato",
        folder: "legato",
        items: [
          "bespoke.jpg",
          "bleached-walnut.jpg",
          "bone-white.jpg",
          "castel.jpg",
          "crisp-white.jpg",
          "grey-cement.jpg",
          "maison-oak - Legato.jpg",
          "maroso-milan.jpg",
          "montage.jpg",
          "papyrus.jpg",
          "serene.jpg",
          "silk.jpg",
          "white-cement.jpg",
        ],
      },
      {
        label: "Ravine",
        folder: "ravine",
        items: [
          "artisan-oak.jpg",
          "avion-grey-ravine.jpg",
          "black-wenge.jpg",
          "blossom-white-ravine.jpg",
          "cafe-oak.jpg",
          "canterbury-grey-ravine.jpg",
          "char-oak.jpg",
          "distressed-wood-ravine.jpg",
          "drifted-oak.jpg",
          "elemental-grey-ravine.jpg",
          "gossamer-white-ravine.jpg",
          "greige-ravine.jpg",
          "maison-oak.jpg",
          "maroso-milan - Ravine.jpg",
          "natural-oak.jpg",
          "notaio-walnut-ravine.jpg",
          "satra-wood.jpg",
          "sepia-oak.jpg",
          "soft-walnut.jpg",
          "tessuto-milan.jpg",
        ],
      },
      {
        label: "Venette",
        folder: "venette",
        items: [
          "adriatic.jpg",
          "arabica.jpg",
          "avion-grey-venette.jpg",
          "black - Venette.jpg",
          "black-wenge -Venette.jpg",
          "blossom-white.jpg",
          "botanic.jpg",
          "canterbury-grey-venette.jpg",
          "cinder-venette.jpg",
          "ferro.jpg",
          "forage.jpg",
          "habitat.jpg",
          "nouveau-grey.jpg",
          "oasis.jpg",
          "oxford.jpg",
          "topiary.jpg",
          "ultra-white-venette.jpg",
        ],
      },
      {
        label: "Woodmatt",
        folder: "woodmatt",
        items: [
          "antico-oak.jpg",
          "batten-oak.jpg",
          "blackened-oak.jpg",
          "blonde-oak.jpg",
          "boston-oak.jpg",
          "botany-oak.jpg",
          "bronzed-oak.jpg",
          "coastal-oak.jpg",
          "danish-rattan.jpg",
          "dark-batten-oak.jpg",
          "district-oak.jpg",
          "ecru-oak.jpg",
          "empire-oak.jpg",
          "estella-oak.jpg",
          "hazel-oak.jpg",
          "laurel-oak.jpg",
          "manor-oak.jpg",
          "notaio-walnut.jpg",
          "prime-oak.jpg",
          "rubra-oak.jpg",
          "society-oak.jpg",
          "swiss-rattan.jpg",
          "tasmanian-oak.jpg",
        ],
      },
    ],
  },
  compact_laminate: {
    label: "Compact laminate",
    note: "Compact laminate colours for hard-wearing tops, wardrobe doors and wet-area surfaces.",
    finishes: [
      {
        label: "Matt",
        folder: "matt",
        items: [
          "black.jpg",
          "blossom-white.jpg",
          "cinder.jpg",
          "natural-oak.jpg",
          "nickel.jpg",
          "nouveau-grey.jpg",
          "oyster-grey.jpg",
          "polar-white.jpg",
          "prime-oak.jpg",
          "stone-grey.jpg",
          "storm.jpg",
          "titanium.jpg",
        ],
      },
      {
        label: "Smooth",
        folder: "smooth",
        items: [
          "agave.jpg",
          "alicante-stone.jpg",
          "aston-white.jpg",
          "athena-stone.jpg",
          "calacutta-doro.jpg",
          "calacutta-grey.jpg",
          "catalina-marble.jpg",
          "cosmic-granite.jpg",
          "dark-cement.jpg",
          "grey-cement.jpg",
          "habitat.jpg",
          "marmo-di-monte.jpg",
          "marmo-di-torre.jpg",
          "portland-stone.jpg",
          "portofino-stone.jpg",
          "roman-ceppo.jpg",
          "tivoli-ceppo.jpg",
          "topiary.jpg",
          "verdelho.jpg",
          "vesuvius-ceppo.jpg",
          "white-cement.jpg",
        ],
      },
      {
        label: "Woodmatt",
        folder: "woodmatt",
        items: [
          "angora-oak.jpg",
          "antico-oak.jpg",
          "batten-oak.jpg",
          "black-ply.jpg",
          "boston-oak.jpg",
          "bottega-oak.jpg",
          "casentino-beech.jpg",
          "empire-oak.jpg",
          "florentine-walnut.jpg",
          "natural-ply.jpg",
          "notaio-walnut.jpg",
          "perugian-walnut.jpg",
          "prime-oak.jpg",
          "tasmanian-oak.jpg",
        ],
      },
    ],
  },
};

function displayColourName(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/\s*-\s*(Gloss|Legato|Ravine|Venette)$/i, "")
    .replace(/-(gloss|ravine|venette|smooth|texture)$/i, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function colourFamilyForMaterial(material) {
  if (material === "thermolaminate") return "thermolaminate_mirror";
  if (material === "compact") return "compact_laminate";
  return "decorative_board_18";
}

export function colourGroupsForMaterial(material) {
  const familyKey = colourFamilyForMaterial(material);
  const family = COLOUR_FAMILIES[familyKey];

  return {
    label: family.label,
    note: family.note,
    groups: family.finishes.map((finish) => ({
      label: finish.label,
      folder: finish.folder,
      colours: finish.items.map((file) => ({
        name: displayColourName(file),
        src: `/images/colours/${familyKey}/${finish.folder}/${file}`,
      })),
    })),
  };
}

const PRODUCTS_BASE = [
  {
    id: "shaker-profile-door",
    type: "door",
    typeLabel: "Door",
    material: "thermolaminate",
    materialLabel: "Thermolaminate",
    compat: "ikea",
    ikea: "metod",
    compatLabel: "IKEA Metod",
    price: 85,
    size: "600 x 700mm",
    name: "Shaker profile door",
    style: "Shaker profile",
    heroCaption: "Shown in Polytec Matte White",
    desc:
      "Classic thermolaminate shaker profile, available across the full Polytec colour range. Pre-drilled for standard Metod hinges. A popular choice for kitchen upgrades.",
    detailDesc:
      "A classic thermolaminate shaker profile door, made to your exact measurements and finished in your choice of Polytec colour. Pre-drilled for standard IKEA Metod hinges so it is ready to hang straight out of the box. A popular choice for kitchen upgrades and rental refreshes across Perth.",
  },
  {
    id: "flat-slab-drawer-front",
    type: "drawer-front",
    typeLabel: "Drawer front",
    material: "16mm",
    materialLabel: "16mm board",
    compat: "ikea",
    ikea: "besta",
    compatLabel: "IKEA Besta",
    price: 55,
    size: "600 x 200mm",
    name: "Flat slab drawer front",
    style: "Flat slab",
    heroCaption: "Shown in Polytec Linen",
    desc:
      "Clean, flat face in 16mm decorative board. Suits contemporary and minimalist interiors. Compatible with Besta drawer runners. Available in all Polytec finishes.",
    detailDesc:
      "A clean flat slab drawer front made from 16mm decorative board and cut to your measurements. It suits contemporary kitchens, bathroom vanities and furniture-style IKEA Besta upgrades where a sharp, simple face is the right fit.",
  },
  {
    id: "end-panel",
    type: "panel",
    typeLabel: "Panel",
    material: "18mm",
    materialLabel: "18mm board",
    compat: "kaboodle",
    ikea: "",
    compatLabel: "Kaboodle",
    price: 110,
    size: "600 x 900mm",
    name: "End panel",
    style: "Flat panel",
    heroCaption: "Shown in Polytec Stone Grey",
    desc:
      "18mm decorative board end panel for a seamless, finished look on exposed cabinet sides. Cut to your exact dimensions and available in all Polytec finishes.",
    detailDesc:
      "An 18mm decorative board end panel for finishing exposed cabinet sides with a seamless matching surface. Each panel is cut to your exact dimensions and can be supplied for Kaboodle cabinetry, custom carcasses and matching built-in details.",
  },
  {
    id: "compact-laminate-wardrobe-door",
    type: "door",
    typeLabel: "Door",
    material: "compact",
    materialLabel: "Compact laminate",
    compat: "ikea",
    ikea: "pax",
    compatLabel: "IKEA Pax",
    price: 135,
    size: "500 x 2000mm",
    name: "Compact laminate wardrobe door",
    style: "Wardrobe door",
    heroCaption: "Shown in Polytec Forest",
    desc:
      "Highly durable compact laminate wardrobe door, moisture and impact resistant. Pre-drilled for Pax hinges. An excellent choice for high-traffic areas.",
    detailDesc:
      "A durable compact laminate wardrobe door made for IKEA Pax upgrades and high-use spaces. The surface is moisture and impact resistant, with hinge drilling available so the new doors are ready to fit to your existing wardrobe system.",
  },
  {
    id: "profiled-edge-door",
    type: "door",
    typeLabel: "Door",
    material: "thermolaminate",
    materialLabel: "Thermolaminate",
    compat: "kaboodle",
    ikea: "",
    compatLabel: "Kaboodle",
    price: 90,
    size: "600 x 700mm",
    name: "Profiled edge door",
    style: "Profiled edge",
    heroCaption: "Shown in Polytec Pebble",
    desc:
      "Thermolaminate door with a routed front profile for added character and depth. A great way to lift a standard Kaboodle carcass with a truly custom finish.",
    detailDesc:
      "A thermolaminate door with a routed front profile for added depth and a more bespoke cabinet finish. It is a practical way to upgrade standard Kaboodle carcasses while keeping your existing layout and cabinet boxes.",
  },
  {
    id: "shaker-drawer-front",
    type: "drawer-front",
    typeLabel: "Drawer front",
    material: "thermolaminate",
    materialLabel: "Thermolaminate",
    compat: "ikea",
    ikea: "metod",
    compatLabel: "IKEA Metod",
    price: 65,
    size: "600 x 200mm",
    name: "Shaker drawer front",
    style: "Shaker profile",
    heroCaption: "Shown in Polytec Matte White",
    desc:
      "Matching thermolaminate shaker drawer front to complement our shaker door range. Pre-drilled for Metod runners. Order alongside your doors for a fully coordinated look.",
    detailDesc:
      "A matching thermolaminate shaker drawer front designed to pair with our shaker cabinet doors. Each front is made to measure, finished in your chosen Polytec colour and drilled to suit your cabinet range where required.",
  },
  {
    id: "besta-side-panel",
    type: "panel",
    typeLabel: "Panel",
    material: "18mm",
    materialLabel: "18mm board",
    compat: "ikea",
    ikea: "besta",
    compatLabel: "IKEA Besta",
    price: 95,
    size: "400 x 740mm",
    name: "Besta side panel",
    style: "Side panel",
    heroCaption: "Shown in Polytec Warm Oak",
    desc:
      "18mm decorative side panel cut to Besta dimensions for a built-in, furniture-quality finish. Covers the raw sides of your Besta units with a matching Polytec surface.",
    detailDesc:
      "An 18mm decorative side panel cut to suit IKEA Besta dimensions, giving freestanding units a built-in furniture-quality finish. Use it to cover exposed sides and create a matching Polytec look across your cabinet run.",
  },
  {
    id: "compact-laminate-table-top",
    type: "table-top",
    typeLabel: "Table top",
    material: "compact",
    materialLabel: "Compact laminate",
    compat: "all",
    ikea: "",
    compatLabel: "",
    price: 180,
    size: "900 x 600mm",
    name: "Compact laminate table top",
    style: "Table top",
    heroCaption: "Shown in Polytec Matte Black",
    desc:
      "Heavy-duty compact laminate table top, cut to your specified dimensions. Scratch, moisture and heat resistant. Suitable for kitchen islands, laundry benches and home offices.",
    detailDesc:
      "A heavy-duty compact laminate table top cut to your nominated dimensions. The surface is scratch, moisture and heat resistant, making it suitable for kitchen islands, laundry benches, study nooks and work surfaces.",
  },
];

function pricingRows(product) {
  const base = product.price;
  const standard = product.size.replace(" x ", " x ");
  return [
    { size: standard, description: "Standard size", price: base },
    { size: "Custom narrow", description: "Smaller width or height", price: Math.max(45, base - 18) },
    { size: "Custom tall", description: "Taller panel or door", price: base + 22, popular: true },
    { size: "Custom wide", description: "Wider face or panel", price: base + 34 },
    { size: "Oversized", description: "Large format custom piece", price: base + 58 },
  ];
}

function preDrilledText(product) {
  if (product.type === "panel" || product.type === "table-top") return "Not applicable";
  if (product.type === "drawer-front") return "Yes, drawer fixing holes available";
  return "Yes, hinge holes included";
}

const TYPE_LABELS = {
  door: "Door",
  "drawer-front": "Drawer front",
  panel: "Panel",
  "table-top": "Table top",
};

const MATERIAL_LABELS = {
  thermolaminate: "Thermolaminate",
  "16mm": "16mm board",
  "18mm": "18mm board",
  compact: "Compact laminate",
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function inferType(row) {
  const joined = `${row.type || ""} ${row.category || ""} ${row.name || ""}`.toLowerCase();
  if (joined.includes("drawer")) return "drawer-front";
  if (joined.includes("panel")) return "panel";
  if (joined.includes("table") || joined.includes("bench") || joined.includes("top")) return "table-top";
  return "door";
}

function inferMaterial(row) {
  const joined = `${row.material || ""} ${row.material_label || ""} ${row.name || ""}`.toLowerCase();
  if (joined.includes("thermolaminate")) return "thermolaminate";
  if (joined.includes("compact")) return "compact";
  if (joined.includes("16mm")) return "16mm";
  if (joined.includes("18mm")) return "18mm";
  return "18mm";
}

function normalizeCompatibility(row) {
  const compat = row.compatibility || row.product_options?.compatibility || "";
  const label = row.compatibility_label || row.product_options?.compatibility_label || "";
  const ikea = row.ikea_system || row.product_options?.ikea_system || "";

  if (compat) {
    return {
      compat,
      compatLabel: label,
      ikea,
    };
  }

  if (label.toLowerCase().includes("ikea") || ikea) {
    return {
      compat: "ikea",
      compatLabel: label || `IKEA ${ikea}`,
      ikea,
    };
  }

  if (label.toLowerCase().includes("kaboodle")) {
    return {
      compat: "kaboodle",
      compatLabel: label,
      ikea: "",
    };
  }

  return {
    compat: "all",
    compatLabel: label,
    ikea: "",
  };
}

function normalizedPricingRows(row, baseProduct) {
  const rows = asArray(row.pricing_rows);
  if (rows.length) {
    return rows.map((item) => ({
      size: item.size || "",
      description: item.description || "",
      price: Number(item.price || 0),
      popular: Boolean(item.popular),
    }));
  }
  return pricingRows(baseProduct);
}

function defaultInfoCards() {
  return [
    {
      title: "How to measure",
      body:
        "Measure the width and height of your cabinet opening or existing face. Send through your dimensions and cabinet type, and we will confirm the correct sizing before production.",
    },
    {
      title: "Pre-drilling and hinges",
      body:
        "Doors and drawer fronts can be drilled to suit common cabinet systems. Let us know your cabinet brand and hardware requirements when you request a quote.",
    },
    {
      title: "Delivery and lead times",
      body:
        "We ship flat-rate across Perth metro. Lead times vary depending on current order volume, so enquire at the time of ordering for current availability.",
    },
  ];
}

export const PRODUCTS = PRODUCTS_BASE.map((product) => ({
  ...product,
  finishBrand: "Polytec",
  leadTime: "Enquire for current times",
  madeToMeasure: "Yes, custom sizes available",
  preDrilled: preDrilledText(product),
  pricingRows: pricingRows(product),
  infoCards: defaultInfoCards(),
}));

export function getProductBySlug(slug) {
  return PRODUCTS.find((product) => product.id === slug);
}

export function getRelatedProducts(product, limit = 3) {
  return PRODUCTS.filter((item) => item.id !== product.id)
    .sort((a, b) => {
      const aScore = Number(a.type === product.type) + Number(a.material === product.material);
      const bScore = Number(b.type === product.type) + Number(b.material === product.material);
      return bScore - aScore;
    })
    .slice(0, limit);
}

export function normalizeProduct(row, images = []) {
  if (!row) return null;

  const productOptions = asObject(row.product_options);
  const type = row.type || productOptions.type || inferType(row);
  const material = row.material || productOptions.material || inferMaterial(row);
  const compatibility = normalizeCompatibility({ ...row, product_options: productOptions });
  const price = Number(row.price_from || row.price || 0);
  const size = row.standard_size || productOptions.standard_size || "Custom size";
  const name = row.name || row.card_title || row.page_title || "Product";

  const baseProduct = {
    id: row.slug || row.id,
    dbId: row.id,
    slug: row.slug || row.id,
    type,
    typeLabel: row.type_label || productOptions.type_label || TYPE_LABELS[type] || "Product",
    material,
    materialLabel: row.material_label || productOptions.material_label || MATERIAL_LABELS[material] || material,
    compat: compatibility.compat,
    ikea: compatibility.ikea,
    compatLabel: compatibility.compatLabel,
    price,
    size,
    name,
    style: row.style || productOptions.style || row.card_title || name,
    heroCaption: row.hero_caption || productOptions.hero_caption || "",
    desc: row.short_description || "",
    detailDesc: row.detail_description || row.long_description || row.short_description || "",
    finishBrand: row.finish_brand || productOptions.finish_brand || "Polytec",
    leadTime: row.lead_time || productOptions.lead_time || "Enquire for current times",
    madeToMeasure: row.made_to_measure || productOptions.made_to_measure || "Yes, custom sizes available",
    preDrilled: row.pre_drilled || productOptions.pre_drilled || "",
    features: asArray(row.features),
    finishes: asArray(row.finishes),
    galleryImages: [
      ...asArray(row.gallery_images),
      ...images.map((image) => image.image_url).filter(Boolean),
    ],
    relatedProductIds: asArray(row.related_product_ids),
    infoCards: asArray(row.info_cards).length ? asArray(row.info_cards) : defaultInfoCards(),
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    metaDescription: row.meta_description,
    sortOrder: row.sort_order || 0,
    isActive: row.is_active ?? true,
  };

  return {
    ...baseProduct,
    preDrilled: baseProduct.preDrilled || preDrilledText(baseProduct),
    pricingRows: normalizedPricingRows(row, baseProduct),
  };
}

export function normalizeProducts(rows = [], imageRows = []) {
  const imagesByProduct = imageRows.reduce((acc, image) => {
    acc[image.product_id] = acc[image.product_id] || [];
    acc[image.product_id].push(image);
    return acc;
  }, {});

  return rows.map((row) => normalizeProduct(row, imagesByProduct[row.id] || [])).filter(Boolean);
}

export function getRelatedProductsFromList(product, products, limit = 3) {
  const explicitIds = new Set(product.relatedProductIds || []);
  const explicit = products.filter(
    (item) => item.id !== product.id && (explicitIds.has(item.dbId) || explicitIds.has(item.id))
  );
  const fallback = products
    .filter((item) => item.id !== product.id && !explicit.includes(item))
    .sort((a, b) => {
      const aScore = Number(a.type === product.type) + Number(a.material === product.material);
      const bScore = Number(b.type === product.type) + Number(b.material === product.material);
      return bScore - aScore;
    });

  return [...explicit, ...fallback].slice(0, limit);
}
