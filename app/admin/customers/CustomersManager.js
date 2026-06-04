"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../admin-shell.module.css";

const emptyForm = {
  id: "",
  name: "",
  company_name: "",
  email: "",
  phone: "",
  site_address: "",
  notes: "",
  is_active: true,
};

function formatDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formFromCustomer(customer) {
  return {
    ...emptyForm,
    ...customer,
    name: customer.name || "",
    company_name: customer.company_name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    site_address: customer.site_address || "",
    notes: customer.notes || "",
    is_active: customer.is_active ?? true,
  };
}

export default function CustomersManager() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCustomers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return customers;

    return customers.filter((customer) =>
      [customer.name, customer.company_name, customer.email, customer.phone, customer.site_address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [customers, search]);

  async function loadCustomers() {
    setIsLoading(true);
    setFeedback("");

    try {
      const response = await fetch("/api/admin/customers", { cache: "no-store" });
      const payload = await response.json();
      setSetupRequired(!!payload.setupRequired);
      setCustomers(payload.customers || []);

      if (payload.error) {
        setFeedback(payload.error);
      }
    } catch (error) {
      setFeedback(error?.message || "Could not load customers.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setFeedback("");
  }

  async function saveCustomer(event) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");

    const endpoint = form.id ? `/api/admin/customers/${form.id}` : "/api/admin/customers";
    const method = form.id ? "PATCH" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setFeedback(payload.error || "Could not save customer.");
        return;
      }

      const message = form.id ? "Customer updated." : "Customer added.";
      setForm(formFromCustomer(payload.customer));
      await loadCustomers();
      setFeedback(message);
    } catch (error) {
      setFeedback(error?.message || "Could not save customer.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.quoteBuilderShell}>
      <form className={styles.productsSection} onSubmit={saveCustomer}>
        <div className={styles.productsHeaderBar}>
          <div>
            <p className={styles.tableMeta}>{form.id ? "Edit customer" : "New customer"}</p>
          </div>
          <div className={styles.rowActions}>
            {form.id ? (
              <button type="button" className={styles.secondaryButton} onClick={resetForm}>
                New customer
              </button>
            ) : null}
            <button type="submit" className={styles.primaryButton} disabled={isSaving}>
              {isSaving ? "Saving..." : form.id ? "Save customer" : "Add customer"}
            </button>
          </div>
        </div>

        <div className={styles.customerFormBody}>
          <div className={styles.customerFormGrid}>
            <label className={styles.fieldLabel}>
              Contact name
              <input
                className={styles.fieldInput}
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                required
              />
            </label>
            <label className={styles.fieldLabel}>
              Company
              <input
                className={styles.fieldInput}
                value={form.company_name}
                onChange={(event) => updateForm("company_name", event.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Email
              <input
                className={styles.fieldInput}
                type="email"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Phone
              <input
                className={styles.fieldInput}
                value={form.phone}
                onChange={(event) => updateForm("phone", event.target.value)}
              />
            </label>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
              Site / delivery address
              <input
                className={styles.fieldInput}
                value={form.site_address}
                onChange={(event) => updateForm("site_address", event.target.value)}
              />
            </label>
            <label className={`${styles.fieldLabel} ${styles.fieldWide}`}>
              Notes
              <textarea
                className={styles.textareaInput}
                rows={3}
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
              />
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => updateForm("is_active", event.target.checked)}
              />
              Active customer
            </label>
          </div>
        </div>
      </form>

      <section className={styles.productsSection}>
        <div className={styles.productsHeaderBar}>
          <div>
            <p className={styles.tableMeta}>
              {isLoading ? "Loading customers" : `${filteredCustomers.length} of ${customers.length} customers`}
            </p>
          </div>
          <div className={styles.rowActions}>
            <input
              className={styles.customerSearchInput}
              placeholder="Search customers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="button" className={styles.secondaryButton} onClick={loadCustomers} disabled={isLoading}>
              Refresh
            </button>
          </div>
        </div>

        {setupRequired ? (
          <div className={styles.inlineNotice}>Run the updated `supabase/quote_project_workflow_setup.sql` before saving customers.</div>
        ) : null}
        {feedback ? <div className={styles.inlineNotice}>{feedback}</div> : null}

        <div className={styles.productsTableWrap}>
          <table className={styles.productsTable}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Status</th>
                <th>Updated</th>
                <th className={styles.actionsCol}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td className={styles.productNameCell}>{customer.name || "-"}</td>
                  <td>{customer.company_name || "-"}</td>
                  <td>{customer.email || "-"}</td>
                  <td>{customer.phone || "-"}</td>
                  <td>{customer.site_address || "-"}</td>
                  <td>
                    <span className={`${styles.statusPill} ${customer.is_active ? styles.statusPillActive : styles.statusPillDraft}`}>
                      {customer.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{formatDate(customer.updated_at || customer.created_at)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.rowEditButton} onClick={() => setForm(formFromCustomer(customer))}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!filteredCustomers.length && !isLoading ? (
                <tr>
                  <td colSpan="8" className={styles.emptyCell}>
                    No customers found.
                  </td>
                </tr>
              ) : null}

              {isLoading ? (
                <tr>
                  <td colSpan="8" className={styles.emptyCell}>
                    Loading customers...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
