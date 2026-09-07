"use client";

// BOARDS TO ORDER.
//
// What to buy for this quote, laid out on real boards. The arithmetic is in
// lib/pcd-board-order.js; this is the screen over it.
//
// TWO KINDS OF SETTING, and keeping them apart is the whole shape of this tab.
//
//   The BOARD is the colour's: how big the sheet comes and whether it has a
//   grain. Both are looked up from the colour library, and each board says
//   where its answer came from. Set one by hand and it is saved against this
//   quote, with a way back to the library.
//
//   HOW WE CUT is the quote's: the saw kerf, the edge trim, whether carcass
//   panels are counted and what "Standard" means on a grained board. Those are
//   the same on every board, they are set once and left, so they live behind a
//   Settings button rather than taking the top of the screen.

import React, { useMemo, useState } from "react";
import { IconSettings } from "@tabler/icons-react";
import {
  BOARD_ORDER_DEFAULTS,
  FALLBACK_BOARD,
  boardOrderText,
  buildBoardOrder,
} from "../../../../lib/pcd-board-order";

// ── Drawing ──────────────────────────────────────────────────────────────────

// One scale for every board on the page, so an 1800 wide sheet is drawn wider
// than a 1200 one instead of both being squeezed into the same box. That is the
// only thing on the drawing that says they are different boards.
const PX_PER_MM = 172 / 1200;

// A board seen from above, the panels on it, and the raw board showing through
// as the offcut. Four fills, one per kind of panel.
const PANEL_FILL = {
  Door: "#c9e0c3",
  "Drawer front": "#a8c5a0",
  Panel: "#e6efe3",
  Carcass: "#ffffff",
};
const BOARD_FILL = "#f0ede4";

function panelFill(productType) {
  return PANEL_FILL[productType] || "#ffffff";
}

const tw = {
  muted: "text-[11px] text-[#8b8a81]",
  smBtn:
    "h-[28px] px-3 text-[12px] font-medium rounded-[6px] border border-[#dbd8cc] bg-white text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors",
  th: "bg-[#f5f8f4] border-b border-[#dbd8cc] px-2 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] whitespace-nowrap",
  td: "px-2 py-[7px] border-b border-[#edf4eb] align-top text-[#1a1a18]",
  pill: "inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium border",
  field: "flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]",
  num: "h-[30px] w-[76px] border border-[#dbd8cc] rounded-[6px] px-2 text-[12px] font-mono text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4] disabled:text-[#8b8a81]",
};

