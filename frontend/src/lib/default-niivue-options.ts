import { NiiVue, type NiiVueOptions } from "@niivue/niivue";

/**
 * The options FreeBrowse constructs its NiiVue instance with. Shared by the
 * app entry (`main.tsx`) and the library (`createFreeBrowseInstance`) so both
 * produce identical instances. No `backend` option: niivue picks WebGPU when
 * `navigator.gpu` exists and falls back to WebGL2 otherwise.
 */
export const DEFAULT_NIIVUE_OPTIONS: Partial<NiiVueOptions> = {
  placeholderText: "Drag-drop images",
  isDragDropEnabled: true,
  backgroundColor: [0, 0, 0, 1],
  crosshairColor: [1.0, 0.0, 0.0, 0.5],
};

/** Overrides the QA route applies on top of the defaults. */
export const QA_VIEWER_NIIVUE_OPTIONS: Partial<NiiVueOptions> = {
  placeholderText: "",
  isDragDropEnabled: false,
  crosshairColor: [1.0, 0.88, 0.88, 1.0],
  crosshairWidth: 0.3,
  crosshairGap: 10,
};

/**
 * Build a NiiVue instance the way FreeBrowse does. A host that wants FreeBrowse
 * to own the instance calls this (or lets `mountFreeBrowse` call it); a host
 * that already has an instance passes its own instead.
 */
export function createFreeBrowseInstance(
  overrides: Partial<NiiVueOptions> = {},
): NiiVue {
  return new NiiVue({ ...DEFAULT_NIIVUE_OPTIONS, ...overrides });
}
