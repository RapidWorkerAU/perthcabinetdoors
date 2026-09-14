import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicPaths from "@/components/public/PublicPaths";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import { loadColourBand, spreadAcross } from "@/lib/pcd-colour-band";
import { evenColumns } from "@/lib/pcd-grid-columns";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../journey.module.css";

// THE IKEA AND KABOODLE PAGE.
//
// ── WHAT HAPPENED TO THE CONFIGURATOR ────────────────────────────────────────
//
// This page used to be six questions and a 3D preview. Everything it knew was
// locked inside a client component, which meant a crawler, and anything reading
// the page to answer a question, saw an empty div where the sizes were. The
// sizes are the single most specific, most checkable thing we know about these
// cabinets, and nobody else in Perth publishes them, so they are now a table on
// the page instead of a wizard behind a click.
//
// ConfiguratorClient, CabinetPreview3D and configurator.module.css went with
// it. cabinet-data.js did NOT: it is also read by the 3D planner, the public
// design submit route and the admin order form, and the table below is written
// from the same catalogue it holds.
//
// ── HOW THE COPY IS WRITTEN ──────────────────────────────────────────────────
//
// Answer first. A section heading is a question somebody actually types, and
// the first sentence answers it completely, naming us and the thing rather than
// saying "we" and "it". That is what makes a sentence still true when something
// lifts it out of the page on its own, which is how it ends up in an answer.
// The repetition of the business name is deliberate; do not tidy it into "we".

export const metadata = {
  title: "IKEA & Kaboodle Replacement Doors, Drawer Fronts and Panels | Perth Cabinet Doors",
  description:
    "Made to measure replacement doors, drawer fronts and panels for IKEA Metod, Pax and Besta and Kaboodle cabinets. Standard sizes, bored for your hinges, made in Perth and installed across Perth metro.",
};

export const dynamic = "force-dynamic";

// ── THE EIGHT PIECES ─────────────────────────────────────────────────────────
//
// ONE LIST, NOT TWO. These were a list of eight names followed by a strip whose
// groups were labelled Doors, Drawer fronts and Panels: the same three
// categories written twice, a few inches apart. Each piece is now one card
// carrying its name, what it is, and the standard sizes the selected system
// publishes for it.
//
// `shape` is what to draw on a card for a piece no system publishes a size for.
// It is a real, representative size rather than a decorative rectangle: a kick
// is long and shallow, a filler is narrow and tall, a shelf is wide and thin.
// Height first, as everywhere.
const MAKE = [
  {
    name: "Cabinet doors",
    type: "Door",
    copy: "Flat slab or profiled, in over 270 colours across Polytec, Laminex and Formica.",
    shape: [720, 450],
  },
  {
    name: "Drawer fronts",
    type: "Drawer front",
    copy: "Made in the set heights each system uses, and drilled to suit your existing runners.",
    shape: [200, 600],
  },
  {
    name: "End and return panels",
    type: "Panel",
    copy: "Used to cover an exposed carcass side in the same finish as the doors beside it.",
    shape: [2055, 650],
  },
  {
    name: "Cover panels",
    type: "Panel",
    copy: "Pax side panels, pantry ends and the tall panels that close off a run.",
    shape: [2400, 620],
  },
  {
    name: "Kicks and plinths",
    type: "Panel",
    copy: "Cut to the length of the run, in a matching or a contrasting colour.",
    shape: [150, 2400],
  },
  {
    name: "Fillers and infills",
    type: "Panel",
    copy: "Made in any width, including the sizes IKEA and Kaboodle do not sell.",
    shape: [720, 80],
  },
  {
    name: "Floating shelves",
    type: "Panel",
    copy: "Made in the same finish as the cabinetry they sit alongside.",
    shape: [40, 900],
  },
  {
    name: "Custom-size fronts",
    type: "Door",
    copy: "Cut to any measurement where an opening is not a standard catalogue size.",
    shape: [880, 520],
  },
];

