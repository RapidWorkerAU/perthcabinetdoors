"use client";

// SUPPLY OR MADE TO ORDER, after the colour. Shared by the quote editor and the
// variation editor so the two ask it the same way. The rules are in
// lib/pcd-made-by.js; this only shows them.
//
//   not a board          N/A
//   no colour yet        a dash: the colour decides what is possible
//   one possibility      that answer, as text, not changeable
//   both                 a choice, while the line is being edited

import { MADE_BY_LABELS, asksMadeBy, effectiveMadeBy } from "../../lib/pcd-made-by";

const ONLY_TITLE = {
  supply: "This colour is only bought as board and cut by us.",
  mto: "This is only made to order by the supplier.",
};

export default function MadeByField({ line, options = [], editable = false, onChange, label = "Made by" }) {
  if (!asksMadeBy(line)) return <span className="text-[10px] text-[#c5cdd8]">N/A</span>;
  if (!String(line.colour || "").trim() || !options.length) return <span className="text-[11px] text-[#c5cdd8]">-</span>;
  const value = options.includes(line.made_by) ? line.made_by : effectiveMadeBy(line);

  if (options.length === 1) {
    return (
      <span className="text-[11px] text-[#1a1a18]" title={ONLY_TITLE[options[0]]}>
        {MADE_BY_LABELS[options[0]]}
      </span>
    );
  }
  if (!editable) return <span className="text-[11px] text-[#1a1a18]">{MADE_BY_LABELS[value] || "-"}</span>;
  return (
    <select
      aria-label={label}
      className="h-[22px] w-full rounded-[3px] border border-[#a8c5a0] bg-white px-[4px] text-[11px] text-[#1a1a18] focus:outline-none focus:border-[#6b9e61]"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>{MADE_BY_LABELS[option]}</option>
      ))}
    </select>
  );
}
