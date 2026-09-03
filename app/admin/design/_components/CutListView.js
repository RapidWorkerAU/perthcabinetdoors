"use client";

// Shared cut-list rendering for the design tool. Two entry points:
//   <CabinetCutRows item items room />  — one cabinet's boards (used in the
//        right-sidebar "View cut list" window)
//   <RoomCutList room items />          — every cabinet in a room plus the
//        shared continuous runs (kickboards / back / filler / underside panels
//        that span several cabinets), used in the top-bar "Cut list" window
//
// The board maths lives in lib/pcd-cut-list.js so it matches what gets quoted;
// this file is only the on-screen presentation.

import { useState } from "react";
import styles from "../design.module.css";
import { computeCutList } from "../../../../lib/pcd-cut-list";
import { computeAllKickboardRuns, hasKickboard, isCornerType } from "../../../../lib/pcd-kickboard-utils";
import { computeAllBackPanelRuns, splitBackPanelWidths } from "../../../../lib/pcd-backpanel-utils";
import { panelReach } from "../../../../lib/pcd-panel-options";
import { computeAllBottomPanelRuns } from "../../../../lib/pcd-bottompanel-utils";
import { computeAllTopPanelRuns } from "../../../../lib/pcd-toppanel-utils";
import { computeAllFillerPanelRuns, fillerPanelGapMm } from "../../../../lib/pcd-fillerpanel-utils";
import { finishedTopPanelDepthMm } from "../../../../lib/pcd-door-utils";

// One definition, in lib/pcd-design-item-io.js. This was written out by hand
// in seven files; see test/one-definition.test.mjs for why it now is not.
import { CABINET_TYPES } from "../../../../lib/pcd-design-item-io";

// Friendly fallback label when an item has no custom label yet.
const TYPE_LABELS = {
  base_cabinet:  "Base Cabinet",
  wall_cabinet:  "Wall Cabinet",
  tall_cabinet:  "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  corner_tall_cabinet: "Corner Pantry",
  blind_corner_cabinet: "Blind Corner Cabinet",
  door:          "Door",
  drawer_front:  "Drawer Front",
  panel:         "Panel",
  scribe:        "Scribe",
  obstruction:   "Obstruction",
  window:        "Window",
  door_opening:  "Doorway",
  appliance:     "Appliance",
  brick_corner_pantry: "Brick Corner Pantry",
  floating_shelf: "Floating Shelf",
  bookcase:      "Bookcase",
  shelf_rail:    "Shelf & Rail",
};

export function itemDisplayLabel(item) {
  return item.label || TYPE_LABELS[item.item_type] || item.item_type;
}

const MAT_DOT_COLOR = {
  shelf:     "#3b82f6",
  back:      "#6b7280",
  kickboard: "#f59e0b",
  filler:    "#f59e0b",
  panel:     "#a855f7",
  door:      "#a855f7",
  drawer:    "#8b5cf6",
};

const WALL_SHORT = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };

function CutListRow({ part }) {
  const dotColor = MAT_DOT_COLOR[part.material] || null;
  return (
    <div className={styles.cutListRow} style={part.note ? { flexWrap: "wrap" } : undefined}>
      {dotColor && <span className={styles.cutListMatDot} style={{ background: dotColor }} />}
      <span className={styles.cutListDim}>
        {part.dim1} <span className={styles.cutListAxis}>({part.axis1})</span>
        {" × "}
        {part.dim2} <span className={styles.cutListAxis}>({part.axis2})</span>
      </span>
      <span className={styles.cutListName}>{part.name}</span>
      {part.note && (
        <span style={{ flexBasis: "100%", fontSize: 10, color: "var(--dt-text-muted, #888780)", lineHeight: 1.35, marginTop: 2 }}>
          ⤷ {part.note}
        </span>
      )}
    </div>
  );
}

// One cabinet's (or floating shelf's) boards. No header/collapse — the caller
// frames it (a modal title, or a collapsible block in the room list).
export function CabinetCutRows({ item, items = [], room = null }) {
  const parts = computeCutList(item, items, room);
  if (!parts.length) {
    return <p className={styles.cutListEmpty}>Set dimensions to see cut list</p>;
  }
  return (
    <div className={styles.cutList}>
      {parts.map((part, i) => <CutListRow key={i} part={part} />)}
    </div>
  );
}

// A non-cabinet item (door, panel, obstruction, …) — just its dimensions.
function SimpleDims({ item }) {
  return (
    <div className={styles.cutList}>
      <div className={styles.cutListRow}>
        <span className={styles.cutListDim}>
          {item.width_mm || 0} <span className={styles.cutListAxis}>(W)</span>
          {" × "}
          {item.height_mm || 0} <span className={styles.cutListAxis}>(H)</span>
          {item.item_type === "scribe"
            ? (item.scribe_thickness_mm ? <>{" × "}{item.scribe_thickness_mm} <span className={styles.cutListAxis}>(T)</span></> : null)
            : item.depth_mm ? <>{" × "}{item.depth_mm} <span className={styles.cutListAxis}>(D)</span></> : null}
        </span>
      </div>
    </div>
  );
}

