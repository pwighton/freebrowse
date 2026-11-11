import { useEffect, useRef, useState } from "react";
import { registerNiiVueEvents } from "@/store/niivue-sync";
import { createStoreSyncTarget } from "@/store/niivue-store-sync";
import { useViewerOptions } from "@/hooks/use-viewer-options";
import { useVolumes } from "@/hooks/use-volumes";
import { useSurfaces } from "@/hooks/use-surfaces";
import { useMeshLayers } from "@/hooks/use-mesh-layers";
import { useDrawing } from "@/hooks/use-drawing";
import { useMagicWand } from "@/hooks/use-magic-wand";
import { useSave } from "@/hooks/use-save";
import { useFileLoading } from "@/hooks/use-file-loading";
import { useZarrStream } from "@/hooks/use-zarr-stream";
import { useRendering } from "@/hooks/use-rendering";
import { useAiCapabilities } from "@/hooks/use-ai-capabilities";
import { useAiSession } from "@/hooks/use-ai-session";
import {
  requestDiskCacheConfirmation,
  resolveDiskCacheConfirmation,
  resolveImagingUploadConfirmation,
  resolveSessionDeleteConfirmation,
} from "@/lib/confirmations";
import { DEFAULT_GPU_MEMORY, preferredBackend } from "@/lib/rendering";
import type { NiiVue } from "@niivue/niivue";
import { rightDragModeFor, type FreeBrowseMode } from "@/lib/capabilities";
import { getFreeBrowseConfig } from "@/lib/deployment-config";
import { useFreeBrowseStore } from "@/store";
import ViewerShell from "./viewer-shell";
import Sidebar from "./sidebar";
import ZarrOpener from "./zarr-opener";
import RemoveDialog from "./dialogs/remove-dialog";
import SaveDialog from "./dialogs/save-dialog";
import SettingsDialog from "./dialogs/settings-dialog";
import ImagingUploadConfirmationDialog from "./dialogs/imaging-upload-confirmation-dialog";
import SessionDeleteConfirmationDialog from "./dialogs/session-delete-confirmation-dialog";
import DiskCacheConfirmationDialog from "./dialogs/disk-cache-confirmation-dialog";

export interface FreeBrowseProps {
  /**
   * The NiiVue instance this UI reflects and drives. The app creates it with
   * `createFreeBrowseInstance()` (`lib/default-niivue-options.ts`); an
   * embedding host may pass its own.
   */
  nv: NiiVue;
  /**
   * Publish the instance as `window.freebrowse.nv` for external callers
   * (console, embedding pages). Defaults to the configured `exposeGlobal`
   * (app: true; library: false).
   */
  exposeGlobal?: boolean;
  /**
   * The instance belongs to the host: FreeBrowse must not push its stored
   * viewer defaults (view mode, crosshair, ruler, …) onto it. The store is
   * seeded FROM the instance instead. Default false (the app owns its instance).
   */
  hostInstance?: boolean;
  /**
   * Allow loading by drag-and-drop (niivue's canvas drop and FreeBrowse's
   * drop zone). `false` also skips the drop zone: the canvas is shown from
   * the start, since the host is expected to load data itself. Default true.
   */
  dragDrop?: boolean;
  /** Show the sidebar initially (the header button still toggles it). Default true. */
  sidebar?: boolean;
  /** Show the footer (coordinate readout) initially. Default true. */
  footer?: boolean;
  /**
   * `"zarr"` mounts the streaming view: one OME-Zarr store streamed as the
   * base volume, with the features that need voxels in memory switched off
   * (see `lib/capabilities.ts`). Default `"default"`, the full viewer.
   */
  mode?: FreeBrowseMode;
}

// The mode the instance's scene was last used in. Both modes share one NiiVue
// instance and one store, and what one mode leaves loaded is not valid in the
// other (a streamed base under the drawing tools, say).
let sceneMode: FreeBrowseMode | null = null;

/** Empty the scene and the store's view of it, for a change of mode. */
async function resetScene(nv: NiiVue): Promise<void> {
  try {
    nv.drawIsEnabled = false;
    if (nv.drawingVolume) nv.closeDrawing();
    // Removing a streamed volume also stops its workers (lib/zarr.ts).
    await nv.removeAllVolumes();
    await nv.removeAllMeshes();
  } catch (error) {
    console.error("Error clearing the scene:", error);
  }
  // No UI is mounted to hear niivue's events, so the store is reset by hand.
  useFreeBrowseStore.setState((state) => ({
    currentImageIndex: null,
    currentSurfaceIndex: null,
    showUploader: true,
    locationData: null,
    zarrVolumes: {},
    zarrStreams: [],
    zarrProgress: null,
    urlLoadStatus: { state: "idle" },
    activeTab: "sceneDetails",
    drawingOptions: { ...state.drawingOptions, enabled: false, mode: "none" },
    volumeVersion: state.volumeVersion + 1,
  }));
}

/**
 * The FreeBrowse UI. Renders the viewer once the scene belongs to `mode`:
 * switching mode (the app's `/` and `/zarr` routes do) first empties the
 * scene, then mounts the other mode's UI afresh.
 */
export default function FreeBrowse(props: FreeBrowseProps) {
  const { nv } = props;
  const mode = props.mode ?? "default";
  const appMode = useFreeBrowseStore((s) => s.appMode);
  const [ready, setReady] = useState(
    () => sceneMode === null || sceneMode === mode,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (sceneMode !== null && sceneMode !== mode) await resetScene(nv);
      sceneMode = mode;
      useFreeBrowseStore.getState().setAppMode(mode);
      useFreeBrowseStore.getState().setViewerOptions((options) => ({
        ...options,
        dragMode: rightDragModeFor(mode, options.dragMode),
      }));
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, nv]);

  if (!ready || appMode !== mode) return null;
  return <FreeBrowseView {...props} mode={mode} />;
}