function BoardDrawing({ group, sheet, index, selected, onPick }) {
  const board = group.board;
  const svgW = board.width_mm * PX_PER_MM;
  const svgL = board.length_mm * PX_PER_MM;
  const trim = board.trim_mm * PX_PER_MM;

  return (
    <svg
      viewBox={`0 0 ${svgW.toFixed(1)} ${svgL.toFixed(1)}`}
      role="img"
      aria-label={`Board ${index + 1} of ${group.boards}`}
      className="block w-full h-auto"
    >
      <rect x="0" y="0" width={svgW} height={svgL} fill={BOARD_FILL} stroke="#dbd8cc" />
      <rect
        x={trim}
        y={trim}
        width={Math.max(0, svgW - 2 * trim)}
        height={Math.max(0, svgL - 2 * trim)}
        fill="none"
        stroke="#c3c0b5"
        strokeDasharray="2 2"
        strokeWidth="0.6"
      />

      {sheet.runs.map((run, runIndex) =>
        run.items.map((item, itemIndex) => {
          const x = trim + item.x * PX_PER_MM;
          const y = trim + item.y * PX_PER_MM;
          const w = item.across * PX_PER_MM;
          const h = item.along * PX_PER_MM;
          const on = selected === item.panel.from_id;
          return (
            <g key={`${runIndex}-${itemIndex}`}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={panelFill(item.panel.product_type)}
                stroke={on ? "#2d5e28" : "#8b8a81"}
                strokeWidth={on ? 1.7 : 0.6}
                className="cursor-pointer"
                onClick={() => onPick(item.panel.from_id)}
              >
                <title>
                  {`${item.panel.name} ${item.panel.height_mm} x ${item.panel.width_mm}${item.turned ? " (turned)" : ""}`}
                </title>
              </rect>
              {w > 30 && h > 12 ? (
                <text
                  x={x + w / 2}
                  y={y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontSize="6.2"
                  fill="#3a3a34"
                  style={{ pointerEvents: "none" }}
                >
                  {`${item.panel.height_mm}x${item.panel.width_mm}`}
                </text>
              ) : null}
            </g>
          );
        })
      )}

      {/* Which way the grain runs. Drawn only on a board that has one, so its
          absence says something rather than being an oversight. */}
      {board.has_grain ? (
        <g stroke="#8b8a81" fill="#8b8a81" opacity="0.9">
          <line x1="4.5" y1={svgL * 0.3} x2="4.5" y2={svgL * 0.7} strokeWidth="0.8" />
          <path d={`M4.5 ${svgL * 0.735} l-2 -4 h4 z`} stroke="none" />
          <path d={`M4.5 ${svgL * 0.265} l-2 4 h4 z`} stroke="none" />
        </g>
      ) : null}
    </svg>
  );
}

// ── The board's own settings ─────────────────────────────────────────────────

function sizeNote(board) {
  if (board.size_source === "quote") {
    return board.library_width_mm
      ? `Set on this quote. The colour library says ${board.library_width_mm} wide x ${board.library_length_mm} long.`
      : "Set on this quote. The colour library has no size for this colour.";
  }
  if (board.size_source === "library") return "From the colour library.";
  return `The colour library has no board size on this colour, so this is the ${FALLBACK_BOARD.width_mm} wide x ${FALLBACK_BOARD.length_mm} long default.`;
}

function grainNote(board) {
  if (board.grain_source === "quote") return "Set on this quote.";
  if (board.grain_source === "library") return "From the colour library.";
  return "Guessed from the finish name, because the colour library has not been asked. Set it on Option Libraries, Board.";
}

function BoardSettings({ board, disabled, onSet, onRevert }) {
  const changed = board.size_source === "quote" || board.grain_source === "quote";

  return (
    <div className="mb-3 bg-white border border-[#dbd8cc] rounded-[6px] px-3 py-3 flex flex-wrap items-start gap-x-8 gap-y-3">
      <div className={tw.field}>
        <span>Board, wide x long, mm</span>
        <span className="flex items-center gap-[6px]">
          <input
            type="number"
            min="1"
            step="10"
            aria-label="Board width"
            className={tw.num}
            disabled={disabled}
            value={board.width_mm}
            onChange={(event) => onSet("width_mm", event.target.value)}
          />
          <span className="text-[#8b8a81] text-[12px]">x</span>
          <input
            type="number"
            min="1"
            step="10"
            aria-label="Board length"
            className={tw.num}
            disabled={disabled}
            value={board.length_mm}
            onChange={(event) => onSet("length_mm", event.target.value)}
          />
        </span>
        <span className={`${tw.muted} font-normal`}>{sizeNote(board)}</span>
      </div>

      <div className={tw.field}>
        <span>Does this board have a grain</span>
        <span className="inline-flex border border-[#dbd8cc] rounded-[6px] overflow-hidden bg-white w-fit">
          {[[true, "Runs down the length"], [false, "No grain"]].map(([value, label], index) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onSet("has_grain", value)}
              className={`px-3 h-[30px] text-[12px] font-medium transition-colors disabled:opacity-50 ${
                index ? "border-l border-[#dbd8cc] " : ""
              }${board.has_grain === value ? "bg-[#1c2b1e] text-white" : "text-[#5a5a52] hover:bg-[#f5f8f4]"}`}
            >
              {label}
            </button>
          ))}
        </span>
        <span className={`${tw.muted} font-normal`}>{grainNote(board)}</span>
      </div>

      {changed ? (
        <button type="button" className={`${tw.smBtn} mt-[18px]`} disabled={disabled} onClick={onRevert}>
          Use the library
        </button>
      ) : null}
    </div>
  );
}

// ── One board ────────────────────────────────────────────────────────────────

