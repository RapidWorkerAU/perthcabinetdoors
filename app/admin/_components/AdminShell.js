"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import styles from "./admin-shell-layout.module.css";

const primaryItems = [
  {
    key: "dashboard",
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: "/images/icons/organisation.svg",
  },
  {
    key: "communication",
    href: "/admin/enquiries",
    label: "Communication",
    icon: "/images/icons/communications.svg",
    children: [
      { href: "/admin/enquiries", label: "Enquiries" },
      { href: "/admin/quote-requests", label: "Quote requests" },
    ],
  },
  {
    key: "order-management",
    href: "/admin/quotes",
    label: "Order Management",
    icon: "/images/icons/orders.svg",
    children: [
      { href: "/admin/quotes", label: "Quotes" },
      { href: "/admin/orders", label: "Orders" },
    ],
  },
  {
    key: "design-tool",
    href: "/admin/design",
    label: "Design Tool",
    icon: "✏",
  },
  {
    key: "business-admin",
    href: "/admin/customers",
    label: "Business Admin",
    icon: "/images/icons/business.svg",
    children: [
      { href: "/admin/customers", label: "Customers" },
      { href: "/admin/options", label: "Colour library" },
      { href: "/admin/products", label: "Products" },
    ],
  },
];

const footerItems = [
  {
    key: "settings",
    href: "/admin/settings",
    label: "Settings",
    icon: "/images/icons/settings.svg",
  },
];

const pageMeta = [
  {
    match: "/admin/dashboard",
    eyebrow: "PCD Admin",
    title: "Dashboard",
    subtitle: "Manage products, quote settings, orders, and website content.",
  },
  {
    match: "/admin/orders",
    eyebrow: "Operations",
    title: "Orders",
    subtitle: "Review customer orders and production workflow.",
  },
  {
    match: "/admin/enquiries",
    eyebrow: "Inbox",
    title: "Enquiries",
    subtitle: "Review general website enquiries and update their follow-up status.",
  },
  {
    match: "/admin/quote-requests",
    eyebrow: "Quoting",
    title: "Quote Requests",
    subtitle: "Review public quote requests and convert them into editable quotes.",
  },
  {
    match: "/admin/customers",
    eyebrow: "Contacts",
    title: "Customers",
    subtitle: "Manage saved customer contacts for quotes, projects, and general enquiries.",
  },
  {
    match: "/admin/quotes",
    eyebrow: "Quoting",
    title: "Quotes",
    subtitle: "Create cabinet making quotes, send approval links, and convert approvals into orders.",
  },
  {
    match: "/admin/products/new",
    eyebrow: "Catalogue",
    title: "New Product",
    subtitle: "Create a product listing for the public catalogue.",
  },
  {
    match: "/admin/products",
    eyebrow: "Catalogue",
    title: "Products",
    subtitle: "Manage product listings, media, page content, and quote setup.",
  },
  {
    match: "/admin/options",
    eyebrow: "Catalogue",
    title: "Colour Library",
    subtitle: "Manage colour tile images, finishes, and material assignments used across products and quote forms.",
  },
  {
    match: "/admin/settings",
    eyebrow: "Account",
    title: "Settings",
    subtitle: "Manage admin login details and account access.",
  },
  {
    match: "/admin/design",
    eyebrow: "Design",
    title: "Design Tool",
    subtitle: "Build cabinet layouts visually and import them into quotes.",
  },
];

