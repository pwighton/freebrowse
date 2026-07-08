import { useEffect, useRef } from "react";
import { registerNiivueEvents } from "@/store/niivue-sync";
import { createStoreSyncTarget } from "@/store/niivue-store-sync";
import { useViewerOptions } from "@/hooks/use-viewer-options";
import { useLocation } from "@/hooks/use-location";
import { useVolumes } from "@/hooks/use-volumes";
import { useSurfaces } from "@/hooks/use-surfaces";
import { useMeshLayers } from "@/hooks/use-mesh-layers";
import { useDrawing } from "@/hooks/use-drawing";
import { useMagicWand } from "@/hooks/use-magic-wand";
import { useSave } from "@/hooks/use-save";
import { useFileLoading } from "@/hooks/use-file-loading";
import { useAiCapabilities } from "@/hooks/use-ai-capabilities";
import { useAiSession } from "@/hooks/use-ai-session";
import {
  resolveImagingUploadConfirmation,
  resolveSessionDeleteConfirmation,
} from "@/lib/confirmations";
import { NiiVueGPU as Niivue } from "@niivue/niivue";
import "../App.css";
import ViewerShell from "./viewer-shell";
import Sidebar from "./sidebar";
import RemoveDialog from "./dialogs/remove-dialog";
import SaveDialog from "./dialogs/save-dialog";
import SettingsDialog from "./dialogs/settings-dialog";
import ImagingUploadConfirmationDialog from "./dialogs/imaging-upload-confirmation-dialog";
import SessionDeleteConfirmationDialog from "./dialogs/session-delete-confirmation-dialog";

const nv = new Niivue({
  // MIGRATION-TODO(P2): tune fontScale (was textHeight=0.02, different units).
  backend: "webgl2", // pin during migration; auto-select in P6
  placeholderText: "Drag-drop images",
  isDragDropEnabled: true,
  backgroundColor: [0, 0, 0, 1],
  crosshairColor: [1.0, 0.0, 0.0, 0.5],
});

