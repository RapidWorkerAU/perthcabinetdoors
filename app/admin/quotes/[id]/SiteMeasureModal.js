"use client";

// SITE MEASURE.
//
// Six answers, asked standing in somebody's kitchen. What it is, how big, how
// many, and on a door which side it hangs and where the cups go. Everything the
// item becomes is in lib/pcd-site-measure.js; this is the card over it.
//
// ── WHY IT SAVES AS YOU GO ───────────────────────────────────────────────────
//
// Each item is written to the quote the moment Add is pressed, through the same
// save the items table already uses. On site that is the whole point: close the
// tab, lose signal, drop the phone, and what has been measured is already on the
// quote. Nothing is held in this card waiting for a button nobody gets to press.
//
// Which is also why the list underneath does not delete. Those are real quote
// lines now, and a delete belongs where every other line is deleted rather than
// behind a second button that only some lines have.

import React, { useMemo, useState } from "react";
import {
  SITE_MEASURE_TYPES,
  measureIsComplete,
  measuredSummary,
  nextReference,
  referenceFromNote,
  siteMeasureType,
} from "../../../../lib/pcd-site-measure";
import { HINGE_SIDES, hingesForHeight } from "../../../../lib/pcd-hinges";

const HINGE_COUNTS = [2, 3, 4, 5];

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]";
const FIELD =
  "h-[46px] w-full border border-[#dbd8cc] rounded-[8px] px-3 text-[17px] font-mono text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]";
const MUTED = "text-[11px] text-[#8b8a81]";

/* Every choice sits on a fixed track. Nothing is left to wrap, so a six item
   list cannot break into a ragged two rows on a narrow screen. */