function RunItem({ runId, dot, title, tag, openItems, toggleItem, children }) {
  const isExpanded = openItems.has(runId);
  return (
    <div className={styles.leftItemBlock}>
      <div className={styles.leftItemRow}>
        <span className={styles.leftItemDot} style={{ background: dot }} />
        <span className={styles.leftItemLabel}>{title}</span>
        <span className={styles.leftItemType} style={{ color: dot }}>{tag}</span>
        <button
          type="button"
          className={`${styles.leftItemExpand} ${isExpanded ? styles.leftItemExpandOpen : ""}`}
          onClick={(e) => toggleItem(runId, e)}
          title={isExpanded ? "Collapse" : "Show cabinets in this run"}
        >
          ›
        </button>
      </div>
      {isExpanded && <div className={styles.cutList}>{children}</div>}
    </div>
  );
}

function KickboardRunItem({ run, runId, openItems, toggleItem }) {
  const totalWidth = run.segments.reduce((sum, s) => sum + s.length, 0);
  const kHeight    = run.segments[0]?.item?.kickboard_height_mm || 120;
  return (
    <RunItem runId={runId} dot="#f59e0b" tag="run" openItems={openItems} toggleItem={toggleItem}
      title={`Kickboard ${WALL_SHORT[run.wall] || run.wall}`}>
      {run.segments.map((seg) => (
        <div key={`${seg.item.id}-${seg.leg}`} className={styles.cutListRow}>
          <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
          <span className={styles.cutListDim}>{seg.length} <span className={styles.cutListAxis}>(W)</span></span>
          <span className={styles.cutListName}>
            {itemDisplayLabel(seg.item)}
            {seg.leg === "secondary" ? " (Wall 2)" : isCornerType(seg.item) ? " (Wall 1)" : ""}
          </span>
        </div>
      ))}
      <div className={styles.cutListRow} style={{ marginTop: 5, borderTop: "1px solid rgba(245,158,11,0.2)", paddingTop: 5 }}>
        <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
        <span className={styles.cutListDim} style={{ color: "rgba(245,158,11,0.9)" }}>
          {totalWidth} <span className={styles.cutListAxis}>(W)</span>{" × "}{kHeight} <span className={styles.cutListAxis}>(H)</span>
        </span>
        <span className={styles.cutListName}>Total cut</span>
      </div>
    </RunItem>
  );
}

function FillerPanelRunItem({ run, runId, openItems, toggleItem, room, allItems }) {
  const totalWidth = run.segments.reduce((sum, s) => sum + s.length, 0);
  const firstItem  = run.segments[0]?.item;
  const fHeight    = firstItem?.filler_panel_height_mm ?? fillerPanelGapMm(firstItem || {}, room, allItems);
  return (
    <RunItem runId={runId} dot="#f59e0b" tag="run" openItems={openItems} toggleItem={toggleItem}
      title={`Filler Panel ${WALL_SHORT[run.wall] || run.wall}`}>
      {run.segments.map((seg) => (
        <div key={seg.item.id} className={styles.cutListRow}>
          <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
          <span className={styles.cutListDim}>{seg.length} <span className={styles.cutListAxis}>(W)</span></span>
          <span className={styles.cutListName}>{itemDisplayLabel(seg.item)}</span>
        </div>
      ))}
      <div className={styles.cutListRow} style={{ marginTop: 5, borderTop: "1px solid rgba(245,158,11,0.2)", paddingTop: 5 }}>
        <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
        <span className={styles.cutListDim} style={{ color: "rgba(245,158,11,0.9)" }}>
          {totalWidth} <span className={styles.cutListAxis}>(W)</span>{" × "}{fHeight} <span className={styles.cutListAxis}>(H)</span>
        </span>
        <span className={styles.cutListName}>Total cut</span>
      </div>
    </RunItem>
  );
}

