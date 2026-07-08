import { useCallback } from "react";
import { useFreeBrowseStore } from "@/store";
import type { NiiVueGPU as Niivue } from "@niivue/niivue";

/**
 * Built-in colormaps that are categorical/label maps (as opposed to continuous
 * gradients). When one of these is selected, FreeBrowse applies it as a label
 * colormap (setColormapLabel) so the volume renders as discrete regions.
 * niivue-mono does not tag colormaps as label-vs-continuous, so this list is
 * curated here; matched case-insensitively against nv.colormaps.
 */
const LABEL_COLORMAPS = new Set(["freesurfer", "roi_i256", "random", "nih"]);

export function useVolumes(
  nvRef: React.RefObject<Niivue | null>,
  debouncedGLUpdate: () => void,
  removeSurface: (surfaceIndex: number) => void,
) {
  // Contrast/colormap/opacity now go through nv.setVolume (which refreshes the
  // GPU itself and emits volumeUpdated), so the debounced GL update is no
  // longer needed here; kept in the signature for call-site stability.
  void debouncedGLUpdate;
  const currentImageIndex = useFreeBrowseStore((s) => s.currentImageIndex);
  const setCurrentImageIndex = useFreeBrowseStore((s) => s.setCurrentImageIndex);
  const volumeVersion = useFreeBrowseStore((s) => s.volumeVersion);
  const incrementVolumeVersion = useFreeBrowseStore((s) => s.incrementVolumeVersion);
  const volumeToRemove = useFreeBrowseStore((s) => s.volumeToRemove);
  const setVolumeToRemove = useFreeBrowseStore((s) => s.setVolumeToRemove);
  const skipRemoveConfirmation = useFreeBrowseStore((s) => s.skipRemoveConfirmation);
  const setRemoveDialogOpen = useFreeBrowseStore((s) => s.setRemoveDialogOpen);
  const surfaceToRemove = useFreeBrowseStore((s) => s.surfaceToRemove);
  const setSurfaceToRemove = useFreeBrowseStore((s) => s.setSurfaceToRemove);
  const drawingOptions = useFreeBrowseStore((s) => s.drawingOptions);
  const setDrawingOptions = useFreeBrowseStore((s) => s.setDrawingOptions);
  const setActiveTab = useFreeBrowseStore((s) => s.setActiveTab);

  const getVolumes = useCallback(() => {
    // Consume volumeVersion to trigger re-renders on mutation
    void volumeVersion;
    const nv = nvRef.current;
    if (!nv) return [];
    return nv.volumes || [];
  }, [nvRef, volumeVersion]);

  const toggleImageVisibility = useCallback(
    (id: string) => {
      const nv = nvRef.current;
      if (!nv) return;
      const volumeIndex = nv.volumes.findIndex((v) => v.id === id);
      if (volumeIndex < 0) return;

      const volume = nv.volumes[volumeIndex];
      const opacity = volume.opacity ?? 1.0;
      const isCurrentlyVisible = opacity > 0;
      const newOpacity = isCurrentlyVisible ? 0 : (opacity === 0 ? 1.0 : opacity);

      void nv.setVolume(volumeIndex, { opacity: newOpacity });
      incrementVolumeVersion();
    },
    [nvRef, incrementVolumeVersion],
  );

  const handleOpacityChange = useCallback(
    (newOpacity: number) => {
      const nv = nvRef.current;
      if (currentImageIndex === null || !nv || !nv.volumes[currentImageIndex]) return;
      void nv.setVolume(currentImageIndex, { opacity: newOpacity });
      incrementVolumeVersion();
    },
    [currentImageIndex, nvRef, debouncedGLUpdate, incrementVolumeVersion],
  );

  const handleFrameChange = useCallback(
    (newFrame: number) => {
      const nv = nvRef.current;
      if (currentImageIndex === null || !nv || !nv.volumes[currentImageIndex]) return;
      const id = nv.volumes[currentImageIndex].id;
      if (!id) return;
      void nv.setFrame4D(id, newFrame);
      incrementVolumeVersion();
    },
    [currentImageIndex, nvRef, incrementVolumeVersion],
  );

  const handleContrastMinChange = useCallback(
    (newContrastMin: number) => {
      const nv = nvRef.current;
      if (currentImageIndex === null || !nv || !nv.volumes[currentImageIndex]) return;
      // setVolume emits volumeUpdated -> the store follows via the event adapter.
      void nv.setVolume(currentImageIndex, { calMin: newContrastMin });
    },
    [currentImageIndex, nvRef],
  );

  const handleContrastMaxChange = useCallback(
    (newContrastMax: number) => {
      const nv = nvRef.current;
      if (currentImageIndex === null || !nv || !nv.volumes[currentImageIndex]) return;
      void nv.setVolume(currentImageIndex, { calMax: newContrastMax });
    },
    [currentImageIndex, nvRef],
  );

  const handleColormapChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newColormap = event.target.value;
      const nv = nvRef.current;
      if (currentImageIndex === null || !nv || !nv.volumes[currentImageIndex]) return;
      // Always set the continuous colormap (so the dropdown value derives from
      // volume.colormap and round-trips through the document). If the chosen
      // colormap is categorical, ALSO attach it as a label colormap so the
      // volume renders as discrete regions; otherwise clear any label colormap.
      // colormapLabel overrides colormap in the renderer, so setting both is safe.
      void nv.setVolume(currentImageIndex, { colormap: newColormap });
      if (LABEL_COLORMAPS.has(newColormap.toLowerCase())) {
        void nv.setColormapLabel(currentImageIndex, newColormap);
      } else {
        void nv.setColormapLabel(currentImageIndex, null);
      }
    },
    [currentImageIndex, nvRef],
  );

  const handleMoveVolumeUp = useCallback(() => {
    const nv = nvRef.current;
    if (currentImageIndex === null || !nv || !nv.volumes[currentImageIndex]) return;
    if (currentImageIndex === 0) return; // already first in the list
    // UI "up" means earlier in the list (lower index); niivue's moveVolumeDown
    // decreases the array index.
    void nv.moveVolumeDown(currentImageIndex);
    setCurrentImageIndex(currentImageIndex - 1); // keep selection on moved volume
    incrementVolumeVersion();
  }, [currentImageIndex, nvRef, setCurrentImageIndex, incrementVolumeVersion]);

  const handleMoveVolumeDown = useCallback(() => {
    const nv = nvRef.current;
    if (currentImageIndex === null || !nv || !nv.volumes[currentImageIndex]) return;
    if (currentImageIndex >= nv.volumes.length - 1) return; // already last in the list
    // UI "down" means later in the list (higher index); niivue's moveVolumeUp
    // increases the array index.
    void nv.moveVolumeUp(currentImageIndex);
    setCurrentImageIndex(currentImageIndex + 1); // keep selection on moved volume
    incrementVolumeVersion();
  }, [currentImageIndex, nvRef, setCurrentImageIndex, incrementVolumeVersion]);

  const removeVolume = useCallback(
    (imageIndex: number) => {
      const nv = nvRef.current;
      if (!nv || !nv.volumes[imageIndex]) return;
      void nv.removeVolume(imageIndex);
      incrementVolumeVersion();

      if (currentImageIndex === imageIndex) {
        if (imageIndex > 0) {
          setCurrentImageIndex(imageIndex - 1);
        } else if (nv.volumes.length > 0) {
          setCurrentImageIndex(0);
        } else {
          setCurrentImageIndex(null);
        }
      } else if (
        currentImageIndex !== null &&
        currentImageIndex > imageIndex
      ) {
        setCurrentImageIndex(currentImageIndex - 1);
      }
    },
    [currentImageIndex, nvRef, incrementVolumeVersion, setCurrentImageIndex],
  );

  const handleRemoveVolumeClick = useCallback(
    (imageIndex: number) => {
      if (skipRemoveConfirmation) {
        removeVolume(imageIndex);
      } else {
        setVolumeToRemove(imageIndex);
        setRemoveDialogOpen(true);
      }
    },
    [skipRemoveConfirmation, removeVolume, setVolumeToRemove, setRemoveDialogOpen],
  );

  const handleEditVolume = useCallback(
    async (imageIndex: number) => {
      // MIGRATION-TODO(P4): "edit volume as drawing" depends on the drawing
      // subsystem (saveVolume -> File -> loadDrawing, uint8 handling) migrated
      // in the drawing phase. Stubbed and hidden in the UI until then.
      void imageIndex;
      void drawingOptions;
      void setDrawingOptions;
      void setActiveTab;
      console.warn("handleEditVolume: disabled during niivue-mono migration (P4)");
    },
    [drawingOptions, setDrawingOptions, setActiveTab],
  );

  const canEditVolume = useCallback(
    (imageIndex: number): boolean => {
      const nv = nvRef.current;
      if (!nv || !nv.volumes[imageIndex]) return false;

      const volume = nv.volumes[imageIndex];
      const background = nv.volumes[0];

      if (!background) return false;
      if (volume === background) return false;
      if (!volume.hdr || !background.hdr) return false;

      const volDims = volume.hdr.dims;
      const backDims = background.hdr.dims;

      if (
        volDims[1] !== backDims[1] ||
        volDims[2] !== backDims[2] ||
        volDims[3] !== backDims[3]
      ) {
        return false;
      }

      if (!volume.hdr.affine || !background.hdr.affine) return false;

      const volAffine = volume.hdr.affine;
      const backAffine = background.hdr.affine;

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const idx = i * 4 + j;
          const volValue = Number(volAffine[idx]);
          const backValue = Number(backAffine[idx]);
          if (Math.abs(volValue - backValue) > 0.0001) {
            return false;
          }
        }
      }

      return true;
    },
    [nvRef],
  );

  const handleConfirmRemove = useCallback(() => {
    if (volumeToRemove !== null) {
      removeVolume(volumeToRemove);
    }
    if (surfaceToRemove !== null) {
      removeSurface(surfaceToRemove);
    }
    setRemoveDialogOpen(false);
    setVolumeToRemove(null);
    setSurfaceToRemove(null);
  }, [volumeToRemove, removeVolume, surfaceToRemove, removeSurface, setRemoveDialogOpen, setVolumeToRemove, setSurfaceToRemove]);

  const handleCancelRemove = useCallback(() => {
    setRemoveDialogOpen(false);
    setVolumeToRemove(null);
    setSurfaceToRemove(null);
  }, [setRemoveDialogOpen, setVolumeToRemove, setSurfaceToRemove]);

  return {
    getVolumes,
    toggleImageVisibility,
    handleOpacityChange,
    handleFrameChange,
    handleContrastMinChange,
    handleContrastMaxChange,
    handleColormapChange,
    handleMoveVolumeUp,
    handleMoveVolumeDown,
    removeVolume,
    handleRemoveVolumeClick,
    handleEditVolume,
    canEditVolume,
    handleConfirmRemove,
    handleCancelRemove,
  };
}