// ── THE STANDARD SIZES ───────────────────────────────────────────────────────
//
// Written from cabinet-data.js, which was audited against ikea.com.au and
// bunnings.com.au and cross-checked across five IKEA front ranges. Read the
// note at the top of that file before changing a number here.
//
// HEIGHT FIRST, EVERYWHERE, the same as every other size on this site and in
// the admin, and the strip says so in words underneath.
//
// ── WHY THEY ARE DRAWN ───────────────────────────────────────────────────────
//
// This was a four row table of dense figures. Every number in it was right and
// it was good for search, but a person scanning it took nothing from it except
// that there are a lot of numbers, which is the opposite of feeling looked
// after. Drawn to one scale, in a single row that scrolls, the range is the
// thing you see: a 2290 Pax door really is five times a 400 Metod one.
//
// DELIBERATELY ABSENT: the Kaboodle 3 and 4 drawer panel sets. They are flagged
// KABOODLE_UNCONFIRMED in cabinet-data.js because the individual panel heights
// have not been checked against a Bunnings pack. A size we are unsure of does
// not go on a public page.
const SYSTEM_SIZES = [
  {
    id: "metod",
    system: "IKEA Metod",
    kind: "Kitchens",
    what: "Base, wall and tall kitchen cabinets, 370 or 600 deep",
    groups: [
      {
        piece: "Cabinet doors",
        type: "Door",
        sizes: [
          [800, 200], [600, 300], [800, 300],
          [400, 400], [600, 400], [800, 400], [1000, 400], [1200, 400], [1400, 400], [2000, 400],
          [800, 450],
          [400, 600], [600, 600], [800, 600], [1000, 600], [1200, 600], [1400, 600], [2000, 600],
        ],
      },
      {
        piece: "Drawer fronts",
        type: "Drawer front",
        sizes: [
          [100, 400], [100, 600], [100, 800],
          [200, 400], [200, 600], [200, 800],
          [400, 400], [400, 600], [400, 800],
        ],
      },
      {
        piece: "Cover panels",
        type: "Panel",
        sizes: [[800, 620], [860, 390], [1060, 390], [2400, 390], [2400, 620], [2440, 910]],
      },
    ],
  },
  {
    id: "pax",
    system: "IKEA Pax",
    kind: "Wardrobes",
    what: "Wardrobe frames, 2010 or 2360 high. Hinged doors only",
    groups: [
      {
        piece: "Cabinet doors",
        type: "Door",
        sizes: [[1950, 250], [2290, 250], [2290, 370], [1950, 500], [2290, 500]],
      },
    ],
    // No panel group: cabinet-data.js has no Pax panel sizes, and a drawn
    // rectangle we cannot put a number under is a made-up size.
    footnote: "Side and cover panels are cut to suit the frame depth.",
  },
  {
    id: "besta",
    system: "IKEA Besta",
    kind: "Living room",
    what: "Wall-hung or standing storage frames",
    groups: [
      { piece: "Cabinet doors", type: "Door", sizes: [[380, 600], [640, 600]] },
      { piece: "Drawer fronts", type: "Drawer front", sizes: [[260, 600], [380, 600]] },
    ],
  },
  {
    id: "kaboodle",
    system: "Kaboodle",
    kind: "Bunnings kitchens",
    what: "Base and wall cabinets are both 720 high, so they share one door height",
    groups: [
      {
        piece: "Cabinet doors",
        type: "Door",
        sizes: [[717, 300], [717, 400], [717, 450], [717, 600], [2055, 450], [2055, 600]],
      },
      {
        // Only the one and two panel sets. The three and four panel sets are
        // flagged KABOODLE_UNCONFIRMED in cabinet-data.js, so they are not
        // drawn and not listed.
        piece: "Drawer fronts",
        type: "Drawer front",
        sizes: [[287, 450], [287, 600], [287, 900], [357, 450], [357, 600], [357, 900]],
      },
      {
        piece: "End and return panels",
        type: "Panel",
        sizes: [[720, 100], [720, 320], [720, 420], [864, 580], [2055, 650], [2200, 650]],
      },
    ],
  },
];


/**
 * One front, drawn at the page scale.
 *
 * Uses the site's own elevation classes from frontend.css, the same ones the
 * quote builder and the planner draw with, so the three kinds are told apart
 * here the way they are told apart everywhere else on the site:
 *
 *   Door          outline, plus a dashed swing converging on the opening edge
 *   Drawer front  outline, plus a short pull near the top
 *   Panel         outline only, because a panel has nothing on it
 *
 * That is what lets the groups in the strip be read without their labels, and
 * the labels are there anyway.
 */
