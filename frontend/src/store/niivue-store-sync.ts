import { DRAG_MODE } from "@niivue/niivue";

import { sliceTypeMap } from "@/lib/niivue-helpers";
import { useFreeBrowseStore } from "@/store";
import type { DragMode } from "@/components/drag-mode-selector";
import type { ViewMode } from "@/store/types";
import type { NiivueEventSource, NiivueSyncTarget } from "./niivue-sync";

/**
 * Concrete NiivueSyncTarget backed by the FreeBrowse Zustand store.
 *
 * This is the adapter that makes the store a *derived view* of niivue state:
 * `registerNiivueEvents(nv, createStoreSyncTarget(nv))` routes every relevant
 * niivue event into the store, translating niivue-mono property names/values
 * into FreeBrowse's store shape. Because both FreeBrowse's own command wrappers
 * and external callers (e.g. `window.freebrowse.nv`) drive niivue through the
 * same events, the UI follows either path identically.
 *
 * The volume/surface UI reads live `nv.volumes`/`nv.meshes` and re-renders on a
 * version-counter bump, so those events bump the counter rather than mirroring
 * a list into the store. Viewer options and location are mirrored into store
 * slices.
 */

/** niivue reader surface this adapter needs beyond the event target. */
type NiivueReader = NiivueEventSource & {
  sliceType: number;
  showRender: number;
};

function dragModeName(value: unknown): DragMode {
  const match = Object.entries(DRAG_MODE).find(([, v]) => v === value);
  return (match?.[0] as DragMode) ?? "contrast";
}

function viewModeFromNiivue(nv: NiivueReader): ViewMode {
  // ACS vs ACSR differ only by showRender, so match on both.
  const exact = Object.entries(sliceTypeMap).find(
    ([, cfg]) => cfg.sliceType === nv.sliceType && cfg.showRender === nv.showRender,
  );
  if (exact) return exact[0] as ViewMode;
  const bySlice = Object.entries(sliceTypeMap).find(
    ([, cfg]) => cfg.sliceType === nv.sliceType,
  );
  return (bySlice?.[0] as ViewMode) ?? "ACS";
}

export function createStoreSyncTarget(nv: NiivueReader): NiivueSyncTarget {
  const store = () => useFreeBrowseStore.getState();
  const patchViewer = (partial: Record<string, unknown>) =>
    store().setViewerOptions((prev) => ({ ...prev, ...partial }));

  return {
    onViewerOptionChange(property, value) {
      // Map niivue-mono flat property names -> FreeBrowse viewerOptions.
      // Properties niivue emits that FreeBrowse has no UI for fall through.
      switch (property) {
        // NOTE: crosshairWidth/crosshairVisible are store-owned UI state, not
        // derived here. niivue only has one crosshairWidth (0 == hidden), so
        // deriving it back would lose the remembered width while hidden. The
        // use-viewer-options handlers own that pair (store + nv). We only mirror
        // it OUT (store -> nv), never back in.
        case "crosshairGap":
          patchViewer({ crosshairGap: value });
          break;
        case "crosshairColor":
          patchViewer({ crosshairColor: value });
          break;
        case "rulerWidth":
          patchViewer({ rulerWidth: value });
          break;
        case "isRulerVisible":
          patchViewer({ rulerVisible: value });
          break;
        case "volumeIsNearestInterpolation":
          patchViewer({ interpolateVoxels: !value });
          break;
        case "volumeOutlineWidth":
          patchViewer({ overlayOutlineWidth: value });
          break;
        case "isColorbarVisible":
          patchViewer({ isColorbar: value });
          break;
        case "isRadiological":
          patchViewer({ isRadiologicalConvention: value });
          break;
        case "secondaryDragMode":
          patchViewer({ dragMode: dragModeName(value) });
          break;
        case "sliceType":
        case "showRender":
          patchViewer({ viewMode: viewModeFromNiivue(nv) });
          break;
        default:
          break;
      }
    },

    onDrawingOptionChange(property, value) {
      // MIGRATION-TODO(P4): full drawing-state mapping lands with the drawing
      // phase; these are the direct scalar mirrors that already line up.
      const s = store();
      switch (property) {
        case "drawPenValue":
          s.setDrawingOptions((prev) => ({ ...prev, penValue: value as number }));
          break;
        case "drawOpacity":
          s.setDrawingOptions((prev) => ({ ...prev, opacity: value as number }));
          break;
        case "drawIsFillOverwriting":
          s.setDrawingOptions((prev) => ({ ...prev, penFill: value as boolean }));
          break;
        case "drawIsEnabled":
          s.setDrawingOptions((prev) => ({ ...prev, enabled: value as boolean }));
          break;
        default:
          break;
      }
    },

    onVolumesChanged() {
      // The sidebar/scene UI reads live nv.volumes; bump the version to re-render.
      store().incrementVolumeVersion();
    },

    onVolumeUpdated() {
      store().incrementVolumeVersion();
    },

    onSurfacesChanged() {
      // MIGRATION-TODO(P3): rebuild the derived `surfaces` list from nv.meshes
      // (updateSurfaceDetails) once surfaces are migrated; bump for now.
      store().incrementLayerVersion();
    },

    onDrawingChanged() {
      // MIGRATION-TODO(P4): mirror drawing state (drawingVolume presence, undo
      // depth) into the drawing slice during the drawing phase.
    },

    onLocationChange(location) {
      const detail = location as {
        mm?: [number, number, number];
        values?: {
          name?: string;
          value?: number;
          vox?: [number, number, number];
        }[];
      } | null;
      if (!detail) return;
      const voxels = (detail.values ?? []).map((v, index) => {
        const vox = v.vox ?? [0, 0, 0];
        return {
          name: v.name || `Volume ${index + 1}`,
          voxel: [
            Math.round(vox[0]),
            Math.round(vox[1]),
            Math.round(vox[2]),
          ] as [number, number, number],
          value: v.value ?? 0,
        };
      });
      store().setLocationData({ mm: detail.mm ?? [0, 0, 0], voxels });
    },

    onDocumentLoaded() {
      // MIGRATION-TODO(P5): documents phase — bump both so volume + surface UI
      // re-read after a document loads.
      store().incrementVolumeVersion();
      store().incrementLayerVersion();
    },

    onColormapAdded() {
      // No store field: the UI reads nv.colormaps on demand. No-op.
    },
  };
}
