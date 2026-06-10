import AdminShell from "../../_components/AdminShell";
import { requireAdminSession } from "../../../../lib/admin-guard";
import { paymentNotificationHtml } from "../../../../lib/pcd-payment-notifications";
import styles from "../../admin-shell.module.css";

const sampleOrder = {
  id: "preview-order",
  order_number: "PCD-O-1042",
  quote_number: "PCD-Q-2208",
  customer_name: "Sample Customer",
};

const sampleQuote = {
  id: "preview-quote",
  quote_number: "PCD-Q-2208",
  customer_name: "Sample Customer",
  currency: "AUD",
};

const previews = [
  {
    key: "deposit",
    title: "Quote deposit payment",
    html: paymentNotificationHtml({
      payment: { payment_type: "deposit", amount: 1225.75 },
      order: sampleOrder,
      quote: sampleQuote,
      flow: "quote_deposit",
      adminOrderUrl: "https://perthcabinetdoors.com.au/admin/orders/preview-order",
    }),
  },
  {
    key: "progress",
    title: "Progress payment",
    html: paymentNotificationHtml({
      payment: { payment_type: "progress", amount: 2450 },
      order: sampleOrder,
      quote: sampleQuote,
      flow: "order_payment_request",
      adminOrderUrl: "https://perthcabinetdoors.com.au/admin/orders/preview-order",
    }),
  },
  {
    key: "final",
    title: "Final payment",
    html: paymentNotificationHtml({
      payment: { payment_type: "final", amount: 980.5 },
      order: sampleOrder,
      quote: sampleQuote,
      flow: "order_payment_request",
      adminOrderUrl: "https://perthcabinetdoors.com.au/admin/orders/preview-order",
    }),
  },
];

export default async function PaymentEmailPreviewPage() {
  await requireAdminSession();

  return (
    <AdminShell>
      <div className={styles.portalGrid}>
        {previews.map((preview) => (
          <section className={styles.portalPanel} key={preview.key}>
            <header className={styles.portalPanelHeader}>
              <div>
                <p className={styles.tableMeta}>Internal payment email preview</p>
                <h2>{preview.title}</h2>
              </div>
            </header>
            <iframe
              title={`${preview.title} email preview`}
              srcDoc={preview.html}
              style={{
                width: "100%",
                minHeight: "760px",
                border: "1px solid #d7dee8",
                borderRadius: "8px",
                background: "#ffffff",
              }}
            />
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
