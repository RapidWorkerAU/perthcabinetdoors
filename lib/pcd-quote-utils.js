import { normaliseMaterialKey } from "./pcd-materials";
import { roundMoney } from "./pcd-money";
// The hinge count used for PRICING has to be the same one used for working out
// where the cups go, or a door is priced for three and drilled for two.
import { hingeCount, hingePositionLines, holeTypeOf, normaliseHingeSide, readMiddles } from "./pcd-hinges";
import { lineMakeDetails } from "./pcd-line-details";

export const GST_RATE = 0.1;

// The values used when the settings row genuinely cannot be read. They are a
// last resort, not a source of wording or policy.
//
// WHY THE TERMS ARE BLANK. quote_terms used to hold the old "valid for 14 days"
// wording, which made this constant a live source of customer-facing text: any
// path that fell back to it reintroduced terms that had been deleted in
// settings, on a quote nobody had chosen them for. Terms are a business
// decision, so there is no sensible built-in for them. Blank means a quote with
// no terms prints no terms, which is honest and visible, rather than quietly
// printing wording nobody wrote.
export const DEFAULT_BUSINESS_DEFAULTS = {
  currency: "AUD",
  gst_rate: GST_RATE,
  markup_percent: 40,
  hinge_drilling_unit_cost_ex_gst: 10,
  quote_terms: "",
  variation_terms: "",
  // How long a quote stands for. UNLIKE the terms above this does have a
  // built-in, because it is not wording, it is a clock: the expiry reminder, the
  // archive job and the lead conversion report all read it, and a blank would
  // mean either expiring everything overnight or never expiring anything. 30
  // matches what the terms say and what lead conversion has always assumed.
  quote_valid_days: 30,
  // How long a quote's SUGGESTED start and completion dates hold for, counted
  // in hours from when it was sent. Separate from quote_valid_days because they
  // answer different questions: the quote can still be good at the old price
  // long after the bench we had free for it has been given to somebody else.
  // 48 is what the quote page and the PDF say.
  schedule_hold_hours: 48,
  // Signed onto every reply sent from the customer desk. Blank means no
  // signature, the same rule the terms follow: a business that has not written
  // one sends none rather than wording nobody chose.
  email_signature_html: "",
  worker_hourly_rate: 85,
  // Workshop labour hours allowed PER CABINET (audit p2-6). Each base-cabinet
  // line contributes labour_hours_per_cabinet × qty to the quote's labour total.
  // A starting estimate — adjust in Business Defaults.
  labour_hours_per_cabinet: 1.5,
  // Hours to make ONE door, drawer front or panel in house from decorative
  // board. Every such line adds this × its qty to the quote's labour hours,
  // alongside labour_hours_per_cabinet above. See calculateQuoteLine.
  inhouse_processing_hours_per_piece: 0,
  // ABS edging per lineal metre, ex GST, our cost plus our uplift. Charged on
  // the edges of every decorative board line. See edgingTotals.
  abs_edging_cost_per_lineal_metre_ex_gst: 0,
  // Quote-level costs a NEW quote starts with. Each one prefills the box of the
  // same name on the quote, which stays editable per job. They start at 0, so
  // until they are filled in a new quote looks exactly as it does today.
  //
  // default_installation_cost_ex_gst is the box labelled "Consumables". The
  // quote column is installation_cost_ex_gst and these names are kept in step
  // with it deliberately, so the mapping is one word either side.
  default_travel_cost_ex_gst: 0,
  default_delivery_cost_ex_gst: 0,
  default_installation_cost_ex_gst: 0,
  default_painting_cost_ex_gst: 0,
  default_glass_cost_ex_gst: 0,
  default_removal_cost_ex_gst: 0,
  // How the saw cuts, read when working out how many boards a quote needs.
  // Here rather than as constants because they change when the blade or the
  // supplier changes, which is a thing to edit on a screen. A zero trim is a
  // real answer, so unlike the hourly rate neither of these inherits when
  // zero. See lib/pcd-board-order.js.
  saw_kerf_mm: 3.2,
  board_edge_trim_mm: 10,
  // The flat Perth metro delivery charge on an order bought on the website, ex
  // GST. A web order has nobody to type a delivery figure in, so it is set here
  // like every other rate. See lib/pcd-shop.js.
  web_delivery_metro_ex_gst: 45,
};

// The quote box each default fills, and the ONE place that mapping is written.
// Every path that makes a quote reads it from here, so a default can never
// apply on one route and quietly not on another.
export const QUOTE_COST_DEFAULT_BY_FIELD = {
  travel_cost_ex_gst: "default_travel_cost_ex_gst",
  delivery_cost_ex_gst: "default_delivery_cost_ex_gst",
  installation_cost_ex_gst: "default_installation_cost_ex_gst",
  painting_cost_ex_gst: "default_painting_cost_ex_gst",
  glass_cost_ex_gst: "default_glass_cost_ex_gst",
  removal_cost_ex_gst: "default_removal_cost_ex_gst",
};

export const PROJECT_LINE_STATUSES = [
  "Not Ordered",
  "Ordered",
  "Received",
  "Checked",
  "Installed",
  "Complete",
  "Issue Follow-Up",
];

export const PROJECT_STATUSES = ["active", "on_hold", "complete", "cancelled"];

// pending_deposit first, because that is where an order that needs a deposit
// begins. See lib/pcd-order-deposit.js for what promotes it to active.
export const ORDER_STATUSES = ["pending_deposit", "active", "on_hold", "complete", "cancelled"];