function BoardGroup({ group, open, disabled, selected, onToggle, onPick, onSet, onRevert }) {
  const board = group.board;
  const short = group.unplaced.length;
  const saving = group.grain_cost_boards;

  return (
    <details
      className="border border-[#dbd8cc] rounded-[8px] mb-3 overflow-hidden"
      open={open}
      onToggle={(event) => onToggle(group.key, event.currentTarget.open)}
    >
      <summary className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer bg-white hover:bg-[#f5f8f4] transition-colors list-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#1a1a18] truncate">
            {`${board.colour} · ${board.finish} · ${board.thickness_mm}mm`}
          </p>
          <p className={tw.muted}>
            {`${board.supplier} · board ${board.width_mm} wide x ${board.length_mm} long · ${group.panels.length} panels · ${group.panel_area_sqm.toFixed(2)} sqm`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
          <span
            className={`${tw.pill} ${
              board.has_grain
                ? "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]"
                : "border-[#dbd8cc] bg-[#f5f8f4] text-[#5a5a52]"
            }`}
          >
            {board.has_grain ? "Grained" : "No grain"}
          </span>
          {board.size_source === "fallback" ? (
            <span className={`${tw.pill} border-[#e8d68f] bg-[#fffdf0] text-[#8a6d0b]`}>No library size</span>
          ) : null}
          {saving ? (
            <span className={`${tw.pill} border-[#e8d68f] bg-[#fffdf0] text-[#8a6d0b]`}>{`+${saving} for grain`}</span>
          ) : null}
          {short ? (
            <span className={`${tw.pill} border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]`}>
              {`${short} will not fit`}
            </span>
          ) : null}
          <span className="text-[11px] text-[#8b8a81] font-mono">
            {`${Math.round(group.offcut_fraction * 100)}% offcut`}
          </span>
          <strong className="text-[14px] font-semibold text-[#1a1a18] font-mono">
            {`${group.boards} board${group.boards === 1 ? "" : "s"}`}
          </strong>
        </div>
      </summary>

      <div className="px-4 py-3 bg-[#f5f8f4] border-t border-[#edf4eb]">
        <BoardSettings
          board={board}
          disabled={disabled}
          onSet={(field, value) => onSet(group.key, field, value)}
          onRevert={() => onRevert(group.key)}
        />

        {short ? (
          <p className="mb-3 rounded-[6px] border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-[12px] leading-[1.5] text-[#991b1b]">
            <strong className="font-semibold">
              {`${short} panel${short > 1 ? "s do" : " does"} not fit a ${board.width_mm} wide x ${board.length_mm} long board`}
            </strong>{" "}
            once the trim is taken off. Check the size, or order a larger board for this colour.
          </p>
        ) : null}

        {saving ? (
          <p className="mb-3 rounded-[6px] border border-[#e8d68f] bg-[#fffdf0] px-3 py-2 text-[12px] leading-[1.5] text-[#8a6d0b]">
            Grain direction costs{" "}
            <strong className="font-semibold">{`${saving} extra board${saving > 1 ? "s" : ""}`}</strong> here. If this
            colour turned out to have no grain it would take {group.boards_if_no_grain}.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 mb-3">
          {group.layout.sheets.map((sheet, index) => {
            const used = sheet.runs.reduce(
              (total, run) => total + run.items.reduce((sum, item) => sum + item.along * item.across, 0),
              0
            );
            const panels = sheet.runs.reduce((total, run) => total + run.items.length, 0);
            const pct = Math.round((used / (board.width_mm * board.length_mm)) * 100);
            return (
              <figure
                key={index}
                className="m-0 bg-white border border-[#dbd8cc] rounded-[6px] p-2 flex-shrink-0"
                style={{ width: `${Math.round(board.width_mm * PX_PER_MM + 18)}px` }}
              >
                <BoardDrawing group={group} sheet={sheet} index={index} selected={selected} onPick={onPick} />
                <figcaption className="flex items-center justify-between gap-2 mt-[6px] text-[10px] text-[#8b8a81]">
                  <span className="font-semibold text-[#5a5a52]">{`Board ${index + 1} of ${group.boards}`}</span>
                  <span className="font-mono">{`${panels} · ${pct}%`}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-[#5a5a52]">
          {[...new Set(group.panels.map((panel) => panel.product_type))].map((type) => (
            <span key={type} className="inline-flex items-center gap-[6px]">
              <i
                className="w-[11px] h-[11px] rounded-[2px] border border-[#8b8a81] inline-block"
                style={{ background: panelFill(type) }}
              />
              {type}
            </span>
          ))}
          <span className="inline-flex items-center gap-[6px]">
            <i
              className="w-[11px] h-[11px] rounded-[2px] border border-[#c3c0b5] inline-block"
              style={{ background: BOARD_FILL }}
            />
            Offcut
          </span>
          <span className="text-[#8b8a81]">
            Sizes are height then width.{" "}
            {board.has_grain
              ? "The arrow shows which way the grain runs."
              : "No grain on this board, so every panel is free to turn."}
          </span>
        </div>

        <div className="bg-white border border-[#dbd8cc] rounded-[6px] overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={tw.th}>From</th>
                <th className={tw.th}>Panel</th>
                <th className={`${tw.th} text-right`}>Size H x W</th>
                <th className={`${tw.th} text-right`}>Qty</th>
                <th className={tw.th}>On this board</th>
                <th className={`${tw.th} text-right`}>Area sqm</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr
                  key={row.key}
                  onClick={() => onPick(row.from_id)}
                  className={`cursor-pointer ${selected === row.from_id ? "bg-[#edf4eb]" : "hover:bg-[#f5f8f4]"}`}
                >
                  <td className={`${tw.td} text-[12px] whitespace-nowrap`}>
                    {row.from_label}
                    {row.cabinet_label ? (
                      <span className="block text-[10px] text-[#8b8a81]">{row.cabinet_label}</span>
                    ) : null}
                  </td>
                  <td className={`${tw.td} text-[12px]`}>
                    {row.name}
                    {row.grain_direction ? (
                      <span className="text-[#8b8a81]">{` · line says ${row.grain_direction}`}</span>
                    ) : null}
                  </td>
                  <td className={`${tw.td} text-[12px] font-mono text-right whitespace-nowrap`}>
                    {`${row.height_mm} x ${row.width_mm}`}
                  </td>
                  <td className={`${tw.td} text-[12px] font-mono text-right`}>{row.qty}</td>
                  <td className={tw.td}>
                    {row.axis === "free" ? (
                      <span className={`${tw.pill} border-[#dbd8cc] bg-[#f5f8f4] text-[#5a5a52]`}>Can be turned</span>
                    ) : (
                      <span className={`${tw.pill} border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]`}>
                        {`Runs up the ${row.axis === "height" ? "height" : "width"}`}
                      </span>
                    )}
                  </td>
                  <td className={`${tw.td} text-[12px] font-mono text-right`}>
                    {((row.height_mm * row.width_mm * row.qty) / 1e6).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

// ── The tab ──────────────────────────────────────────────────────────────────

export default function BoardOrderPanel({
  lines = [],
  colours = [],
  settings = null,
  defaults = BOARD_ORDER_DEFAULTS,
  disabled = false,
  onChange,
  Modal,
}) {
  // One board open at a time. Two open boards means two sets of drawings on
  // screen, and the second one you opened is the one you are reading.
  const [openKey, setOpenKey] = useState(null);
  const [selected, setSelected] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const active = useMemo(
    () => ({ ...BOARD_ORDER_DEFAULTS, ...defaults, ...(settings || {}) }),
    [defaults, settings]
  );

  const result = useMemo(
    () => buildBoardOrder({ lines, colours, settings: active }),
    [lines, colours, active]
  );

  // The biggest board is open when you arrive, so the tab shows what it does
  // rather than a row of closed headers.
  const openGroup = openKey === null ? result.groups[0]?.key ?? null : openKey;

  function patch(next) {
    if (disabled || !onChange) return;
    const merged = { ...(settings || {}), ...next };
    // Only ever store what was deliberately changed. An empty object means
    // nothing was, and null is what the column holds for that.
    const cleaned = {};
    for (const [key, value] of Object.entries(merged)) {
      if (key === "boards") {
        if (value && Object.keys(value).length) cleaned.boards = value;
        continue;
      }
      if (value !== undefined && value !== null) cleaned[key] = value;
    }
    onChange(Object.keys(cleaned).length ? cleaned : null);
  }

  function setBoard(key, field, value) {
    const boards = { ...(settings?.boards || {}) };
    const board = { ...(boards[key] || {}) };
    if (field === "has_grain") {
      board.has_grain = Boolean(value);
    } else {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) return;
      board[field] = number;
    }
    boards[key] = board;
    patch({ boards });
  }

  function revertBoard(key) {
    const boards = { ...(settings?.boards || {}) };
    delete boards[key];
    patch({ boards });
  }

  const changedFromDefaults = ["include_carcass", "standard_grain", "kerf_mm", "trim_mm"].some(
    (key) => settings && settings[key] !== undefined && settings[key] !== defaults[key]
  );

  function copyOrder() {
    const text = boardOrderText(result);
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => setCopied(false)
    );
  }

  const totals = result.totals;
  const noSize = result.groups.filter((group) => group.board.size_source === "fallback");

  return (
    <div>
      {/* Said the way the Quote Items tab says it: what is here on the left,
          what you can do about it on the right. */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-3 flex-wrap">
        <span className="text-[12px] text-[#8b8a81]">
          {`${result.groups.length} board${result.groups.length === 1 ? "" : "s"} · ${totals.panels} panels · ${totals.panel_area_sqm.toFixed(2)} sqm`}
          {totals.grain_cost_boards ? (
            <span className="ml-2 text-[#8a6d0b] font-medium">
              {`${totals.grain_cost_boards} board${totals.grain_cost_boards > 1 ? "s" : ""} added by grain direction`}
            </span>
          ) : null}
          {totals.unplaced ? (
            <span className="ml-2 text-[#991b1b] font-medium">
              {`${totals.unplaced} panel${totals.unplaced > 1 ? "s" : ""} too big for a board`}
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${tw.smBtn} inline-flex items-center gap-[6px]`}
            onClick={() => setSettingsOpen(true)}
          >
            <IconSettings size={14} />
            Settings
            {changedFromDefaults ? <span className="w-[6px] h-[6px] rounded-full bg-[#6b9e61]" /> : null}
          </button>
          <button
            type="button"
            className="h-[28px] px-3 text-[12px] font-semibold rounded-[6px] border border-[#a8c5a0] bg-white text-[#2d5e28] hover:bg-[#edf4eb] transition-colors"
            onClick={copyOrder}
          >
            {copied ? "Copied" : "Copy order list"}
          </button>
        </div>
      </div>

      {result.groups.length === 0 ? (
        <div className="bg-white border border-[#dbd8cc] rounded-[8px] py-10 text-center">
          <p className="text-[13px] font-medium text-[#1a1a18] mb-1">Nothing to order yet</p>
          <p className="text-[11px] text-[#8b8a81]">
            Add a line made from decorative board, with a height, a width and a colour on it.
          </p>
        </div>
      ) : null}

      {noSize.length ? (
        <p className="mb-3 rounded-[6px] border border-[#e8d68f] bg-[#fffdf0] px-3 py-2 text-[12px] leading-[1.5] text-[#8a6d0b]">
          <strong className="font-semibold">
            {`${noSize.length} colour${noSize.length > 1 ? "s have" : " has"} no board size in the colour library`}
          </strong>{" "}
          ({noSize.map((group) => `${group.board.colour} ${group.board.finish}`).join(", ")}). Counted at{" "}
          {`${FALLBACK_BOARD.width_mm} wide x ${FALLBACK_BOARD.length_mm} long`} for now. Set the real size on the board below, or
          fix the library row.
        </p>
      ) : null}

      {result.excluded_lines.length ? (
        <p className="mb-3 rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[12px] leading-[1.5] text-[#5a5a52]">
          Left out of the count:{" "}
          {result.excluded_lines.map((entry, index) => (
            <React.Fragment key={entry.index}>
              {index ? ", " : ""}
              <strong className="font-semibold">{`line ${entry.index + 1}`}</strong>{" "}
              {entry.product_type.toLowerCase()}
            </React.Fragment>
          ))}
          . Not made from decorative board.
        </p>
      ) : null}

      {result.groups.length ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8b8a81] mb-3">One board, one colour</p>
      ) : null}

      {result.groups.map((group) => (
        <BoardGroup
          key={group.key}
          group={group}
          open={openGroup === group.key}
          disabled={disabled}
          selected={selected}
          onToggle={(key, isOpen) => setOpenKey(isOpen ? key : null)}
          onPick={(id) => setSelected((current) => (current === id ? null : id))}
          onSet={setBoard}
          onRevert={revertBoard}
        />
      ))}

      {result.groups.length ? (
        <div className="bg-[#edf4eb] border border-[#a8c5a0] rounded-[8px] p-4 mt-4">
          {result.groups.map((group) => (
            <div
              key={group.key}
              className="flex justify-between items-center py-[5px] border-b border-[#a8c5a0] text-[13px] gap-3"
            >
              <span className="text-[#2d5e28] min-w-0 truncate">
                {`${group.board.supplier} ${group.board.colour}, ${group.board.finish}, ${group.board.thickness_mm}mm`}
                <span className="text-[#4a7a42] text-[11px]">
                  {` · ${group.board.width_mm} wide x ${group.board.length_mm} long`}
                </span>
              </span>
              <strong className="text-[#1a1a18] font-mono font-medium flex-shrink-0">{group.boards}</strong>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3 mt-1">
            <span className="text-[15px] font-semibold text-[#2d5e28]">Boards to order</span>
            <strong className="text-[20px] font-semibold text-[#1a1a18] font-mono">{totals.boards}</strong>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-[1.6] text-[#8b8a81] max-w-[78ch]">
        <strong className="font-semibold text-[#5a5a52]">What this is.</strong> A buying guide, not a cutting program.
        The layout is a first fit, largest panel first, cut in runs across the board the way a panel saw works. A nesting
        program at the saw will beat it here and there, so treat the board count as the number to order and not the last
        word on where each panel lands.
      </p>

      {Modal ? (
        <Modal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="How the boards are worked out"
          subtitle="Board size and grain belong to the colour, so they are set on each board."
          size="lg"
          footer={
            <>
              <button
                type="button"
                className="h-[34px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors"
                disabled={disabled || !changedFromDefaults}
                onClick={() =>
                  patch({
                    include_carcass: undefined,
                    standard_grain: undefined,
                    kerf_mm: undefined,
                    trim_mm: undefined,
                  })
                }
              >
                Reset to defaults
              </button>
              <button
                type="button"
                className="h-[34px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] transition-colors"
                onClick={() => setSettingsOpen(false)}
              >
                Done
              </button>
            </>
          }
        >
          <label className="flex items-start gap-[10px] cursor-pointer">
            <input
              type="checkbox"
              className="w-[16px] h-[16px] mt-[1px] accent-[#2d5e28] cursor-pointer flex-shrink-0"
              disabled={disabled}
              checked={active.include_carcass}
              onChange={(event) => patch({ include_carcass: event.target.checked })}
            />
            <span>
              <span className="block text-[13px] text-[#1a1a18]">Include cabinet carcass panels</span>
              <span className={`block ${tw.muted}`}>
                Every side, top, bottom, back and shelf from the cut list on each base cabinet.
              </span>
            </span>
          </label>

          <div className="h-px bg-[#edf4eb]" />

          <div className={tw.field}>
            <span>On a grained board, Standard means</span>
            <span className="inline-flex border border-[#dbd8cc] rounded-[6px] overflow-hidden bg-white w-fit">
              {[["height", "Up the height"], ["by_type", "By panel type"]].map(([value, label], index) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => patch({ standard_grain: value })}
                  className={`px-3 h-[32px] text-[13px] font-medium transition-colors disabled:opacity-50 ${
                    index ? "border-l border-[#dbd8cc] " : ""
                  }${active.standard_grain === value ? "bg-[#1c2b1e] text-white" : "text-[#5a5a52] hover:bg-[#f5f8f4]"}`}
                >
                  {label}
                </button>
              ))}
            </span>
            <span className={`${tw.muted} font-normal`}>
              By panel type runs a drawer front across its width, the way the order form describes it. A board with no
              grain ignores this: every panel on it can be turned.
            </span>
          </div>

          <div className="h-px bg-[#edf4eb]" />

          <div className="grid grid-cols-2 gap-3">
            {[
              ["kerf_mm", "Saw kerf mm", "0.1", "Taken off between panels."],
              ["trim_mm", "Edge trim mm", "1", "Taken off all four edges of the board."],
            ].map(([key, label, step, hint]) => (
              <label key={key} className={tw.field}>
                <span>{label}</span>
                <input
                  type="number"
                  min="0"
                  step={step}
                  disabled={disabled}
                  className="h-[34px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] font-mono text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61] disabled:bg-[#f5f8f4]"
                  value={active[key]}
                  onChange={(event) => {
                    const number = Number(event.target.value);
                    if (Number.isFinite(number) && number >= 0) patch({ [key]: number });
                  }}
                />
                <span className={`${tw.muted} font-normal`}>{hint}</span>
              </label>
            ))}
          </div>

          <p className={tw.muted}>
            These come from Settings, Business Defaults. Changing them here changes this quote only.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

