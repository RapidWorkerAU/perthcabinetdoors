"use client";

import { useState } from "react";
import { forgetLists, useLists } from "@/lib/use-lists";

// A VOCABULARY, PICKED FROM, WITH A WAY TO ADD TO IT.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Some fields that are plainly a vocabulary were plain text boxes, and a text
// box is how one answer becomes several. The board library grew three finishes
// twice over, purely from typing:
//
//     "Absolute Grain" and "AbsoluteGrain"
//     "Absolute Matt"  and "AbsoluteMatte"
//     "Raw"            and "Raw Finish"
//
// Nothing rejected them, because nothing could: to the database they are six
// different words. Every screen that groups or filters by finish then treated
// them as six finishes, so /finishes listed one twice and a quote could be
// written against either spelling.
//
// ── WHY IT IS NOT A datalist ────────────────────────────────────────────────
//
// An <input list> suggests as you type and accepts anything anyway, so it would
// have suggested "Absolute Grain" and still taken "AbsoluteGrain". Suggesting
// is not structuring. This is a real select: the only way to introduce a new
// word is to add it to the vocabulary deliberately, which is what Add new does.
//
// ── ADDING IS ADDING TO THE LIST, NOT TO THIS RECORD ────────────────────────
//
// Add new writes the item into Settings, Lists through the same endpoint that
// screen uses, so the next person meets it as an option rather than typing it
// again and guessing the spelling. That is the whole point: a value invented on
// one record that never reaches the vocabulary is the fault this fixes, wearing
// a different hat.
//
// Whatever the record already holds is always in its own dropdown, even if it
// has been retired or predates the list. See optionsFor in lib/pcd-lists.js:
// switching an option off must never silently rewrite a record that used it.

const ADD_NEW = "__pcd_add_new__";

/**
 * A derived vocabulary, in the shape the select expects.
 *
 * Whatever this record already holds is added if the list does not carry it, for
 * the same reason optionsFor does it for a database vocabulary: a value that
 * vanishes from its own dropdown is a field that silently empties the first time
 * somebody opens the record and saves it.
 */
function asOptions(values, held) {
  const list = [...new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ key: v, label: v }));
  const current = String(held || "").trim();
  if (current && !list.some((o) => o.key === current)) {
    list.push({ key: current, label: current, retired: true });
  }
  return list;
}

/**
 * TWO KINDS OF VOCABULARY, ONE CONTROL.
 *
 * `listKey` is a vocabulary held in the database and edited in Settings, Lists.
 * Adding to it writes there, so the word reaches everybody.
 *
 * `options` is a vocabulary DERIVED from what already exists, which is what the
 * profile library's categories are: they are whatever the rows in it happen to
 * use, narrowed to the kind being edited. There is no table to write a new one
 * into, so adding there just accepts the word on this record. It is still
 * structured, because the only way to introduce a word is to ask for it.
 *
 * Either one, never both. The point of putting them in one control is that the
 * behaviour a person learns on one screen is the behaviour they get on the next.
 */
export default function ListField({
  listKey = "",
  options: givenOptions = null,
  value = "",
  onChange,
  disabled = false,
  placeholder = "Select one",
  className = "",
  // Defaulted, not merely optional: without a default TypeScript reads a bare
  // parameter as required, and every caller that does not label its select or
  // want the error back fails to type check.
  id = undefined,
  onError = null,
}) {
  const lists = useLists();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const derived = Array.isArray(givenOptions);
  const options = derived
    ? asOptions(givenOptions, value)
    : lists.optionsFor(listKey, value);

  async function addNew() {
    const label = draft.trim();
    if (!label || saving) return;

    // Already there under another capitalisation is not an error, it is the
    // answer: select the one that exists rather than making a second.
    const match = options.find((option) => option.label.toLowerCase() === label.toLowerCase());
    if (match) {
      onChange(match.label);
      setAdding(false);
      setDraft("");
      return;
    }

    // A derived vocabulary has no table behind it, so the new word simply goes
    // on this record and becomes an option for the next one by existing.
    if (derived) {
      onChange(label);
      setAdding(false);
      setDraft("");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_key: listKey, label }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not add that.");

      // The cache is what every other field on the screen is reading from, so
      // it has to be dropped or the new word is invisible everywhere but here.
      forgetLists();
      onChange(payload.item?.label || label);
      setAdding(false);
      setDraft("");
    } catch (error) {
      if (onError) onError(error?.message || "Could not add that.");
    } finally {
      setSaving(false);
    }
  }

  if (adding) {
    return (
      <div className="flex gap-1.5">
        <input
          id={id}
          className={className}
          autoFocus
          value={draft}
          disabled={saving}
          placeholder="New entry"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addNew();
            }
            if (event.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
        />
        <button
          type="button"
          className="h-[34px] shrink-0 rounded-[6px] bg-[#1c2b1e] px-3 text-[12px] font-medium text-white disabled:opacity-50"
          disabled={saving || !draft.trim()}
          onClick={addNew}
        >
          {saving ? "Adding" : "Add"}
        </button>
        <button
          type="button"
          className="h-[34px] shrink-0 rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18]"
          disabled={saving}
          onClick={() => {
            setAdding(false);
            setDraft("");
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className={className}
      value={value || ""}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value === ADD_NEW) {
          setAdding(true);
          return;
        }
        onChange(event.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.key} value={option.label}>
          {option.retired ? `${option.label} (retired)` : option.label}
        </option>
      ))}
      <option value={ADD_NEW}>Add new...</option>
    </select>
  );
}