function BackPanelRunItem({ run, runId, openItems, toggleItem }) {
  const totalWidth = run.segments.reduce((sum, s) => sum + s.length, 0);
  const firstItem  = run.segments[0]?.item;
  const qty        = firstItem?.back_panel_qty || 1;
  const runsToFloor = panelReach(firstItem, "back").toFloor;
  const panelH     = runsToFloor
    ? (Number(firstItem.height_mm) || 0) + (Number(firstItem.kickboard_height_mm) || 120)
    : (Number(firstItem.height_mm) || 0);
  const widths = splitBackPanelWidths(totalWidth, qty);
  const showKickboard = hasKickboard(firstItem) && !runsToFloor;
  const kickboardH = Number(firstItem?.kickboard_height_mm) || 120;
  return (
    <RunItem runId={runId} dot="#a855f7" tag="run" openItems={openItems} toggleItem={toggleItem}
      title={`Back Panel ${WALL_SHORT[run.wall] || run.wall}`}>
      {run.segments.map((seg) => (
        <div key={seg.item.id} className={styles.cutListRow}>
          <span className={styles.cutListMatDot} style={{ background: "#a855f7" }} />
          <span className={styles.cutListDim}>{seg.length} <span className={styles.cutListAxis}>(W)</span></span>
          <span className={styles.cutListName}>{itemDisplayLabel(seg.item)}</span>
        </div>
      ))}
      {widths.map((w, i) => (
        <div key={`panel-${i}`} className={styles.cutListRow}
          style={i === 0 ? { marginTop: 5, borderTop: "1px solid rgba(168,85,247,0.2)", paddingTop: 5 } : undefined}>
          <span className={styles.cutListMatDot} style={{ background: "#a855f7" }} />
          <span className={styles.cutListDim} style={{ color: "rgba(168,85,247,0.9)" }}>
            {w} <span className={styles.cutListAxis}>(W)</span>{" × "}{panelH} <span className={styles.cutListAxis}>(H)</span>
          </span>
          <span className={styles.cutListName}>Panel {i + 1} of {widths.length}</span>
        </div>
      ))}
      {showKickboard && (
        <div className={styles.cutListRow} style={{ marginTop: 5, borderTop: "1px solid rgba(245,158,11,0.2)", paddingTop: 5 }}>
          <span className={styles.cutListMatDot} style={{ background: "#f59e0b" }} />
          <span className={styles.cutListDim} style={{ color: "rgba(245,158,11,0.9)" }}>
            {totalWidth} <span className={styles.cutListAxis}>(W)</span>{" × "}{kickboardH} <span className={styles.cutListAxis}>(H)</span>
          </span>
          <span className={styles.cutListName}>Kickboard — Back (continues under panel)</span>
        </div>
      )}
    </RunItem>
  );
}

function BottomPanelRunItem({ run, runId, openItems, toggleItem }) {
  const totalWidth = run.segments.reduce((sum, s) => sum + s.length, 0);
  const firstItem  = run.segments[0]?.item;
  const qty        = firstItem?.bottom_panel_qty || 1;
  const panelD     = Number(firstItem?.depth_mm) || 0;
  const widths     = splitBackPanelWidths(totalWidth, qty);
  return (
    <RunItem runId={runId} dot="#a855f7" tag="run" openItems={openItems} toggleItem={toggleItem}
      title={`Underside Panel ${WALL_SHORT[run.wall] || run.wall}`}>
      {run.segments.map((seg) => (
        <div key={seg.item.id} className={styles.cutListRow}>
          <span className={styles.cutListMatDot} style={{ background: "#a855f7" }} />
          <span className={styles.cutListDim}>{seg.length} <span className={styles.cutListAxis}>(W)</span></span>
          <span className={styles.cutListName}>{itemDisplayLabel(seg.item)}</span>
        </div>
      ))}
      {widths.map((w, i) => (
        <div key={`panel-${i}`} className={styles.cutListRow}
          style={i === 0 ? { marginTop: 5, borderTop: "1px solid rgba(168,85,247,0.2)", paddingTop: 5 } : undefined}>
          <span className={styles.cutListMatDot} style={{ background: "#a855f7" }} />
          <span className={styles.cutListDim} style={{ color: "rgba(168,85,247,0.9)" }}>
            {w} <span className={styles.cutListAxis}>(W)</span>{" × "}{panelD} <span className={styles.cutListAxis}>(D)</span>
          </span>
          <span className={styles.cutListName}>Panel {i + 1} of {widths.length}</span>
        </div>
      ))}
    </RunItem>
  );
}

