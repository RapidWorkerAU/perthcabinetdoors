"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import styles from "../design.module.css";
import DesignTopBar, { barButton } from "../../../../components/DesignTopBar";
import DesignCanvas from "./DesignCanvas";
import DesignLeftPanel from "./DesignLeftPanel";
import DesignRightPanel from "./DesignRightPanel";
import ImportModal from "./ImportModal";
import MaterialDefaultsModal from "./MaterialDefaultsModal";
import DesignPlanExportModal from "./DesignPlanExportModal";
import FrontElevationView from "./FrontElevationView";
import StageQuoteModal from "./StageQuoteModal";
import CutListModal from "./CutListModal";
import { RoomCutList } from "./CutListView";
import useDesignProgram from "./useDesignProgram";
import PinchZoom from "./PinchZoom";

// three.js is heavy and only needed once the 3D view is opened, so it's split
// out of the initial bundle and never server-rendered (r3f is client-only).
const Design3DView = dynamic(() => import("./Design3DView"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#78716c", fontSize: 13 }}>
      Loading 3D view…
    </div>
  ),
});

// One row in the "Quote & Export" kebab menu — dark, full-width, hover-lit.
function ActionMenuItem({ onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.10)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 7, border: "none", background: "transparent", color: disabled ? "rgba(243,241,234,0.4)" : "#f3f1ea", cursor: disabled ? "default" : "pointer", font: "inherit", fontSize: 13, whiteSpace: "nowrap" }}
    >
      {children}
    </button>
  );
}