// WHAT A LIST MAY BE FILTERED BY, which is deliberately not what a dropdown may
// SET. Archiving records the status it is archiving from so a restore is exact,
// so it has to go through the archive route rather than through somebody
// choosing it from the status dropdown and losing that.
export const ORDER_FILTER_STATUSES = [...ORDER_STATUSES, "archived"];
// awaiting_deposit sits between viewed and approved: the customer has said yes
// and the deposit has not arrived, so NOTHING has been created. It is not an
// approval, it has no order, and it is deliberately invisible to production and
// to the financials. See lib/pcd-deposit-gate.js.
export const QUOTE_STATUSES = ["draft", "sent", "viewed", "awaiting_deposit", "approved", "rejected"];
export const QUOTE_FILTER_STATUSES = [...QUOTE_STATUSES, "archived"];

export const ORDER_LINE_STATUSES = [
  "Not Ordered",
  "Ordered",
  "Received",
  "Checked",
  "Installed",
  "Complete",
];

export const ORDER_PRODUCTION_STAGES = [
  "Not Started",
  "Materials Ready",
  "Cutting",
  "Edging",
  "Profiling",
  "Thermolaminating",
  "Drilling",
  "Quality Check",
  "Packed",
  "Ready for Install",
  "Complete",
];

export function toNumber(value, fallback = 0) {
  if (value === "" || value === null || typeof value === "undefined") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Several money columns are `not null default 0` in Postgres, so a row that was
// never given a value is indistinguishable from one deliberately set to zero —
// and toNumber(0, fallback) returns 0, not the fallback. For fields where zero
// is not a real business value (a worker does not cost $0/hour), zero has to
// mean "inherit the global default", or every quote created before the field
// was populated silently prices its labour at nothing.
//
// Only use this for fields where zero is genuinely meaningless. Line markup
// deliberately does NOT use it: 0% markup is a real choice on a pass-through
// item, and overriding it here would quietly reprice work that was quoted
// correctly.
export function inheritWhenZero(value, fallback = 0) {
  const number = toNumber(value, fallback);
  return number === 0 ? toNumber(fallback) : number;
}

// Re-exported rather than written again: every module that holds a figure
// rounds it the same way, and there is one place that decides how.
// See lib/pcd-money.js.
export { roundMoney };

// Every settings field the app is allowed to see, in one shape.
//
// This DROPS keys it does not list, which is easy to forget: a column added to
// pcd_business_defaults is invisible to the whole application until it is added
// here as well as to businessDefaultsToDbRow and the settings screen. That is
// exactly how the drawer runner rates ended up unreachable — they existed as
// constants, nothing carried them through, so every quote used the built-in
// number no matter what was configured.
export function normalizeBusinessDefaults(defaults = {}) {
  const text = (value, fallback) => String(value ?? fallback ?? "");
  return {
    currency: String(defaults.currency ?? defaults.currency_code ?? DEFAULT_BUSINESS_DEFAULTS.currency).toUpperCase(),
    gst_rate: toNumber(defaults.gst_rate ?? defaults.gstRate, DEFAULT_BUSINESS_DEFAULTS.gst_rate),
    markup_percent: toNumber(defaults.markup_percent ?? defaults.markupPercent, DEFAULT_BUSINESS_DEFAULTS.markup_percent),
    hinge_drilling_unit_cost_ex_gst: toNumber(
      defaults.hinge_drilling_unit_cost_ex_gst ?? defaults.hingeDrillingUnitCostExGst,
      DEFAULT_BUSINESS_DEFAULTS.hinge_drilling_unit_cost_ex_gst
    ),
    // Blank is a real answer for both of these: it means "this business has not
    // written terms", and a quote then carries none. It must never silently
    // become wording from a constant.
    quote_terms: text(defaults.quote_terms ?? defaults.quoteTerms, DEFAULT_BUSINESS_DEFAULTS.quote_terms),
    variation_terms: text(defaults.variation_terms ?? defaults.variationTerms, DEFAULT_BUSINESS_DEFAULTS.variation_terms),
    // A stored 0 or a blank means the field has never been filled in, not that a
    // quote is good for no days. Left alone it would expire every quote in the
    // system on the pass after it was saved, so it inherits, the same rule the
    // hourly rate follows above.
    // Whole days, because a quote good for 30.5 days has no meaning and the
    // column will not take it.
    quote_valid_days: Math.round(
      inheritWhenZero(
        defaults.quote_valid_days ?? defaults.quoteValidDays,
        DEFAULT_BUSINESS_DEFAULTS.quote_valid_days
      )
    ),
    // A stored 0 means nobody has set a window, not that the dates hold for no
    // time at all. Left alone it would tell every customer their dates had
    // already lapsed, so it inherits, the same rule quote_valid_days follows.
    schedule_hold_hours: Math.round(
      inheritWhenZero(
        defaults.schedule_hold_hours ?? defaults.scheduleHoldHours,
        DEFAULT_BUSINESS_DEFAULTS.schedule_hold_hours
      )
    ),
    email_signature_html: text(defaults.email_signature_html, DEFAULT_BUSINESS_DEFAULTS.email_signature_html),
    // A stored 0 here means the field was never filled in, not that a worker
    // costs nothing an hour, so it inherits. Without this a single 0 saved in
    // settings prices the labour on every quote in the system at nothing, with
    // no warning anywhere. Same reasoning as inheritWhenZero above, applied one
    // level earlier so the whole app is covered rather than each caller.
    worker_hourly_rate: inheritWhenZero(
      defaults.worker_hourly_rate ?? defaults.workerHourlyRate,
      DEFAULT_BUSINESS_DEFAULTS.worker_hourly_rate
    ),
    labour_hours_per_cabinet: toNumber(
      defaults.labour_hours_per_cabinet ?? defaults.labourHoursPerCabinet,
      DEFAULT_BUSINESS_DEFAULTS.labour_hours_per_cabinet
    ),
    inhouse_processing_hours_per_piece: toNumber(
      defaults.inhouse_processing_hours_per_piece,
      DEFAULT_BUSINESS_DEFAULTS.inhouse_processing_hours_per_piece
    ),
    abs_edging_cost_per_lineal_metre_ex_gst: toNumber(
      defaults.abs_edging_cost_per_lineal_metre_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.abs_edging_cost_per_lineal_metre_ex_gst
    ),
    default_travel_cost_ex_gst: toNumber(
      defaults.default_travel_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_travel_cost_ex_gst
    ),
    default_delivery_cost_ex_gst: toNumber(
      defaults.default_delivery_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_delivery_cost_ex_gst
    ),
    default_installation_cost_ex_gst: toNumber(
      defaults.default_installation_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_installation_cost_ex_gst
    ),
    default_painting_cost_ex_gst: toNumber(
      defaults.default_painting_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_painting_cost_ex_gst
    ),
    default_glass_cost_ex_gst: toNumber(
      defaults.default_glass_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_glass_cost_ex_gst
    ),
    default_removal_cost_ex_gst: toNumber(
      defaults.default_removal_cost_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.default_removal_cost_ex_gst
    ),
    saw_kerf_mm: toNumber(
      defaults.saw_kerf_mm ?? defaults.sawKerfMm,
      DEFAULT_BUSINESS_DEFAULTS.saw_kerf_mm
    ),
    board_edge_trim_mm: toNumber(
      defaults.board_edge_trim_mm ?? defaults.boardEdgeTrimMm,
      DEFAULT_BUSINESS_DEFAULTS.board_edge_trim_mm
    ),
    // A zero is a real answer here: free metro delivery is a thing a business
    // can decide on, so unlike the hourly rate it does not inherit.
    web_delivery_metro_ex_gst: toNumber(
      defaults.web_delivery_metro_ex_gst,
      DEFAULT_BUSINESS_DEFAULTS.web_delivery_metro_ex_gst
    ),
  };
}

// The quote-level costs a new quote starts with, ready to spread onto an insert.
export function quoteCostDefaults(defaults = {}) {
  const normalized = normalizeBusinessDefaults(defaults);
  const costs = {};
  for (const [field, key] of Object.entries(QUOTE_COST_DEFAULT_BY_FIELD)) {
    costs[field] = toNumber(normalized[key]);
  }
  return costs;
}

// Fill in only the costs the caller has not decided for itself.
//
// A 0 the caller sent is a real answer and is kept: someone who clears the
// delivery box on a quote means nothing for delivery, and a default must never
// put it back. Only an absent field inherits.
export function applyQuoteCostDefaults(payload = {}, defaults = {}) {
  const costs = quoteCostDefaults(defaults);
  const filled = { ...payload };
  for (const field of Object.keys(QUOTE_COST_DEFAULT_BY_FIELD)) {
    const sent = payload[field];
    if (sent === undefined || sent === null || sent === "") filled[field] = costs[field];
  }
  return filled;
}

// ── Board we cut and edge ourselves ──────────────────────────────────────────
//
// Two numbers on a quote come off the same question: which lines are decorative
// board that our own workshop makes. The in-house processing time is charged per
// piece of it, and the ABS edging is charged per lineal metre of its edges.
// Both read this, so a line can never count for one and not the other.
//
// Hardware carries no board at all, and a benchtop is priced from the benchtop
// material list rather than the board library, so neither counts however their
// material column reads. Everything else is decided by the material itself:
// decorative board in any thickness counts, thermolaminate and compact laminate
// do not.
const NON_BOARD_PRODUCT_TYPES = new Set(["hardware", "benchtop"]);
const BASE_CABINET_PRODUCT_TYPE = "base_cabinet";

function productTypeKey(line = {}) {
  return String(line.product_type ?? line.productType ?? "").trim().toLowerCase();
}

export function isDecorativeBoardLine(line = {}) {
  if (NON_BOARD_PRODUCT_TYPES.has(productTypeKey(line))) return false;
  return normaliseMaterialKey(line.material) === "decorative_board";
}

// Lineal metres of edge tape one line needs: the edges that are banded.
//
// Which edges get tape is a question every line can now answer, so it is
// charged the way it is made. Nobody said (null) still means all four, which is
// our standard and what every line was charged before the question existed. An
// empty list is a real answer, all four left raw, and charges nothing.
//
// A cabinet never carries banded_edges, so it keeps the old rule: a carcass is
// edged across its front, two sides plus the top and the bottom, which is
// exactly the perimeter of the face the line carries.
//
// The web shop charges its doors with exactly this, decided 11 September 2026,
// so a paid web order and the quote behind it can never disagree about edging.
export function edgingLinealMetres(line = {}) {
  if (!isDecorativeBoardLine(line)) return 0;
  const width = toNumber(line.width_mm ?? line.widthMm);
  const height = toNumber(line.height_mm ?? line.heightMm);
  const qty = Math.max(0, toNumber(line.qty, 1));
  if (!(width > 0) || !(height > 0) || !(qty > 0)) return 0;
  const banded = line.banded_edges ?? line.bandedEdges;
  if (!Array.isArray(banded)) return roundMoney(((2 * (width + height)) / 1000) * qty);
  const edges = new Set(banded.map((edge) => String(edge).trim().toLowerCase()));
  const across = (edges.has("top") ? width : 0) + (edges.has("bottom") ? width : 0);
  const down = (edges.has("left") ? height : 0) + (edges.has("right") ? height : 0);
  return roundMoney(((across + down) / 1000) * qty);
}

// The edging figure for a whole quote: the metres, the rate, what that comes to,
// and what is actually charged once any override is taken into account.
//
// The rate on the settings screen is our cost plus our uplift, ex GST, so this
// is charged as it stands and is never marked up again — the same as delivery
// or consumables.
export function edgingTotals(lines = [], defaults = {}, costs = {}) {
  const normalized = normalizeBusinessDefaults(defaults);
  const metres = roundMoney(
    (Array.isArray(lines) ? lines : []).reduce(
      (sum, line) => sum + toNumber(line.edging_lineal_metres ?? edgingLinealMetres(line)),
      0
    )
  );
  const ratePerLm = toNumber(normalized.abs_edging_cost_per_lineal_metre_ex_gst);
  const calculated = roundMoney(metres * ratePerLm);
  // Null, undefined and "" all mean "not overridden". A typed 0 is an override:
  // it says this job carries no edging cost, and a recalculation must not put
  // the calculated figure back.
  const rawOverride = costs.edging_cost_override_ex_gst ?? costs.edgingCostOverrideExGst;
  const overridden = rawOverride !== undefined && rawOverride !== null && rawOverride !== "";
  return {
    edging_lineal_metres: metres,
    edging_rate_per_lm_ex_gst: ratePerLm,
    edging_calculated_cost_ex_gst: calculated,
    edging_cost_override_ex_gst: overridden ? roundMoney(toNumber(rawOverride)) : null,
    edging_cost_ex_gst: overridden ? roundMoney(toNumber(rawOverride)) : calculated,
  };
}

// A measurement, or null. Blank is not zero here: a drilled door with no
// bottom measurement is one we set the positions on, and storing that as a 0
// would put a cup on the bottom edge of the door.
function hingeMm(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function calculateQuoteLine(line = {}, defaults = {}) {
  const calculationDefaults = normalizeBusinessDefaults(defaults);
  const qty = Math.max(0, toNumber(line.qty, 1));
  const productUnitCostExGst = toNumber(line.product_unit_cost_ex_gst ?? line.productUnitCostExGst);
  // Blank means "whatever the business default is", the same rule the labour
  // hours and the edging cost follow. A typed 0 is a real answer and stays 0.
  // `??` alone would not do it: an empty string is not null, and Number("") is
  // 0, so a line waiting for its default would have quietly been a 0% markup.
  const markupGiven = line.markup_percent ?? line.markupPercent;
  const markupPercent =
    markupGiven === "" || markupGiven === null || markupGiven === undefined
      ? toNumber(calculationDefaults.markup_percent)
      : toNumber(markupGiven, calculationDefaults.markup_percent);
  const hingeQty = hingeCount(line.hinge_qty ?? line.hingeQty);
  const hingeDrillingUnitCost = toNumber(
    line.hinge_drilling_unit_cost_ex_gst ?? line.hingeDrillingUnitCostExGst,
    calculationDefaults.hinge_drilling_unit_cost_ex_gst
  );
  const hingeDrillingCostExGst = line.hinge_holes || line.hingeHoles ? roundMoney(hingeQty * hingeDrillingUnitCost * qty) : 0;
  const hingeSupplyCostExGst = 0;
  const hingeDrillingQty = line.hinge_holes || line.hingeHoles ? hingeQty * qty : 0;
  const hingeSupplyQty = 0;
  // Cabinet labour (audit p2-6): every base-cabinet line carries the per-cabinet
  // business-default hours × its qty, recomputed here each calc so it always
  // reflects the current default. This feeds the DERIVED quote labour total,
  // never the manual base — see calculateQuoteTotals.
  const isCabinetLine = productTypeKey(line) === BASE_CABINET_PRODUCT_TYPE;
  // In-house processing time: the hours our workshop spends making one door,
  // drawer front or panel out of decorative board, × how many of them.
  //
  // A cabinet is excluded on purpose. Its per-cabinet hours above are already
  // the time to make the cabinet, so charging processing on top would bill the
  // same work twice. The doors and panels that go on it are their own lines and
  // are counted here, which is what makes the two add up rather than overlap.
  const processingLabourHours = !isCabinetLine && isDecorativeBoardLine(line)
    ? roundMoney(toNumber(calculationDefaults.inhouse_processing_hours_per_piece) * qty)
    : 0;
  // THIS HAS TO SURVIVE BEING RUN TWICE ON THE SAME LINE, and it did not.
  //
  // It used to return `line.labour_hours + processingLabourHours`, and the
  // result is written back to the same column it was read from. So every save
  // added the processing time again. Worse, calculateQuoteTotals calls this on
  // every line, so a line that had already been calculated once, as it has in
  // the Stage Quote preview and on every import, was counted twice before it
  // was ever saved. Two panels at half an hour each came out at two hours in
  // the preview and grew by another hour every time the quote was touched.
  //
  // The line now returns what is ON it, and the processing time stays reported
  // separately in processing_labour_hours. calculateQuoteTotals adds the two
  // together once. Running this ten times gives the same answer as running it
  // once, which is the only property that makes a derived figure trustworthy.
  // HOURS SOMEBODY ENTERED BEAT THE DEFAULT, which is what makes the field on
  // the cabinet's Boards tab mean anything. It was there, it saved, and this
  // then replaced it with the business default on every calculation, so the
  // configurator reported one number of hours and the quote billed another.
  //
  // A blank still means "use the configured default x how many of them", the
  // same rule the markup and the edging cost follow. A cabinet that has never
  // been opened, and every cabinet already in the database, is unaffected.
  // HOURS SOMEBODY ENTERED ON THE CABINET BEAT THE DEFAULT, which is what makes
  // the Labour hours field on the configurator's Boards tab mean anything. It
  // was there, it saved to the configuration, and this then replaced it with
  // the business default on every calculation, so the modal reported one figure
  // and the quote billed another.
  //
  // Read off the CONFIGURATION, never off line.labour_hours. That column is
  // this function's own output, so reading it back and multiplying would grow
  // the hours on every save. See the note below about surviving being run
  // twice: this is the same trap, and the configuration is what stays outside
  // the loop. Blank still means "the configured default", the same rule the
  // markup and the edging cost follow, so every cabinet already saved and every
  // cabinet imported from a design is unaffected.
  //
  // The figure is hours for ONE cabinet, the same unit as the default it
  // replaces, so the multiply by qty stays exactly where it was.
  const cabinetConfig = line.cabinet_config ?? line.cabinetConfig ?? null;
  const enteredCabinetHours = toNumber(cabinetConfig?.labour_hours ?? cabinetConfig?.labourHours);
  const hoursPerCabinet =
    enteredCabinetHours > 0 ? enteredCabinetHours : toNumber(calculationDefaults.labour_hours_per_cabinet);
  const labourHours = isCabinetLine
    ? roundMoney(hoursPerCabinet * qty)
    : roundMoney(toNumber(line.labour_hours ?? line.labourHours));
  const productCostExGst = roundMoney(productUnitCostExGst * qty);
  const markupAmountExGst = roundMoney(productCostExGst * (markupPercent / 100));
  const lineTotalExGst = roundMoney(productCostExGst + markupAmountExGst + hingeDrillingCostExGst + hingeSupplyCostExGst);

  return {
    product_type: line.product_type ?? line.productType ?? "",
    product_name: line.product_name ?? line.productName ?? "",
    description: line.description ?? "",
    material: line.material ?? "",
    supplier_name: line.supplier_name ?? line.supplierName ?? "",
    thickness: line.thickness ?? "",
    width_mm: line.width_mm ?? line.widthMm ?? null,
    height_mm: line.height_mm ?? line.heightMm ?? null,
    finish: line.finish ?? "",
    colour: line.colour ?? "",
    profile_type: line.profile_type ?? line.profileType ?? "",
    profile: line.profile ?? "",
    edge_mould: line.edge_mould ?? line.edgeMould ?? "",
    qty,
    hinge_holes: Boolean(line.hinge_holes ?? line.hingeHoles ?? false),
    hinge_supply: false,
    hinge_qty: line.hinge_qty ?? line.hingeQty ?? "",
    // Whose cabinet, and where the cups go. Carried through the calculation
    // untouched: none of them changes what anything costs, and a normalise
    // that dropped them would lose the answer every time a quote was saved.
    //
    // The measurements are only kept while the line is actually drilled. An
    // untick that left them behind would put a measurement on a workshop sheet
    // for a door with no holes in it.
    cabinet_brand: line.cabinet_brand ?? line.cabinetBrand ?? "",
    hinge_side: line.hinge_holes || line.hingeHoles ? normaliseHingeSide(line.hinge_side ?? line.hingeSide) : "",
    hinge_from_bottom_mm: line.hinge_holes || line.hingeHoles ? hingeMm(line.hinge_from_bottom_mm ?? line.hingeFromBottomMm) : null,
    hinge_from_top_mm: line.hinge_holes || line.hingeHoles ? hingeMm(line.hinge_from_top_mm ?? line.hingeFromTopMm) : null,
    hinge_middles_mm: line.hinge_holes || line.hingeHoles ? readMiddles(line.hinge_middles_mm ?? line.hingeMiddlesMm) : [],
    // THE ANSWERS BEYOND THE BOARD, carried through untouched for the same
    // reason as the cabinet and the cups above.
    //
    // This return value is built field by field, and these seven were never
    // added to it. Every path that saves a quote line prices it here first (the
    // editor, the whole quote save, a request conversion, the Excel order form,
    // a reprice, a duplicate), so every one of them dropped the kind of panel,
    // the banded edges, the hinge boring, the grain, who supplies it and the
    // hardware kind, on every save. An audit on 11 September 2026 found not one
    // saved quote line with any of them. quoteLineRow validates them.
    panel_use: line.panel_use ?? line.panelUse ?? "",
    banded_edges: Array.isArray(line.banded_edges ?? line.bandedEdges) ? (line.banded_edges ?? line.bandedEdges) : null,
    hole_type: line.hole_type ?? line.holeType ?? "",
    edge_finish: line.edge_finish ?? line.edgeFinish ?? "",
    grain_direction: line.grain_direction ?? line.grainDirection ?? "",
    supplied_by: line.supplied_by ?? line.suppliedBy ?? "",
    hardware_type: line.hardware_type ?? line.hardwareType ?? "",
    product_unit_cost_ex_gst: productUnitCostExGst,
    unit_cost_mode: line.unit_cost_mode ?? line.unitCostMode ?? "manual",
    unit_cost_source_id: line.unit_cost_source_id ?? line.unitCostSourceId ?? null,
    unit_cost_source_label: line.unit_cost_source_label ?? line.unitCostSourceLabel ?? "",
    unit_cost_per_sqm_ex_gst: toNumber(line.unit_cost_per_sqm_ex_gst ?? line.unitCostPerSqmExGst),
    calculated_unit_cost_ex_gst: toNumber(line.calculated_unit_cost_ex_gst ?? line.calculatedUnitCostExGst),
    product_cost_ex_gst: productCostExGst,
    material_cost_ex_gst: lineTotalExGst,
    hinge_drilling_cost_ex_gst: hingeDrillingCostExGst,
    hinge_supply_cost_ex_gst: hingeSupplyCostExGst,
    hinge_drilling_qty: hingeDrillingQty,
    hinge_supply_qty: hingeSupplyQty,
    labour_hours: labourHours,
    // Reported so the totals can say where the hours and the metres came from.
    // Neither is a column on a quote line; both are worked out from the line
    // every time, so they can never drift from the sizes and quantity on it.
    processing_labour_hours: processingLabourHours,
    edging_lineal_metres: edgingLinealMetres(line),
    worker_hourly_rate: 0,
    labour_cost_ex_gst: 0,
    travel_cost_ex_gst: 0,
    delivery_cost_ex_gst: 0,
    installation_cost_ex_gst: 0,
    painting_cost_ex_gst: 0,
    glass_cost_ex_gst: 0,
    removal_cost_ex_gst: 0,
    other_cost_ex_gst: 0,
    markup_percent: markupPercent,
    markup_amount_ex_gst: markupAmountExGst,
    unit_price_ex_gst: roundMoney(productUnitCostExGst + (productUnitCostExGst * (markupPercent / 100))),
    line_total_ex_gst: lineTotalExGst,
    client_note: line.client_note ?? line.clientNote ?? "",
    notes: line.notes ?? "",
  };
}

export function calculateQuoteTotals(lines = [], gstRate = GST_RATE, costs = {}) {
  const calculationDefaults = normalizeBusinessDefaults(costs.business_defaults ?? costs.businessDefaults ?? costs);
  const normalizedLines = lines.map((line) => calculateQuoteLine(line, calculationDefaults));
  const productLinesCostExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.product_cost_ex_gst), 0)
  );
  const materialCostExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.material_cost_ex_gst), 0)
  );
  const hingeDrillingCostExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.hinge_drilling_cost_ex_gst), 0)
  );
  const hingeSupplyCostExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.hinge_supply_cost_ex_gst), 0)
  );
  const hingeDrillingQty = normalizedLines.reduce((sum, line) => sum + toNumber(line.hinge_drilling_qty), 0);
  const hingeSupplyQty = normalizedLines.reduce((sum, line) => sum + toNumber(line.hinge_supply_qty), 0);
  // LABOUR HOURS WORK LIKE THE EDGING COST: worked out from the lines, and
  // overridden by typing a number in.
  //
  // They used to be additive. The box on the quote held a "manual" figure that
  // was added to the automatic hours, so the number on screen was one nobody
  // could edit: clearing the box to zero still left the automatic hours behind,
  // with nothing to say where they came from or how to be rid of them.
  //
  // Now the box holds the whole figure. Blank means follow the lines; a typed
  // number, including zero, pins it. manual_labour_hours is that override, and
  // it is null when nothing has been typed.
  const lineLabourHours = normalizedLines.reduce((sum, line) => sum + toNumber(line.labour_hours), 0);
  // The same line hours, split by where they came from, purely so the editor can
  // say "x from cabinets, y from fronts and panels" instead of one lump nobody
  // can check.
  const cabinetLabourHours = roundMoney(
    normalizedLines.reduce(
      (sum, line) => sum + (productTypeKey(line) === BASE_CABINET_PRODUCT_TYPE ? toNumber(line.labour_hours) : 0),
      0
    )
  );
  const processingLabourHours = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.processing_labour_hours), 0)
  );
  // What the lines say the job takes, before anybody overrides it.
  const calculatedLabourHours = roundMoney(lineLabourHours + processingLabourHours);
  // Null, undefined and "" all mean "not overridden". A typed 0 IS an override:
  // it says this job carries no labour, and a recalculation must not put the
  // calculated hours back. Same rule as the edging override, deliberately.
  const rawLabourOverride = costs.manual_labour_hours ?? costs.manualLabourHours;
  const labourOverridden = rawLabourOverride !== undefined && rawLabourOverride !== null && rawLabourOverride !== "";
  const manualLabourHours = labourOverridden ? roundMoney(toNumber(rawLabourOverride)) : null;
  const labourHours = labourOverridden ? manualLabourHours : calculatedLabourHours;
  const edging = edgingTotals(normalizedLines, calculationDefaults, costs);
  // A stored 0 here is the column default on a quote that never captured a
  // rate, not a decision to pay nothing — inherit the configured rate so the
  // labour total is not silently zeroed. See inheritWhenZero.
  const workerHourlyRate = inheritWhenZero(
    costs.worker_hourly_rate ?? costs.workerHourlyRate,
    calculationDefaults.worker_hourly_rate
  );
  const labourCostExGst = roundMoney(labourHours * workerHourlyRate);
  const travelCostExGst = toNumber(costs.travel_cost_ex_gst ?? costs.travelCostExGst);
  const deliveryCostExGst = toNumber(costs.delivery_cost_ex_gst ?? costs.deliveryCostExGst);
  const installationCostExGst = toNumber(costs.installation_cost_ex_gst ?? costs.installationCostExGst);
  const paintingCostExGst = toNumber(costs.painting_cost_ex_gst ?? costs.paintingCostExGst);
  const glassCostExGst = toNumber(costs.glass_cost_ex_gst ?? costs.glassCostExGst);
  const removalCostExGst = toNumber(costs.removal_cost_ex_gst ?? costs.removalCostExGst);
  const otherCostExGst = 0;
  const costBeforeMarkup = roundMoney(
    materialCostExGst +
      labourCostExGst +
      travelCostExGst +
      deliveryCostExGst +
      installationCostExGst +
      paintingCostExGst +
      glassCostExGst +
      removalCostExGst +
      edging.edging_cost_ex_gst +
      otherCostExGst
  );
  const markupAmountExGst = roundMoney(
    normalizedLines.reduce((sum, line) => sum + toNumber(line.markup_amount_ex_gst), 0)
  );
  const subtotalExGst = costBeforeMarkup;
  // THE RATE ACTUALLY APPLIED, worked out once and returned, so no screen has
  // to guess it back from the amount.
  //
  // The quote editor used to caption this row with `form.gst_rate || 0.1`. A
  // legitimate rate of 0 is falsy, so a GST free quote printed "GST (10%)"
  // beside an amount of nothing: the label and the number contradicted each
  // other, and the label is the one a customer would read back to us. Anything
  // that cannot be read as a number is 0 here rather than 10%, because a rate
  // nobody can parse is not evidence that GST is due.
  const appliedGstRate = toNumber(gstRate);
  const gstAmount = roundMoney(subtotalExGst * appliedGstRate);
  const totalIncGst = roundMoney(subtotalExGst + gstAmount);

  return {
    lines: normalizedLines,
    subtotal_ex_gst: subtotalExGst,
    // The rate this total was actually worked out with, so a caption can state
    // it rather than re-deriving it and disagreeing with the amount beside it.
    gst_rate: appliedGstRate,
    gst_amount: gstAmount,
    total_inc_gst: totalIncGst,
    product_lines_cost_ex_gst: productLinesCostExGst,
    material_cost_ex_gst: materialCostExGst,
    manual_labour_hours: manualLabourHours,
    // What the lines add up to, so the editor can put it in the box as a real
    // editable number rather than showing it as a figure nobody can touch.
    calculated_labour_hours: calculatedLabourHours,
    labour_hours_overridden: labourOverridden,
    line_labour_hours: roundMoney(lineLabourHours),
    cabinet_labour_hours: cabinetLabourHours,
    processing_labour_hours: processingLabourHours,
    labour_hours: labourHours,
    worker_hourly_rate: workerHourlyRate,
    labour_cost_ex_gst: labourCostExGst,
    travel_cost_ex_gst: travelCostExGst,
    delivery_cost_ex_gst: deliveryCostExGst,
    installation_cost_ex_gst: installationCostExGst,
    painting_cost_ex_gst: paintingCostExGst,
    glass_cost_ex_gst: glassCostExGst,
    removal_cost_ex_gst: removalCostExGst,
    ...edging,
    other_cost_ex_gst: otherCostExGst,
    hinge_drilling_cost_ex_gst: hingeDrillingCostExGst,
    hinge_supply_cost_ex_gst: hingeSupplyCostExGst,
    hinge_drilling_qty: hingeDrillingQty,
    hinge_supply_qty: hingeSupplyQty,
    markup_percent: 0,
    markup_amount_ex_gst: markupAmountExGst,
  };
}