function FrontElevation({ height, width, type, board, boardId, box = 104 }) {
  // One drawing per card, sized to fill its box without ever overflowing it.
  const scale = Math.min(box / height, 88 / width);
  const pullY = Math.min(height * 0.3, height * 0.26);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={Math.max(8, Math.round(width * scale))}
      height={Math.max(8, Math.round(height * scale))}
      role="presentation"
      aria-hidden="true"
    >
      {/* A REAL BOARD, NOT A WHITE RECTANGLE.
          A hairline outline is a technical drawing; the same rectangle with a
          board in it is a door. The tile is a real row out of the colour
          library, so the section shows the range in the material somebody is
          actually choosing. Falls back to the outline fill when the library
          cannot be read, which is what every other colour on this page does. */}
      {board ? (
        <>
          <defs>
            <pattern id={boardId} patternUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
              <image href={board} x="0" y="0" width={width} height={height} preserveAspectRatio="xMidYMid slice" />
            </pattern>
          </defs>
          <rect className="pcdElevBoard" x="0" y="0" width={width} height={height} fill={`url(#${boardId})`} />
        </>
      ) : (
        <rect className="pcdElevFront" x="0" y="0" width={width} height={height} />
      )}
      {type === "Door" ? (
        <>
          <line className="pcdElevSwing" x1="0" y1="0" x2={width} y2={height / 2} />
          <line className="pcdElevSwing" x1="0" y1={height} x2={width} y2={height / 2} />
        </>
      ) : null}
      {type === "Drawer front" ? (
        <line className="pcdElevPull" x1={width * 0.35} x2={width * 0.65} y1={pullY} y2={pullY} />
      ) : null}
    </svg>
  );
}

/** The biggest size in a list, which is the one worth drawing on a card. */
function biggestOf(sizes) {
  return sizes.reduce((best, size) => (size[0] * size[1] > best[0] * best[1] ? size : best));
}

// FOUR, NOT SIX. "The 35mm cup" said what the lede above the grid already
// says, and "Undrilled on request" said the last line of that lede. What is
// left is the four things the lede cannot carry on its own.
const HINGES = [
  ["Blum Inserta or cup only", "An Inserta hinge knocks into a cup with two dowel holes beside it. Name which you are using and we bore for it."],
  ["Two to five hinges", "The number is taken from the door height unless you specify otherwise. Your own positions override it."],
  ["Measured from the ends", "The bottom hinge is measured up from the bottom edge and the top hinge down from the top edge. Left blank, our standard positions are used."],
  ["Drawer fronts undrilled", "Supplied blank so they can be fixed through the existing drawer box, whether that is a Metod Maximera or a Kaboodle runner."],
];


