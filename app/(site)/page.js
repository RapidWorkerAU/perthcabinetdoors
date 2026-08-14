import LandingHeroVideo from "./LandingHeroVideo";
import PublicSiteNav from "./PublicSiteNav";
import PublicButton from "@/components/public/PublicButton";
import PublicFooter from "@/components/public/PublicFooter";
import PublicSection from "@/components/public/PublicSection";

export const metadata = {
  title: "Perth Cabinet Doors | Custom Cabinet Doors, Panels & Drawer Fronts - Perth WA",
  description:
    "Perth's cabinet door specialists. Ready-made doors, panels and drawer fronts in Polytec, pre-drilled, hinged and shipped flat rate across Perth metro.",
};

export default function HomePage() {
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

      <section className="landing-section landing-split">
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
      </section>

      <section className="landing-dark-section" id="how-it-works">
        <div className="landing-section landing-dark-inner">
          <p className="landing-label">Simple Process</p>
          <h2>
            From Measurement to <em>Your Front Door</em> in Four Steps
          </h2>
          <div className="landing-steps">
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

      <section className="landing-section landing-style-section">
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
      </section>

      <section className="landing-bespoke" id="bespoke">
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

      <section className="landing-section">
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
            <strong>100+</strong>
            <h3>Colours &amp; Finishes</h3>
            <p>Polytec colours across matte, gloss, textured and timber-look finishes.</p>
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
