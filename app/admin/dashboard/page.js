import Link from "next/link";
import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import styles from "../admin-shell.module.css";

const mobileTasks = [
  {
    href: "/admin/quotes",
    icon: "QT",
    title: "Quote jobs",
    status: "Mobile ready",
    meta: "Create, edit, price and send quotes",
    description: "Best for simple quote edits, line items, customer details, notes, totals and approval links while away from the desk.",
    cta: "Open quotes",
  },
  {
    href: "/admin/quote-requests",
    icon: "RQ",
    title: "Review requests",
    status: "Mobile ready",
    meta: "Convert website requests into quotes",
    description: "Check incoming customer details, read project notes, and start the next quote without needing a desktop screen.",
    cta: "Open requests",
  },
  {
    href: "/admin/customers",
    icon: "CU",
    title: "Customers",
    status: "Mobile ready",
    meta: "Find and update contacts",
    description: "Look up customer records, phone/email details and job history when following up from site or the workshop.",
    cta: "Open customers",
  },
  {
    href: "/admin/orders",
    icon: "OR",
    title: "Orders",
    status: "Review focused",
    meta: "Check production and payment state",
    description: "Use mobile for review and status checks. Detailed production admin is still better on a larger screen.",
    cta: "Open orders",
  },
  {
    href: "/admin/products",
    icon: "PR",
    title: "Catalogue",
    status: "Light edits",
    meta: "Products, media and quote config",
    description: "Quick product checks and small edits work on mobile. Heavy catalogue setup is still a desktop task.",
    cta: "Open products",
  },
  {
    href: "/admin/defaults",
    icon: "DF",
    title: "Defaults",
    status: "Desktop preferred",
    meta: "Global pricing assumptions",
    description: "Available on mobile for urgent changes, but use desktop for careful pricing and configuration work.",
    cta: "Open defaults",
  },
];

export default async function AdminDashboardPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <section className={styles.portalPanel}>
        <header className={styles.portalPanelHeader}>
          <div>
            <h2>Mobile operations hub</h2>
            <p>Fast access to the admin tasks that are practical from a phone.</p>
          </div>
          <span className={styles.portalPanelBadge}>Backend app</span>
        </header>
        <div className={styles.portalPanelBody}>
          <div className={styles.portalTiles}>
            {mobileTasks.map((task) => (
              <Link href={task.href} className={styles.portalTile} key={task.href}>
                <span className={styles.portalTileTop}>
                  <span className={styles.portalTileIcon} aria-hidden="true">{task.icon}</span>
                  <span className={styles.portalTileStatus}>{task.status}</span>
                </span>
                <h3>{task.title}</h3>
                <span className={styles.portalTileMeta}>{task.meta}</span>
                <p>{task.description}</p>
                <span className={styles.portalTileCta}>{task.cta}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