export default function FreeBrowse() {
  const nvRef = useRef<Niivue | null>(nv);

  // Event-driven sync: the Zustand store is a derived view of niivue state.
  // registerNiivueEvents subscribes the store adapter to niivue's events, so
  // both FreeBrowse's own command wrappers and external callers driving the
  // instance (window.freebrowse.nv) update the UI through the same path.
  useEffect(() => {
    const teardown = registerNiivueEvents(nv, createStoreSyncTarget(nv));
    (window as unknown as { freebrowse?: { nv: Niivue } }).freebrowse = { nv };
    return teardown;
  }, []);

  // --- Hooks ---
  const {
    viewerOptions,
    applyViewerOptions,
    syncViewerOptionsFromNiivue,
    debouncedGLUpdate,
  } = useViewerOptions(nvRef, true);
  const { handleLocationChange } = useLocation(nvRef);
  const {
    updateSurfaceDetails,
    toggleSurfaceVisibility,
    removeSurface,
    handleRemoveSurfaceClick,
    handleSurfaceOpacityChange,
    handleSurfaceColorChange,
    handleMeshShaderChange,
  } = useSurfaces(nvRef, debouncedGLUpdate);
  const {
    layerFileInputRef,
    getLayers,
    removeLayer: removeLayerFromMesh,
    handleLayerOpacityChange,
    handleLayerCalMinChange,
    handleLayerCalMaxChange,
    handleLayerColormapChange,
    handleLayerUseNegativeCmapChange,
    handleAddLayerFiles,
    handleLayerFileChange,
  } = useMeshLayers(nvRef);
  const {
    getVolumes,
    toggleImageVisibility,
    handleOpacityChange,
    handleFrameChange,
    handleContrastMinChange,
    handleContrastMaxChange,
    handleColormapChange,
    handleMoveVolumeUp,
    handleMoveVolumeDown,
    handleRemoveVolumeClick,
    handleEditVolume,
    canEditVolume,
    handleConfirmRemove,
    handleCancelRemove,
  } = useVolumes(nvRef, debouncedGLUpdate, removeSurface);
  const {
    handleCreateDrawingLayer,
    handleDrawingColormapChange,
    handleDrawModeChange,
    handlePenFillChange,
    handlePenErasesChange,
    handlePenValueChange,
    handleDrawingOpacityChange,
    handleMagicWand2dOnlyChange,
    handleMagicWandMaxDistanceChange,
    handleMagicWandThresholdChange,
    handleDrawUndo,
    handleSaveDrawing,
  } = useDrawing(nvRef, debouncedGLUpdate);
  // Magic wand (nv-ext-drawing): seeds a flood fill on slice clicks in wand
  // mode; params flow through the store, result via drawingChanged.
  useMagicWand(nvRef);
  const {
    handleSaveScene,
    handleConfirmSave,
    handleCancelSave,
    handleVolumeUrlChange,
    handleVolumeCheckboxChange,
    handleDocumentLocationChange,
    handleDocumentCheckboxChange,
  } = useSave(nvRef);
  const {
    serverlessMode,
    fileInputRef,
    surfaceFileInputRef,
    handleFileUpload,
    handleImagingFileSelect,
    handleNvdFileSelect,
    handleFileChange,
    handleAddMoreFiles,
    handleAddSurfaceFiles,
    handleSurfaceFileChange,
  } = useFileLoading(
    nvRef,
    applyViewerOptions,
    syncViewerOptionsFromNiivue,
    updateSurfaceDetails,
    handleLocationChange,
  );

  useAiCapabilities();
  const {
    refreshSessions: handleAiRefreshSessions,
    handleNewSession: handleAiNewSession,
    handleLoadSession: handleAiLoadSession,
    handleRunSegmentation: handleAiRunSegmentation,
    handleExitAndSaveSession: handleAiExitAndSaveSession,
    handleExitAndDeleteSession: handleAiExitAndDeleteSession,
  } = useAiSession(nvRef);

  return (
    <ViewerShell
      nvInstance={nv}
      viewMode={viewerOptions.viewMode}
      onFileUpload={handleFileUpload}
      sidebar={
        <Sidebar
          nvRef={nvRef}
          serverlessMode={serverlessMode}
          onNvdFileSelect={handleNvdFileSelect}
          onImagingFileSelect={handleImagingFileSelect}
          onAddMoreFiles={handleAddMoreFiles}
          onAddSurfaceFiles={handleAddSurfaceFiles}
          getVolumes={getVolumes}
          onToggleImageVisibility={toggleImageVisibility}
          onEditVolume={handleEditVolume}
          canEditVolume={canEditVolume}
          onRemoveVolumeClick={handleRemoveVolumeClick}
          onOpacityChange={handleOpacityChange}
          onFrameChange={handleFrameChange}
          onContrastMinChange={handleContrastMinChange}
          onContrastMaxChange={handleContrastMaxChange}
          onColormapChange={handleColormapChange}
          onMoveVolumeUp={handleMoveVolumeUp}
          onMoveVolumeDown={handleMoveVolumeDown}
          onToggleSurfaceVisibility={toggleSurfaceVisibility}
          onRemoveSurfaceClick={handleRemoveSurfaceClick}
          onSurfaceOpacityChange={handleSurfaceOpacityChange}
          onSurfaceColorChange={handleSurfaceColorChange}
          onMeshShaderChange={handleMeshShaderChange}
          getLayers={getLayers}
          onAddLayerFiles={handleAddLayerFiles}
          onRemoveLayer={removeLayerFromMesh}
          onLayerOpacityChange={handleLayerOpacityChange}
          onLayerCalMinChange={handleLayerCalMinChange}
          onLayerCalMaxChange={handleLayerCalMaxChange}
          onLayerColormapChange={handleLayerColormapChange}
          onLayerUseNegativeCmapChange={handleLayerUseNegativeCmapChange}
          onCreateDrawingLayer={handleCreateDrawingLayer}
          onDrawModeChange={handleDrawModeChange}
          onDrawingColormapChange={handleDrawingColormapChange}
          onPenFillChange={handlePenFillChange}
          onPenErasesChange={handlePenErasesChange}
          onPenValueChange={handlePenValueChange}
          onDrawingOpacityChange={handleDrawingOpacityChange}
          onMagicWand2dOnlyChange={handleMagicWand2dOnlyChange}
          onMagicWandMaxDistanceChange={handleMagicWandMaxDistanceChange}
          onMagicWandThresholdChange={handleMagicWandThresholdChange}
          onDrawUndo={handleDrawUndo}
          onSaveDrawing={handleSaveDrawing}
          onSaveScene={handleSaveScene}
          onAiNewSession={handleAiNewSession}
          onAiLoadSession={handleAiLoadSession}
          onAiRunSegmentation={handleAiRunSegmentation}
          onAiExitAndSaveSession={handleAiExitAndSaveSession}
          onAiExitAndDeleteSession={handleAiExitAndDeleteSession}
          onAiRefreshSessions={handleAiRefreshSessions}
        />
      }
      dialogs={
        <>
          <RemoveDialog
            onConfirm={handleConfirmRemove}
            onCancel={handleCancelRemove}
          />
          <SaveDialog
            nvRef={nvRef}
            onConfirm={handleConfirmSave}
            onCancel={handleCancelSave}
            onVolumeUrlChange={handleVolumeUrlChange}
            onVolumeCheckboxChange={handleVolumeCheckboxChange}
            onDocumentLocationChange={handleDocumentLocationChange}
            onDocumentCheckboxChange={handleDocumentCheckboxChange}
          />
          <SettingsDialog nvRef={nvRef} />
          <ImagingUploadConfirmationDialog
            onConfirm={() => resolveImagingUploadConfirmation(true)}
            onCancel={() => resolveImagingUploadConfirmation(false)}
          />
          <SessionDeleteConfirmationDialog
            onConfirm={() => resolveSessionDeleteConfirmation(true)}
            onCancel={() => resolveSessionDeleteConfirmation(false)}
          />
        </>
      }
      hiddenInputs={
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />
          <input
            type="file"
            ref={surfaceFileInputRef}
            onChange={handleSurfaceFileChange}
            multiple
            className="hidden"
          />
          <input
            type="file"
            ref={layerFileInputRef}
            onChange={handleLayerFileChange}
            multiple
            className="hidden"
          />
        </>
      }
    />
  );
}