function isPathActive(pathname, href) {
  if (href === "/admin/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getPageMeta(pathname) {
  if (pathname.startsWith("/admin/quotes/")) {
    return {
      eyebrow: "Quoting",
      title: "Quote Builder",
      subtitle: "Build cabinet making quotes, price the job, send approval links, and track approval progress.",
    };
  }

  if (pathname.includes("/admin/products/") && pathname.endsWith("/edit")) {
    return {
      eyebrow: "Catalogue",
      title: "Edit Product",
      subtitle: "Update product details, media, pricing labels, and catalogue status.",
    };
  }

  if (pathname.includes("/admin/products/") && pathname.endsWith("/quote")) {
    return {
      eyebrow: "Quoting",
      title: "Quote Config",
      subtitle: "Manage quote fields, option sets, dimensions, and pricing rules for this product.",
    };
  }

  return pageMeta.find((item) => isPathActive(pathname, item.match)) || pageMeta[0];
}

function renderSidebarIcon(item) {
  if (item.icon?.startsWith("/")) {
    return <img src={item.icon} alt="" className={styles.sidebarIconImage} />;
  }

  return item.icon;
}

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceLoaded, setSidebarPreferenceLoaded] = useState(false);
  const [openSections, setOpenSections] = useState([]);
  const [logoutConfirmArmed, setLogoutConfirmArmed] = useState(false);
  const [notifications, setNotifications] = useState({});

  const meta = useMemo(() => getPageMeta(pathname), [pathname]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data?.user?.email || "Admin");
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const response = await fetch("/api/admin/notifications", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && response.ok && payload.ok) {
          setNotifications(payload.notifications || {});
        }
      } catch {
        if (!cancelled) {
          setNotifications({});
        }
      }
    }

    loadNotifications();
    window.addEventListener("focus", loadNotifications);
    const intervalId = window.setInterval(loadNotifications, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadNotifications);
      window.clearInterval(intervalId);
    };
  }, [pathname]);

  useEffect(() => {
    const storedValue = localStorage.getItem("pcd_admin_sidebar_collapsed");
    setSidebarCollapsed(storedValue === "true");
    setSidebarPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!sidebarPreferenceLoaded) return;
    localStorage.setItem("pcd_admin_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed, sidebarPreferenceLoaded]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!logoutConfirmArmed) return;
    const timeoutId = window.setTimeout(() => setLogoutConfirmArmed(false), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [logoutConfirmArmed]);

  useEffect(() => {
    const activeGroups = primaryItems
      .filter((item) => item.children?.some((child) => isPathActive(pathname, child.href)))
      .map((item) => item.key);

    if (activeGroups.length) {
      setOpenSections(activeGroups);
    }
  }, [pathname]);

  async function handleSignOut() {
    if (!logoutConfirmArmed) {
      setLogoutConfirmArmed(true);
      return;
    }

    setIsBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push("/admin");
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  function toggleSection(key) {
    setOpenSections((current) => (current.includes(key) ? [] : [key]));
  }

  function notificationCountForHref(href) {
    return Number(notifications[href] || 0);
  }

  function notificationCountForItem(item) {
    if (item.children?.length) {
      return item.children.reduce((total, child) => total + notificationCountForHref(child.href), 0);
    }

    return notificationCountForHref(item.href);
  }

  function renderCountBadge(count, className = "") {
    if (!count) return null;
    return <span className={`${styles.navNotificationBadge} ${className}`}>{count > 99 ? "99+" : count}</span>;
  }

  function renderNotificationDot(count, className = "") {
    if (!count) return null;
    return <span className={`${styles.navNotificationDot} ${className}`} aria-hidden="true" />;
  }

  function renderNavItem(item, options = {}) {
    const isMobile = options.mobile;
    const isActive =
      isPathActive(pathname, item.href) ||
      item.children?.some((child) => isPathActive(pathname, child.href));
    const isOpen = openSections.includes(item.key);
    const itemNotificationCount = notificationCountForItem(item);

    if (item.children?.length && (isMobile || !sidebarCollapsed)) {
      if (isMobile) {
        return (
          <div
            key={item.key}
            className={`${styles.mobileMenuItem} ${styles.mobileMenuGroup} ${
              isOpen ? styles.mobileMenuGroupOpen : ""
            }`}
          >
            <button
              type="button"
              className={styles.mobileMenuGroupTrigger}
              aria-expanded={isOpen}
              onClick={() => toggleSection(item.key)}
            >
              <span className={styles.mobileMenuItemLabel}>
                <span>{item.label}</span>
                {renderNotificationDot(itemNotificationCount)}
              </span>
              <span className={styles.mobileMenuGroupChevron} aria-hidden="true" />
            </button>
            <div
              className={`${styles.mobileMenuSubnav} ${isOpen ? styles.mobileMenuSubnavOpen : ""}`}
              aria-hidden={!isOpen}
            >
              {item.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className={styles.mobileMenuSublink}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>{child.label}</span>
                  {renderCountBadge(notificationCountForHref(child.href))}
                </Link>
              ))}
            </div>
          </div>
        );
      }

      return (
        <div
          key={item.key}
          className={`${styles.sidebarItem} ${styles.sidebarGroup} ${isOpen ? styles.sidebarGroupOpen : ""}`}
        >
          <button
            type="button"
            className={`${styles.sidebarGroupTrigger} ${isActive ? styles.sidebarLinkActive : ""}`}
            aria-expanded={isOpen}
            onClick={() => toggleSection(item.key)}
          >
              <span className={styles.sidebarTriggerMain}>
                <span className={styles.sidebarIconFrame} aria-hidden="true">
                  {renderSidebarIcon(item)}
                </span>
                <span className={styles.sidebarLinkLabel}>{item.label}</span>
                {renderNotificationDot(itemNotificationCount)}
              </span>
            <span className={styles.sidebarToggleChevron} aria-hidden="true" />
          </button>
          <div
            className={`${styles.sidebarSubnav} ${isOpen ? styles.sidebarSubnavOpen : ""}`}
            aria-hidden={!isOpen}
          >
            {item.children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className={`${styles.sidebarSublink} ${
                  isPathActive(pathname, child.href) ? styles.sidebarSublinkActive : ""
                }`}
              >
                <span className={styles.sidebarSublinkLabel}>{child.label}</span>
                {renderCountBadge(notificationCountForHref(child.href))}
              </Link>
            ))}
          </div>
        </div>
      );
    }

    if (isMobile) {
      return (
        <div key={item.key} className={styles.mobileMenuItem}>
          <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
            <span>{item.label}</span>
            {renderCountBadge(itemNotificationCount)}
          </Link>
        </div>
      );
    }

    return (
      <div key={item.key} className={styles.sidebarItem}>
        <Link
          href={item.href}
          className={`${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ""}`}
          title={item.label}
          aria-label={item.label}
        >
          <span className={styles.sidebarIconFrame} aria-hidden="true">
            {renderSidebarIcon(item)}
          </span>
          <span className={styles.sidebarLinkLabel}>{item.label}</span>
          {item.children?.length ? renderNotificationDot(itemNotificationCount) : renderCountBadge(itemNotificationCount)}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.viewport}>
      <div className={styles.deviceShell}>
        <div className={styles.deviceBezel}>
          <header className={styles.mobileHeader}>
            <Link href="/admin/dashboard" className={styles.mobileHeaderBrand} aria-label="PCD admin dashboard">
              <img src="/images/horizontal-pcd-logo.png" alt="Perth Cabinet Doors" />
              <span className={styles.mobileHeaderBrandText}>PCD Admin</span>
            </Link>

            <button
              type="button"
              className={styles.mobileHeaderMenuButton}
              title="Open menu"
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className={styles.mobileHeaderMenuIcon} aria-hidden="true">
                <span />
              </span>
            </button>
          </header>

          <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}>
            <div className={styles.sidebarTop}>
              <Link href="/admin/dashboard" className={styles.brand} aria-label="PCD admin dashboard">
                <span className={styles.brandMark}>
                  <img src="/images/rectangle-pcd-logo.png" alt="" className={styles.brandImage} />
                </span>
                <span className={styles.brandText}>Perth Cabinet Doors</span>
              </Link>

              <button
                type="button"
                className={styles.sidebarCollapseButton}
                aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
                aria-pressed={sidebarCollapsed}
                onClick={() => setSidebarCollapsed((current) => !current)}
              >
                <span className={styles.sidebarCollapseIcon} aria-hidden="true" />
              </button>
            </div>

            <nav className={styles.sidebarNav} aria-label="Admin navigation">
              {primaryItems.map((item) => renderNavItem(item))}
            </nav>

            <div className={styles.sidebarFooter}>
              {footerItems.map((item) => renderNavItem(item))}
              <button
                type="button"
                className={`${styles.sidebarLink} ${styles.logoutButton} ${
                  logoutConfirmArmed ? styles.sidebarLinkConfirm : ""
                }`}
                title={logoutConfirmArmed ? "Click again to confirm logout" : "Logout"}
                aria-label={logoutConfirmArmed ? "Confirm logout" : "Logout"}
                onClick={handleSignOut}
                disabled={isBusy}
              >
                <span className={styles.sidebarIconFrame} aria-hidden="true">
                  <img src="/images/icons/logout.svg" alt="" className={styles.sidebarIconImage} />
                </span>
                <span className={styles.sidebarLinkLabel}>
                  {isBusy ? "Logging out..." : logoutConfirmArmed ? "Confirm Logout" : "Logout"}
                </span>
              </button>
            </div>
          </aside>

          <section className={styles.canvas}>
            <header className={styles.topbar}>
              <div className={styles.topbarPrimary}>
                <div className={styles.greetingBlock}>
                  <p className={styles.eyebrow}>{meta.eyebrow}</p>
                  <h1 className={styles.title}>{meta.title}</h1>
                  <p className={styles.subtitle}>{meta.subtitle}</p>
                </div>
              </div>

              <div className={styles.topbarActions}>
                <div className={styles.accountSummary}>
                  <div className={styles.accountSummaryText}>
                    <div className={styles.accountSummaryPrimary}>
                      <span className={styles.accountSummaryLabel}>My account</span>
                      <span className={styles.accountSummaryValue}>{adminEmail || "Logged in"}</span>
                    </div>
                    <span className={`${styles.accessPill} ${styles.accessPillAdmin}`}>
                      Administrator Access
                    </span>
                  </div>
                </div>
              </div>
            </header>

            <main className={styles.body}>{children}</main>
          </section>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className={styles.mobileMenu} role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className={styles.mobileMenuHeader}>
            <Link
              href="/admin/dashboard"
              className={styles.mobileMenuBrand}
              aria-label="PCD admin dashboard"
              onClick={() => setMobileMenuOpen(false)}
            >
              <img src="/images/rectangle-pcd-logo.png" alt="" />
              <span>PCD Admin</span>
            </Link>

            <button
              type="button"
              className={styles.mobileMenuClose}
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className={styles.mobileMenuCloseIcon} aria-hidden="true" />
            </button>
          </div>

          <nav className={styles.mobileMenuNav} aria-label="Admin mobile navigation">
            {primaryItems.map((item) => renderNavItem(item, { mobile: true }))}
            {footerItems.map((item) => renderNavItem(item, { mobile: true }))}
          </nav>

          <div className={styles.mobileMenuActions}>
            <button type="button" className={styles.mobileMenuLogout} onClick={handleSignOut} disabled={isBusy}>
              {isBusy ? "Logging out..." : logoutConfirmArmed ? "Confirm Logout" : "Logout"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