function FreeBrowseView({
  nv,
  exposeGlobal,
  hostInstance = false,
  dragDrop,
  sidebar,
  footer,
  mode = "default",
}: FreeBrowseProps) {
  const expose = exposeGlobal ?? getFreeBrowseConfig().exposeGlobal;

  // Initial layout / loading preferences from the host. Applied on mount and
  // whenever the props change; the user's own toggles are left alone otherwise.
  useEffect(() => {
    const patch: Partial<{
      dragDropEnabled: boolean;
      showUploader: boolean;
      sidebarOpen: boolean;
      footerOpen: boolean;
    }> = {};
    if (dragDrop !== undefined) {
      patch.dragDropEnabled = dragDrop;
      if (!dragDrop) patch.showUploader = false;
    }
    if (sidebar !== undefined) patch.sidebarOpen = sidebar;
    if (footer !== undefined) patch.footerOpen = footer;
    if (Object.keys(patch).length) useFreeBrowseStore.setState(patch);
  }, [dragDrop, sidebar, footer]);
  const nvRef = useRef<NiiVue | null>(nv);
  nvRef.current = nv;

  // Event-driven sync: the Zustand store is a derived view of niivue state.
  // registerNiiVueEvents subscribes the store adapter to niivue's events, so
  // both FreeBrowse's own command wrappers and external callers driving the
  // instance (window.freebrowse.nv) update the UI through the same path.
  useEffect(() => {
    const teardown = registerNiiVueEvents(nv, createStoreSyncTarget(nv));
    if (expose) window.freebrowse = { nv }; // typed in src/window.d.ts
    return () => {
      teardown();
      if (window.freebrowse?.nv === nv) delete window.freebrowse;
    };
  }, [nv, expose]);

  // --- Hooks ---
  const {
    viewerOptions,
    applyViewerOptions,
    syncViewerOptionsFromNiiVue,
    debouncedGLUpdate,
  } = useViewerOptions(nvRef, hostInstance ? "sync" : "apply");
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
    handleDocumentFormatChange,
  } = useSave(nvRef);
  const {
    serverlessMode,
    fileInputRef,
    surfaceFileInputRef,
    handleFileUpload,
    handleImagingFileSelect,
    handleUrlLoad,
    handleNvdFileSelect,
    handleFileChange,
    handleAddMoreFiles,
    handleAddSurfaceFiles,
    handleSurfaceFileChange,
  } = useFileLoading(
    nvRef,
    applyViewerOptions,
    syncViewerOptionsFromNiiVue,
    updateSurfaceDetails,
  );

  const { openZarrStore, addZarrStore, selectZarrFrame } =
    useZarrStream(nvRef);

  const { setUseWebGpu, setGpuMemory } = useRendering(nvRef, hostInstance);

  // The disk cache writes streamed data to the browser's storage: ask first.
  const handleZarrDiskCacheChange = async (enabled: boolean) => {
    if (enabled && !(await requestDiskCacheConfirmation())) return;
    useFreeBrowseStore.getState().setZarrSettings({ diskCache: enabled });
  };
  const handleZarrSettingsReset = () => {
    const state = useFreeBrowseStore.getState();
    state.resetZarrSettings();
    void setGpuMemory(
      DEFAULT_GPU_MEMORY[
        state.activeBackend ?? preferredBackend(state.useWebGpu)
      ],
    );
  };

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
      nvCanvasEmptyState={
        mode === "zarr" ? <ZarrOpener onOpen={(url) => void openZarrStore(url)} /> : undefined
      }
      sidebar={
        <Sidebar
          nvRef={nvRef}
          serverlessMode={serverlessMode}
          onNvdFileSelect={handleNvdFileSelect}
          onImagingFileSelect={handleImagingFileSelect}
          onAddMoreFiles={handleAddMoreFiles}
          onLoadUrl={
            mode === "zarr" ? (url) => void openZarrStore(url) : handleUrlLoad
          }
          onAddZarrStore={(url) => void addZarrStore(url)}
          onSelectZarrFrame={(id, selection) =>
            void selectZarrFrame(id, selection)
          }
          onZarrGpuMemoryChange={(bytes) => void setGpuMemory(bytes)}
          onZarrDiskCacheChange={(enabled) =>
            void handleZarrDiskCacheChange(enabled)
          }
          onZarrSettingsReset={handleZarrSettingsReset}
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
            onDocumentFormatChange={handleDocumentFormatChange}
          />
          <SettingsDialog
            nvRef={nvRef}
            onUseWebGpuChange={(use) => void setUseWebGpu(use)}
            hostInstance={hostInstance}
          />
          <ImagingUploadConfirmationDialog
            onConfirm={() => resolveImagingUploadConfirmation(true)}
            onCancel={() => resolveImagingUploadConfirmation(false)}
          />
          <SessionDeleteConfirmationDialog
            onConfirm={() => resolveSessionDeleteConfirmation(true)}
            onCancel={() => resolveSessionDeleteConfirmation(false)}
          />
          <DiskCacheConfirmationDialog
            onConfirm={() => resolveDiskCacheConfirmation(true)}
            onCancel={() => resolveDiskCacheConfirmation(false)}
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
