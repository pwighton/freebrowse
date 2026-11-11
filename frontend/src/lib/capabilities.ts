/**
 * What the UI offers in each mode.
 *
 * `default` is the full viewer. `zarr` is the streaming view: its base volume
 * is fetched brick by brick and has no voxels on the CPU, so everything that
 * reads or writes voxels (drawing, the magic wand, AI annotation, saving) and
 * everything that assumes millimetre scanner space (surfaces) is switched off.
 */
import type { DragMode } from "@/components/drag-mode-selector";
import { useFreeBrowseStore } from "@/store";

export type FreeBrowseMode = "default" | "zarr";

export interface Capabilities {
  /** File picker, drop zone and niivue's canvas drag-and-drop. */
  fileUpload: boolean;
  /** Drawing layers, edit-as-drawing and the magic wand. */
  drawing: boolean;
  /** Save to the backend and download. */
  save: boolean;
  /** AI annotation sessions. */
  ai: boolean;
  /** The surfaces tab. */
  surfaces: boolean;
  /** The backend's document and data listings. */
  backendBrowse: boolean;
}

const ALL: Capabilities = {
  fileUpload: true,
  drawing: true,
  save: true,
  ai: true,
  surfaces: true,
  backendBrowse: true,
};

const NONE: Capabilities = {
  fileUpload: false,
  drawing: false,
  save: false,
  ai: false,
  surfaces: false,
  backendBrowse: false,
};

export function capabilitiesFor(mode: FreeBrowseMode): Capabilities {
  return mode === "zarr" ? NONE : ALL;
}

/** The capabilities of the mode the mounted UI is in. */
export function useCapabilities(): Capabilities {
  return capabilitiesFor(useFreeBrowseStore((s) => s.appMode));
}

/**
 * The right-drag mode to enter a view with. niivue's `contrast` drag sets the
 * window from the voxels in the dragged box, which a streamed volume does not
 * have in memory, so the zarr view offers `windowing` (drag for width and
 * level) in its place; each view swaps out the other's.
 */
export function rightDragModeFor(
  mode: FreeBrowseMode,
  current: DragMode,
): DragMode {
  if (mode === "zarr") return current === "contrast" ? "windowing" : current;
  return current === "windowing" ? "contrast" : current;
}