// ── THE FAQ ──────────────────────────────────────────────────────────────────
//
// The questions are the search terms, so they are written the way somebody
// types them, and the first sentence of each answer is the whole answer. An
// assistant quoting one of these in isolation should still be quoting something
// true and complete.
const FAQ = [
  [
    "Do you make doors that fit IKEA Metod cabinets?",
    "Yes. Perth Cabinet Doors makes doors, drawer fronts, end panels, kicks and fillers for IKEA Metod cabinets, in the standard Metod sizes and in custom sizes where an opening is not standard. Each piece is cut, edged and bored in our workshop in Perth and hangs on the concealed hinges already fitted to the cabinet.",
  ],
  [
    "Can I use your doors on Kaboodle cabinets from Bunnings?",
    "Yes. Kaboodle base and wall cabinets are both 720mm high and therefore share a single door height of 717mm, which Perth Cabinet Doors makes in every Kaboodle cabinet width. We also make the 2055mm pantry doors, the drawer panel sets and the end and filler panels.",
  ],
  [
    "How much do replacement IKEA and Kaboodle fronts cost?",
    SHOP_ENABLED
      ? "It depends on the finish. Flat decorative board fronts are priced on this site as you enter the size, so the figure is on screen before you commit. Profiled and thermolaminated fronts are quoted by hand, because a routed profile costs more than the board it is cut from in a way a square metre rate cannot describe. Either way there is no charge to find out."
      : "It depends on the finish, the size and how many pieces there are, so Perth Cabinet Doors prices every list by hand rather than publishing a rate that would be wrong for most jobs. Build a list of what you need and a price comes back within 1 to 3 business days, with no charge and no obligation. Installation is quoted with the fronts, as one price.",
  ],
  [
    "Is it cheaper than buying the fronts from IKEA or Bunnings?",
    "It depends on the finish. A plain flat door from Perth Cabinet Doors is comparable to the range's own basic front. On better finishes the difference is larger: a thermolaminated or profiled door from us is often less than the equivalent Kaboodle door, drawer panel or end panel, in a considerably wider choice of colour. Send us the list and we will price it against what you are comparing it to.",
  ],
  [
    "Do you make custom sizes?",
    "Yes. Custom sizes are the majority of what Perth Cabinet Doors makes. Any opening that is not a standard catalogue size is cut to your measurement, including wider fillers where a cabinet has been removed. There is no minimum order, so a single door is an order we will take.",
  ],
  [
    "Can you install them?",
    "Yes. Perth Cabinet Doors installs across the Perth metro area, and installation is quoted with the fronts as one price. We also supply only, to homeowners and to trades, which is how a large share of these orders are filled.",
  ],
  [
    "How does ordering replacement fronts work?",
    "Count the doors, drawer fronts, panels and kicks you need. A standard cabinet determines its own front size; a non-standard opening needs a measurement or a photo. Choose a colour and profile, get the price, and every piece is then cut, edged and bored in our own Perth workshop before it is delivered at a flat rate across Perth metro or installed by our team.",
  ],
  [
    "Do you sell the cabinets themselves?",
    <>
      Perth Cabinet Doors does not sell flat-pack carcasses. We make the fronts and panels that go on them.
      Where a cabinet is needed in a size the range does not offer, we build cabinets to size in the same
      finish, quoted alongside the fronts. Doing a whole room? Lay it out in our{" "}
      <Link href="/design">free 3D planner</Link> and send it through, and we quote the standard units and the
      pieces we build to suit as one job.
    </>,
  ],
  [
    "What if my cabinets are not IKEA or Kaboodle?",
    "Everything described here applies to any cabinet fitted with a standard concealed hinge. Send the sizes, or photographs with rough dimensions, and we will confirm what fits.",
  ],
  [
    "How long does it take?",
    SHOP_ENABLED
      ? "Flat fronts ordered through the shop are usually dispatched within ten working days. Quoted work is priced within 1 to 3 business days, and build time is typically two to three weeks from approval, depending on the finish."
      : "Quoted work is priced within 1 to 3 business days, and build time is typically two to three weeks from approval, depending on the finish.",
  ],
];

