import LandingHeroVideo from "./LandingHeroVideo";
import PublicSiteNav from "./PublicSiteNav";
import PublicButton from "@/components/public/PublicButton";
import PublicFooter from "@/components/public/PublicFooter";
import PublicSection from "@/components/public/PublicSection";
import Link from "next/link";
import { loadColourBand, spreadAcross } from "@/lib/pcd-colour-band";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";

// TWO WAYS TO ORDER, AND THE SITE KEEPS THEM APART FROM HERE ON.
//
// The fork, in plain words: buy a flat decorative board front outright, or put
// anything at all on a quote list. Green for the one with a price, amber for
// the one without, the same two colours as the Cart and My list buttons in the
// bar above. See the "Two Paths, One Website" plan.
//
// IT SITS AFTER THE DIY SECTION, not directly under the hero. The hero already
// leads with Get a Free Quote, so a fork a hundred pixels below it was the page
// making the same offer twice in one screen. A section of reading in between is
// what stops that.
//
// Each path shows its own basket, and those tiles are EXAMPLES and say so. See
// .landing-ways in frontend.css for the rest of the reasoning.
const ROUTES = [
  {
    tone: "buy",
    tag: "Buy online",
    title: "Standard doors and panels",
    blurb:
      "Polytec decorative board, 16mm and 18mm, cut to your sizes. Priced to the cent as you set it up, and paid for on the site.",
    points: [
      "See the price change as you size it",
      "Pay on the site, made in about ten working days",
      "Flat rate delivery anywhere in the Perth metro",
    ],
    href: "/products",
    label: "Shop doors online",
    basket: {
      title: "Cart",
      state: "Priced",
      lines: [
        ["2 x Flat door", "Coastal Oak Woodmatt, 717 x 450 mm", "$186.40", "linear-gradient(150deg,#cdb392,#a3835f)"],
        ["1 x Flat panel", "Crisp White Legato, 2055 x 650 mm", "$142.10", "linear-gradient(150deg,#f4f2ec,#ddd8cd)"],
        ["1 x Drawer front", "Notaio Walnut Woodmatt, 200 x 600 mm", "$44.30", "linear-gradient(150deg,#6b4c39,#43301f)"],
      ],
      foot: "Subtotal $372.80 inc GST. Delivery added at checkout.",
    },
  },
  {
    tone: "quote",
    tag: "Get a quote",
    title: "Everything else we make",
    blurb:
      "Thermolaminate, compact laminate, benchtops, whole kitchens. Anything with a profile pressed into it or a shape to it.",
    points: [
      "Build a list of what you need, no prices yet",
      "Priced by hand, back to you within 1 to 3 business days",
      "Nothing is charged until you accept the quote",
    ],
    href: "/request-quote",
    label: "Start a quote request",
    basket: {
      title: "Quote list",
      state: "To be quoted",
      lines: [
        ["6 x Door, shaker", "Classic White thermolaminate, 720 x 450 mm", null, "linear-gradient(150deg,#f6f4ef,#e3ded2)"],
        ["1 x Benchtop", "Char Oak Ravine compact laminate", null, "linear-gradient(150deg,#4b3d33,#2c2421)"],
        ["1 x New cabinet", "900 wide pantry, to suit the run", null, "linear-gradient(150deg,#a8a49c,#7d7a72)"],
      ],
      foot: "No prices anywhere. Worked out by hand and emailed to you.",
    },
  },
];

