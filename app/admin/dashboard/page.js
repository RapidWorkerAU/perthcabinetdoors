import AdminShell from "../_components/AdminShell";
import { requireAdminSession } from "../../../lib/admin-guard";
import styles from "../admin-shell.module.css";

export default async function AdminDashboardPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <section className={styles.emptyState}>
        <p>Dashboard content placeholder.</p>
      </section>
    </AdminShell>
  );
}