function TopPanelRunItem({ run, runId, openItems, toggleItem }) {
  const totalWidth = run.segments.reduce((sum, s) => sum + s.length, 0);
  const firstItem  = run.segments[0]?.item;
  const qty        = firstItem?.top_panel_qty || 1;
  const panelD     = finishedTopPanelDepthMm(firstItem) || Number(firstItem?.depth_mm) || 0;
  const widths     = splitBackPanelWidths(totalWidth, qty);
  return (
    <RunItem runId={runId} dot="#a855f7" tag="run" openItems={openItems} toggleItem={toggleItem}
      title={`Top Panel ${WALL_SHORT[run.wall] || run.wall}`}>
      {run.segments.map((seg) => (
        <div key={seg.item.id} className={styles.cutListRow}>
          <span className={styles.cutListMatDot} style={{ background: "#a855f7" }} />
          <span className={styles.cutListDim}>{seg.length} <span className={styles.cutListAxis}>(W)</span></span>
          <span className={styles.cutListName}>{itemDisplayLabel(seg.item)}</span>
        </div>
      ))}
      {widths.map((w, i) => (
        <div key={`panel-${i}`} className={styles.cutListRow}
          style={i === 0 ? { marginTop: 5, borderTop: "1px solid rgba(168,85,247,0.2)", paddingTop: 5 } : undefined}>
          <span className={styles.cutListMatDot} style={{ background: "#a855f7" }} />
          <span className={styles.cutListDim} style={{ color: "rgba(168,85,247,0.9)" }}>
            {w} <span className={styles.cutListAxis}>(W)</span>{" Ã— "}{panelD} <span className={styles.cutListAxis}>(D)</span>
          </span>
          <span className={styles.cutListName}>Panel {i + 1} of {widths.length}</span>
        </div>
      ))}
    </RunItem>
  );
}

// The whole-room cutting list: every item's cut list, then the shared
// continuous runs. Everything starts expanded (it's a dedicated window meant to
// be read in full); each block can be collapsed.
export function RoomCutList({ room, items = [] }) {
  const roomItems = items.filter((i) => i.room_id === room?.id);

  const kbRuns = computeAllKickboardRuns(roomItems, room);
  const bpRuns = computeAllBackPanelRuns(roomItems);
  const fpRuns = computeAllFillerPanelRuns(roomItems);
  const upRuns = computeAllBottomPanelRuns(roomItems);
  const tpRuns = computeAllTopPanelRuns(roomItems);

  const kbId = (run) => `kb-${room.id}-${run.wall}-${run.segments[0]?.item?.id}-${run.segments[0]?.leg}`;
  const bpId = (run) => `bp-${room.id}-${run.wall}-${run.segments[0]?.item?.id}`;
  const fpId = (run) => `fp-${room.id}-${run.wall}-${run.segments[0]?.item?.id}`;
  const upId = (run) => `up-${room.id}-${run.wall}-${run.segments[0]?.item?.id}`;
  const tpId = (run) => `tp-${room.id}-${run.wall}-${run.segments[0]?.item?.id}`;

  // Start with every block open.
  const [openItems, setOpenItems] = useState(() => new Set([
    ...roomItems.map((i) => i.id),
    ...kbRuns.map(kbId), ...bpRuns.map(bpId), ...fpRuns.map(fpId), ...upRuns.map(upId), ...tpRuns.map(tpId),
  ]));
  const toggleItem = (id, e) => {
    e?.stopPropagation();
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasCutList = (item) => CABINET_TYPES.includes(item.item_type) || item.item_type === "floating_shelf";

  if (!roomItems.length) {
    return <p className={styles.cutListEmpty} style={{ padding: 20 }}>No items in this room yet.</p>;
  }

  return (
    <div>
      {roomItems.map((item) => {
        const isOpen = openItems.has(item.id);
        return (
          <div key={item.id} className={styles.leftItemBlock}>
            <div className={styles.leftItemRow} role="button" tabIndex={0}
              onClick={(e) => toggleItem(item.id, e)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleItem(item.id, e); }}>
              <span className={styles.leftItemLabel}>
                {itemDisplayLabel(item)}
                {item.qty > 1 && <span className={styles.leftItemQty}> ×{item.qty}</span>}
              </span>
              <button
                type="button"
                className={`${styles.leftItemExpand} ${isOpen ? styles.leftItemExpandOpen : ""}`}
                onClick={(e) => toggleItem(item.id, e)}
                title={isOpen ? "Collapse" : "Expand"}
              >
                ›
              </button>
            </div>
            {isOpen && (hasCutList(item)
              ? <CabinetCutRows item={item} items={roomItems} room={room} />
              : <SimpleDims item={item} />)}
          </div>
        );
      })}

      {kbRuns.map((run) => <KickboardRunItem key={kbId(run)} run={run} runId={kbId(run)} openItems={openItems} toggleItem={toggleItem} />)}
      {bpRuns.map((run) => <BackPanelRunItem key={bpId(run)} run={run} runId={bpId(run)} openItems={openItems} toggleItem={toggleItem} />)}
      {fpRuns.map((run) => <FillerPanelRunItem key={fpId(run)} run={run} runId={fpId(run)} openItems={openItems} toggleItem={toggleItem} room={room} allItems={roomItems} />)}
      {upRuns.map((run) => <BottomPanelRunItem key={upId(run)} run={run} runId={upId(run)} openItems={openItems} toggleItem={toggleItem} />)}
      {tpRuns.map((run) => <TopPanelRunItem key={tpId(run)} run={run} runId={tpId(run)} openItems={openItems} toggleItem={toggleItem} />)}
    </div>
  );
}
