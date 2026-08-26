"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { edgeImageSrc } from "@/lib/pcd-profile-images";
import { useSearchParams } from "next/navigation";
import { formatMoney, toNumber } from "../../../lib/pcd-quote-utils";
import { rowCapHeight } from "../../../lib/pcd-row-cap";
import { toTermsHtml } from "../../../lib/pcd-terms-html";
import PcdLoader from "@/components/public/PcdLoader";
import styles from "./quote-public.module.css";
import {
  ADDRESS_KEYS,
  DETAIL_FIELDS,
  formatSiteAddress,
  validateDetails,
} from "../../../lib/pcd-contact-details";

function sortedLines(quote) {
  return [...(quote?.pcd_quote_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

// Superseded copies are kept as our record of what was sent and when, but the
// customer must only ever see the current one. Two PDFs in this list with no way
// to tell which is live is how somebody ends up working from old figures.
function sortedAttachments(quote) {
  return [...(quote?.pcd_quote_attachments || [])]
    .filter((attachment) => !attachment.superseded_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function lineValue(value) {
  return value || "N/A";
}

function isBaseCabinetLine(line) {
  return line?.product_type === "base_cabinet";
}

function productDisplayName(line) {
  if (isBaseCabinetLine(line)) return "Base Cabinet";
  return line.product_type || line.product_name;
}

function cabinetDimensionText(line) {
  const config = line.cabinet_config;
  if (config?.width_mm || config?.height_mm || config?.depth_mm) {
    return `${config.height_mm || "-"} x ${config.width_mm || "-"} x ${config.depth_mm || "-"}`;
  }

  const match = String(line.description || "").match(/(\d+(?:\.\d+)?)mm wide x (\d+(?:\.\d+)?)mm high x (\d+(?:\.\d+)?)mm deep/i);
  return match ? `${match[1]} x ${match[2]} x ${match[3]}` : "";
}

function quoteLineSizeText(line) {
  if (isBaseCabinetLine(line)) return cabinetDimensionText(line);
  const width = line.width_mm ? `${line.width_mm}` : "";
  const height = line.height_mm ? `${line.height_mm}` : "";
  return width || height ? `${height || "-"} x ${width || "-"}` : "";
}

function assetSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function colourSrcForLine(line) {
  return line.colour_src || "";
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: response.redirected
        ? "This quote action was redirected before it could be recorded. Please refresh the page and try again."
        : "We could not read the server response. Please refresh the page and try again.",
    };
  }
}

function edgeOptionSrc(label) {
  return edgeImageSrc(label);
}

function profileOptionSrc(profileType, label) {
  return profileType && label ? `/images/profiles/${assetSlug(profileType)}/${assetSlug(label)}.jpg` : "";
}

function SelectionTile({ src, label, onPreview }) {
  if (src) {
    return (
      <button
        type="button"
        className={`${styles.publicSelectionTile} ${styles.publicSelectionTileButton}`}
        onClick={() => onPreview({ src, label: lineValue(label) })}
      >
        <img alt="" src={src} onError={(event) => { event.currentTarget.style.display = "none"; }} />
        <span>{lineValue(label)}</span>
      </button>
    );
  }

  return (
    <span className={styles.publicSelectionTile}>
      <span>{lineValue(label)}</span>
    </span>
  );
}

function DetailStack({ line }) {
  return (
    <div className={styles.quoteItemDetailStack}>
      <strong>{lineValue(productDisplayName(line))}</strong>
      <span>{lineValue(line.material)}</span>
      <span>{lineValue(line.finish)}</span>
      <span>{lineValue(line.colour)}</span>
    </div>
  );
}

function PreviewName({ src, label, onPreview }) {
  const displayLabel = lineValue(label);
  if (!src || displayLabel === "N/A") {
    return <span>{displayLabel}</span>;
  }

  return (
    <span className={styles.quotePreviewName}>
      <button
        type="button"
        className={styles.quotePreviewTextButton}
        aria-label={`View ${displayLabel} image`}
        onClick={() => onPreview({ src, label: displayLabel })}
      >
        {displayLabel}
      </button>
    </span>
  );
}

const DETAIL_INPUTS = {
  name: { label: "Full name", type: "text", placeholder: "Sarah Jones", autoComplete: "name" },
  email: { label: "Email", type: "email", placeholder: "sarah@example.com", autoComplete: "email" },
  mobile: { label: "Mobile", type: "tel", placeholder: "0412 345 678", autoComplete: "tel" },
  street: { label: "Street address", type: "text", placeholder: "14 Rokeby Road", autoComplete: "address-line1" },
  suburb: { label: "Suburb", type: "text", placeholder: "Subiaco", autoComplete: "address-level2" },
  postcode: { label: "Postcode", type: "text", placeholder: "6008", autoComplete: "postal-code", inputMode: "numeric" },
};

// Quote Items stops growing after this many rows and scrolls inside itself.
// The page still scrolls; what it does not do is turn one section into an
// endless run that buries the totals and the Approve button below it.
const VISIBLE_ITEM_ROWS = 5;

// Reads the real rows off the page and hands them to rowCapHeight. offsetHeight
// is used rather than a bounding rect because it does not change as the box is
// scrolled, so re-measuring a list that is already capped gives the same answer
// instead of drifting.
function useRowCap(itemCount, visibleRows) {
  const [node, setNode] = useState(null);
  const [maxHeight, setMaxHeight] = useState(null);
  const ref = useCallback((element) => setNode(element), []);
  const capped = itemCount > visibleRows;

  useEffect(() => {
    if (!node || !capped) {
      setMaxHeight(null);
      return undefined;
    }

    const rows = () => Array.from(node.querySelectorAll("[data-cap-row]"));

    function measure() {
      setMaxHeight(
        rowCapHeight({
          rowHeights: rows().map((row) => row.offsetHeight),
          // A card list is a grid with a gap between cards; a table has none.
          gap: Number.parseFloat(window.getComputedStyle(node).rowGap) || 0,
          headHeight: node.querySelector("thead")?.offsetHeight || 0,
          visibleRows,
        })
      );
    }

    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    // Row heights change when the window narrows and when a mobile card is
    // opened, so the cap has to follow rather than being measured once.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    rows().forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [node, capped, itemCount, visibleRows]);

  return [ref, maxHeight];
}

// The four tiles that can be edited, in the order they read in the summary.
const SUMMARY_TILES = [
  { id: "name", label: "Customer", keys: ["name"], value: (d) => d.name },
  { id: "email", label: "Email", keys: ["email"], value: (d) => d.email },
  { id: "mobile", label: "Mobile", keys: ["mobile"], value: (d) => d.mobile },
  { id: "address", label: "Site address", keys: ADDRESS_KEYS, value: formatSiteAddress },
];

// One tile of the Quote Summary, which edits itself.
//
// It reads as a summary value until the customer asks to change it, then the
// value is replaced by its field or fields in place. Nothing opens below, no
// panel, no save button: the value is live as it is typed, so leaving the tile
// is the whole interaction. It folds back to a plain value once what is in it
// is valid, which is also the signal that the field is done.
//
// The address is one tile with three fields because that is how an address is
// missing: never the suburb on its own.
function SummaryDetail({ label, keys, value, details, errors, touched, locked, isOpen, onOpen, onClose, onChange, onTouch }) {
  const missing = keys.some((key) => errors[key]);
  const valid = keys.every((key) => !errors[key]);

  if (locked || !isOpen) {
    return (
      <div className={`${styles.summaryItem} ${missing && !locked ? styles.summaryItemMissing : ""}`}>
        <span>{label}</span>
        <strong>
          {missing && !locked ? (
            <button type="button" className={styles.detailAdd} onClick={onOpen}>
              Add {label.toLowerCase()}
            </button>
          ) : (
            <>
              {value || "-"}
              {!locked && value ? (
                <button type="button" className={styles.detailEdit} onClick={onOpen}>Change</button>
              ) : null}
            </>
          )}
        </strong>
      </div>
    );
  }

  return (
    <div
      className={`${styles.summaryItem} ${missing ? styles.summaryItemMissing : ""}`}
      // Focus moving between the address fields stays inside the tile, so only
      // a move that actually leaves it counts as finishing.
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (valid) onClose();
      }}
    >
      <span>{label}</span>
      <div className={styles.detailFields}>
        {keys.map((key, index) => {
          const field = DETAIL_INPUTS[key];
          const showError = touched[key] && errors[key];
          return (
            <div key={key}>
              <input
                className={`${styles.detailInput} ${showError ? styles.inputError : ""}`}
                type={field.type}
                value={details[key] || ""}
                placeholder={field.placeholder}
                aria-label={field.label}
                autoComplete={field.autoComplete}
                inputMode={field.inputMode}
                autoFocus={index === 0}
                onChange={(event) => onChange(key, event.target.value)}
                onBlur={() => onTouch(key)}
              />
              {showError ? <span className={styles.detailError}>{errors[key]}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function QuoteApprovalClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";
  const [quote, setQuote] = useState(null);
  const [clientName, setClientName] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);
  const [expandedMobileLineId, setExpandedMobileLineId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [paymentAcknowledged, setPaymentAcknowledged] = useState(false);
  // The details we must hold before this can be accepted. Pre-filled from the
  // customer record by the get route, and edited in the summary panel where
  // the customer can already see what is missing.
  const [details, setDetails] = useState({});
  // Which summary tile is currently a field rather than a value. One at a time,
  // because there is nowhere for a second one to go.
  const [openTile, setOpenTile] = useState(null);
  const [touched, setTouched] = useState({});

  const detailErrors = useMemo(() => validateDetails(details), [details]);
  const detailsComplete = Object.keys(detailErrors).length === 0;
  // The one thing the customer reads when they cannot accept. Named field by
  // field rather than by tile, so "postcode" says which box is empty instead of
  // asking again for an address that is otherwise already there.
  const missingLabels = useMemo(
    () => DETAIL_FIELDS.filter((field) => detailErrors[field.key]).map((field) => field.label),
    [detailErrors]
  );

  const lines = useMemo(() => sortedLines(quote), [quote]);
  const attachments = useMemo(() => sortedAttachments(quote), [quote]);
  // The two renderings of the same lines each get their own cap, because a
  // table row and a mobile card are nothing like the same height.
  const [desktopItemsRef, desktopItemsMax] = useRowCap(lines.length, VISIBLE_ITEM_ROWS);
  const [mobileItemsRef, mobileItemsMax] = useRowCap(lines.length, VISIBLE_ITEM_ROWS);
  const itemsAreCapped = lines.length > VISIBLE_ITEM_ROWS;
  // LOCKED MEANS FINISHED, NOT ANSWERED.
  //
  // awaiting_deposit is deliberately not locked. The customer approved, went to
  // pay and stopped, and locking them out at that point was the dead end this
  // replaced: their own link told them the quote was approved and an order
  // existed, with no button and no way to pay, and their only route back was to
  // ring us. Now they come back to the same link and finish.
  const isLocked = quote?.status === "approved" || quote?.status === "rejected";
  const awaitingDeposit = quote?.status === "awaiting_deposit";
  const productLineTotal = useMemo(() => {
    const lineSum = lines.reduce((sum, line) => sum + toNumber(line.line_total_ex_gst), 0);
    return lineSum || toNumber(quote?.material_cost_ex_gst);
  }, [lines, quote?.material_cost_ex_gst]);
  const labourCost = toNumber(quote?.labour_cost_ex_gst) ||
    toNumber(quote?.labour_hours) * toNumber(quote?.worker_hourly_rate);
  const costSummaryRows = [
    { label: "Product line items", description: "Items listed in the quote table above.", amount: productLineTotal, always: true },
    {
      label: quote?.labour_hours ? `Labour (${toNumber(quote.labour_hours)} hrs)` : "Labour",
      description: "Workshop and job labour required for this quote.",
      amount: labourCost,
    },
    { label: "Travel", description: "Travel allowance for the job.", amount: toNumber(quote?.travel_cost_ex_gst) },
    { label: "Delivery", description: "Delivery allowance for the supplied items.", amount: toNumber(quote?.delivery_cost_ex_gst) },
    { label: "Consumables", description: "Small job materials such as glue, screws, and sundries.", amount: toNumber(quote?.installation_cost_ex_gst) },
    { label: "Painting", description: "Painting allowance for painted doors and drawer fronts.", amount: toNumber(quote?.painting_cost_ex_gst) },
    { label: "Glass", description: "Glass allowance for doors or panels with glass inserts.", amount: toNumber(quote?.glass_cost_ex_gst) },
    { label: "Door removal and disposal", description: "Taking off your old doors and fronts and taking them away.", amount: toNumber(quote?.removal_cost_ex_gst) },
    { label: "Edging", description: "Edge tape applied to every board edge on the pieces we make.", amount: toNumber(quote?.edging_cost_ex_gst) },
  ].filter((row) => row.always || row.amount > 0);
  const depositPercent = Number(quote?.deposit_percent || 0);
  const depositRequired = Boolean(quote?.deposit_required && depositPercent > 0);
  const depositAmount = depositRequired ? Number((toNumber(quote?.total_inc_gst) * depositPercent / 100).toFixed(2)) : 0;

  useEffect(() => {
    async function loadQuote() {
      if (!code) {
        setMessage("Missing access code.");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/quote-workflow/get?code=${encodeURIComponent(code)}`, { cache: "no-store" });
        const payload = await readJsonResponse(response);
        if (!response.ok || !payload.ok) {
          setMessage(payload.error || "We could not load this quote.");
          return;
        }
        setQuote(payload.quote);
        setDetails(payload.details || {});
      } catch (error) {
        setMessage(error?.message || "We could not load this quote.");
      } finally {
        setIsLoading(false);
      }
    }

    loadQuote();
  }, [code]);

  async function submitAction(action) {
    setMessage("");
    if (!clientName.trim()) {
      setMessage("Please enter your name first.");
      return;
    }
    if (action === "rejected" && !note.trim()) {
      setMessage("Please include a rejection note.");
      return;
    }
    if (action === "approved" && !paymentAcknowledged) {
      setMessage("Please acknowledge the payment requirement before approving this quote.");
      return;
    }
    // Rejection is never gated on these; only acceptance. The Approve button is
    // disabled while anything is missing, so this is the safety net rather than
    // the normal path. It opens the first tile that is blocking, which is more
    // use than a sentence saying something is.
    if (action === "approved" && !detailsComplete) {
      const blocking = SUMMARY_TILES.find((tile) => tile.keys.some((key) => detailErrors[key]));
      if (blocking) setOpenTile(blocking.id);
      setMessage("Please complete your contact and delivery details in the Quote Summary above.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/quote-workflow/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          action,
          client_name: clientName.trim(),
          note: note.trim() || null,
          // Only meaningful on approval; the route ignores them otherwise.
          details: action === "approved" ? details : undefined,
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "We could not record your response.");
        return;
      }
      if (payload.requiresPayment && payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }
      // Only reached when nothing was owed: the deposit path has already sent
      // them to Stripe above. So an order really has been created here.
      setQuote((current) => ({ ...current, status: action }));
      setMessage(action === "approved" ? "Quote approved. Your order has been created." : "Quote rejected. Your response has been recorded.");
    } catch (error) {
      setMessage(error?.message || "We could not record your response.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Quote</div>
        <div className={styles.panelBody}>
          <PcdLoader
            variant="panel"
            label="Loading your quote"
            steps={["Finding your quote", "Loading the details", "Almost there"]}
          />
        </div>
      </section>
    );
  }

  if (!quote) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Quote</div>
        <div className={styles.panelBody}>{message || "Quote not found."}</div>
      </section>
    );
  }

  return (
    <div className={styles.quoteViewCard}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Quote Summary</div>
        <div className={styles.panelBody}>
          {/* The summary has always printed a dash where we hold nothing, with
              no way to fix it. Now that dash is the fix: an Add button that
              turns the tile into its field. Nothing announces itself at the top
              of the page; a tile that blocks acceptance is simply marked, and
              the reason is stated once, next to the button it blocks. */}
          <div className={styles.quoteViewSummaryGrid}>
            <div className={styles.summaryItem}><span>Quote title</span><strong>{quote.title || "Cabinetry Quote"}</strong></div>
            <div className={styles.summaryItem}><span>Status</span><strong>{quote.status}</strong></div>
            <div className={styles.summaryItem}><span>Quote number</span><strong>{quote.quote_number}</strong></div>

            {SUMMARY_TILES.map((tile) => (
              <SummaryDetail
                key={tile.id}
                label={tile.label}
                keys={tile.keys}
                value={tile.value(details)}
                details={details}
                errors={detailErrors}
                touched={touched}
                locked={isLocked}
                isOpen={openTile === tile.id}
                onOpen={() => setOpenTile(tile.id)}
                onClose={() => setOpenTile((current) => (current === tile.id ? null : current))}
                onChange={(key, value) => setDetails((current) => ({ ...current, [key]: value }))}
                onTouch={(key) => setTouched((current) => ({ ...current, [key]: true }))}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>Quote Items</div>
        <div className={styles.panelBody}>
          <div
            ref={desktopItemsRef}
            className={`${styles.tableWrap} ${styles.quoteItemsDesktopTable} ${desktopItemsMax ? styles.quoteItemsCapped : ""}`}
            style={desktopItemsMax ? { maxHeight: desktopItemsMax } : undefined}
          >
            <table className={`${styles.table} ${styles.quoteItemsPublicTable}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item details</th>
                  <th>Client notes</th>
                  <th>W x H x D (mm)</th>
                  <th>Qty</th>
                  <th>Edge profile</th>
                  <th>Profile</th>
                  <th>Hinges</th>
                  <th>Unit cost</th>
                  <th>Total ex GST</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const showProfiles = line.material === "Thermolaminate" && line.product_type !== "Panel" && line.product_type !== "Table top";
                  const hingesApplicable = line.product_type === "Door";
                  const colourSrc = colourSrcForLine(line);
                  const edgeSrc = edgeOptionSrc(line.edge_mould);
                  const profileSrc = showProfiles ? profileOptionSrc(line.profile_type, line.profile) : "";
                  const clientNote = String(line.client_note || "").trim();
                  return (
                    <tr key={line.id || index} data-cap-row>
                      <td><span className={styles.quoteItemNumber}>{index + 1}</span></td>
                      <td><DetailStack line={line} /></td>
                      <td>
                        {clientNote ? (
                          <span className={styles.quoteLineClientNote}>{clientNote}</span>
                        ) : (
                          <span className={styles.quoteLineClientNoteEmpty}>-</span>
                        )}
                      </td>
                      <td>{lineValue(quoteLineSizeText(line))}</td>
                      <td>{line.qty || "1"}</td>
                      <td><PreviewName src={edgeSrc} label={line.edge_mould} onPreview={setPreviewImage} /></td>
                      <td>
                        <div className={styles.quoteItemDetailStack}>
                          <span>{showProfiles ? lineValue(line.profile_type) : "N/A"}</span>
                          {showProfiles ? <PreviewName src={profileSrc} label={line.profile} onPreview={setPreviewImage} /> : <span>N/A</span>}
                        </div>
                      </td>
                      <td>
                        <div className={styles.quoteItemDetailStack}>
                          <span>Drill: {hingesApplicable ? line.hinge_holes ? "Yes" : "No" : "N/A"}</span>
                          <span>Qty: {hingesApplicable && line.hinge_holes ? lineValue(line.hinge_qty) : "N/A"}</span>
                        </div>
                      </td>
                      <td>{formatMoney(line.unit_price_ex_gst, quote.currency)}</td>
                      <td>{formatMoney(line.line_total_ex_gst, quote.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            ref={mobileItemsRef}
            className={`${styles.quoteItemsMobileList} ${mobileItemsMax ? styles.quoteItemsCapped : ""}`}
            style={mobileItemsMax ? { maxHeight: mobileItemsMax } : undefined}
          >
            {lines.map((line, index) => {
              const showProfiles = line.material === "Thermolaminate" && line.product_type !== "Panel" && line.product_type !== "Table top";
              const hingesApplicable = line.product_type === "Door";
              const colourSrc = colourSrcForLine(line);
              const edgeSrc = edgeOptionSrc(line.edge_mould);
              const profileSrc = showProfiles ? profileOptionSrc(line.profile_type, line.profile) : "";
              const lineKey = line.id || `line-${index}`;
              const isExpanded = expandedMobileLineId === lineKey;
              const clientNote = String(line.client_note || "").trim();
              return (
                <article className={`${styles.quoteItemMobileCard} ${isExpanded ? styles.quoteItemMobileCardOpen : ""}`} key={lineKey} data-cap-row>
                  <button
                    type="button"
                    className={styles.quoteItemMobileHeader}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedMobileLineId((current) => (current === lineKey ? null : lineKey))}
                  >
                    <span className={styles.quoteItemNumber}>{index + 1}</span>
                    <div>
                      <p>{lineValue(productDisplayName(line), "Quote item")}</p>
                      <strong>{formatMoney(line.line_total_ex_gst, quote.currency)}</strong>
                    </div>
                    <span className={styles.quoteItemMobileToggle} aria-hidden="true" />
                  </button>
                  {isExpanded ? (
                    <div className={styles.quoteItemMobileContent}>
                      <div className={styles.quoteItemMobileSpecs}>
                        <div><span>Material</span><strong>{lineValue(line.material)}</strong></div>
                        <div><span>Size</span><strong>{lineValue(quoteLineSizeText(line))}</strong></div>
                        <div><span>Qty</span><strong>{line.qty || "1"}</strong></div>
                        <div><span>Unit cost</span><strong>{formatMoney(line.unit_price_ex_gst, quote.currency)}</strong></div>
                      </div>
                      <div className={styles.quoteItemMobileSelections}>
                        <div>
                          <span>Colour</span>
                          <SelectionTile src={colourSrc} label={line.colour} onPreview={setPreviewImage} />
                        </div>
                        <div>
                          <span>Edge profile</span>
                          <SelectionTile src={edgeSrc} label={line.edge_mould} onPreview={setPreviewImage} />
                        </div>
                        {showProfiles ? (
                          <>
                            <div>
                              <span>Profile type</span>
                              <strong>{lineValue(line.profile_type)}</strong>
                            </div>
                            <div>
                              <span>Profile name</span>
                              <SelectionTile src={profileSrc} label={line.profile} onPreview={setPreviewImage} />
                            </div>
                          </>
                        ) : null}
                      </div>
                      <div className={styles.quoteItemMobileHinges}>
                        <span className={hingesApplicable && line.hinge_holes ? styles.quoteItemYes : styles.quoteItemNo}>
                          {hingesApplicable && line.hinge_holes ? "Yes" : hingesApplicable ? "No" : "N/A"} drill holes
                        </span>
                        <span>Hinge qty: {hingesApplicable && line.hinge_holes ? lineValue(line.hinge_qty) : "N/A"}</span>
                      </div>
                      {clientNote ? (
                        <div className={styles.quoteLineClientNote}>
                          <strong>Note:</strong> {clientNote}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          {/* Overlay scrollbars stay invisible until something is scrolled, so
              a capped list needs to say out loud that there is more in it. */}
          {itemsAreCapped ? (
            <p className={styles.quoteItemsScrollNote}>
              {lines.length} items. Scroll inside the list to see them all.
            </p>
          ) : null}
        </div>
      </section>

      <div className={styles.quoteViewTwoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>Quote Totals</div>
          <div className={styles.panelBody}>
            <div className={`${styles.totals} ${styles.publicTotalsBreakdown}`}>
              {costSummaryRows.map((row) => (
                <div className={styles.publicCostRow} key={row.label}>
                  <span>
                    <strong>{row.label}</strong>
                    <small>{row.description}</small>
                  </span>
                  <strong>{formatMoney(row.amount, quote.currency)}</strong>
                </div>
              ))}
              <div className={styles.publicTotalFocus}>
                <div className={styles.totalRow}><span>Subtotal ex GST</span><strong>{formatMoney(quote.subtotal_ex_gst, quote.currency)}</strong></div>
                <div className={styles.totalRow}><span>GST</span><strong>{formatMoney(quote.gst_amount, quote.currency)}</strong></div>
                <div className={`${styles.totalRow} ${styles.totalRowGrand}`}><span>Total inc GST</span><strong>{formatMoney(quote.total_inc_gst, quote.currency)}</strong></div>
              </div>
            </div>
            {attachments.length ? (
              <button type="button" className={styles.attachmentModalButton} onClick={() => setIsAttachmentsOpen(true)}>
                Attachments ({attachments.length})
              </button>
            ) : null}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>Your Response</div>
          <div className={styles.panelBody}>
            {isLocked ? (
              <p className={styles.message}>
                This quote has been {quote.status}. {quote.status === "approved" ? "An order has been created for Perth Cabinet Doors to track your line items." : "Perth Cabinet Doors has received your response."}
              </p>
            ) : (
              <div className={styles.formStack}>
                <label className={styles.label}>
                  Your name
                  <input className={styles.input} value={clientName} onChange={(event) => setClientName(event.target.value)} />
                </label>
                <label className={styles.label}>
                  Note
                  <textarea className={styles.textarea} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
                <label className={`${styles.publicPaymentAck}`}>
                  <input
                    type="checkbox"
                    checked={paymentAcknowledged}
                    onChange={(event) => setPaymentAcknowledged(event.target.checked)}
                  />
                  <span>
                    {depositRequired
                      ? `I acknowledge that a ${depositPercent.toFixed(2)}% deposit (${formatMoney(depositAmount, quote.currency)}) is required before this quote is accepted.`
                      : "I acknowledge that no deposit is required at acceptance for this quote."}
                  </span>
                </label>
                {/* APPROVED, NOT PAID, AND STILL ABLE TO FINISH.
                    Says where they actually stand rather than leaving them to
                    guess from a form that looks untouched, and states the
                    consequence in the same words the reminder emails use. The
                    buttons below stay live: approving again takes them straight
                    back to the payment page. */}
                {awaitingDeposit ? (
                  <p className={styles.depositPending}>
                    You approved this quote but the {formatMoney(depositAmount, quote.currency)} deposit has not
                    reached us, so it is not formally approved and no order has been created. Use the button
                    below to go back to the payment page and finish.
                  </p>
                ) : null}
                {message ? <p className={styles.message}>{message}</p> : null}
                {/* The only place the block is announced, sitting against the
                    button it disables. Marked rather than merely stated, so it
                    is not read as one more line of small print, and matching
                    the tiles it points at. Rejecting is unaffected: declining
                    should not require an address. */}
                {!detailsComplete ? (
                  <p className={styles.acceptBlocked}>
                    Add your {missingLabels.map((l) => l.toLowerCase()).join(", ")} in the Quote Summary above
                    to accept. Rejecting this quote does not require them.
                  </p>
                ) : null}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => submitAction("approved")}
                    disabled={isSubmitting || !detailsComplete}
                  >
                    {awaitingDeposit ? "Pay deposit" : "Approve quote"}
                  </button>
                  <button type="button" className={styles.buttonDanger} onClick={() => submitAction("rejected")} disabled={isSubmitting}>
                    Reject quote
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {quote.client_notes || quote.assumptions || quote.exclusions || quote.terms ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>Quote Notes</div>
          <div className={styles.panelBody}>
            <div className={styles.formStack}>
              {quote.client_notes ? <p className={styles.noteText}><strong>Notes:</strong> {quote.client_notes}</p> : null}
              {quote.assumptions ? <p className={styles.noteText}><strong>Assumptions:</strong> {quote.assumptions}</p> : null}
              {quote.exclusions ? <p className={styles.noteText}><strong>Exclusions:</strong> {quote.exclusions}</p> : null}
              {/* Terms are the one note that carries formatting: bold, lists,
                  the lot. The markup is written by the terms editor and passes
                  through the whitelist in lib/pcd-terms-html.js on save, which
                  is what makes it safe to render here. toTermsHtml also carries
                  the older plain-text terms across, so a quote written before
                  formatting existed still reads with its line breaks. */}
              {quote.terms ? (
                <div className={styles.noteText}>
                  <strong>Terms:</strong>
                  <div
                    className="pcd-rich-text"
                    dangerouslySetInnerHTML={{ __html: toTermsHtml(quote.terms) }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {isAttachmentsOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="quote-attachments-title">
          <div className={styles.attachmentModal}>
            <div className={styles.attachmentModalHeader}>
              <div>
                <span>Quote files</span>
                <h2 id="quote-attachments-title">Quote Attachments</h2>
                <p>Download or open the files shared with this quote.</p>
              </div>
            </div>
            <div className={styles.attachmentModalBody}>
              <table className={styles.attachmentModalTable}>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((attachment) => (
                    <tr key={attachment.id}>
                      <td>{attachment.file_name}</td>
                      <td>{attachment.file_type || "File"}</td>
                      <td>{attachment.file_size ? `${(Number(attachment.file_size) / 1024 / 1024).toFixed(1)} MB` : "-"}</td>
                      <td>{attachment.created_at ? new Date(attachment.created_at).toLocaleString("en-AU") : "-"}</td>
                      <td>
                        <a className={styles.buttonSecondary} href={attachment.file_url} target="_blank" rel="noreferrer">
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.attachmentModalFooter}>
              <button type="button" className={styles.buttonSecondary} onClick={() => setIsAttachmentsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewImage ? (
        <div
          className={styles.imagePreviewOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={`${previewImage.label} preview`}
          onClick={() => setPreviewImage(null)}
        >
          <div className={styles.imagePreviewModal} onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.imagePreviewClose} onClick={() => setPreviewImage(null)}>
              Close
            </button>
            <img src={previewImage.src} alt={previewImage.label} />
            <p>{previewImage.label}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