/**
 * One line summary of what an item physically is: size, then the finish
 * details. Order items, project items and variation lines all carry the same
 * spec columns, so they all read the same way wherever they are listed.
 * Pass includeQty when the reader needs to compare two versions of an item
 * (a variation) and a qty change would otherwise be invisible.
 */
export function formatItemSpecs(item, { includeQty = false } = {}) {
  if (!item) return "";
  // A plain letter x, NOT the × the screens use. This line is also printed on
  // the production sheet and the variation notes, and the PDF fonts are ASCII
  // only. See lib/pcd-size-label.js for the screen format.
  const size = item.width_mm || item.height_mm
    ? `${item.height_mm || "-"} x ${item.width_mm || "-"}mm`
    : "";
  const finish = [
    item.material,
    item.thickness,
    item.finish,
    item.colour,
    item.profile_type,
    item.profile,
    item.edge_mould,
  ].filter(Boolean).join(" - ");
  const qty = includeQty && toNumber(item.qty) > 0 ? `Qty ${toNumber(item.qty)}` : "";
  // WHOSE CABINET, AND THE DRILLING. This one string is the spec line on every
  // panel view of an order, on a project, and on both sides of a variation's
  // before and after. Putting the drilling in it is what makes a variation that
  // changes the handing SHOW that it changed, instead of the two sides reading
  // identically while the door comes back mirrored.
  //
  // Says nothing at all for a piece that is not drilled, so no caller has to
  // ask whether there is anything to add.
  const cabinet = item.cabinet_brand ? String(item.cabinet_brand) : "";
  const drilling = hingeSpecText(item);
  // The kind of panel, the banded edges, the grain and who supplies it. They
  // used to stop at the quote, so every order view read a Scribe as a plain
  // Panel with no word about its edges. See lib/pcd-line-details.js.
  const make = lineMakeDetails(item).join(", ");
  return [size, finish, make, cabinet, drilling, qty].filter(Boolean).join(" | ");
}

