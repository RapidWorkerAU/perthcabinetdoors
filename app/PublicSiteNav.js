export default function PublicSiteNav({ active = "", variant = "solid" }) {
  const isActive = (key) => (active === key ? " is-active" : "");

  return (
    <nav className={`public-site-nav public-site-nav-${variant}`} aria-label="Primary">
      <div className="public-site-nav-inner">
        <a href="/" className="public-site-logo-link" aria-label="Perth Cabinet Doors home">
          <img src="/images/light-pcd-logo-horizontal.png" alt="Perth Cabinet Doors" />
        </a>
        <div className="public-site-nav-links">
          <a href="/" className={isActive("home")}>
            Home
          </a>
          <a href="/products" className={isActive("products")}>
            Products
          </a>
          <a href="/#how-it-works">How It Works</a>
          <a href="/#materials">Materials</a>
          <a href="/#bespoke">Bespoke</a>
          <a href="/contact" className={isActive("contact")}>
            Contact
          </a>
        </div>
        <div className="public-site-nav-actions">
          <a href="/admin" className="public-site-nav-login">
            Login
          </a>
          <a href="/request-quote" className="public-site-nav-quote">
            Get a Quote
          </a>
        </div>
      </div>
    </nav>
  );
}