export default function DesignProgram({ projectId }) {
  const [show3D, setShow3D] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [roomCutListOpen, setRoomCutListOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false); // "Quote & Export" kebab menu
  // The desktop "Add item" picker lives in the LEFT rail now (the card
  // catalogue); the chosen type is held here so the right panel can show its
  // size form. Cleared whenever add-mode ends (see effect below).
  const [addPick, setAddPick] = useState(null);
  // Paint panels with the real colour-library tiles instead of the flat
  // per-type colours. Shared across all three views and OFF by default — the
  // default look is the familiar coloured-by-type one. Toggle lives in each
  // view's toolbar; when a tile can't be resolved a panel keeps its type colour.
  const [showColours, setShowColours] = useState(false);
  const toggleColours = () => setShowColours((v) => !v);
  const {
    project, setProject,
    rooms, items,
    selectedRoomId, setSelectedRoomId,
    selectedItemId, setSelectedItemId,
    isAddingItem, setIsAddingItem,
    importOpen, setImportOpen,
    materialDefaultsOpen, setMaterialDefaultsOpen,
    frontViewWall, setFrontViewWall,
    loading, error,
    saveError, dismissSaveError,
    colourImages,
    setItems,
    loadAll,
    handleAddRoom, handleUpdateRoom, handleDeleteRoom,
    handleAddItem, handleItemChange, handleItemDragEnd, handleOptimisticItemChange,
    handleDuplicateItem, handleDeleteItem,
    handleCanvasItemClick, handleCanvasDeselect,
    selectedRoom, roomItems, selectedItem,
    overlappingItemIds, selectedItemOverlaps,
  } = useDesignProgram(projectId);

  // Clear the picked add-type whenever we leave add-mode (cancel, or a
  // successful add resets isAddingItem in the hook).
  useEffect(() => { if (!isAddingItem) setAddPick(null); }, [isAddingItem]);

  if (loading) {
    return (
      <div className={styles.designShell}>
        <div className={styles.loadingScreen}>Loading design project…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.designShell}>
        <div className={styles.errorScreen}>
          <span>{error}</span>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={loadAll}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // One view state for the shared top bar. Under the hood the tool still tracks
  // "3D open" and "which elevation wall" separately, so we translate between the
  // two: plan = neither, elevation = a wall chosen, 3d = the 3D view.
  const view = show3D ? "3d" : frontViewWall ? "elevation" : "plan";
  const elevWall = frontViewWall || "top";
  const onView = (v) => {
    if (v === "3d") { setFrontViewWall(null); setShow3D(true); }
    else if (v === "elevation") { setShow3D(false); setFrontViewWall(frontViewWall || "top"); }
    else { setShow3D(false); setFrontViewWall(null); }
  };
  const onElevWall = (w) => { setShow3D(false); setFrontViewWall(w); };

  return (
    <div className={styles.designShell}>
      <DesignTopBar
        view={view} onView={onView}
        elevWall={elevWall} onElevWall={onElevWall}
        showColours={showColours} onToggleColours={toggleColours}
        left={<>
          <Link href="/admin/design" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none", fontSize: 12, whiteSpace: "nowrap" }}>← All projects</Link>
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{project?.name || "Design Tool"}</span>
          {/* Room switcher — moved off the left rail so the rail is a clean
              cabinet list. */}
          <select
            value={selectedRoomId || ""}
            onChange={(e) => { setSelectedRoomId(e.target.value); setSelectedItemId(null); setIsAddingItem(false); }}
            disabled={rooms.length === 0}
            title="Switch room"
            style={{ ...barButton, background: "rgba(255,255,255,0.06)", padding: "6px 8px", maxWidth: 200 }}
          >
            {rooms.length === 0 && <option value="">No rooms yet</option>}
            {rooms.map((r) => <option key={r.id} value={r.id} style={{ color: "#111" }}>{r.name}</option>)}
          </select>
        </>}
        right={<>
          <button type="button" style={barButton} onClick={() => setRoomCutListOpen(true)} disabled={!selectedRoom} title="See every cabinet's cut list plus the shared kickboard / panel runs for this room">Cut list</button>
          <button type="button" style={barButton} onClick={() => setMaterialDefaultsOpen(true)} title="Set project-wide starting materials for new cabinets, shelves, doors, drawers and panels">Material Defaults</button>
          {/* Quote + export functions collapsed into a kebab menu to keep the bar tidy. */}
          <span style={{ position: "relative" }}>
            <button type="button" style={{ ...barButton, display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => setActionsOpen((o) => !o)} aria-haspopup="menu" aria-expanded={actionsOpen} title="Quote and export functions">
              Quote &amp; Export <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1, letterSpacing: "-1px" }}>⋮</span>
            </button>
            {actionsOpen && (
              <>
                <div onClick={() => setActionsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 21, background: "#2f302c", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, minWidth: 210, padding: 6, boxShadow: "0 14px 36px rgba(0,0,0,0.45)" }}>
                  <ActionMenuItem onClick={() => { setStageOpen(true); setActionsOpen(false); }}>Stage Quote</ActionMenuItem>
                  <ActionMenuItem onClick={() => { setImportOpen(true); setActionsOpen(false); }}>Import to Quote</ActionMenuItem>
                  <ActionMenuItem disabled={rooms.length === 0} onClick={() => { setExportOpen(true); setActionsOpen(false); }}>Export PDF</ActionMenuItem>
                </div>
              </>
            )}
          </span>
        </>}
      />

      <div className={styles.designProgram}>
      <DesignLeftPanel
        rooms={rooms}
        items={items}
        selectedRoomId={selectedRoomId}
        selectedItemId={selectedItemId}
        onSelectRoom={(id) => { setSelectedRoomId(id); setSelectedItemId(null); setIsAddingItem(false); }}
        onSelectItem={(id) => { setSelectedItemId(id); setIsAddingItem(false); }}
        onAddRoom={handleAddRoom}
        onUpdateRoom={handleUpdateRoom}
        onDeleteRoom={handleDeleteRoom}
        onDeleteItem={handleDeleteItem}
        onAddCabinet={() => { setAddPick(null); setIsAddingItem(true); setSelectedItemId(null); }}
        isAddingItem={isAddingItem}
        pickedType={addPick}
        onPickType={(type, kind) => setAddPick(type ? { type, kind } : null)}
        onCancelAdd={() => { setIsAddingItem(false); setAddPick(null); }}
      />

      <div className={styles.canvasArea}>
        {saveError && (
          <div className={styles.saveErrorBanner}>
            <span>Couldn&apos;t save your last change: {saveError}</span>
            <button type="button" onClick={dismissSaveError}>Dismiss</button>
          </div>
        )}
        {show3D && selectedRoom ? (
          <Design3DView
            room={selectedRoom}
            items={roomItems}
            onClose={() => setShow3D(false)}
            colourImages={colourImages}
            showColours={showColours}
            onToggleColours={toggleColours}
            selectedItemId={selectedItemId}
            onSelectItem={(id) => { setSelectedItemId(id); setIsAddingItem(false); }}
            showClose={false}
          />
        ) : frontViewWall && selectedRoom ? (
          <FrontElevationView
            wall={frontViewWall}
            room={selectedRoom}
            items={roomItems}
            // The top bar now owns view switching + the wall picker, so the
            // elevation view drops its own tabs/close chrome to match the public
            // planner (chrome={false}).
            chrome={false}
            onClose={() => setFrontViewWall(null)}
            // Optimistic update + revert-and-surface on failure, so an elevation
            // edit that doesn't save can't silently look applied.
            onItemChange={handleOptimisticItemChange}
            onItemSelect={(itemId) => { setSelectedItemId(itemId); setIsAddingItem(false); }}
            selectedId={selectedItemId}
            colourImages={colourImages}
            showColours={showColours}
            zoomable
            zoomControls="full"
          />
        ) : selectedRoom ? (
          <>
            <div className={styles.canvasToolbar}>
              <span className={styles.canvasToolbarLabel}>Room:</span>
              <span className={styles.canvasToolbarRoomName}>{selectedRoom.name}</span>
              <span className={styles.canvasToolbarHint}>
                Drag cabinets to position · back of cabinet sets elevation wall · white stripe = front face
              </span>
            </div>
            <div className={styles.canvasSvgWrap}>
              <PinchZoom maxScale={4} controls="full">
                <DesignCanvas
                  room={selectedRoom}
                  items={roomItems}
                  selectedItemId={selectedItemId}
                  overlappingItemIds={overlappingItemIds}
                  onItemClick={handleCanvasItemClick}
                  onDeselect={handleCanvasDeselect}
                  onItemDragEnd={handleItemDragEnd}
                  onFrontView={(wall) => setFrontViewWall(wall)}
                  colourImages={colourImages}
                  showColours={showColours}
                />
              </PinchZoom>
            </div>
          </>
        ) : (
          <div className={styles.canvasEmpty}>
            <span>No room selected</span>
            <span className={styles.canvasEmptyHint}>Add a room in the left panel to start designing.</span>
          </div>
        )}
      </div>

      <DesignRightPanel
        item={selectedItem}
        allItems={roomItems}
        room={selectedRoom}
        materialDefaults={project?.material_defaults}
        isAddingItem={isAddingItem}
        isOverlapping={selectedItemOverlaps}
        onAdd={handleAddItem}
        onCancelAdd={() => { setIsAddingItem(false); setAddPick(null); }}
        onItemChange={handleItemChange}
        onDeleteItem={handleDeleteItem}
        onDuplicateItem={handleDuplicateItem}
        onSelectItem={(id) => { setSelectedItemId(id); setIsAddingItem(false); }}
        currentWall={frontViewWall}
        pickedType={addPick}
        onPickType={(type, kind) => setAddPick(type ? { type, kind } : null)}
        colourImages={colourImages}
      />
      </div>

      {importOpen && (
        <ImportModal
          projectId={projectId}
          items={items}
          rooms={rooms}
          onClose={() => setImportOpen(false)}
        />
      )}

      {exportOpen && rooms.length > 0 && (
        <DesignPlanExportModal
          projectId={projectId}
          project={project}
          rooms={rooms}
          items={items}
          currentRoomId={selectedRoomId}
          colourImages={colourImages}
          onClose={() => setExportOpen(false)}
        />
      )}

      {materialDefaultsOpen && (
        <MaterialDefaultsModal
          projectId={projectId}
          initialDefaults={project?.material_defaults}
          onClose={() => setMaterialDefaultsOpen(false)}
          onSaved={(materialDefaults) => setProject((p) => ({ ...p, material_defaults: materialDefaults }))}
          onItemsChanged={loadAll}
        />
      )}

      {stageOpen && project?.id && (
        <StageQuoteModal projectId={project.id} onClose={() => setStageOpen(false)} />
      )}

      {roomCutListOpen && selectedRoom && (
        <CutListModal
          title={selectedRoom.name}
          subtitle="Cutting list — every cabinet plus shared runs"
          onClose={() => setRoomCutListOpen(false)}
        >
          <RoomCutList room={selectedRoom} items={roomItems} />
        </CutListModal>
      )}

    </div>
  );
}