/**
 * The drilling on one line, short enough to sit in a spec string.
 *
 * The long form belongs on the workshop sheet; this is the version that has to
 * fit beside a colour and an edge profile without pushing them off the row.
 */
export function hingeSpecText(item) {
  if (!item?.hinge_holes) return "";
  const count = hingeCount(item);
  const side = normaliseHingeSide(item.hinge_side);
  // The positions the way they were asked: bottom from the bottom, top from
  // the top. See hingePositionLines.
  const positions = hingePositionLines(item);
  const boring = holeTypeOf(item);
  const head = [
    `Drill${count ? ` ${count}` : ""}`,
    side ? side.toLowerCase() : "side not recorded",
    boring || "",
  ].filter(Boolean).join(" ");
  const where = positions
    ? positions.map((part) => part[0].toLowerCase() + part.slice(1)).join(", ")
    : "standard positions";
  return `${head}, ${where}`;
}

// ── WHAT COUNTS AS A CURRENCY, IN ONE PLACE ──────────────────────────────────
//
// Intl.NumberFormat accepts a real three letter ISO code and THROWS on anything
// else, including the empty string. That is a reasonable thing for it to do and
// a disastrous thing to have behind a free text box.
//
// The Currency box on the quote editor was exactly that. Nothing checked it:
// the save route stored whatever arrived, and the only database constraint was
// that it not be blank, so AUDD, A, a bare dollar sign and "AU D" all saved.
// formatMoney is called in 24 files and fourteen of those calls are on the
// customer's own quote page, so one typo took down the quote editor AND showed
// the customer "application error: a client-side exception has occurred". Found
// 21 September 2026, the same week the same message came from a different bug.
//
// Two separate jobs, and they must not be confused:
//
//   isCurrencyCode is the GATE. It is what the save routes and the settings
//   screen use to refuse a value on the way in. That is the real fix.
//
//   formatMoney is the DEFENCE, for the rows already saved with a bad code and
//   for anything that gets past a gate later. It must never throw, because a
//   money formatter is not allowed to be the reason a page does not render.

