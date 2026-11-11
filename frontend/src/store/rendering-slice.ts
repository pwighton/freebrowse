import type { StateCreator } from "zustand";
import type { RenderBackend } from "@/lib/rendering";
import { DEFAULT_ZARR_SETTINGS, type ZarrSettings } from "@/lib/zarr-settings";

export interface RenderingSlice {
  /** Preference: draw with WebGPU where the browser has it. Persisted. */
  useWebGpu: boolean;
  /** The backend the view is actually running on; null before it starts. */
  activeBackend: RenderBackend | null;
  /** The zarr view's streaming settings. Persisted. */
  zarrSettings: ZarrSettings;
  /**
   * Finest pyramid level the zarr view may stream (0 = full resolution). Kept
   * for the session only: it is a property of the store being looked at.
   */
  zarrFinestLevel: number;
  diskCacheConfirmDialogOpen: boolean;
  skipDiskCacheConfirmation: boolean;
  setUseWebGpu: (use: boolean) => void;
  setActiveBackend: (backend: RenderBackend | null) => void;
  setZarrSettings: (patch: Partial<ZarrSettings>) => void;
  setZarrFinestLevel: (level: number) => void;
  resetZarrSettings: () => void;
  setDiskCacheConfirmDialogOpen: (open: boolean) => void;
  setSkipDiskCacheConfirmation: (skip: boolean) => void;
}

export const createRenderingSlice: StateCreator<RenderingSlice> = (set) => ({
  useWebGpu: true,
  activeBackend: null,
  zarrSettings: DEFAULT_ZARR_SETTINGS,
  zarrFinestLevel: 0,
  diskCacheConfirmDialogOpen: false,
  skipDiskCacheConfirmation: false,
  setUseWebGpu: (useWebGpu) => set({ useWebGpu }),
  setActiveBackend: (activeBackend) => set({ activeBackend }),
  setZarrSettings: (patch) =>
    set((state) => ({ zarrSettings: { ...state.zarrSettings, ...patch } })),
  setZarrFinestLevel: (zarrFinestLevel) => set({ zarrFinestLevel }),
  resetZarrSettings: () =>
    set({ zarrSettings: DEFAULT_ZARR_SETTINGS, zarrFinestLevel: 0 }),
  setDiskCacheConfirmDialogOpen: (diskCacheConfirmDialogOpen) =>
    set({ diskCacheConfirmDialogOpen }),
  setSkipDiskCacheConfirmation: (skipDiskCacheConfirmation) =>
    set({ skipDiskCacheConfirmation }),
});
