"use client";

// The terms library on the Business Defaults screen.
//
// This replaced a single "Default terms text" box. One box meant every quote
// carried the same wording whether or not it fitted the job, so anything about
// installation, removal or acceptance was either on quotes it did not apply to
// or retyped by hand each time.
//
// Each term saves on its own rather than through the Save defaults button at
// the bottom of the screen. Adding a term, renaming one and switching Always
// are separate decisions from changing an hourly rate, and tying them to one
// submit meant a half-finished term blocked saving a number.

import { useCallback, useEffect, useState } from "react";
import TermsEditor from "./TermsEditor";
import { termsHtmlToPlainText, toTermsHtml } from "../../../lib/pcd-terms-html";

const EMPTY_DRAFT = { id: null, name: "", body_html: "", always_include: false };

export default function QuoteTermsManager() {
  const [terms, setTerms] = useState([]);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/quote-terms", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setError(payload.error || "Could not load your terms.");
        return;
      }
      setTerms(payload.terms || []);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your terms.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function send(method, body, query = "") {
    setBusy(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch(`/api/admin/quote-terms${query}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setError(payload.error || "Could not save.");
        return null;
      }
      await load();
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Give the term a name.");
      return;
    }
    const body = { name: draft.name, body_html: draft.body_html, always_include: draft.always_include };
    const saved = draft.id
      ? await send("PATCH", { ...body, id: draft.id })
      : await send("POST", body);
    if (saved) {
      setDraft(null);
      setStatus(draft.id ? "Term updated." : "Term added.");
    }
  }

  async function toggleAlways(term) {
    const saved = await send("PATCH", { id: term.id, always_include: !term.always_include });
    if (saved) {
      setStatus(
        term.always_include
          ? `"${term.name}" is now added only when you choose it.`
          : `"${term.name}" will start every new quote.`
      );
    }
  }

  async function remove(term) {
    // Deleting takes it out of the library and changes no existing quote, since
    // every quote holds its own copy of the wording. Worth saying out loud on
    // the button, so nobody avoids tidying the library for fear of rewriting
    // history.
    if (typeof window !== "undefined" && !window.confirm(`Delete "${term.name}"? Quotes already using this wording keep it.`)) return;
    const saved = await send("DELETE", null, `?id=${encodeURIComponent(term.id)}`);
    if (saved) setStatus(`"${term.name}" deleted.`);
  }

  const previewOf = (term) => {
    const text = termsHtmlToPlainText(term.body_html);
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  };

  return (
    <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Quote terms</p>
      </div>

      <div className="p-4">
        <p className="mb-3 text-[11px] leading-snug text-[#8b8a81]">
          Terms are named so a quote can carry the wording that fits the job. A term marked <strong>Always</strong> starts
          every new quote. The rest wait here until you add them from the Notes tab of a quote. Adding a term copies its
          wording onto that quote, so editing it here never rewrites a quote you have already sent.
        </p>

        {error ? (
          <div className="mb-3 rounded-[6px] border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {terms.map((term) => (
            <div key={term.id} className="rounded-[6px] border border-[#dbd8cc] px-3 py-[10px]">
              {draft?.id === term.id ? (
                <TermDraft draft={draft} setDraft={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} busy={busy} />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#1a1a18]">{term.name}</p>
                      <p className="mt-[2px] whitespace-pre-line text-[11px] leading-snug text-[#8b8a81]">
                        {previewOf(term) || "No wording yet."}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleAlways(term)}
                        disabled={busy}
                        title={term.always_include ? "On every new quote. Click to make it optional." : "Optional. Click to put it on every new quote."}
                        className={`h-[26px] rounded-[4px] border px-2 text-[11px] font-medium ${
                          term.always_include
                            ? "border-[#6b9e61] bg-[#edf4eb] text-[#1c2b1e]"
                            : "border-[#dbd8cc] bg-white text-[#8b8a81]"
                        }`}
                      >
                        {term.always_include ? "Always" : "On request"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft({ ...term })}
                        className="h-[26px] rounded-[4px] border border-[#dbd8cc] bg-white px-2 text-[11px] text-[#5a5a52] hover:bg-[#f5f8f4]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(term)}
                        disabled={busy}
                        className="h-[26px] rounded-[4px] border border-[#dbd8cc] bg-white px-2 text-[11px] text-[#991b1b] hover:bg-[#fef2f2]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {loaded && terms.length === 0 ? (
            <p className="rounded-[6px] border border-dashed border-[#dbd8cc] px-3 py-4 text-center text-[12px] text-[#8b8a81]">
              No terms yet. Add one and mark it Always to have it start every quote.
            </p>
          ) : null}

          {draft && !draft.id ? (
            <div className="rounded-[6px] border border-[#6b9e61] px-3 py-[10px]">
              <TermDraft draft={draft} setDraft={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} busy={busy} />
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
            disabled={Boolean(draft)}
            className="h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50"
          >
            + Add term type
          </button>
          {status ? <span className="text-[12px] text-[#5a5a52]">{status}</span> : null}
        </div>
      </div>
    </div>
  );
}

function TermDraft({ draft, setDraft, onSave, onCancel, busy }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]">
        Name
        <input
          type="text"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder="e.g. Installation, Door removal, Quote acceptance"
          className="h-[34px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]"
        />
      </label>

      <div className="flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]">
        Wording
        <TermsEditor
          value={draft.body_html}
          onChange={(html) => setDraft({ ...draft, body_html: html })}
          placeholder="The wording that gets copied onto a quote."
          height={120}
          ariaLabel="Term wording"
        />
      </div>

      <label className="flex items-center gap-2 text-[12px] text-[#1a1a18]">
        <input
          type="checkbox"
          checked={draft.always_include}
          onChange={(event) => setDraft({ ...draft, always_include: event.target.checked })}
        />
        Put this on every new quote
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !draft.name.trim() || !toTermsHtml(draft.body_html).trim()}
          className="h-[32px] rounded-[6px] bg-[#1c2b1e] px-3 text-[12px] font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving..." : draft.id ? "Save term" : "Add term"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] text-[#5a5a52] hover:bg-[#f5f8f4]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