export const metadata = {
  title: "Perth Cabinet Doors | Custom Cabinet Doors, Panels & Drawer Fronts - Perth WA",
  description:
    "Perth's cabinet door specialists. Ready-made doors, panels and drawer fronts in Polytec, pre-drilled, hinged and shipped flat rate across Perth metro.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // 24 TILES SPREAD ACROSS THE WHOLE LIBRARY, not the first 24, which would be
  // 24 shades of oak. See lib/pcd-colour-band.js.
  const bandColours = spreadAcross(await loadColourBand(), 24);

  return (
    <main className="landing-page">
      <header className="landing-hero">
        <LandingHeroVideo />
        <div className="landing-hero-shade" />
        <PublicSiteNav active="home" variant="overlay" />

        <div className="landing-hero-copy">
          <div className="landing-hero-badge">Perth, Western Australia - Locally owned and operated</div>
          <h1>
            Custom Cabinet Doors, Panels &amp; Drawer Fronts.
            <em className="landing-hero-tagline">Ready to Fit. Ready to Ship.</em>
          </h1>
          <p>
            Refresh your kitchen without replacing the cabinets. Doors, drawer fronts and panels made to
            measure in Polytec, Laminex and Formica, pre-drilled and hinged to suit IKEA, Kaboodle or your
            existing cabinetry - and new cabinets built to match wherever you need them.
          </p>
          <div className="landing-actions">
            <PublicButton href="/request-quote" className="landing-button landing-button-primary">
              Get a Free Quote
            </PublicButton>
            <PublicButton href="#how-it-works" className="landing-button landing-button-secondary">
              See How It Works
            </PublicButton>
          </div>
          <p className="landing-hero-trust">
            Flat-rate delivery across Perth metro - 20+ years cabinet making experience - Bespoke cabinetry available
          </p>
        </div>
      </header>

      <section className="landing-trust" aria-label="Service highlights">
        <div><span />Pre-drilled and hinged to your specs</div>
        <div><span />Polytec, Laminex &amp; Formica</div>
        <div><span />Flat-rate Perth metro delivery</div>
        <div><span />IKEA and Kaboodle compatible</div>
        <div><span />Bespoke cabinetry available</div>
      </section>

      <section className="landing-ground-cream">
        <div className="landing-section landing-split">
        <div>
          <p className="landing-label">For the DIY Renovator</p>
          <h2>
            Give Your Kitchen a <em>Custom Look</em> Without the Custom Price Tag
          </h2>
        </div>
        <div>
          <p className="landing-lead">
            Tired of the same IKEA Metod, Besta or Pax finish as everyone else on the street?
            Perth Cabinet Doors makes it easy to transform your kitchen, bathroom or laundry with
            replacement doors, panels and drawer fronts made to your measurements.
          </p>
          <p>
            Our ready-made panels are built in Perth by cabinet makers, cut and finished in our local
            workshop rather than mass-produced overseas. Every door is cut to your specified dimensions,
            finished in your chosen Polytec colour, and can be pre-drilled for hinges so all you need is
            a screwdriver.
          </p>
          <p>
            Choose thermolaminate doors for classic shaker profiles, modern flat slab doors for a
            contemporary finish, and front or side profiles for a more bespoke edge. Laminex and Formica
            options are also available on request.
          </p>
          </div>
        </div>
      </section>

      {/* THE FORK. Dark green, full bleed, the same rail as everything else,
          and far enough below the hero that the page is not making the same
          offer twice in one screen. With the shop closed there is only one way
          to order, so it is not a fork and does not pretend to be one. */}
      {SHOP_ENABLED ? (
        <section className="landing-ground-dark" aria-labelledby="two-ways">
          <div className="landing-section landing-dark-inner">
            <p className="landing-label">Two ways to order</p>
            <h2 id="two-ways">
              Buy it now, or <em>have it quoted</em>
            </h2>
            <p className="landing-lead">
              Which one you are on comes down to a single question: is the front flat, in a Polytec decorative
              board colour? If it is, the price is on the screen. If it is anything else, we work it out by
              hand.
            </p>
            <div className="landing-ways">
              {ROUTES.map((route) => (
                <article className={`landing-way landing-way-${route.tone}`} key={route.tone}>
                  <p className="landing-way-tag">{route.tag}</p>
                  <h3>{route.title}</h3>
                  <p>{route.blurb}</p>

                  <div className={`landing-basket landing-basket-${route.tone}`}>
                    <div className="landing-basket-head">
                      <b>{route.basket.title}</b>
                      <span>{route.basket.state}</span>
                      <em>Example</em>
                    </div>
                    {route.basket.lines.map(([what, spec, amount, swatch]) => (
                      <div className="landing-basket-row" key={what}>
                        <i style={{ background: swatch }} aria-hidden="true" />
                        <span>
                          <b>{what}</b>
                          <small>{spec}</small>
                        </span>
                        {amount ? (
                          <span className="landing-basket-amount">{amount}</span>
                        ) : (
                          <span className="landing-basket-pending">Quote</span>
                        )}
                      </div>
                    ))}
                    <div className="landing-basket-foot">{route.basket.foot}</div>
                  </div>

                  <ul>
                    {route.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <Link className="landing-way-btn" href={route.href}>
                    {route.label}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* MINT, NOT THE DARK GREEN IT USED TO BE. The band above is the fork, and
          two dark bands touching read as one long dark stretch however different
          the greens are. The four columns keep their structure; only the ink
          flips. With the shop closed nothing dark sits above this, so it takes
          the dark green back. */}
      <section
        className={SHOP_ENABLED ? "landing-ground-mint" : "landing-ground-dark"}
        id="how-it-works"
      >
        {/* landing-dark-inner is what makes the heading cream, so it only goes
            on when the ground is actually dark. */}
        <div className={`landing-section${SHOP_ENABLED ? "" : " landing-dark-inner"}`}>
          <p className="landing-label">Simple Process</p>
          <h2>
            From Measurement to <em>Your Front Door</em> in Four Steps
          </h2>
          <div className={`landing-steps${SHOP_ENABLED ? " landing-steps-light" : ""}`}>
            <article>
              <p>Step 01</p>
              <h3>Measure Your Openings</h3>
              <span>
                Note the height, width and thickness of each door or drawer front. We will guide you
                through the details needed for an accurate quote.
              </span>
            </article>
            <article>
              <p>Step 02</p>
              <h3>Choose Your Finish</h3>
              <span>
                Select from over 100 colours across Polytec, Laminex and Formica, plus our door profiles
                and edge details. We post samples free anywhere in Perth metro.
              </span>
            </article>
            <article>
              <p>Step 03</p>
              <h3>We Build &amp; Pre-Drill</h3>
              <span>
                Your panels are cut and finished in our Perth workshop, with hinge holes drilled to suit
                IKEA, Kaboodle or custom cabinets.
              </span>
            </article>
            <article>
              <p>Step 04</p>
              <h3>Flat-Rate Delivery</h3>
              <span>
                Completed doors are carefully packaged and delivered across Perth metro, ready to hang.
              </span>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section" id="materials">
        <p className="landing-label">Materials &amp; Finishes</p>
        <h2>
          Polytec, Laminex &amp; Formica. <em>All Made to Measure in Perth.</em>
        </h2>
        <p className="landing-lead">
          Three of Australia&apos;s major decorative surface ranges, all supplied and finished in our own
          workshop. Every colour below is available as a door, a drawer front or a panel, so a whole
          kitchen matches - including the pieces IKEA and Kaboodle do not make.
        </p>
        <div className="landing-card-grid">
          <article>
            <strong>Our Deepest Range</strong>
            <h3>Polytec</h3>
            <p>
              Contemporary colours in matte, gloss and textured finishes. Polytec thermolaminate is ideal
              for shaker-style profiled doors and wrap-around edge details.
            </p>
          </article>
          <article>
            <strong>Colour &amp; Timber Looks</strong>
            <h3>Laminex</h3>
            <p>
              A trusted Australian surface range with strong colour and timber-look options, including its
              stone and concrete-look finishes.
            </p>
          </article>
          <article>
            <strong>Something Less Common</strong>
            <h3>Formica</h3>
            <p>
              Decorative surfaces with distinctive colours, patterns and stone-look finishes for projects
              that want something you will not see next door.
            </p>
          </article>
        </div>
      </section>

      {/* THE COLOUR BAND. Full bleed, no container, straight after the sentence
          about the size of the range. It is the biggest visual break on the
          page and every tile in it is a real board out of the library. */}
      {bandColours.length ? (
        <section className="landing-ground-sand">
          <div className="landing-colour-band" aria-hidden="true">
            {bandColours.map((colour) => (
              <span key={colour.name} style={{ backgroundImage: `url(${colour.imageUrl})` }} title={colour.name} />
            ))}
          </div>
          <p className="landing-colour-note">
            Over 270 colours across Polytec, Laminex and Formica &nbsp;&middot;&nbsp;{" "}
            <Link href="/finishes">Browse the finishes</Link>
          </p>
        </section>
      ) : null}

      <section className="landing-ground-white">
        <div className="landing-section landing-style-section">
          <p className="landing-label">Door Styles We Offer</p>
          <h2>
            From Classic Shaker to <em>Contemporary Slab</em>
          </h2>
        <div className="landing-style-grid">
          <article>
            <h3>Thermolaminate Shaker</h3>
            <p>A timeless routed profile wrapped in thermolaminate for a seamless kitchen finish.</p>
            <figure className="landing-style-image">
              <img src="/images/bathroom-minor-portrait.jpg" alt="Bathroom cabinetry drawer and storage detail" />
            </figure>
          </article>
          <article>
            <h3>Flat Slab / Modern Panel</h3>
            <p>Clean lines and a flat face for minimalist kitchen refaces and bathroom vanities.</p>
            <figure className="landing-style-image">
              <img src="/images/bathroom-full-landscape.jpg" alt="Modern bathroom cabinetry with flat panel fronts" />
            </figure>
          </article>
          <article>
            <h3>Profiled &amp; Routed Edge</h3>
            <p>Front and side profile options for a more detailed custom appearance.</p>
            <figure className="landing-style-image">
              <img src="/images/vanity-detail-portrait.jpg" alt="Detailed custom vanity cabinetry profile" />
            </figure>
          </article>
          <article>
            <h3>Drawer Fronts</h3>
            <p>Matching drawer fronts in any style and finish, pre-drilled for easy installation.</p>
            <figure className="landing-style-image">
              <img src="/images/kitchen-detail-landscape.jpg" alt="Detailed cabinet surface and edge profile" />
            </figure>
          </article>
          </div>
        </div>
      </section>

      <section className="landing-ground-mint" id="bespoke">
        <div className="landing-section">
          <p className="landing-label">Full-Service Cabinetry</p>
          <h2>
            Full Bespoke Cabinetry, <em>Built for Every Room in Your Home</em>
          </h2>
          <p className="landing-lead">
            Perth Cabinet Doors is a professional cabinet making shop with a focus on quality craftsmanship.
            We design, build and install bespoke cabinetry across Perth metro, built to your space, style
            and budget.
          </p>
          <div className="landing-services">
            {[
              "Kitchen Cabinetry",
              "Bathroom Vanities",
              "Laundry Fitouts",
              "TV & Entertainment Units",
              "Bedroom Drawers",
              "Built-In Wardrobes",
              "Home Office",
              "Supply & Install",
            ].map((service) => (
              <div key={service}>{service}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-ground-cream">
        <div className="landing-section">
          <p className="landing-label">Why Perth Cabinet Doors</p>
          <h2>
            Competitive Cabinet Door Prices, <em>Backed by 20 Years of Expertise</em>
          </h2>
          <div className="landing-why-grid">
          <article>
            <strong>20+</strong>
            <h3>Years of Trade Experience</h3>
            <p>Trade knowledge that means better advice, better construction and better results.</p>
          </article>
          <article>
            <strong>270+</strong>
            <h3>Colours &amp; Finishes</h3>
            <p>Polytec, Laminex and Formica across matte, gloss, textured and timber-look finishes.</p>
          </article>
          <article>
            <strong>$</strong>
            <h3>Competitive Pricing</h3>
            <p>Professional, trade-quality cabinet doors without the premium showroom price tag.</p>
          </article>
          <article>
            <strong>Ready</strong>
            <h3>Ready to Fit</h3>
            <p>Doors can be pre-drilled, packaged and delivered ready to install.</p>
          </article>
          </div>
        </div>
      </section>

      <PublicSection className="landing-cta" id="contact">
        <p className="landing-label">Get Started Today</p>
        <h2>Ready to Transform Your Kitchen, Bathroom or Laundry?</h2>
        <p>
          Tell us what you need and we will come back with a free, no-obligation quote. From a single
          replacement door to a full custom fitout, we can help.
        </p>
        <div className="landing-cta-actions">
          <PublicButton href="/request-quote" className="landing-button landing-button-primary">
            Get a Free Quote
          </PublicButton>
          <PublicButton href="/start" className="landing-button landing-button-secondary">
            See Our Services
          </PublicButton>
        </div>
        <span>Flat-rate shipping across Perth metro - No minimum order - Expert advice from our team</span>
      </PublicSection>

      <PublicFooter className="landing-footer" separator="dash" />
    </main>
  );
}
