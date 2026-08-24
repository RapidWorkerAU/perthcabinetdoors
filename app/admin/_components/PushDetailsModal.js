"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { defaultSelection, pushSummary, targetKey } from "../../../lib/pcd-customer-push";
import { formatAdminLabel } from "../_utils/formatAdminLabel";

// "You changed the customer. Should their jobs change too?"
//
// WHY IT ASKS RATHER THAN DOING IT. A quote and an order each keep their own
// copy of the customer's details on purpose: a second kitchen at an investment
// property is a real job at an address that is not where the customer lives.
// Pushing automatically would redirect a delivery every time somebody corrected
// a home address.
//
// WHY IT ASKS RATHER THAN NOT. The far more common case is the plain one: the
// customer moved, or the address was typed wrong, and every open job is now
// wrong with it. Making somebody open six orders and retype it is how five of
// them stay wrong.
//
// So it shows exactly what would change, ticks what is still in play, and lets
// a person untick anything that should keep its own details.

function statusWords(target) {
  if (target.live) return target.type === "quote" ? "Still out" : "Still running";
  // The label, not the column. "pending_deposit" is a key.
  return target.status ? formatAdminLabel(target.status) : "Finished";
}

export default function PushDetailsModal({ open, onClose, onDone, customerId, customerName }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targets, setTargets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !customerId) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/admin/customers/${customerId}/push-details`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload.ok) {
          setError(payload.error || "Could not work out what would change.");
          setTargets([]);
          return;
        }
        setTargets(payload.targets || []);
        setSelected(defaultSelection(payload.targets || []));
      })
      .catch((problem) => {
        if (!cancelled) setError(problem?.message || "Could not work out what would change.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  if (!open) return null;

  const toggle = (key) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );

  async function push() {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/push-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: selected }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setError(payload.error || "Could not update those jobs.");
        return;
      }
      onDone(payload.updated || 0);
      onClose();
    } catch (problem) {
      setError(problem?.message || "Could not update those jobs.");
    } finally {
      setSaving(false);
    }
  }

  const nothingToDo = !loading && !error && targets.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Update their jobs too?"
      subtitle={`The customer record is already saved${customerName ? ` for ${customerName}` : ""}`}
      size="lg"
      footer={
        nothingToDo ? (
          <button
            type="button"
            className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors"
            onClick={onClose}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              className="h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
              onClick={onClose}
              disabled={saving}
            >
              Just the customer record
            </button>
            <button
              type="button"
              className="h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors"
              onClick={push}
              disabled={saving || loading || !selected.length}
            >
              {saving ? "Updating…" : `Update ${selected.length} ${selected.length === 1 ? "job" : "jobs"}`}
            </button>
          </>
        )
      }
    >
      {loading ? (
        <p className="text-[13px] text-[#5a5a52]">Looking at their quotes and orders…</p>
      ) : error ? (
        <p className="rounded-[6px] border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-[12.5px] leading-[1.5] text-[#991b1b]">
          {error}
        </p>
      ) : nothingToDo ? (
        <p className="text-[13px] leading-[1.6] text-[#5a5a52]">
          Every quote and order for this customer already carries these details, so there is nothing to push.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-[1.6] text-[#5a5a52]">
            {/* Said plainly, because the whole point is that this is a choice. */}
            These jobs carry their own copy of the customer&apos;s details and would change. Anything still in play is
            ticked; finished and cancelled work is not, because changing where a delivered job went is a rewrite rather
            than a correction.
          </p>

          <div className="overflow-hidden rounded-[7px] border border-[#dbd8cc]">
            {targets.map((target) => {
              const key = targetKey(target);
              const on = selected.includes(key);
              return (
                <label
                  key={key}
                  className={`flex min-h-[52px] cursor-pointer items-start gap-3 border-b border-[#edf4eb] px-3 py-[10px] last:border-b-0 ${
                    on ? "bg-[#f5fff5]" : "bg-white hover:bg-[#faf9f5]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(key)}
                    disabled={saving}
                    className="mt-[3px] h-[16px] w-[16px] flex-none accent-[#2d5e28]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13px] font-semibold text-[#1a1a18]">{target.ref}</span>
                      {target.name && <span className="truncate text-[12px] text-[#5a5a52]">{target.name}</span>}
                      <span
                        className={`rounded-full px-[6px] text-[10px] font-semibold ${
                          target.live ? "bg-[#edf4eb] text-[#2d5e28]" : "bg-[#f5f5f4] text-[#8b8a81]"
                        }`}
                      >
                        {statusWords(target)}
                      </span>
                    </span>
                    {/* What it says NOW, so a person can see what is being
                        replaced rather than only what it is replaced with. */}
                    <span className="mt-[2px] block break-words text-[11.5px] text-[#8b8a81]">
                      Now: {target.currentAddress}
                    </span>
                    <span className="block text-[11.5px] text-[#8b8a81]">
                      Would change: {target.changed.join(", ")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <p className="text-[12px] text-[#5a5a52]">{pushSummary(selected.length, targets)}</p>
        </div>
      )}
    </Modal>
  );
}
