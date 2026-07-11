"use client";

import styles from "../design.module.css";
import DesignCanvas from "./DesignCanvas";
import DesignLeftPanel from "./DesignLeftPanel";
import DesignRightPanel from "./DesignRightPanel";
import ImportModal from "./ImportModal";
import MaterialDefaultsModal from "./MaterialDefaultsModal";
import FrontElevationView from "./FrontElevationView";
import useDesignProgram from "./useDesignProgram";

export default function DesignProgram({ projectId }) {
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
    setItems,
    loadAll,
    handleAddRoom, handleUpdateRoom, handleDeleteRoom,
    handleAddItem, handleItemChange, handleItemDragEnd,
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
        {frontViewWall && selectedRoom ? (
          <FrontElevationView
            wall={frontViewWall}
            room={selectedRoom}
            items={roomItems}
            onClose={() => setFrontViewWall(null)}
            onItemChange={(itemId, patch) => {
              // Optimistic update so the right panel sees changes immediately on drag release
              setItems((it) => it.map((x) => (x.id === itemId ? { ...x, ...patch } : x)));
              handleItemChange(itemId, patch);
            }}
            onItemSelect={(itemId) => { setSelectedItemId(itemId); setIsAddingItem(false); }}
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
              <DesignCanvas
                room={selectedRoom}
                items={roomItems}
                selectedItemId={selectedItemId}
                overlappingItemIds={overlappingItemIds}
                onItemClick={handleCanvasItemClick}
                onDeselect={handleCanvasDeselect}
                onItemDragEnd={handleItemDragEnd}
                onFrontView={(wall) => setFrontViewWall(wall)}
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