function Tiles({ options, value, onPick, cols, disabled }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
      {options.map((option) => {
        const on = String(value) === String(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.value)}
            className={`h-[46px] w-full rounded-[8px] border text-[13px] font-medium truncate px-1 transition-colors disabled:opacity-50 ${
              on
                ? "border-[#1c2b1e] bg-[#1c2b1e] text-white"
                : "border-[#dbd8cc] bg-white text-[#3a3a34] hover:border-[#a8c5a0] hover:bg-[#f5f8f4]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function emptyItem(lines, from) {
  const type = from ? from.type : "door";
  return {
    ref: nextReference(lines, type),
    type,
    height_mm: "",
    width_mm: "",
    qty: 1,
    hinge_side: from ? from.hinge_side : "Left",
    hinge_count: 0,
    cups: [],
    standard: true,
    // Once somebody has set the number themselves it stops following the height.
    countSet: false,
  };
}

export default function SiteMeasureModal({ open, lines = [], onClose, onAdd, Modal }) {
  const [draft, setDraft] = useState(() => emptyItem(lines));
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState([]);

  const type = siteMeasureType(draft.type);
  const ready = measureIsComplete(draft) && !saving;
  const suggested = hingesForHeight(draft.height_mm);

  // What is already on the quote from a measure, this visit or an earlier one,
  // so the numbering and the list both survive closing the tab.
  const measured = useMemo(
    () =>
      lines
        .map((line, index) => ({ line, index, ref: referenceFromNote(line?.notes) }))
        .filter((entry) => entry.ref),
    [lines]
  );

  function set(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function pickType(key) {
    setDraft((current) => {
      const next = { ...current, type: key, ref: nextReference(lines, key) };
      if (!siteMeasureType(key).hinges) {
        next.hinge_count = 0;
        next.cups = [];
      } else if (!current.countSet) {
        next.hinge_count = hingesForHeight(current.height_mm);
      }
      return next;
    });
  }

  function setHeight(value) {
    setDraft((current) => {
      const next = { ...current, height_mm: value };
      if (siteMeasureType(current.type).hinges && !current.countSet) {
        next.hinge_count = hingesForHeight(value);
      }
      return next;
    });
  }

  function setCup(index, value) {
    setDraft((current) => {
      const cups = [...(current.cups || [])];
      cups[index] = value;
      return { ...current, cups };
    });
  }

  async function add(keepSize) {
    if (!ready) return;
    setSaving(true);
    const item = { ...draft, cups: [...(draft.cups || [])] };
    const saved = await onAdd(item);
    setSaving(false);
    if (!saved) return;

    setAdded((current) => [...current, { ref: item.ref, summary: measuredSummary(item) }]);
    setDraft(
      keepSize
        ? { ...item, ref: nextReference([...lines, { notes: `Site measure ref ${item.ref}.` }], item.type) }
        : emptyItem([...lines, { notes: `Site measure ref ${item.ref}.` }], item)
    );
  }

  if (!Modal) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Site measure"
      subtitle="Each item is saved to the quote as you add it. The board and the colour are set back at the office."
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors"
        >
          Done
        </button>
      }
    >
      {/* ── The card ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#dbd8cc] rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#edf4eb] flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-[#1a1a18]">Next item</span>
          <span className="text-[13px] font-mono font-semibold text-[#2d5e28] bg-[#edf4eb] rounded-[6px] px-[8px] py-[2px]">
            {draft.ref}
          </span>
        </div>

        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Item type</span>
            <Tiles
              cols={3}
              disabled={saving}
              value={draft.type}
              onPick={pickType}
              options={SITE_MEASURE_TYPES.map((t) => ({ value: t.key, label: t.label }))}
            />
          </div>

          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 76px" }}>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Height</span>
              <input
                inputMode="numeric"
                placeholder="0"
                disabled={saving}
                className={FIELD}
                value={draft.height_mm}
                onChange={(event) => setHeight(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Width</span>
              <input
                inputMode="numeric"
                placeholder="0"
                disabled={saving}
                className={FIELD}
                value={draft.width_mm}
                onChange={(event) => set({ width_mm: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Qty</span>
              <input
                inputMode="numeric"
                disabled={saving}
                className={`${FIELD} text-center px-1`}
                value={draft.qty}
                onChange={(event) => set({ qty: event.target.value })}
              />
            </label>
          </div>

          {/* Hinges, only on a door. */}
          {type.hinges ? (
            <div className="border-t border-[#edf4eb] pt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className={LABEL}>Hinge side</span>
                <Tiles
                  cols={2}
                  disabled={saving}
                  value={draft.hinge_side}
                  onPick={(value) => set({ hinge_side: value })}
                  options={HINGE_SIDES.map((side) => ({ value: side, label: side }))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className={LABEL}>How many hinges</span>
                <Tiles
                  cols={4}
                  disabled={saving}
                  value={draft.hinge_count}
                  onPick={(value) =>
                    setDraft((current) => ({
                      ...current,
                      hinge_count: Number(value),
                      countSet: true,
                      cups: (current.cups || []).slice(0, Number(value)),
                    }))
                  }
                  options={HINGE_COUNTS.map((n) => ({ value: n, label: String(n) }))}
                />
                {suggested && !draft.countSet ? (
                  <span className={MUTED}>
                    {`A ${draft.height_mm}mm door starts at ${suggested}. Change it if the door is heavy.`}
                  </span>
                ) : null}
              </div>

              {draft.hinge_count ? (
                <>
                  <label className="flex items-center gap-[10px] cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={saving}
                      className="w-[18px] h-[18px] accent-[#2d5e28] flex-shrink-0"
                      checked={draft.standard}
                      onChange={(event) => set({ standard: event.target.checked })}
                    />
                    <span className="text-[13px] text-[#1a1a18]">Our standard cup positions</span>
                  </label>

                  {draft.standard ? null : (
                    <div className="flex flex-col gap-2">
                      <span className={LABEL}>Cups, up from the bottom edge</span>
                      {Array.from({ length: draft.hinge_count }, (_, index) => {
                        const name =
                          index === 0 ? "Bottom" : index === draft.hinge_count - 1 ? "Top" : `Cup ${index + 1}`;
                        return (
                          <label key={index} className="flex items-center gap-3">
                            <span className="w-[70px] flex-shrink-0 text-[12px] text-[#5a5a52]">{name}</span>
                            <input
                              inputMode="numeric"
                              placeholder="0"
                              disabled={saving}
                              className={FIELD}
                              value={draft.cups?.[index] ?? ""}
                              onChange={(event) => setCup(index, event.target.value)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="border-t border-[#edf4eb] pt-3 flex flex-col gap-3">
            <p className={`${MUTED} leading-[1.5]`}>
              Saves as <span className="text-[#3a3a34] font-medium">{measuredSummary(draft)}</span>
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr auto" }}>
              <button
                type="button"
                disabled={!ready}
                onClick={() => add(false)}
                className={`h-[48px] px-4 rounded-[8px] text-[15px] font-semibold whitespace-nowrap transition-colors ${
                  ready ? "bg-[#1c2b1e] text-white hover:bg-[#2d3f2f]" : "bg-[#edf0ea] text-[#a8a69c] cursor-not-allowed"
                }`}
              >
                {saving ? "Saving..." : "Add item"}
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => add(true)}
                className={`h-[48px] px-5 rounded-[8px] text-[14px] font-medium whitespace-nowrap border transition-colors ${
                  ready
                    ? "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28] hover:bg-[#e2ecdf]"
                    : "border-[#e6e3d9] bg-white text-[#c3c0b5] cursor-not-allowed"
                }`}
              >
                Add, same size
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── What is on the quote already ─────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className={LABEL}>On this quote</span>
          <span className={MUTED}>{`${measured.length} measured`}</span>
        </div>

        {measured.length ? (
          <div className="flex flex-col gap-[6px]">
            {measured.map((entry) => {
              const justAdded = added.some((row) => row.ref === entry.ref);
              return (
                <div
                  key={`${entry.ref}-${entry.index}`}
                  className={`border rounded-[8px] px-3 py-[10px] flex items-center gap-3 ${
                    justAdded ? "border-[#a8c5a0] bg-[#edf4eb]" : "border-[#dbd8cc] bg-white"
                  }`}
                >
                  <span className="w-[46px] flex-shrink-0 text-[12px] font-mono font-semibold text-[#2d5e28] bg-white border border-[#a8c5a0] rounded-[5px] text-center py-[3px]">
                    {entry.ref}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-[#1a1a18] truncate">
                    {`Line ${entry.index + 1}`}
                    <span className="text-[#5a5a52] font-mono">
                      {entry.line.height_mm && entry.line.width_mm
                        ? ` ${entry.line.height_mm} x ${entry.line.width_mm}`
                        : ""}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-[#dbd8cc] rounded-[10px] py-8 text-center">
            <p className="text-[13px] font-medium text-[#1a1a18] mb-1">Nothing measured yet</p>
            <p className={MUTED}>Fill the card and press Add item.</p>
          </div>
        )}

        <p className={`${MUTED} leading-[1.6] mt-3`}>
          <span className="font-semibold text-[#5a5a52]">These are quote lines already.</span> Change a size or take one
          off on the items table, the same as any other line. Everything a measure does not ask, the board, the colour,
          the finish and the edge, is still to be filled in and each line is flagged for it.
        </p>
      </div>
    </Modal>
  );
}