/** True only for something Intl will actually format as money. */
export function isCurrencyCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat("en-AU", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

/** The stored form of a currency: trimmed and upper case, or "" if it is not one. */
export function normaliseCurrencyCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return isCurrencyCode(code) ? code : "";
}

/**
 * Why this quote's currency cannot be saved, or null if it can.
 *
 * REFUSED ON THE WAY IN, the same way a backwards pair of suggested dates is.
 * A quote saved with a currency nothing can format is a quote that reads oddly
 * on every screen it appears on, including the customer's, and the person who
 * typed it is the only one who can say what they meant. Guessing on their
 * behalf would put a number in front of a customer labelled as a currency
 * nobody chose.
 */
export function quoteCurrencyProblem(quote = {}) {
  const sent = String(quote.currency ?? "").trim();
  if (!sent) return null; // Nothing sent means "use the configured default".
  if (isCurrencyCode(sent)) return null;
  return {
    field: "currency",
    message:
      `"${sent}" is not a currency code. Use the three letter code, for example AUD. ` +
      "Anything else cannot be shown as money on the quote or on the customer's copy.",
  };
}

/**
 * Why this GST rate cannot be saved, or null if it can.
 *
 * ONE RULE, BOTH ENDS. The settings screen shows this as it is typed and the
 * save route refuses on the same function, because a check that only runs in
 * the browser is a suggestion rather than a rule.
 *
 * Both ends of the range matter and neither was checked. A rate of 0 charged no
 * GST on every quote in the system with nothing anywhere saying so, which would
 * have surfaced at the tax return. A rate of 10, typed by somebody reading the
 * label as a percentage, is a thousand percent. A negative rate produces a
 * total below the subtotal, which is not a thing that exists.
 */
