"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { edgeImageSrc, profileImageSrc } from "@/lib/pcd-profile-images";
import {
  boardGroupKey,
  boardGroupSpec,
  isHardwareLine,
  lineFrontProfile,
  lineDisplayName,
  lineEdgeLines,
  lineSubLines,
} from "../../../lib/pcd-quote-line-display";
import { bandedEdgesText } from "../../../lib/pcd-line-details";
import { hingeCustomerLines } from "../../../lib/pcd-hinges";
import { useSearchParams } from "next/navigation";
import { formatMoney, toNumber } from "../../../lib/pcd-quote-utils";
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

// A status prints on its own in the summary, where it is the start of a line
// and not the middle of a sentence, so it takes a capital. The database keeps
// it lower case because that is what the rest of the app compares against.
function capitalise(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "-";
}

function lineValue(value) {
  return value || "N/A";
}

function isBaseCabinetLine(line) {
  return line?.product_type === "base_cabinet";
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

// The photo for a front profile, from the one resolver that knows where the
// library actually sits. This used to build the path by hand and left out the
// brand folder, so every profile a customer clicked opened a broken image.
function profileOptionSrc(profileType, label) {
  return profileImageSrc(profileType, label) || "";
}

// THE CELL THE CUSTOMER READS FIRST.
//
// It used to print the product type and then the material, the finish and the
// colour, each falling back to "N/A". On a hardware line all three are blank
// because a hinge has no board, so the row read "Hardware" and three N/As and
// never said WHICH hinge, even though the line knew its name all along. What a
// line is called and what sits under it is now one shared answer. See
// lib/pcd-quote-line-display.js.
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


// SIZE, WITH ITS UNITS IN THE CELL.
//
// A column heading is read once and a cell is read eight times, so which way
// round the numbers go and what they are measured in belong in the cell.
const SIZE_MARKS = ["H", "W", "D"];

// WHAT THE LINE IS, said the same way in both views and in the PDF.
//
// A hardware line was reading as the bare word "Hardware" and nothing else,
// because lineHeading names the KIND and these lines carry no kind. Which
// hinge it was sat in product_name, printed on the PDF and shown nowhere on
// the page the customer actually opens. Both now read lineSubLines, which is
// the one describer, so the two documents cannot say different things.
//
// Nothing is added to a board line: its material, finish and colour are said
// once at the top of its group and repeating them on every row is what the
// grouping was built to stop.
// A BOLD LABEL, THEN EVERYTHING ELSE UNDER IT, the way the PDF sets a cell.
//
// The note used to be a column with a button that opened a dialog: three
// clicks and a layer over the page to read one sentence, on the one screen a
// customer is meant to check and answer. It reads under the line it is about
// now, in the same quiet type as the rest of the detail.
//
// Material, finish and colour are NOT here on a board line. They are said
// once at the top of the group, which is the whole reason the lines are
// grouped, so only a hardware line gets its detail on the row.
function ItemName({ line }) {
  const detail = isHardwareLine(line)
    ? lineSubLines(line)
        .filter((part) => part.value)
        // The item is a name and stands on its own. Anything else is a fact
        // about the line and has to say what it is.
        .map((part) => ({ key: part.key, text: part.key === "item" ? part.value : `${part.label} ${part.value}` }))
    : [];

  const note = String(line.client_note || "").trim();
  if (note) detail.push({ key: "note", text: `Note: ${note}` });

  return (
    <>
      <span className={styles.quoteItemName}>{lineDisplayName(line)}</span>
      {detail.map((part) => (
        <span className={styles.quoteItemDetail} key={part.key}>{part.text}</span>
      ))}
    </>
  );
}

function SizeText({ line }) {
  const text = quoteLineSizeText(line);
  if (!text) return <span className={styles.quoteItemNo}>-</span>;
  return (
    <span className={styles.sizeCell}>
      {text.split(" x ").map((part, index) => (
        <span key={index}>
          {index ? " x " : ""}
          {part}
          {SIZE_MARKS[index] ? <span className={styles.sizeUnit}> ({SIZE_MARKS[index]})</span> : null}
        </span>
      ))}
      <span className={styles.sizeUnit}> mm</span>
    </span>
  );
}

// THE COLUMNS A GROUP STILL NEEDS.
//
// A column is dropped when no line in the group has anything to put in it,
// which is the difference between "the question does not arise" and "we have
// not filled it in". Hinges is the exception and is always drawn: not drilling
// is a fact a customer has to be told, the same as drilling.
const CONFIG_COLUMNS = [
  {
    key: "edge",
    label: "Edge profile",
    // The profile and which edges are banded. A Laminex board has no edge
    // profile to pick and still has banded edges, so either one earns the column.
    has: (line) => lineEdgeLines(line).length > 0,
    cell: (line, onPreview) => (
      <span className={styles.quoteItemDetailStack}>
        {String(line.edge_mould || "").trim() ? (
          <PreviewName src={edgeOptionSrc(line.edge_mould)} label={line.edge_mould} onPreview={onPreview} />
        ) : null}
        {bandedEdgesText(line.banded_edges) ? <span>{bandedEdgesText(line.banded_edges)}</span> : null}
      </span>
    ),
  },
  {
    key: "profile",
    label: "Profile",
    has: (line) => Boolean(lineFrontProfile(line)),
    cell: (line, onPreview) =>
      lineFrontProfile(line) ? (
        <PreviewName
          src={profileOptionSrc(line.profile_type, line.profile)}
          label={line.profile}
          onPreview={onPreview}
        />
      ) : (
        <span className={styles.quoteItemNo}>-</span>
      ),
  },
  {
    key: "hinges",
    label: "Hinges",
    has: () => true,
    // The drilling in full: how many, which side, and where the cups go. It is
    // the one thing on a door that cannot be checked once it is made, so the
    // customer gets all of it here and the same words on the PDF.
    cell: (line) => (
      <span className={styles.quoteItemDetailStack}>
        {hingeCustomerLines(line).map((detail, index) => (
          <span
            key={detail}
            className={
              index ? undefined : line.hinge_holes ? styles.quoteItemYes : styles.quoteItemStated
            }
          >
            {detail}
          </span>
        ))}
      </span>
    ),
  },
];

// ONE GROUP A BOARD.
//
// Material, finish and colour decide the group, so a quote that is mostly one
// board reads as one block with three fewer columns in it. Hardware has no
// board at all and forms its own group with no specification columns.
//
// The line number stays the number the line has on the quote, not its position
// after grouping, so a customer ringing up about line seven and the office
// looking at line seven are looking at the same thing.
function groupLinesByBoard(lines) {
  const order = [];
  const map = new Map();

  lines.forEach((line, index) => {
    const numbered = { ...line, lineIndex: index + 1 };
    const key = boardGroupKey(line);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(numbered);
  });

  return order.map((key) => {
    const grouped = map.get(key);
    const first = grouped[0];
    const hardware = isHardwareLine(first);
    return {
      key,
      hardware,
      lines: grouped,
      title: hardware ? "Hardware" : String(first.colour || "").trim() || "Board not recorded",
      lifted: boardGroupSpec(first),
      colourSrc: hardware ? "" : colourSrcForLine(first),
      qty: grouped.reduce((sum, line) => sum + (Number(line.qty) || 0), 0),
      total: grouped.reduce((sum, line) => sum + toNumber(line.line_total_ex_gst), 0),
      cols: hardware ? [] : CONFIG_COLUMNS.filter((col) => grouped.some((line) => col.has(line))),
    };
  });
}

const DETAIL_INPUTS = {
  name: { label: "Full name", type: "text", placeholder: "Sarah Jones", autoComplete: "name" },
  email: { label: "Email", type: "email", placeholder: "sarah@example.com", autoComplete: "email" },
  mobile: { label: "Mobile", type: "tel", placeholder: "0412 345 678", autoComplete: "tel" },
  street: { label: "Street address", type: "text", placeholder: "14 Rokeby Road", autoComplete: "address-line1" },
  suburb: { label: "Suburb", type: "text", placeholder: "Subiaco", autoComplete: "address-level2" },
  postcode: { label: "Postcode", type: "text", placeholder: "6008", autoComplete: "postal-code", inputMode: "numeric" },
};

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
        <span>
          {label}
          {!locked && value && !missing ? (
            <button type="button" className={styles.detailEdit} onClick={onOpen}>Change</button>
          ) : null}
        </span>
        <strong>
          {missing && !locked ? (
            <button type="button" className={styles.detailAdd} onClick={onOpen}>
              Add {label.toLowerCase()}
            </button>
          ) : (
            value || "-"
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
  // An expired quote is not a broken link, and the page must not read like one.
  // Somebody who let a quote run out did nothing wrong and is owed a heading
  // that says what happened rather than "Quote not found".
  const [isExpired, setIsExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [responseOnScreen, setResponseOnScreen] = useState(false);
  const [paymentAcknowledged, setPaymentAcknowledged] = useState(false);
  // The details we must hold before this can be accepted. Pre-filled from the
  // customer record by the get route, and edited in the summary panel where
  // the customer can already see what is missing.
  const [details, setDetails] = useState({});
  // When we say the job would happen, worked out by the server: the pair of
  // dates, how long the job runs, and the one sentence that states how long
  // they hold for. Null on a quote that suggests no dates, which is most older
  // ones, and the panel is then not rendered at all.
  const [schedule, setSchedule] = useState(null);
  // What they have already paid us, worked out by the server: the lines, what
  // it comes to, and what is left to pay. Null when they hold nothing, and the
  // block is then not rendered at all. See lib/pcd-customer-credits.js.
  const [credit, setCredit] = useState(null);
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
  const lineGroups = useMemo(() => groupLinesByBoard(lines), [lines]);
  const attachments = useMemo(() => sortedAttachments(quote), [quote]);
  // The two renderings of the same lines each get their own cap, because a
  // table row and a mobile card are nothing like the same height.
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
  // THE DEPOSIT IS WHAT THEY PAY, not a share of a total they are not paying.
  // A credit is money we already have, so it comes off the deposit and the
  // figure on this page has to be the reduced one or the payment page will ask
  // for something different than the quote promised. The server works it out;
  // see depositAmountForQuote in lib/pcd-quote-acceptance.js.
  const depositFull = depositRequired ? Number((toNumber(quote?.total_inc_gst) * depositPercent / 100).toFixed(2)) : 0;
  const depositAmount = credit ? toNumber(credit.depositAfter) : depositFull;

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
          setIsExpired(Boolean(payload.expired));
          return;
        }
        setQuote(payload.quote);
        setDetails(payload.details || {});
        setSchedule(payload.schedule || null);
        setCredit(payload.credit || null);
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

  // THE RESPONSE BAR.
  //
  // A twenty line order puts the buttons well below the fold, and a customer
  // who does not scroll to the bottom never answers. The bar sits on the
  // bottom edge until the response section is actually on screen and then
  // takes itself away. It accepts nothing: it carries you to the form,
  // because accepting still needs a name, a number and a tick.
  useEffect(() => {
    if (isLoading || !quote) return undefined;
    const target = document.getElementById("quote-response");
    if (!target || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => setResponseOnScreen(entries[0].isIntersecting),
      { threshold: 0.15 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isLoading, quote]);

  function scrollToResponse() {
    const target = document.getElementById("quote-response");
    if (target) target.scrollIntoView({ block: "start" });
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
        <div className={styles.panelHeader}>{isExpired ? "This quote has expired" : "Quote"}</div>
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
            <div className={styles.summaryItem}><span>Status</span><strong>{capitalise(quote.status)}</strong></div>
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

      {/* WHEN THE JOB WOULD HAPPEN.

          Its own panel rather than two more tiles in the summary above, because
          it carries a condition and a condition has to be read, not skimmed
          past in a grid of fifteen values.

          The dates are shown whether or not the hold has lapsed. Taking them
          off the page once the window passes would leave the customer with less
          than they were sent and no idea what they had been offered; the
          sentence underneath changes instead, which is the honest version.

          Said once. There is no repeat of this next to the Approve button and
          no second warning at the top of the page. */}
      {schedule ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>Suggested Dates</div>
          <div className={styles.panelBody}>
            <div className={styles.quoteViewSummaryGrid}>
              <div className={styles.summaryItem}><span>Suggested start</span><strong>{schedule.startWords}</strong></div>
              <div className={styles.summaryItem}><span>Suggested completion</span><strong>{schedule.completionWords}</strong></div>
              <div className={styles.summaryItem}>
                <span>On the bench</span>
                <strong>{schedule.days} {schedule.days === 1 ? "day" : "days"}</strong>
              </div>
            </div>
            <p className={schedule.state === "lapsed" ? styles.scheduleNoticeLapsed : styles.scheduleNotice}>
              {schedule.state === "lapsed"
                ? `This quote was sent more than ${schedule.holdWindow} ago, so these dates are no longer held. If you approve it, we will confirm new dates for your job.`
                : schedule.notice}
            </p>
          </div>
        </section>
      ) : null}

      {/* THE LIST IS GROUPED BY THE BOARD IT IS MADE FROM.
          A quote is a handful of boards used over and over, so the board is
          said once at the top of its group and its three columns come out of
          the rows underneath. What is left in a row is what actually differs
          between one line and the next. */}
      {lineGroups.map((group) => (
        <section className={`${styles.panel} ${styles.lineGroup}`} key={group.key}>
          <div className={styles.lineGroupHead}>
            {group.colourSrc ? (
              <button
                type="button"
                className={styles.lineGroupSwatch}
                aria-label={`View ${group.title}`}
                onClick={() => setPreviewImage({ src: group.colourSrc, label: group.title })}
              >
                <img alt="" src={group.colourSrc} onError={(event) => { event.currentTarget.style.display = "none"; }} />
              </button>
            ) : (
              <span className={styles.lineGroupSwatch} aria-hidden="true" />
            )}
            <div className={styles.lineGroupNames}>
              <span className={styles.lineGroupName}>{group.title}</span>
              {group.lifted.length ? (
                <dl className={styles.lineGroupPairs}>
                  {group.lifted.map((pair) => (
                    <div key={pair[0]}>
                      <dt>{pair[0]}</dt>
                      <dd>{pair[1]}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            <span className={styles.lineGroupSum}>
              {group.lines.length} {group.lines.length === 1 ? "line" : "lines"}, {group.qty} items
              <b>{formatMoney(group.total, quote.currency)}</b>
            </span>
          </div>

          <div className={`${styles.tableWrap} ${styles.quoteItemsDesktopTable}`}>
            <table className={`${styles.table} ${styles.quoteItemsPublicTable}`}>
              <thead>
                <tr>
                  <th data-align="center">#</th>
                  <th>Item</th>
                  <th data-align="center" data-key="start">Size H x W</th>
                  <th data-align="center" data-key="end">Qty</th>
                  {group.cols.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                  <th data-align="center" data-zone>Unit cost</th>
                  <th data-align="center">Total ex GST</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line) => (
                  <tr key={line.id || line.lineIndex}>
                    <td data-align="center">
                      <span className={styles.quoteItemNumber}>{line.lineIndex}</span>
                    </td>
                    <td>
                      <ItemName line={line} />
                    </td>
                    <td data-align="center" data-key="start">
                      <SizeText line={line} />
                    </td>
                    <td data-align="center" data-key="end">{line.qty || "1"}</td>
                    {group.cols.map((col) => (
                      <td key={col.key}>{col.cell(line, setPreviewImage)}</td>
                    ))}
                    <td data-align="center" data-zone>{formatMoney(line.unit_price_ex_gst, quote.currency)}</td>
                    <td data-align="center">{formatMoney(line.line_total_ex_gst, quote.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* THE SAME GROUP ON A PHONE.
              The board is still said once at the top, and each line becomes a
              block with its size and quantity first, because that is what a
              customer checks, then the rest of what makes it. */}
          <div className={styles.quoteItemsMobileList}>
            {group.lines.map((line) => (
              <article className={styles.quoteItemMobileCard} key={line.id || `m-${line.lineIndex}`}>
                <div className={styles.quoteItemMobileHeader}>
                  <span className={styles.quoteItemNumber}>{line.lineIndex}</span>
                  <p><ItemName line={line} /></p>
                </div>
                <div className={styles.quoteItemMobileKey}>
                  <div>
                    <span>Size H x W</span>
                    <strong><SizeText line={line} /></strong>
                  </div>
                  <div>
                    <span>Qty</span>
                    <strong>{line.qty || "1"}</strong>
                  </div>
                </div>
                {group.cols.length ? (
                  <dl className={styles.specGrid}>
                    {group.cols.map((col) => (
                      <div className={styles.specSlot} key={col.key}>
                        <dt>{col.label}</dt>
                        <dd>{col.cell(line, setPreviewImage)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <div className={styles.quoteItemMobileFigures}>
                  <div>
                    <span>Unit</span>
                    <strong>{formatMoney(line.unit_price_ex_gst, quote.currency)}</strong>
                  </div>
                  <div>
                    <span>Total ex GST</span>
                    <strong>{formatMoney(line.line_total_ex_gst, quote.currency)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className={styles.quoteViewTwoColumn}>
        <section className={styles.panel} id="quote-response">
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

              {/* MONEY ALREADY RECEIVED, UNDER THE TOTAL. NOT A DISCOUNT ROW.
                  A credit in the cost breakdown above would land before GST and
                  hand back more than the customer paid us, and it would break
                  the line check on every tax invoice for the job that follows.
                  Under the total it is what it actually is: the quote is the
                  quote, and this much of it is already paid for. */}
              {credit ? (
                <div className={styles.publicCreditBlock}>
                  {credit.lines.map((line) => (
                    <div className={styles.publicCreditRow} key={line.label}>
                      <span>{line.label}</span>
                      <strong>{formatMoney(-line.amount, quote.currency)}</strong>
                    </div>
                  ))}
                  <div className={styles.publicCreditPayable}>
                    <span>Amount payable</span>
                    <strong>{formatMoney(credit.payable, quote.currency)}</strong>
                  </div>
                  {credit.sentence ? <p className={styles.publicCreditNote}>{credit.sentence}</p> : null}
                </div>
              ) : null}
            </div>
            {attachments.length ? (
              <button type="button" className={styles.attachmentModalButton} onClick={() => setIsAttachmentsOpen(true)}>
                Attachments ({attachments.length})
              </button>
            ) : null}
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

      {!isLocked && !isExpired && !responseOnScreen ? (
        <div className={styles.responseBar}>
          <div className={styles.responseBarInner}>
            <div className={styles.responseBarText}>
              {/* What they pay, not what the job costs. A bar showing the full
                  total on a quote with a credit on it is the one number they
                  would quote back at us. */}
              <span>{credit ? "Amount payable" : "Total inc GST"}</span>
              <strong>{formatMoney(credit ? credit.payable : quote.total_inc_gst, quote.currency)}</strong>
            </div>
            <div className={styles.responseBarButtons}>
              <button type="button" className={styles.buttonSecondary} onClick={scrollToResponse}>
                Decline
              </button>
              <button type="button" className={styles.button} onClick={scrollToResponse}>
                Go to accept
              </button>
            </div>
          </div>
        </div>
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

