"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import { colourGroupsForMaterial } from "../../../products/product-data";
import { EDGE_PROFILES, PROFILE_NAMES_BY_TYPE, PROFILE_TYPES } from "../../../request-quote/quote-form-data";
import { buildColourFamilyFromRows, COLOUR_MATERIALS } from "../../../../lib/pcd-colour-library";
import styles from "../../admin-shell.module.css";

function normalizeSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function resolveImageSrc(imageUrl) {
  if (!imageUrl) return "";
  if (
    imageUrl.startsWith("/") ||
    imageUrl.startsWith("http://") ||
    imageUrl.startsWith("https://") ||
    imageUrl.startsWith("data:") ||
    imageUrl.startsWith("blob:")
  ) {
    return imageUrl;
  }
  return `/${imageUrl.replace(/^\.\//, "")}`;
}

function normalizeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

function assetSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function edgeOptionSrc(label) {
  return `/images/edges/${assetSlug(label)}.png`;
}

function profileOptionSrc(profileType, label) {
  return `/images/profiles/${assetSlug(profileType)}/${assetSlug(label)}.jpg`;
}

function sortAssetsByNewest(items) {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.path.localeCompare(b.path);
  });
}

function normalizeMediaOrder(urls, preferredPrimary) {
  const deduped = Array.from(new Set((urls || []).filter(Boolean)));
  if (!deduped.length) {
    return { ordered: [], primary: "" };
  }

  const primary = deduped.includes(preferredPrimary) ? preferredPrimary : deduped[0];
  const ordered = [primary, ...deduped.filter((url) => url !== primary)];

  return { ordered, primary };
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function linesToArray(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value) {
  return arrayValue(value).join("\n");
}

function normalizeFinishes(value) {
  const finishes = arrayValue(value);
  return finishes.length ? finishes : [{ name: "", description: "" }];
}

function normalizePricingRows(value) {
  const rows = arrayValue(value);
  return rows.length ? rows : [{ size: "", description: "", price: "", popular: false }];
}

const PRODUCT_EDIT_FIELD_HELP = {
  name: "Updates the main product name shown in admin and on the public product page.",
  slug: "Controls the public product page URL. Leave blank only when you want it generated from the product name.",
  eyebrow: "Small category text shown above the product heading on the public page.",
  heroCaption: "Caption displayed over the main product image.",
  detailDescription: "Main descriptive copy shown near the top of the public product page.",
  displayTitle: "One shared title used for the product page heading and the product library tile.",
  category: "Controls which product category this appears under in the catalogue.",
  status: "Draft hides the product from public catalogue views; active makes it available.",
  priceFrom: "Starting price shown on the product page and product library tile.",
  sortOrder: "Controls the display order in product lists. Lower numbers appear first.",
  shortDescription: "Short copy shown on the product library tile.",
  type: "Internal filter used by quote forms and product grouping. This should match what the product is.",
  typeLabel: "Customer-facing type text shown in the public product specs table.",
  material: "Internal material key used to load the correct colour library and quote options.",
  materialLabel: "Customer-facing material text shown in the public product specs table.",
  compatibility: "Internal compatibility filter used for catalogue and quote logic.",
  compatibilityLabel: "Customer-facing compatibility text shown in the public product specs table.",
  ikeaSystem: "Specific IKEA system text shown only where it is relevant to the product.",
  style: "Style/profile text shown in the public product specs table.",
  finishBrand: "Brand name shown in the public product specs table, such as Polytec.",
  standardSize: "Reference size shown beside pricing so customers understand the baseline price.",
  preDrilled: "Text shown in the specs table for hinge drilling or pre-drilling availability.",
  madeToMeasure: "Text shown in the specs table for custom sizing availability.",
  leadTime: "Customer-facing lead time text shown in the product specs table.",
  featuresText: "Bullet list shown in the product information section. Enter one feature per line.",
  metaDescription: "SEO summary used by search engines and link previews.",
  ctaLabel: "Text shown on the main call-to-action button.",
  ctaUrl: "Destination path or URL used by the main call-to-action button.",
  currency: "Currency label used beside product pricing.",
  relatedProductIdsText: "Optional related product IDs or slugs, one per line.",
};

function normalizeInfoCards(value) {
  const cards = arrayValue(value);
  return cards.length ? cards : [{ title: "", body: "" }];
}

function defaultInfoCardsForType(type) {
  if (type === "panel") {
    return [
      {
        title: "How to measure",
        body: "Measure the exposed side or panel area and send through your finished width and height in millimetres.",
      },
      {
        title: "Panel use",
        body: "Panels are supplied cut to size and do not require hinge or drawer drilling.",
      },
      {
        title: "Delivery and lead times",
        body: "We ship flat-rate across Perth metro. Lead times vary depending on current order volume.",
      },
    ];
  }

  if (type === "table-top") {
    return [
      {
        title: "How to measure",
        body: "Measure the final table top, bench or work surface size you need in millimetres.",
      },
      {
        title: "Panel use",
        body: "Table tops are supplied cut to size and do not require hinge or drawer drilling.",
      },
      {
        title: "Delivery and lead times",
        body: "We ship flat-rate across Perth metro. Lead times vary depending on current order volume.",
      },
    ];
  }

  return [
    {
      title: "How to measure",
      body: "Measure the width and height of your cabinet opening or existing face. Send through your dimensions and cabinet type, and we will confirm the correct sizing before production.",
    },
    {
      title: "Pre-drilling and hinges",
      body: "Doors and drawer fronts can be drilled to suit common cabinet systems. Let us know your cabinet brand and hardware requirements when you request a quote.",
    },
    {
      title: "Delivery and lead times",
      body: "We ship flat-rate across Perth metro. Lead times vary depending on current order volume, so enquire at the time of ordering for current availability.",
    },
  ];
}

async function listBucketAssets(supabase, bucketName) {
  const storage = supabase.storage.from(bucketName);
  const queue = [""];
  const files = [];

  while (queue.length) {
    const prefix = queue.shift();
    const { data, error } = await storage.list(prefix, {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw error;
    }

    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = !item.id && !item.metadata;
      if (isFolder) {
        queue.push(path);
      } else {
        const {
          data: { publicUrl },
        } = storage.getPublicUrl(path);

        files.push({
          path,
          name: item.name,
          url: publicUrl,
          createdAt: item.created_at || item.updated_at || item.last_accessed_at || null,
        });
      }
    }
  }

  return sortAssetsByNewest(files);
}

async function persistProductImages(supabase, productId, urls, primaryUrl, productName) {
  const { error: deleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    throw deleteError;
  }

  const rows = urls.map((url, index) => ({
    product_id: productId,
    image_url: url,
    alt_text: productName,
    caption: null,
    sort_order: index,
    is_primary: url === primaryUrl,
  }));

  if (!rows.length) {
    return;
  }

  const { error: insertError } = await supabase.from("product_images").insert(rows);
  if (insertError) {
    throw insertError;
  }
}

export default function ProductEditorForm({
  mode,
  initialProduct,
  initialImages,
  initialQuoteConfig = null,
  initialOptionSets = [],
  initialColourFinishes = [],
  initialColourTiles = [],
  initialColourMaterialLinks = [],
}) {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const initialUrls = (initialImages || []).map((x) => x.image_url);
  const initialPrimary =
    (initialImages || []).find((x) => x.is_primary)?.image_url || (initialImages?.[0]?.image_url || "");
  const normalizedInitial = normalizeMediaOrder(initialUrls, initialPrimary);

  const [name, setName] = useState(initialProduct?.name || "");
  const [slug, setSlug] = useState(initialProduct?.slug || "");
  const [eyebrow, setEyebrow] = useState(initialProduct?.eyebrow || "");
  const [cardTitle, setCardTitle] = useState(initialProduct?.card_title || initialProduct?.name || "");
  const [pageTitle, setPageTitle] = useState(initialProduct?.page_title || initialProduct?.name || "");
  const [category, setCategory] = useState(initialProduct?.category || "cabinet-doors");
  const [type, setType] = useState(initialProduct?.type || "door");
  const [typeLabel, setTypeLabel] = useState(initialProduct?.type_label || "Door");
  const [material, setMaterial] = useState(initialProduct?.material || "thermolaminate");
  const [materialLabel, setMaterialLabel] = useState(initialProduct?.material_label || "Thermolaminate");
  const [compatibility, setCompatibility] = useState(initialProduct?.compatibility || "all");
  const [compatibilityLabel, setCompatibilityLabel] = useState(initialProduct?.compatibility_label || "");
  const [ikeaSystem, setIkeaSystem] = useState(initialProduct?.ikea_system || "");
  const [style, setStyle] = useState(initialProduct?.style || "");
  const [standardSize, setStandardSize] = useState(initialProduct?.standard_size || "");
  const [heroCaption, setHeroCaption] = useState(initialProduct?.hero_caption || "");
  const [finishBrand, setFinishBrand] = useState(initialProduct?.finish_brand || "Polytec");
  const [leadTime, setLeadTime] = useState(initialProduct?.lead_time || "");
  const [madeToMeasure, setMadeToMeasure] = useState(initialProduct?.made_to_measure || "");
  const [preDrilled, setPreDrilled] = useState(initialProduct?.pre_drilled || "");
  const [longDescription, setLongDescription] = useState(initialProduct?.long_description || "");
  const [detailDescription, setDetailDescription] = useState(initialProduct?.detail_description || "");
  const [metaDescription, setMetaDescription] = useState(initialProduct?.meta_description || "");
  const [ctaLabel, setCtaLabel] = useState(initialProduct?.cta_label || "Open online quotation request form");
  const [ctaUrl, setCtaUrl] = useState(initialProduct?.cta_url || "/request-quote");
  const [currency, setCurrency] = useState(initialProduct?.currency || "AUD");
  const [featuresText, setFeaturesText] = useState(arrayToLines(initialProduct?.features));
  const [finishes, setFinishes] = useState(normalizeFinishes(initialProduct?.finishes));
  const [pricingRows, setPricingRows] = useState(normalizePricingRows(initialProduct?.pricing_rows));
  const [infoCards, setInfoCards] = useState(normalizeInfoCards(initialProduct?.info_cards));
  const [relatedProductIdsText, setRelatedProductIdsText] = useState(
    arrayToLines(initialProduct?.related_product_ids)
  );
  const [quoteEnabled, setQuoteEnabled] = useState(initialQuoteConfig?.is_enabled ?? true);
  const [priceFrom, setPriceFrom] = useState(
    initialProduct?.price_from != null ? String(initialProduct.price_from) : ""
  );
  const [sortOrder, setSortOrder] = useState(
    initialProduct?.sort_order != null ? String(initialProduct.sort_order) : "0"
  );
  const [isActive, setIsActive] = useState(initialProduct?.is_active ?? true);
  const [shortDescription, setShortDescription] = useState(initialProduct?.short_description || "");

  const [mediaUrls, setMediaUrls] = useState(normalizedInitial.ordered);
  const [primaryImageUrl, setPrimaryImageUrl] = useState(normalizedInitial.primary);

  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [bucketAssets, setBucketAssets] = useState([]);
  const [modalSelected, setModalSelected] = useState([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadTotalCount, setUploadTotalCount] = useState(0);
  const [uploadDoneCount, setUploadDoneCount] = useState(0);
  const [isApplyingMedia, setIsApplyingMedia] = useState(false);
  const [draggingUrl, setDraggingUrl] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [previewMode, setPreviewMode] = useState("page");
  const [activeEditSection, setActiveEditSection] = useState("");
  const [adminOptionViewerMode, setAdminOptionViewerMode] = useState("colours");
  const [activeAdminProfileType, setActiveAdminProfileType] = useState(PROFILE_TYPES[0] || "");
  const [activeAdminProfile, setActiveAdminProfile] = useState(0);
  const [activeAdminEdge, setActiveAdminEdge] = useState(0);

  const orderedMedia = useMemo(
    () => normalizeMediaOrder(mediaUrls, primaryImageUrl).ordered,
    [mediaUrls, primaryImageUrl]
  );
  const effectivePrimary = orderedMedia[0] || "";
  const nonPrimaryMedia = orderedMedia.slice(1);
  const showThermolaminateProfiles = material === "thermolaminate" && type !== "panel" && type !== "table-top";
  const isSuccessFeedback = feedback === "Media linked to this product.";

  useEffect(() => {
    if (!isSuccessFeedback) return undefined;

    const timeout = window.setTimeout(() => {
      setFeedback("");
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [isSuccessFeedback]);

  useEffect(() => {
    if (effectivePrimary !== primaryImageUrl) {
      setPrimaryImageUrl(effectivePrimary);
    }
  }, [effectivePrimary, primaryImageUrl]);

  function setPrimaryAndNormalize(url) {
    const normalized = normalizeMediaOrder(mediaUrls, url);
    setMediaUrls(normalized.ordered);
    setPrimaryImageUrl(normalized.primary);
  }

  function openMediaModal() {
    setIsMediaModalOpen(true);
    setModalSelected([...mediaUrls]);
  }

  function closeMediaModal() {
    setIsMediaModalOpen(false);
  }

  useEffect(() => {
    async function loadAssets() {
      if (!isMediaModalOpen) return;

      setIsLoadingAssets(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const assets = await listBucketAssets(supabase, "products");
        setBucketAssets(assets);
      } catch (error) {
        setFeedback(error?.message || "Could not load storage images.");
      } finally {
        setIsLoadingAssets(false);
      }
    }

    loadAssets();
  }, [isMediaModalOpen]);

  function toggleModalSelection(url) {
    setModalSelected((previous) =>
      previous.includes(url) ? previous.filter((item) => item !== url) : [...previous, url]
    );
  }

  async function handleUploadFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    setUploadTotalCount(files.length);
    setUploadDoneCount(0);
    setFeedback("");

    try {
      const supabase = createSupabaseBrowserClient();
      const storage = supabase.storage.from("products");
      const uploadedUrls = [];
      const uploadedAssets = [];

      for (const file of files) {
        const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const filePath = `uploads/${uniquePrefix}-${normalizeFileName(file.name)}`;

        const { error } = await storage.upload(filePath, file, {
          upsert: false,
          contentType: file.type || undefined,
        });

        if (error) {
          const details = error.message || "Upload failed.";
          throw new Error(`${details} Check products bucket policies (insert/select) for this admin user.`);
        }

        const {
          data: { publicUrl },
        } = storage.getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
        uploadedAssets.push({
          path: filePath,
          name: file.name,
          url: publicUrl,
          createdAt: new Date().toISOString(),
        });

        setUploadDoneCount((count) => count + 1);
      }

      setBucketAssets((previous) => sortAssetsByNewest([...uploadedAssets, ...previous]));
      setModalSelected((previous) => [...new Set([...previous, ...uploadedUrls])]);
    } catch (error) {
      setFeedback(error?.message || "Image upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDoneMedia() {
    const selectedSet = new Set(modalSelected);
    const bucketUrls = bucketAssets.map((asset) => asset.url);
    const selectedBucketUrls = bucketUrls.filter((url) => selectedSet.has(url));

    const preservedExternal = mediaUrls.filter((url) => !bucketUrls.includes(url));
    const nextMediaUrlsRaw = [...preservedExternal, ...selectedBucketUrls];

    if (!nextMediaUrlsRaw.length) {
      setFeedback("Select at least one image in the media modal.");
      return;
    }

    const normalized = normalizeMediaOrder(nextMediaUrlsRaw, primaryImageUrl);

    setMediaUrls(normalized.ordered);
    setPrimaryImageUrl(normalized.primary);
    setIsMediaModalOpen(false);

    if (mode === "edit" && initialProduct?.id) {
      setIsApplyingMedia(true);
      try {
        const supabase = createSupabaseBrowserClient();
        await persistProductImages(
          supabase,
          initialProduct.id,
          normalized.ordered,
          normalized.primary,
          name || "Product"
        );
        setFeedback("Media linked to this product.");
        router.refresh();
      } catch (error) {
        setFeedback(error?.message || "Could not map selected media to this product.");
      } finally {
        setIsApplyingMedia(false);
      }
    }
  }

  function removeMedia(url) {
    const nextRaw = mediaUrls.filter((item) => item !== url);
    const normalized = normalizeMediaOrder(nextRaw, primaryImageUrl === url ? nextRaw[0] : primaryImageUrl);
    setMediaUrls(normalized.ordered);
    setPrimaryImageUrl(normalized.primary);
  }

  function handleDropOnNonPrimary(targetUrl) {
    if (!draggingUrl || draggingUrl === targetUrl) return;

    const list = [...nonPrimaryMedia];
    const from = list.indexOf(draggingUrl);
    const to = list.indexOf(targetUrl);
    if (from < 0 || to < 0) return;

    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);

    const next = effectivePrimary ? [effectivePrimary, ...list] : list;
    setMediaUrls(next);
    setDraggingUrl("");
  }

  function updateFinish(index, key, value) {
    setFinishes((previous) =>
      previous.map((finish, itemIndex) => (itemIndex === index ? { ...finish, [key]: value } : finish))
    );
  }

  function addFinish() {
    setFinishes((previous) => [...previous, { name: "", description: "" }]);
  }

  function removeFinish(index) {
    setFinishes((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  function updatePricingRow(index, key, value) {
    setPricingRows((previous) =>
      previous.map((row, itemIndex) => (itemIndex === index ? { ...row, [key]: value } : row))
    );
  }

  function addPricingRow() {
    setPricingRows((previous) => [...previous, { size: "", description: "", price: "", popular: false }]);
  }

  function removePricingRow(index) {
    setPricingRows((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  function updateInfoCard(index, key, value) {
    setInfoCards((previous) =>
      previous.map((card, itemIndex) => (itemIndex === index ? { ...card, [key]: value } : card))
    );
  }

  function addInfoCard() {
    setInfoCards((previous) => [...previous, { title: "", body: "" }]);
  }

  function removeInfoCard(index) {
    setInfoCards((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFeedback("");

    const normalizedName = name.trim();
    const normalizedSlug = normalizeSlug(slug || initialProduct?.slug || normalizedName);

    if (!normalizedName) {
      setFeedback("Title is required.");
      return;
    }

    if (!normalizedSlug) {
      setFeedback("Could not generate a valid slug from title.");
      return;
    }

    const productOptions = objectValue(initialProduct?.product_options);

    const normalizedFinishes = finishes
      .map((finish) => ({
        name: String(finish.name || "").trim(),
        description: String(finish.description || "").trim(),
      }))
      .filter((finish) => finish.name || finish.description);

    const normalizedPricingRows = pricingRows
      .map((row) => ({
        size: String(row.size || "").trim(),
        description: String(row.description || "").trim(),
        price: row.price === "" || row.price == null ? 0 : Number(row.price),
        popular: Boolean(row.popular),
      }))
      .filter((row) => row.size || row.description || row.price);

    const normalizedInfoCards = infoCards
      .map((card) => ({
        title: String(card.title || "").trim(),
        body: String(card.body || card.text || "").trim(),
      }))
      .filter((card) => card.title || card.body);

    const chosenPrimary = orderedMedia[0];

    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();

      const payload = {
        name: normalizedName,
        slug: normalizedSlug,
        category,
        eyebrow: eyebrow.trim(),
        card_title: cardTitle.trim() || normalizedName,
        page_title: pageTitle.trim() || normalizedName,
        price_from: priceFrom ? Number(priceFrom) : null,
        is_active: isActive,
        sort_order: Number(sortOrder || 0),
        currency,
        short_description: shortDescription.trim() || null,
        long_description: longDescription.trim() || null,
        meta_description: metaDescription.trim() || null,
        cta_label: ctaLabel.trim() || null,
        cta_url: ctaUrl.trim() || null,
        type,
        type_label: typeLabel.trim() || null,
        material,
        material_label: materialLabel.trim() || null,
        compatibility,
        compatibility_label: compatibilityLabel.trim() || null,
        ikea_system: ikeaSystem.trim() || null,
        style: style.trim() || null,
        standard_size: standardSize.trim() || null,
        hero_caption: heroCaption.trim() || null,
        detail_description: detailDescription.trim() || null,
        finish_brand: finishBrand.trim() || null,
        lead_time: leadTime.trim() || null,
        made_to_measure: madeToMeasure.trim() || null,
        pre_drilled: preDrilled.trim() || null,
        features: linesToArray(featuresText),
        finishes: normalizedFinishes,
        gallery_images: orderedMedia,
        pricing_rows: normalizedPricingRows,
        info_cards: normalizedInfoCards,
        related_product_ids: linesToArray(relatedProductIdsText),
        product_options: productOptions,
      };

      let productId = initialProduct?.id;

      if (mode === "edit") {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) {
          setFeedback(error.message || "Could not update product.");
          return;
        }
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error || !data?.id) {
          setFeedback(error?.message || "Could not create product.");
          return;
        }
        productId = data.id;
      }

      await persistProductImages(supabase, productId, orderedMedia, chosenPrimary, normalizedName);

      if (productId) {
        try {
          const quoteConfigPayload = {
            product_id: productId,
            is_enabled: quoteEnabled,
            quote_title: initialQuoteConfig?.quote_title || "Online Quotation Request",
            quote_description:
              initialQuoteConfig?.quote_description || "Create a detailed quote request for this product.",
            finish_set_id: null,
            colour_set_id: null,
            profile_type_set_id: null,
            profile_set_id: null,
            edge_set_id: null,
            hinge_set_id: null,
            groups_json: initialQuoteConfig?.groups_json || {},
            dimensions_json: initialQuoteConfig?.dimensions_json || {},
            pricing_json: initialQuoteConfig?.pricing_json || {},
          };

          const { error: quoteConfigError } = await supabase
            .from("product_quote_configs")
            .upsert(quoteConfigPayload, { onConflict: "product_id" });

          if (quoteConfigError) {
            throw quoteConfigError;
          }
        } catch (error) {
          setFeedback(
            `${normalizedName} was saved, but the quote option links could not be saved: ${
              error?.message || "Unknown error."
            }`
          );
          return;
        }
      }

      router.push("/admin/products");
      router.refresh();
    } catch (error) {
      setFeedback(error?.message || "Could not save product.");
    } finally {
      setIsSaving(false);
    }
  }

  const uploadPercent = uploadTotalCount ? Math.round((uploadDoneCount / uploadTotalCount) * 100) : 0;
  const customInfoCards = normalizeInfoCards(infoCards).filter((card) => card.title || card.body || card.text);
  const visibleInfoCards = customInfoCards.length ? customInfoCards : defaultInfoCardsForType(type);
  const databaseColourFamily = buildColourFamilyFromRows({
    finishes: initialColourFinishes,
    tiles: initialColourTiles,
    materialRows: initialColourMaterialLinks,
    material,
  });
  const colourFamily = databaseColourFamily?.groups?.length ? databaseColourFamily : colourGroupsForMaterial(material);
  const selectedFinish = colourFamily.groups[0] || { label: "Finish", colours: [] };
  const selectedColour = selectedFinish.colours[0] || { name: "Colour", src: "" };
  const adminProfileOptions = PROFILE_NAMES_BY_TYPE[activeAdminProfileType] || [];
  const selectedAdminProfile = adminProfileOptions[activeAdminProfile] || adminProfileOptions[0];
  const selectedAdminEdge = EDGE_PROFILES[activeAdminEdge] || EDGE_PROFILES[0];

  function formatMoney(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency || "AUD",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  }

  function updateMaterialSelection(value) {
    const selectedMaterial = COLOUR_MATERIALS.find((item) => item.key === value);
    setMaterial(value);
    if (selectedMaterial) {
      setMaterialLabel(selectedMaterial.label);
    }
  }

  function openEditSection(section) {
    setActiveEditSection(section);
  }

  function closeEditSection() {
    setActiveEditSection("");
  }

  function updateDisplayTitle(value) {
    setCardTitle(value);
    setPageTitle(value);
  }

  function editLabel(section, label) {
    if (label) return label;
    const labels = {
      hero: "Edit hero",
      tile: "Edit tile",
      specs: "Edit specs",
      pricing: "Edit pricing",
      quote: "Edit options",
      settings: "Edit page settings",
    };
    return labels[section] || "Edit";
  }

  function renderEditButton(section, label) {
    return (
      <button type="button" className={styles.productPreviewEditButton} onClick={() => openEditSection(section)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M14.7 5.3l4 4L8.9 19H5v-3.9l9.7-9.8z" />
          <path d="M16.4 3.6l2-2 4 4-2 2" />
        </svg>
        <span>{editLabel(section, label)}</span>
      </button>
    );
  }

  function renderMediaEditButton() {
    return (
      <button type="button" className={`${styles.productPreviewEditButton} ${styles.productPreviewMediaEditButton}`} onClick={openMediaModal}>
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M14.7 5.3l4 4L8.9 19H5v-3.9l9.7-9.8z" />
          <path d="M16.4 3.6l2-2 4 4-2 2" />
        </svg>
        <span>Edit media</span>
      </button>
    );
  }

  function renderImagePlaceholder(label = "Product image") {
    return (
      <div className={styles.productPreviewImagePlaceholder}>
        <div />
        <span>{label}</span>
      </div>
    );
  }

  function renderMediaStrip() {
    return (
      <div className={styles.productPreviewMediaStrip}>
        {orderedMedia.length ? (
          orderedMedia.slice(0, 4).map((url, index) => (
            <button
              type="button"
              key={url}
              className={`${styles.productPreviewThumb} ${index === 0 ? styles.productPreviewThumbActive : ""}`}
              onClick={() => setPrimaryAndNormalize(url)}
              title={index === 0 ? "Primary image" : "Set as primary image"}
            >
              <img src={resolveImageSrc(url)} alt="" />
            </button>
          ))
        ) : (
          <>
            {["Front view", "Side profile", "Close-up", "Installed"].map((label) => (
              <button type="button" key={label} className={styles.productPreviewThumb} onClick={openMediaModal}>
                {label}
              </button>
            ))}
          </>
        )}
      </div>
    );
  }

  function renderAdminOptionViewer() {
    return (
      <div className={`${styles.productOptionViewer} ${styles.fieldWide}`}>
        {showThermolaminateProfiles ? (
          <div className={styles.productOptionViewerToggle} role="radiogroup" aria-label="Product option viewer">
            {[
              ["colours", "Colours"],
              ["profiles", "Front profiles"],
              ["edges", "Edge profiles"],
            ].map(([value, label]) => (
              <button
                aria-checked={adminOptionViewerMode === value}
                className={`${styles.productOptionViewerToggleButton} ${adminOptionViewerMode === value ? styles.productOptionViewerToggleButtonActive : ""}`}
                key={value}
                onClick={() => setAdminOptionViewerMode(value)}
                role="radio"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {adminOptionViewerMode === "colours" || !showThermolaminateProfiles ? (
          <>
            <div className={styles.productColourLibraryPreviewHeader}>
              <div>
                <strong>Colour Library selections</strong>
                <span>
                  {colourFamily.groups.length
                    ? `${colourFamily.groups.length} finish group${colourFamily.groups.length === 1 ? "" : "s"} linked to ${materialLabel || material}.`
                    : `No active colours are linked to ${materialLabel || material}.`}
                </span>
              </div>
            </div>
            {colourFamily.groups.length ? (
              <div className={styles.productColourLibraryGroups}>
                {colourFamily.groups.map((finish) => (
                  <div className={styles.productColourLibraryGroup} key={finish.label}>
                    <div>
                      <strong>{finish.label}</strong>
                      <span>{finish.colours.length} colour{finish.colours.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className={styles.productColourLibrarySwatches}>
                      {finish.colours.slice(0, 14).map((colour) => (
                        <span key={`${finish.label}-${colour.name}`} title={colour.name}>
                          <img src={colour.src} alt="" />
                        </span>
                      ))}
                      {finish.colours.length > 14 ? <em>+{finish.colours.length - 14}</em> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>Add colour tiles to this material in the Colour Library, then they will appear here automatically.</p>
            )}
          </>
        ) : null}

        {showThermolaminateProfiles && adminOptionViewerMode === "profiles" ? (
          <>
            <div className={styles.productColourLibraryPreviewHeader}>
              <div>
                <strong>Front profile type</strong>
                <span>Thermolaminate front profiles match the quote form choices.</span>
              </div>
            </div>
            <div className={styles.productOptionViewerTabs}>
              {PROFILE_TYPES.map((profileType) => (
                <button
                  className={activeAdminProfileType === profileType ? styles.productOptionViewerTabActive : ""}
                  key={profileType}
                  onClick={() => {
                    setActiveAdminProfileType(profileType);
                    setActiveAdminProfile(0);
                  }}
                  type="button"
                >
                  {profileType}
                </button>
              ))}
            </div>
            <div className={styles.productOptionProfileGrid}>
              {adminProfileOptions.map((profile, index) => (
                <button
                  className={activeAdminProfile === index ? styles.productOptionImageTileActive : ""}
                  key={`${activeAdminProfileType}-${profile}`}
                  onClick={() => setActiveAdminProfile(index)}
                  title={profile}
                  type="button"
                >
                  <img src={profileOptionSrc(activeAdminProfileType, profile)} alt="" />
                  <span>{profile}</span>
                </button>
              ))}
            </div>
            {selectedAdminProfile ? <p>{selectedAdminProfile} - {activeAdminProfileType}</p> : null}
          </>
        ) : null}

        {showThermolaminateProfiles && adminOptionViewerMode === "edges" ? (
          <>
            <div className={styles.productColourLibraryPreviewHeader}>
              <div>
                <strong>Edge profile</strong>
                <span>Edge profiles match the quote form choices.</span>
              </div>
            </div>
            <div className={styles.productOptionEdgeGrid}>
              {EDGE_PROFILES.map((edge, index) => (
                <button
                  className={activeAdminEdge === index ? styles.productOptionImageTileActive : ""}
                  key={edge}
                  onClick={() => setActiveAdminEdge(index)}
                  title={edge}
                  type="button"
                >
                  <img src={edgeOptionSrc(edge)} alt="" />
                  <span>{edge}</span>
                </button>
              ))}
            </div>
            {selectedAdminEdge ? <p>{selectedAdminEdge}</p> : null}
          </>
        ) : null}

      </div>
    );
  }

  function renderProductPreviewOptionViewer() {
    return (
      <div className={styles.productPreviewOptionViewer}>
        {showThermolaminateProfiles ? (
          <div className={styles.productPreviewViewerToggle} role="radiogroup" aria-label="Product option viewer preview">
            {[
              ["colours", "Colours"],
              ["profiles", "Front profiles"],
              ["edges", "Edge profiles"],
            ].map(([value, label]) => (
              <button
                aria-checked={adminOptionViewerMode === value}
                className={adminOptionViewerMode === value ? styles.productPreviewViewerToggleActive : ""}
                key={value}
                onClick={() => setAdminOptionViewerMode(value)}
                role="radio"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {adminOptionViewerMode === "colours" || !showThermolaminateProfiles ? (
          <div className={styles.productPreviewColourPicker}>
            <div className={styles.productPreviewColourHeader}>
              <div className={styles.productPreviewSectionLabel}>{colourFamily.label} colour</div>
              {renderEditButton("quote", "Edit options")}
            </div>
            <div className={styles.productPreviewFinishTabs}>
              {colourFamily.groups.map((finish, index) => (
                <span className={index === 0 ? styles.productPreviewFinishTabActive : ""} key={finish.label}>
                  {finish.label}
                </span>
              ))}
            </div>
            <div className={styles.productPreviewSwatches}>
              {selectedFinish.colours.slice(0, 12).map((colour, index) => (
                <span className={index === 0 ? styles.productPreviewSwatchActive : ""} key={`${selectedFinish.label}-${colour.name}`}>
                  <img src={colour.src} alt="" />
                </span>
              ))}
            </div>
            <div className={styles.productPreviewColourName}>
              {selectedColour.name} <span>{selectedFinish.label}</span>
            </div>
            <div className={styles.productPreviewColourNote}>
              {colourFamily.note} Shown colours are indicative only. Request a sample before ordering.
            </div>
          </div>
        ) : null}

        {showThermolaminateProfiles && adminOptionViewerMode === "profiles" ? (
          <div className={styles.productPreviewColourPicker}>
            <div className={styles.productPreviewColourHeader}>
              <div className={styles.productPreviewSectionLabel}>Front profile type</div>
              {renderEditButton("quote", "Edit options")}
            </div>
            <div className={styles.productPreviewFinishTabs}>
              {PROFILE_TYPES.map((profileType) => (
                <span className={activeAdminProfileType === profileType ? styles.productPreviewFinishTabActive : ""} key={profileType}>
                  {profileType}
                </span>
              ))}
            </div>
            <div className={styles.productPreviewProfileGrid}>
              {adminProfileOptions.slice(0, 10).map((profile, index) => (
                <span className={activeAdminProfile === index ? styles.productPreviewOptionTileActive : ""} key={`${activeAdminProfileType}-${profile}`}>
                  <img src={profileOptionSrc(activeAdminProfileType, profile)} alt="" />
                  <small>{profile}</small>
                </span>
              ))}
            </div>
            {selectedAdminProfile ? (
              <div className={styles.productPreviewColourName}>{selectedAdminProfile} <span>{activeAdminProfileType}</span></div>
            ) : null}
          </div>
        ) : null}

        {showThermolaminateProfiles && adminOptionViewerMode === "edges" ? (
          <div className={styles.productPreviewColourPicker}>
            <div className={styles.productPreviewColourHeader}>
              <div className={styles.productPreviewSectionLabel}>Edge profile</div>
              {renderEditButton("quote", "Edit options")}
            </div>
            <div className={styles.productPreviewEdgeGrid}>
              {EDGE_PROFILES.map((edge, index) => (
                <span className={activeAdminEdge === index ? styles.productPreviewOptionTileActive : ""} key={edge}>
                  <img src={edgeOptionSrc(edge)} alt="" />
                  <small>{edge}</small>
                </span>
              ))}
            </div>
            {selectedAdminEdge ? <div className={styles.productPreviewColourName}>{selectedAdminEdge}</div> : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderModalContent() {
    switch (activeEditSection) {
      case "hero":
        return (
          <div className={styles.formGrid}>
            <label className={styles.fieldLabel} htmlFor="name" data-help={PRODUCT_EDIT_FIELD_HELP.name}>
              Product name
              <input
                id="name"
                className={styles.fieldInput}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!cardTitle) setCardTitle(event.target.value);
                  if (!pageTitle) setPageTitle(event.target.value);
                }}
                required
              />
            </label>
            <label className={styles.fieldLabel} htmlFor="slug" data-help={PRODUCT_EDIT_FIELD_HELP.slug}>
              URL slug
              <input
                id="slug"
                className={styles.fieldInput}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="Generated from product name if blank"
              />
            </label>
            <label className={styles.fieldLabel} htmlFor="eyebrow" data-help={PRODUCT_EDIT_FIELD_HELP.eyebrow}>
              Eyebrow
              <input id="eyebrow" className={styles.fieldInput} value={eyebrow} onChange={(event) => setEyebrow(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="heroCaption" data-help={PRODUCT_EDIT_FIELD_HELP.heroCaption}>
              Hero caption
              <input id="heroCaption" className={styles.fieldInput} value={heroCaption} onChange={(event) => setHeroCaption(event.target.value)} />
            </label>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`} htmlFor="detailDescription" data-help={PRODUCT_EDIT_FIELD_HELP.detailDescription}>
              Detail page description
              <textarea id="detailDescription" className={styles.textareaInput} value={detailDescription} onChange={(event) => setDetailDescription(event.target.value)} rows={6} />
            </label>
          </div>
        );
      case "tile":
        return (
          <div className={styles.formGrid}>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`} htmlFor="displayTitle" data-help={PRODUCT_EDIT_FIELD_HELP.displayTitle}>
              Display title
              <input
                id="displayTitle"
                className={styles.fieldInput}
                value={cardTitle || pageTitle}
                onChange={(event) => updateDisplayTitle(event.target.value)}
              />
            </label>
            <label className={styles.fieldLabel} htmlFor="category" data-help={PRODUCT_EDIT_FIELD_HELP.category}>
              Category
              <select id="category" className={styles.fieldInput} value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="cabinet-doors">Cabinet Doors</option>
                <option value="drawer-fronts">Drawer Fronts</option>
                <option value="mirrors">Mirrors</option>
                <option value="panels">Panels</option>
              </select>
            </label>
            <label className={styles.fieldLabel} htmlFor="status" data-help={PRODUCT_EDIT_FIELD_HELP.status}>
              Status
              <select id="status" className={styles.fieldInput} value={isActive ? "active" : "draft"} onChange={(event) => setIsActive(event.target.value === "active")}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label className={styles.fieldLabel} htmlFor="priceFrom" data-help={PRODUCT_EDIT_FIELD_HELP.priceFrom}>
              Price from
              <span className={styles.moneyInputWrap}>
                <span>{currency || "AUD"} $</span>
                <input
                  id="priceFrom"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className={styles.moneyFieldInput}
                  value={priceFrom}
                  onChange={(event) => setPriceFrom(event.target.value)}
                  onBlur={() => {
                    if (priceFrom !== "") setPriceFrom(Number(priceFrom || 0).toFixed(2));
                  }}
                />
              </span>
            </label>
            <label className={styles.fieldLabel} htmlFor="sortOrder" data-help={PRODUCT_EDIT_FIELD_HELP.sortOrder}>
              Sort order
              <input id="sortOrder" type="number" className={styles.fieldInput} value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
            </label>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`} htmlFor="shortDescription" data-help={PRODUCT_EDIT_FIELD_HELP.shortDescription}>
              Tile short description
              <textarea id="shortDescription" className={styles.textareaInput} value={shortDescription} onChange={(event) => setShortDescription(event.target.value)} rows={5} />
            </label>
          </div>
        );
      case "specs":
        return (
          <div className={styles.formGrid}>
            <label className={styles.fieldLabel} htmlFor="type" data-help={PRODUCT_EDIT_FIELD_HELP.type}>
              Type filter
              <select id="type" className={styles.fieldInput} value={type} onChange={(event) => setType(event.target.value)}>
                <option value="door">Door</option>
                <option value="drawer-front">Drawer front</option>
                <option value="panel">Panel</option>
                <option value="table-top">Table top</option>
              </select>
            </label>
            <label className={styles.fieldLabel} htmlFor="typeLabel" data-help={PRODUCT_EDIT_FIELD_HELP.typeLabel}>
              Display type
              <input id="typeLabel" className={styles.fieldInput} value={typeLabel} onChange={(event) => setTypeLabel(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="material" data-help={PRODUCT_EDIT_FIELD_HELP.material}>
              Material filter
              <select id="material" className={styles.fieldInput} value={material} onChange={(event) => setMaterial(event.target.value)}>
                <option value="thermolaminate">Thermolaminate</option>
                <option value="16mm">16mm decorative board</option>
                <option value="18mm">18mm decorative board</option>
                <option value="compact">Compact laminate</option>
              </select>
            </label>
            <label className={styles.fieldLabel} htmlFor="materialLabel" data-help={PRODUCT_EDIT_FIELD_HELP.materialLabel}>
              Display material
              <input id="materialLabel" className={styles.fieldInput} value={materialLabel} onChange={(event) => setMaterialLabel(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="compatibility" data-help={PRODUCT_EDIT_FIELD_HELP.compatibility}>
              Compatibility filter
              <select id="compatibility" className={styles.fieldInput} value={compatibility} onChange={(event) => setCompatibility(event.target.value)}>
                <option value="all">All / custom</option>
                <option value="ikea">IKEA</option>
                <option value="kaboodle">Kaboodle</option>
              </select>
            </label>
            <label className={styles.fieldLabel} htmlFor="compatibilityLabel" data-help={PRODUCT_EDIT_FIELD_HELP.compatibilityLabel}>
              Display compatibility
              <input id="compatibilityLabel" className={styles.fieldInput} value={compatibilityLabel} onChange={(event) => setCompatibilityLabel(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="ikeaSystem" data-help={PRODUCT_EDIT_FIELD_HELP.ikeaSystem}>
              IKEA system
              <input id="ikeaSystem" className={styles.fieldInput} value={ikeaSystem} onChange={(event) => setIkeaSystem(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="style" data-help={PRODUCT_EDIT_FIELD_HELP.style}>
              Style
              <input id="style" className={styles.fieldInput} value={style} onChange={(event) => setStyle(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="finishBrand" data-help={PRODUCT_EDIT_FIELD_HELP.finishBrand}>
              Finish brand
              <input id="finishBrand" className={styles.fieldInput} value={finishBrand} onChange={(event) => setFinishBrand(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="standardSize" data-help={PRODUCT_EDIT_FIELD_HELP.standardSize}>
              Standard size
              <input id="standardSize" className={styles.fieldInput} value={standardSize} onChange={(event) => setStandardSize(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="preDrilled" data-help={PRODUCT_EDIT_FIELD_HELP.preDrilled}>
              Pre-drilled text
              <input id="preDrilled" className={styles.fieldInput} value={preDrilled} onChange={(event) => setPreDrilled(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="madeToMeasure" data-help={PRODUCT_EDIT_FIELD_HELP.madeToMeasure}>
              Made to measure text
              <input id="madeToMeasure" className={styles.fieldInput} value={madeToMeasure} onChange={(event) => setMadeToMeasure(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="leadTime" data-help={PRODUCT_EDIT_FIELD_HELP.leadTime}>
              Lead time
              <input id="leadTime" className={styles.fieldInput} value={leadTime} onChange={(event) => setLeadTime(event.target.value)} />
            </label>
          </div>
        );
      case "pricing":
        return (
          <div className={styles.adminRepeater}>
            <p className={styles.productEditModalIntro}>
              These rows appear in the indicative pricing table. Keep the size, description, and price short so the public table stays easy to scan.
            </p>
            {pricingRows.map((row, index) => (
              <div className={styles.adminRepeaterRow} key={`pricing-${index}`}>
                <input className={styles.fieldInput} value={row.size || ""} onChange={(event) => updatePricingRow(index, "size", event.target.value)} placeholder="Size" />
                <input className={styles.fieldInput} value={row.description || ""} onChange={(event) => updatePricingRow(index, "description", event.target.value)} placeholder="Description" />
                <input className={styles.fieldInput} type="number" step="0.01" value={row.price ?? ""} onChange={(event) => updatePricingRow(index, "price", event.target.value)} placeholder="Price" />
                <label className={styles.checkboxRow}><input type="checkbox" checked={Boolean(row.popular)} onChange={(event) => updatePricingRow(index, "popular", event.target.checked)} /> Popular</label>
                <button type="button" className={styles.rowDeleteButton} onClick={() => removePricingRow(index)}>Remove</button>
              </div>
            ))}
            <button type="button" className={styles.secondaryButton} onClick={addPricingRow}>Add pricing row</button>
          </div>
        );
      case "quote":
        return (
          <div className={styles.formGrid}>
            <label
              className={`${styles.productEditorToggle} ${styles.fieldWide}`}
              data-help="Controls whether this product can be used in the online quote request flow."
            >
              <input type="checkbox" checked={quoteEnabled} onChange={(event) => setQuoteEnabled(event.target.checked)} />
              Quote enabled
            </label>
            <p className={`${styles.sectionText} ${styles.fieldWide}`}>
              Colours and finishes are controlled by the central colour library based on the selected material. This keeps product pages and quote forms using the same tiles.
            </p>
            <label
              className={styles.fieldLabel}
              data-help="Choose the material group for this product. This controls which Colour Library finishes and colour tiles appear on the product page and quote forms."
            >
              Product material
              <select className={styles.fieldInput} value={material} onChange={(event) => updateMaterialSelection(event.target.value)}>
                {COLOUR_MATERIALS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            {renderAdminOptionViewer()}
          </div>
        );
      case "settings":
        return (
          <div className={styles.formGrid}>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`} htmlFor="metaDescription" data-help={PRODUCT_EDIT_FIELD_HELP.metaDescription}>
              Meta description
              <textarea id="metaDescription" className={styles.textareaInput} value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} rows={3} />
            </label>
            <label className={styles.fieldLabel} htmlFor="ctaLabel" data-help={PRODUCT_EDIT_FIELD_HELP.ctaLabel}>
              CTA label
              <input id="ctaLabel" className={styles.fieldInput} value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="ctaUrl" data-help={PRODUCT_EDIT_FIELD_HELP.ctaUrl}>
              CTA URL
              <input id="ctaUrl" className={styles.fieldInput} value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} />
            </label>
            <label className={styles.fieldLabel} htmlFor="currency" data-help={PRODUCT_EDIT_FIELD_HELP.currency}>
              Currency
              <input id="currency" className={styles.fieldInput} value={currency} onChange={(event) => setCurrency(event.target.value)} />
            </label>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`} htmlFor="relatedProductIdsText" data-help={PRODUCT_EDIT_FIELD_HELP.relatedProductIdsText}>
              Related product IDs or slugs, one per line
              <textarea id="relatedProductIdsText" className={styles.textareaInput} value={relatedProductIdsText} onChange={(event) => setRelatedProductIdsText(event.target.value)} rows={4} />
            </label>
          </div>
        );
      default:
        return null;
    }
  }

  function renderEditModal() {
    if (!activeEditSection) return null;

    const titleMap = {
      hero: "Edit product hero",
      tile: "Edit catalogue tile",
      specs: "Edit product specs",
      pricing: "Edit pricing table",
      quote: "Edit quote option links",
      settings: "Edit page settings",
    };
    const descriptionMap = {
      hero: "Edit the visible hero copy and page URL details shown at the top of the public product page.",
      tile: "Edit catalogue tile details and the customer-facing price/status information.",
      specs: "Edit internal filters separately from the customer-facing labels shown in the public specs table.",
      pricing: "Edit the rows shown in the indicative pricing table.",
      quote: "Link quote-form option lists to this product. Colour tiles come from the central Colour Library by material.",
      settings: "Edit SEO, call-to-action, and related-product settings.",
    };

    return (
      <div className={styles.mediaModalBackdrop} role="dialog" aria-modal="true" onMouseDown={closeEditSection}>
        <div className={styles.productEditModalPanel} onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.mediaModalHeader}>
            <h2 className={styles.mediaModalTitle}>{titleMap[activeEditSection] || "Edit section"}</h2>
            <button type="button" className={styles.mediaCloseButton} onClick={closeEditSection}>
              x
            </button>
          </div>
          <div className={styles.productEditModalBody}>
            <p className={styles.productEditModalIntro}>{descriptionMap[activeEditSection]}</p>
            {renderModalContent()}
          </div>
          <div className={styles.mediaModalFooter}>
            <button type="button" className={styles.primaryButton} onClick={closeEditSection}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className={styles.editorWrap}>
      <form onSubmit={handleSubmit}>
        <div className={styles.editorTopBar}>
          <div>
            <p className={styles.editorSubtitle}>{name || "Product details"}</p>
          </div>
          <div className={styles.productEditorModeToggle} role="radiogroup" aria-label="Product editor preview mode">
            <button
              type="button"
              role="radio"
              aria-checked={previewMode === "page"}
              className={`${styles.productEditorModeButton} ${previewMode === "page" ? styles.productEditorModeButtonActive : ""}`}
              onClick={() => setPreviewMode("page")}
            >
              Product page
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={previewMode === "tile"}
              className={`${styles.productEditorModeButton} ${previewMode === "tile" ? styles.productEditorModeButtonActive : ""}`}
              onClick={() => setPreviewMode("tile")}
            >
              Product library tile
            </button>
          </div>
          <div className={styles.editorTopActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => router.push("/admin/products")}
            >
              Back
            </button>
            <button type="submit" className={styles.primaryButton} disabled={isSaving || isApplyingMedia}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {feedback ? (
          <div
            className={`${styles.productEditorToast} ${isSuccessFeedback ? styles.productEditorToastSuccess : styles.productEditorToastError}`}
            role={isSuccessFeedback ? "status" : "alert"}
          >
            <span className={styles.productEditorToastIcon} aria-hidden="true" />
            <span>{feedback}</span>
          </div>
        ) : null}

        <div className={styles.productPreviewCanvas}>
          {previewMode === "page" ? (
            <div className={styles.productPreviewPage}>
              <section className={styles.productPreviewHero}>
                <div className={styles.productPreviewGallery}>
                  <div className={styles.productPreviewMainImage}>
                    {effectivePrimary ? (
                      <img src={resolveImageSrc(effectivePrimary)} alt={name || "Product image"} />
                    ) : (
                      renderImagePlaceholder("Product image")
                    )}
                    {heroCaption ? <span className={styles.productPreviewCaption}>{heroCaption}</span> : null}
                    <div className={styles.productPreviewImageActions}>
                      {renderMediaEditButton()}
                    </div>
                  </div>
                  {renderMediaStrip()}
                </div>

                <div className={styles.productPreviewDetails}>
                  <div className={styles.productPreviewSectionHeader}>
                    <div className={styles.productPreviewBadges}>
                      <span>{typeLabel || "Type"}</span>
                      <span>{materialLabel || "Material"}</span>
                      {compatibilityLabel ? <span>{compatibilityLabel}</span> : null}
                    </div>
                    {renderEditButton("hero")}
                  </div>
                  <h1>{name || "Product name"}</h1>
                  <p>{detailDescription || longDescription || "Add a product detail description so customers understand what they are viewing."}</p>

                  <div className={styles.productPreviewSpecList}>
                    <div><span>Material</span><strong>{materialLabel || "-"}</strong></div>
                    <div><span>Style</span><strong>{style || "-"}</strong></div>
                    <div><span>Finish brand</span><strong>{finishBrand || "-"}</strong></div>
                    <div><span>Compatible with</span><strong>{compatibilityLabel || "Custom cabinetry"}</strong></div>
                    <div><span>Pre-drilled</span><strong>{preDrilled || "-"}</strong></div>
                    <div><span>Made to measure</span><strong>{madeToMeasure || "-"}</strong></div>
                    <div><span>Lead time</span><strong>{leadTime || "-"}</strong></div>
                  </div>
                  <div className={styles.productPreviewInlineActions}>{renderEditButton("specs", "Edit specs")}</div>

                  {renderProductPreviewOptionViewer()}

                  <div className={styles.productPreviewPriceBlock}>
                    <span>Starting from</span>
                    <strong>{formatMoney(priceFrom)}</strong>
                    <small>{standardSize || "Standard size"} - see full pricing table below</small>
                    {renderEditButton("tile", "Edit price/status")}
                  </div>

                  <div className={styles.productPreviewCtaGroup}>
                    <span>{ctaLabel || "Get a free quote"}</span>
                    <span>Call us - 0408 906 784</span>
                    {renderEditButton("settings", "Edit CTA/SEO")}
                  </div>
                  <p className={styles.productPreviewCtaNote}>
                    We will come back to you promptly with a quote based on your exact measurements and chosen finish.
                  </p>
                  <div className={styles.productPreviewDeliveryStrip}>
                    <div><span />Flat-rate shipping, Perth metro</div>
                    <div><span />{type === "panel" || type === "table-top" ? "Cut to your measurements" : "Pre-drilled, ready to hang"}</div>
                    <div><span />Made to your measurements</div>
                  </div>
                </div>
              </section>

              <section className={styles.productPreviewLowerGrid}>
                <article className={styles.productPreviewPanel}>
                  <div className={styles.productPreviewPanelHeader}>
                    <h2>Indicative pricing</h2>
                    {renderEditButton("pricing")}
                  </div>
                  <table className={styles.productPreviewPricingTable}>
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th>Description</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingRows.map((row, index) => (
                        <tr key={`preview-pricing-${index}`}>
                          <td>{row.size || "-"} {row.popular ? <span>Popular</span> : null}</td>
                          <td>{row.description || "-"}</td>
                          <td>{row.price === "" || row.price == null ? "-" : formatMoney(row.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className={styles.productPreviewPricingNote}>
                    All prices are indicative and in {currency || "AUD"}. Final pricing is confirmed on enquiry based on your dimensions, quantity and chosen {finishBrand || "finish"}. Laminex and Formica pricing available on request.
                  </p>
                </article>

                <article className={styles.productPreviewPanel}>
                  <div className={styles.productPreviewPanelHeader}>
                    <h2>Enquire about a custom size</h2>
                  </div>
                  <div className={styles.productPreviewEnquiryBody} aria-label="Read-only public quote enquiry form preview">
                    <p>Need a size not listed above, or want a firm quote? Fill in your details and we will get back to you promptly.</p>
                    <div className={styles.productPreviewFieldRow}>
                      <label>Width (mm)<input type="text" placeholder="e.g. 600" disabled /></label>
                      <label>Height (mm)<input type="text" placeholder="e.g. 900" disabled /></label>
                    </div>
                    <div className={styles.productPreviewFieldRow}>
                      <label>Quantity<input type="text" placeholder="e.g. 6" disabled /></label>
                      <label>Colour / finish<input type="text" placeholder={`e.g. ${selectedColour.name}`} disabled /></label>
                    </div>
                    <div className={styles.productPreviewFieldRow}>
                      <label>Your name<input type="text" placeholder="First and last name" disabled /></label>
                      <label>Phone or email<input type="text" placeholder="How should we reach you?" disabled /></label>
                    </div>
                    <label className={styles.productPreviewFieldFull}>Delivery suburb<input type="text" placeholder="e.g. Subiaco" disabled /></label>
                    <label className={styles.productPreviewFieldFull}>Anything else?<textarea placeholder="e.g. compatible cabinet range, hinge requirements, delivery suburb..." disabled /></label>
                    <button type="button" className={styles.productPreviewSubmitButton} disabled>
                      Send enquiry
                    </button>
                  </div>
                </article>
              </section>

              <section className={styles.productPreviewInfoSection}>
                <h2>Product information</h2>
                <p>Everything you need to know before ordering</p>
                <div className={styles.productPreviewInfoGrid}>
                  {visibleInfoCards.map((card, index) => (
                    <article key={`preview-info-${index}`}>
                      <h3>{card.title || "Information card"}</h3>
                      <p>{card.body || card.text || ""}</p>
                    </article>
                  ))}
                </div>
              </section>

            </div>
          ) : (
            <div className={styles.productTilePreviewStage}>
              <article className={styles.productLibraryTilePreview}>
                <div className={styles.productLibraryTileImage}>
                  {effectivePrimary ? <img src={resolveImageSrc(effectivePrimary)} alt={name || "Product image"} /> : renderImagePlaceholder("Tile image")}
                  <div className={styles.productLibraryTileBadges}>
                    {compatibilityLabel ? <span>{compatibilityLabel}</span> : null}
                    {materialLabel ? <span>{materialLabel}</span> : null}
                  </div>
                  {renderMediaEditButton()}
                </div>
                <div className={styles.productLibraryTileBody}>
                  <div className={styles.productPreviewSectionHeader}>
                    <span className={styles.productLibraryTileType}>{eyebrow || typeLabel || "Product"}</span>
                    {renderEditButton("tile")}
                  </div>
                  <h2>{cardTitle || name || "Product title"}</h2>
                  <p>{shortDescription || longDescription || "Add a short catalogue description."}</p>
                  <div className={styles.productLibraryTileFooter}>
                    <div>
                      <span>Starting from</span>
                      <strong>{formatMoney(priceFrom)}</strong>
                      <small>{standardSize || "Standard size"}</small>
                    </div>
                    <span className={styles.productLibraryTileButton}>View product</span>
                  </div>
                </div>
              </article>
            </div>
          )}
        </div>
      </form>

      {renderEditModal()}

      {isMediaModalOpen ? (
        <div className={styles.mediaModalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.mediaModalPanel}>
            <div className={styles.mediaModalHeader}>
              <h2 className={styles.mediaModalTitle}>Select file</h2>
              <button type="button" className={styles.mediaCloseButton} onClick={closeMediaModal}>
                x
              </button>
            </div>

            <div className={styles.mediaModalBody}>
              <div className={styles.mediaUploadArea}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadFiles}
                  className={styles.mediaHiddenInput}
                />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? "Uploading..." : "Upload image"}
                </button>
                {isUploading ? (
                  <div className={styles.uploadProgressWrap}>
                    <div className={styles.uploadProgressText}>
                      Uploading {uploadDoneCount}/{uploadTotalCount} image{uploadTotalCount === 1 ? "" : "s"}
                    </div>
                    <div className={styles.uploadProgressBar}>
                      <div className={styles.uploadProgressFill} style={{ width: `${uploadPercent}%` }} />
                    </div>
                  </div>
                ) : null}
                <p className={styles.mediaUploadHint}>
                  Upload above, then tick images below to link them to this product.
                </p>
              </div>

              <div className={styles.mediaListScroller}>
                {isLoadingAssets ? (
                  <p className={styles.placeholderText}>Loading images from products bucket...</p>
                ) : (
                  <div className={styles.mediaGrid}>
                    {bucketAssets.map((asset) => {
                      const checked = modalSelected.includes(asset.url);
                      return (
                        <label key={asset.path} className={styles.mediaAssetTile}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleModalSelection(asset.url)}
                            className={styles.mediaAssetCheckbox}
                          />
                          <img src={asset.url} alt={asset.name} className={styles.mediaAssetImage} />
                          <span className={styles.mediaAssetName}>{asset.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.mediaModalFooter}>
              <button type="button" className={styles.overlayCancelButton} onClick={closeMediaModal}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleDoneMedia}
                disabled={isApplyingMedia || isUploading}
              >
                {isApplyingMedia ? "Applying..." : "Done"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