export function gstRateProblem(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) {
    return { field: "gst_rate", message: "GST rate must be a number, written as a decimal. 10% is 0.1." };
  }
  if (rate > 1) {
    return {
      field: "gst_rate",
      message:
        `GST rate is a decimal, so 10% is 0.1 rather than ${value}. ` +
        `Entered as it is, every quote would charge ${Math.round(rate * 100)}% GST.`,
    };
  }
  if (rate <= 0) {
    return {
      field: "gst_rate",
      message:
        "GST rate must be more than zero. A zero or negative rate charges no GST on every quote, " +
        "and nothing anywhere says so.",
    };
  }
  return null;
}

export function formatMoney(value, currency = "AUD") {
  const amount = toNumber(value);
  const code = normaliseCurrencyCode(currency);

  // A code we cannot format is SHOWN, not swapped for one we can. Quietly
  // printing $1,234.50 against a quote whose currency says something else would
  // hide the fault on the one screen where somebody might notice it, and the
  // number would be a lie about which currency it is in. The amount still
  // reads correctly, the page still renders, and the odd looking code beside it
  // is the visible symptom that sends somebody to fix the quote.
  if (!code) {
    const written = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    const shown = String(currency ?? "").trim();
    return shown ? `${written} ${shown}` : written;
  }

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(amount);
}