export default async function IkeaKaboodlePage() {
  const colours = await loadColourBand();

  // EIGHT BOARDS, SAMPLED ACROSS THE LIBRARY, one per piece card. Taking the
  // first eight would be eight shades of oak, which says the opposite of what
  // the cards are for: the point is that a door, a panel and a kick can each be
  // a different finish and still be the same job.
  const boards = spreadAcross(colours, MAKE.length);
  // The band walks the library the same way, so the eighteen tiles below read
  // as range rather than as one end of the sort order.
  const bandColours = spreadAcross(colours, 18);

  return (
    <>
      <PublicSiteNav variant="solid" />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.wrap}>
            <div className={styles.pageHeaderCrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/start">Services</Link> &rsaquo; IKEA &amp;
              Kaboodle
            </div>
            {/* THREE LINES, AND NO BUTTONS. The cream header is a title block,
                not a hero: it says what the page is and gets out of the way.
                It ran to five lines and three buttons, which made the top of
                the page longer than the first real section.

                Everything that came out is still on the page and said better
                further down: how it is delivered or installed is its own
                section, how the price works is its own section, and the three
                ways to buy close the page. The h1 and this sentence still
                carry every entity name, which is the part that has to survive
                being lifted out on its own. */}
            <h1>Replacement Doors, Drawer Fronts and Panels for IKEA and Kaboodle Cabinets</h1>
            <p>
              Perth Cabinet Doors makes made to measure replacement doors, drawer fronts and panels for IKEA
              Metod, Pax and Besta cabinets and for Kaboodle cabinets from Bunnings. Cut, edged and bored for
              your hinges in our Perth workshop.
            </p>
          </div>
        </header>

        {/* ONE SECTION, ONE LIST.
            "What can we make" and "What sizes do they come in" were two
            sections asking one question, and the strip under them repeated
            three of the eight piece names as its own group labels. Each piece
            is now one card: its name as a heading, what it is, the standard
            sizes the selected system publishes for it, and a drawing of the
            biggest of them filled with a real board. */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <p className={styles.label}>What We Make</p>
            {/* THE HEADING, THEN THE CONTROL. NO PARAGRAPH BETWEEN THEM.
                There was a five line lead here that opened "Perth Cabinet Doors
                makes every visible component on the front of an IKEA or
                Kaboodle cabinet", directly under a cream header that already
                said Perth Cabinet Doors makes replacement doors, drawer fronts
                and panels for those cabinets. Two paragraphs, one fact, a
                screen apart.

                Nothing in it was only in it. The carcass is not replaced is the
                FAQ entry "Do you sell the cabinets themselves?". Sizes are
                written height first is the note under every panel. The fixed
                catalogue is the whole point of the tabs below and is better
                shown than stated.

                The question heading stays, because a heading is the part an
                assistant lifts and the part that ranks. What it loses is the
                restatement underneath it, and the cards answer it better than
                the sentence did. */}
            <h2>What can we make for an IKEA or Kaboodle cabinet?</h2>

            {/* FOUR PANELS, ALL OF THEM IN THE PAGE, SWITCHED WITH CSS.
                The radios come first so a plain sibling selector can reach both
                the labels and the panels, which is what keeps this working with
                no JavaScript at all. Every size in all four systems is in the
                markup whichever tab is showing, so nothing here is hidden from
                a crawler or from anything reading the page to answer a
                question. That is the mistake the configurator made and it is
                not worth repeating for a tab set. */}
            <div className={styles.sizeTabs}>
              {SYSTEM_SIZES.map((row, index) => (
                <input
                  className={styles.sizeRadio}
                  key={`radio-${row.id}`}
                  type="radio"
                  name="pcd-size-system"
                  id={`pcd-size-${row.id}`}
                  defaultChecked={index === 0}
                />
              ))}

              <div className={styles.sizeTabRow} role="radiogroup" aria-label="Cabinet system">
                {SYSTEM_SIZES.map((row) => (
                  <label className={styles.sizeTab} key={`tab-${row.id}`} htmlFor={`pcd-size-${row.id}`}>
                    {row.system} <span>{row.kind}</span>
                  </label>
                ))}
              </div>

              {SYSTEM_SIZES.map((row) => (
                <div className={`${styles.sizePanel} ${styles[`sizePanel_${row.id}`]}`} key={`panel-${row.id}`}>
                  <div className={styles.pieceCards}>
                    {MAKE.map((piece, index) => {
                      const group = row.groups.find((entry) => entry.piece === piece.name);
                      const sizes = group ? group.sizes : [];
                      const drawn = sizes.length ? biggestOf(sizes) : piece.shape;
                      // A different board per card, sampled across the library,
                      // so the eight cards show the range as well as the pieces.
                      const board = boards.length ? boards[index % boards.length] : null;

                      return (
                        <article className={styles.pieceCard} key={piece.name}>
                          <div className={styles.pieceArt}>
                            <FrontElevation
                              height={drawn[0]}
                              width={drawn[1]}
                              type={piece.type}
                              board={board?.imageUrl}
                              boardId={`pcdBoard-${row.id}-${index}`}
                            />
                          </div>
                          <div className={styles.pieceBody}>
                            <h3>{piece.name}</h3>
                            <p>{piece.copy}</p>
                            {sizes.length ? (
                              <div className={styles.sizeChips}>
                                {sizes.slice(0, 6).map(([height, width]) => (
                                  // ONE STRING, NOT THREE EXPRESSIONS. Written as
                                  // {height}&times;{width} React separates the
                                  // parts with comment nodes and the size stops
                                  // being one run of text for anything reading
                                  // the page. These numbers are the point.
                                  <span className={styles.sizeChip} key={`${height}x${width}`}>
                                    {`${height} × ${width}`}
                                  </span>
                                ))}
                                {sizes.length > 6 ? (
                                  <span className={`${styles.sizeChip} ${styles.sizeChipMore}`}>
                                    {`and ${sizes.length - 6} more`}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <div className={styles.sizeChips}>
                                <span className={`${styles.sizeChip} ${styles.sizeChipMore}`}>
                                  Cut to your measurement
                                </span>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <p className={styles.sizeNote}>
                    <strong>{row.system}.</strong> {row.what}. Sizes are the ones this system publishes,
                    written height first.{row.footnote ? ` ${row.footnote}` : ""}
                  </p>
                </div>
              ))}
            </div>

            <p className={styles.pullNote}>
              <strong>These are the nominal sizes, the way IKEA and Bunnings label them.</strong> The front
              Perth Cabinet Doors cuts is 3mm smaller each way in both systems, matching the original, so it
              hangs with the same gap around it. A 900 wide cabinet is fronted with two doors rather than one.
              Sliding wardrobe fronts are not made. Anything that is not on this list is a custom size, which
              is most of what we make.
            </p>
          </div>
        </section>

        <section className={styles.dark}>
          <div className={styles.wrap}>
            <p className={`${styles.label} ${styles.labelLight}`}>Hinges and Boring</p>
            <h2>Do you drill the doors for IKEA and Kaboodle hinges?</h2>
            <p className={`${styles.lead} ${styles.leadLight}`}>
              Yes. Perth Cabinet Doors bores the 35mm hinge cup at the position your cabinet system uses, so a
              new door hangs on the concealed hinges already fitted to the cabinet. Boring is optional on
              every order: decline it and the door is supplied blank, ready to be drilled on site.
            </p>
            <div className={styles.hingeGrid} style={{ "--cols": evenColumns(HINGES.length) }}>
              {HINGES.map(([title, detail]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        {/* "HOW MUCH DO THEY COST" WAS A SECTION HERE, AND IT IS AN FAQ NOW.
            Two columns of specification, and with the shop closed both columns
            gave the same answer: the tag and the price line were the same
            string on each side, so it was a comparison with nothing to compare.
            Every fact in it was also somewhere else on this page, in the FAQ or
            in the section below. And it did not answer its own heading: "how
            much" was met with "it depends, go and find out", which is the
            weakest answer to the strongest question on the page.
            The question survives as an FAQ entry. If we ever publish a real
            from-price for a flat door and a profiled one, that is worth a
            section again, and nothing less is. */}

        {/* COLOURS, AS A BAND RATHER THAN A FEATURE ROW WITH A BUTTON.
            Same information, a better visual, and the link to /finishes is a
            link in a sentence instead of the page's third filled button. */}
        <section className={`${styles.section} ${styles.sectionPanel}`}>
          <div className={styles.wrap}>
            <p className={styles.label}>Colours and Profiles</p>
            <h2>Over 270 colours across Polytec, Laminex and Formica</h2>
            <p className={styles.lead}>
              Every finish those three brands make, and each colour is available as a door, a drawer front and
              a panel so a whole kitchen matches. That is considerably more choice than any flat-pack cabinet
              range carries, and it is the usual reason somebody replaces fronts rather than buying them from
              the range again. <Link href="/finishes">Browse the finishes</Link>, and ask about samples when
              you enquire.
            </p>
            {bandColours.length ? (
              <div className={styles.colourBand} aria-hidden="true">
                {bandColours.map((colour) => (
                  <span key={colour.name} style={{ backgroundImage: `url(${colour.imageUrl})` }} title={colour.name} />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* CUT FROM HERE, AND WHERE EACH WENT.
            An installation cross-sell panel and a planner cross-sell panel,
            three sections apart, each a bordered box whose only content was a
            dark button. Installation is now a line in the costs section above
            and a question in the FAQ below; the planner is a link inside the
            answer about building cabinets to size.
            A four step "How ordering works" section, which restated the header
            and the costs section. The question survives as one FAQ entry. */}

        <section className={styles.section}>
          <div className={styles.wrap}>
            <p className={styles.label}>Common Questions</p>
            <h2>Questions we are asked most</h2>
            <div className={styles.faq}>
              {FAQ.map(([question, answer], index) => (
                <details key={question} open={index === 0}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.closing}>
          <div className={styles.wrap}>
            <PublicPaths
              onDark
              heading="Get a price on IKEA or Kaboodle fronts"
              lead="Tell us your cabinet range, how many doors and drawer fronts you need and the finish you are after. Whichever of these sounds like you, it starts here."
              paths={["shop", "quote", "ask"]}
              note="No minimum order · Bored to suit your hinges · Flat-rate Perth metro delivery · Quotes are free"
            />
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
