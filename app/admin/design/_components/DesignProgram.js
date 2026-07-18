"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import styles from "../design.module.css";
import DesignCanvas from "./DesignCanvas";
import DesignLeftPanel from "./DesignLeftPanel";
import DesignRightPanel from "./DesignRightPanel";
import ImportModal from "./ImportModal";
import MaterialDefaultsModal from "./MaterialDefaultsModal";
import DesignPlanExportModal from "./DesignPlanExportModal";
import FrontElevationView from "./FrontElevationView";
import useDesignProgram from "./useDesignProgram";

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

export default function DesignProgram({ projectId }) {
  const [show3D, setShow3D] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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

  if (loading) {
    return (
      <div className={styles.designProgram}>
        <div className={styles.loadingScreen}>Loading design project…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.designProgram}>
        <div className={styles.errorScreen}>
          <span>{error}</span>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={loadAll}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.designProgram}>
      <DesignLeftPanel
        project={project}
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
        onOpenImport={() => setImportOpen(true)}
        onOpenMaterialDefaults={() => setMaterialDefaultsOpen(true)}
        onAddCabinet={() => { setIsAddingItem(true); setSelectedItemId(null); }}
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
          />
        ) : frontViewWall && selectedRoom ? (
          <FrontElevationView
            wall={frontViewWall}
            room={selectedRoom}
            items={roomItems}
            onClose={() => setFrontViewWall(null)}
            // Optimistic update + revert-and-surface on failure, so an elevation
            // edit that doesn't save can't silently look applied.
            onItemChange={handleOptimisticItemChange}
            onItemSelect={(itemId) => { setSelectedItemId(itemId); setIsAddingItem(false); }}
            colourImages={colourImages}
            showColours={showColours}
            onToggleColours={toggleColours}
          />
        ) : selectedRoom ? (
          <>
            <div className={styles.canvasToolbar}>
              <span className={styles.canvasToolbarLabel}>Room:</span>
              <span className={styles.canvasToolbarRoomName}>{selectedRoom.name}</span>
              <span className={styles.canvasToolbarHint}>
                Drag cabinets to position · back of cabinet sets elevation wall · white stripe = front face
              </span>
              <button
                type="button"
                className={`${styles.view3dBtn} ${showColours ? styles.view3dBtnActive : ""}`}
                onClick={toggleColours}
                title="Paint cabinets with their real colour-library finishes"
              >
                {showColours ? "Colours on" : "Show colours"}
              </button>
              <button
                type="button"
                className={styles.view3dBtn}
                onClick={() => setShow3D(true)}
                title="View this room in 3D (read-only)"
              >
                3D view
              </button>
              <button
                type="button"
                className={styles.view3dBtn}
                onClick={() => setExportOpen(true)}
                title="Export a customer PDF: floor plan, elevations, 3D and finishes"
              >
                Export PDF
              </button>
            </div>
            <div className={styles.canvasSvgWrap}>
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
        onCancelAdd={() => setIsAddingItem(false)}
        onItemChange={handleItemChange}
        onDeleteItem={handleDeleteItem}
        onDuplicateItem={handleDuplicateItem}
        onSelectItem={(id) => { setSelectedItemId(id); setIsAddingItem(false); }}
      />

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

    </div>
  );
}
