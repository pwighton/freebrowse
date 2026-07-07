import { useCallback } from "react";
import { useFreeBrowseStore } from "@/store";
import { type NiiVueGPU as Niivue } from "@niivue/niivue";

export function useDrawing(
  nvRef: React.RefObject<Niivue | null>,
  debouncedGLUpdate: () => void,
) {
  const drawingOptions = useFreeBrowseStore((s) => s.drawingOptions);
  const incrementVolumeVersion = useFreeBrowseStore((s) => s.incrementVolumeVersion);
  const setDrawingOptions = useFreeBrowseStore((s) => s.setDrawingOptions);
  const setActiveTab = useFreeBrowseStore((s) => s.setActiveTab);

  const syncDrawingOptionsFromNiivue = useCallback(() => {
    // MIGRATION-TODO(P4): re-read magic wand threshold/max-distance from niivue's
    // clickToSegment* opts once the niivue-mono drawing API exposes them.
    console.warn(
      "syncDrawingOptionsFromNiivue: disabled during niivue-mono migration (P4)",
    );
  }, [
    nvRef,
    drawingOptions.mode,
    drawingOptions.magicWandThresholdPercent,
    drawingOptions.magicWandMaxDistanceMM,
    setDrawingOptions,
  ]);

  const handleCreateDrawingLayer = useCallback(() => {
    // MIGRATION-TODO(P4): disable drawing then set pen value/fill/opacity via the
    // new niivue-mono drawing API before enabling the drawing layer.
    console.warn(
      "handleCreateDrawingLayer: disabled during niivue-mono migration (P4)",
    );
    setDrawingOptions((prev) => ({ ...prev, enabled: true, mode: "none" }));
    setActiveTab("drawing");
  }, [nvRef, drawingOptions, setDrawingOptions, setActiveTab]);

  const handleDrawingColormapChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newColormap = event.target.value;
      setDrawingOptions((prev) => ({ ...prev, colormap: newColormap }));
      // MIGRATION-TODO(P4): apply the draw colormap and refresh the GL volume via
      // the new niivue-mono drawing API.
    },
    [nvRef, setDrawingOptions],
  );

  const handleDrawModeChange = useCallback(
    (mode: "none" | "pen" | "wand") => {
      console.log("handleDrawModeChange() ", mode);
      setDrawingOptions((prev) => ({
        ...prev,
        mode,
        penErases: mode === "wand" ? false : prev.penErases,
      }));
      // MIGRATION-TODO(P4): wire pen/wand/none modes into the niivue-mono drawing
      // + clickToSegment API (setDrawingEnabled, setPenValue, opts.clickToSegment*).
      console.warn(
        "handleDrawModeChange: disabled during niivue-mono migration (P4)",
      );
    },
    [nvRef, drawingOptions, setDrawingOptions],
  );

  const handlePenFillChange = useCallback(
    (checked: boolean) => {
      setDrawingOptions((prev) => ({ ...prev, penFill: checked }));
      // MIGRATION-TODO(P4): update drawFillOverwrites and pen value (when in pen
      // mode) via the new niivue-mono drawing API.
    },
    [nvRef, drawingOptions, setDrawingOptions],
  );

  const handlePenErasesChange = useCallback(
    (checked: boolean) => {
      setDrawingOptions((prev) => ({ ...prev, penErases: checked }));
      // MIGRATION-TODO(P4): update pen value / drawing-enabled state via the new
      // niivue-mono drawing API depending on the active mode.
    },
    [nvRef, drawingOptions, setDrawingOptions],
  );

  const handlePenValueChange = useCallback(
    (value: number) => {
      setDrawingOptions((prev) => ({ ...prev, penValue: value }));
      console.log("handlePenValueChange: ", value);
      // MIGRATION-TODO(P4): push the pen value to niivue when in pen mode via the
      // new niivue-mono drawing API.
    },
    [nvRef, drawingOptions, setDrawingOptions],
  );

  const handleDrawingOpacityChange = useCallback(
    (opacity: number) => {
      setDrawingOptions((prev) => ({ ...prev, opacity }));
      // MIGRATION-TODO(P4): apply draw opacity via the new niivue-mono drawing API
      // and trigger debouncedGLUpdate() to refresh the view.
    },
    [nvRef, debouncedGLUpdate, setDrawingOptions],
  );

  const handleMagicWand2dOnlyChange = useCallback(
    (checked: boolean) => {
      setDrawingOptions((prev) => ({ ...prev, magicWand2dOnly: checked }));
      // MIGRATION-TODO(P4): sync clickToSegmentIs2D via the new niivue-mono API.
    },
    [nvRef, drawingOptions.mode, setDrawingOptions],
  );

  const handleMagicWandMaxDistanceChange = useCallback(
    (value: number) => {
      setDrawingOptions((prev) => ({ ...prev, magicWandMaxDistanceMM: value }));
      // MIGRATION-TODO(P4): sync clickToSegmentMaxDistanceMM via the new
      // niivue-mono API.
    },
    [nvRef, drawingOptions.mode, setDrawingOptions],
  );

  const handleMagicWandThresholdChange = useCallback(
    (value: number) => {
      setDrawingOptions((prev) => ({
        ...prev,
        magicWandThresholdPercent: value,
      }));
      // MIGRATION-TODO(P4): sync clickToSegmentPercent via the new niivue-mono API.
    },
    [nvRef, drawingOptions.mode, setDrawingOptions],
  );

  const handleDrawUndo = useCallback(() => {
    // MIGRATION-TODO(P4): call niivue-mono's draw undo once the new drawing API
    // is available.
    console.warn("handleDrawUndo: disabled during niivue-mono migration (P4)");
  }, [nvRef]);

  const handleSaveDrawing = useCallback(async () => {
    // MIGRATION-TODO(P4): save the drawing bitmap to a file (saveImage), close the
    // drawing, then reload it as a volume via the new niivue-mono drawing API and
    // NVImage loader.
    console.warn(
      "handleSaveDrawing: disabled during niivue-mono migration (P4)",
    );
    setDrawingOptions((prev) => ({
      ...prev,
      enabled: false,
      mode: "none",
    }));
    setActiveTab("sceneDetails");
    incrementVolumeVersion();
  }, [nvRef, drawingOptions, setDrawingOptions, setActiveTab, incrementVolumeVersion]);

  return {
    syncDrawingOptionsFromNiivue,
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
  };
}
