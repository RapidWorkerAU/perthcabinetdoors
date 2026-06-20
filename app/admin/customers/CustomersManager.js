"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../admin-content.module.css";
import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../_components/AdminActionDropdown";
import { AdminTablePagination, useAdminTablePagination } from "../_components/AdminTablePagination";

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
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);

  const filteredCustomers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return customers;

    return customers.filter((customer) =>
      [customer.name, customer.company_name, customer.email, customer.phone, customer.site_address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [customers, search]);
  const customerPagination = useAdminTablePagination(filteredCustomers, search);

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

  function openNewCustomerModal() {
    setForm(emptyForm);
    setFeedback("");
    setIsCustomerModalOpen(true);
  }

  function openEditCustomerModal(customer) {
    setForm(formFromCustomer(customer));
    setFeedback("");
    setIsCustomerModalOpen(true);
  }

  function closeCustomerModal() {
    if (isSaving) return;
    setIsCustomerModalOpen(false);
    setForm(emptyForm);
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
      setCustomers((current) => {
        if (form.id) {
          return current.map((customer) => (customer.id === payload.customer.id ? payload.customer : customer));
        }

        return [payload.customer, ...current];
      });
      setForm(emptyForm);
      setIsCustomerModalOpen(false);
      setFeedback(message);
    } catch (error) {
      setFeedback(error?.message || "Could not save customer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCustomers(ids) {
    if (!ids.length) return;
    setIsSaving(true);
    setFeedback("");

    try {
      for (const id of ids) {
        const response = await fetch(`/api/admin/customers/${id}`, { method: "DELETE" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Could not delete customer.");
        }
      }

      setCustomers((current) => current.filter((customer) => !ids.includes(customer.id)));
      setSelectedCustomerIds((current) => current.filter((id) => !ids.includes(id)));
      setFeedback(`${ids.length} customer${ids.length === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      setFeedback(error?.message || "Could not delete selected customers.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleSelectedCustomer(id) {
    setSelectedCustomerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectedCustomerPage(checked) {
    const pageIds = customerPagination.pageItems.map((customer) => customer.id);
    setSelectedCustomerIds((current) => {
      if (!checked) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  return (
    <div className={styles.quoteBuilderShell}>
      <section className={styles.productsSection}>
        <div className={`${styles.productsHeaderBar} ${styles.tableToolbar} ${styles.customerToolbar}`}>
          <div className={styles.tableToolbarFilters}>
            <AdminBulkDeleteButton count={selectedCustomerIds.length} disabled={isSaving} onConfirm={() => deleteCustomers(selectedCustomerIds)} />
            <input
              className={styles.customerSearchInput}
              placeholder="Search customers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className={styles.tableToolbarActions}>
            <button type="button" className={styles.primaryButton} onClick={openNewCustomerModal}>
              Add customer
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
                <th className={styles.rowSelectCol}>
                  <input
                    type="checkbox"
                    checked={customerPagination.pageItems.length > 0 && customerPagination.pageItems.every((customer) => selectedCustomerIds.includes(customer.id))}
                    onChange={(event) => toggleSelectedCustomerPage(event.target.checked)}
                    aria-label="Select all visible customers"
                  />
                </th>
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
              {customerPagination.pageItems.map((customer) => (
                <tr key={customer.id}>
                  <td className={styles.rowSelectCol}>
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(customer.id)}
                      onChange={() => toggleSelectedCustomer(customer.id)}
                      aria-label={`Select ${customer.name || "customer"}`}
                    />
                  </td>
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
                  <td className={styles.actionsCol}>
                    <AdminActionDropdown label={`Open actions for ${customer.name || "customer"}`}>
                      <button type="button" className={styles.tableActionMenuItem} onClick={() => openEditCustomerModal(customer)}>
                        Edit
                      </button>
                      <AdminConfirmDeleteAction disabled={isSaving} onConfirm={() => deleteCustomers([customer.id])} />
                    </AdminActionDropdown>
                  </td>
                </tr>
              ))}

              {!filteredCustomers.length && !isLoading ? (
                <tr>
                  <td colSpan="9" className={styles.emptyCell}>
                    No customers found.
                  </td>
                </tr>
              ) : null}

              {isLoading ? (
                <tr>
                  <td colSpan="9" className={styles.emptyCell}>
                    Loading customers...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AdminTablePagination
          label="customers"
          page={customerPagination.page}
          pageCount={customerPagination.pageCount}
          totalItems={customerPagination.totalItems}
          onPageChange={customerPagination.setPage}
        />
      </section>

      {isCustomerModalOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label={form.id ? "Edit customer" : "Add customer"}>
          <form className={`${styles.customerModal} ${styles.customerRecordModal}`} onSubmit={saveCustomer}>
            <header className={styles.customerModalHeader}>
              <div className={styles.customerModalIcon}>{form.id ? "ED" : "AD"}</div>
              <div>
                <p className={styles.tableMeta}>{form.id ? "Edit customer" : "New customer"}</p>
                <h2>{form.id ? "Edit Customer" : "Add Customer"}</h2>
              </div>
              <button type="button" className={styles.modalCloseButton} onClick={closeCustomerModal} disabled={isSaving}>
                Close
              </button>
            </header>

            <div className={styles.customerModalBody}>
              <div className={styles.customerModalGrid}>
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
                    rows={4}
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

            <footer className={styles.customerModalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={closeCustomerModal} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className={styles.primaryButton} disabled={isSaving}>
                {isSaving ? "Saving..." : form.id ? "Save customer" : "Add customer"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}

