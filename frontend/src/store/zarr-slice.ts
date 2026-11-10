import type { StateCreator } from "zustand";

/** Where an in-memory volume that was read from a zarr store came from. */
export interface ZarrVolumeOrigin {
  /** Absolute store URL. */
  url: string;
  /** The pyramid level that was read (0 = finest). */
  level: number;
  /** How many levels the store has. */
  levelCount: number;
  /** Voxel spacing of that level in display order, micrometres. */
  spacingUm: [number, number, number];
}

/** Progress of a load started from a URL (a zarr store or a remote file). */
export type UrlLoadStatus =
  | { state: "idle" }
  | { state: "loading"; url: string }
  | { state: "error"; url: string; message: string };

export interface ZarrSlice {
  /**
   * Zarr origin by niivue volume id. Entries for volumes that have since been
   * removed are harmless and are not pruned.
   */
  zarrVolumes: Record<string, ZarrVolumeOrigin>;
  urlLoadStatus: UrlLoadStatus;
  addZarrVolumes: (ids: string[], origin: ZarrVolumeOrigin) => void;
  setUrlLoadStatus: (status: UrlLoadStatus) => void;
}

export const createZarrSlice: StateCreator<ZarrSlice> = (set) => ({
  zarrVolumes: {},
  urlLoadStatus: { state: "idle" },
  addZarrVolumes: (ids, origin) =>
    set((state) => ({
      zarrVolumes: {
        ...state.zarrVolumes,
        ...Object.fromEntries(ids.map((id) => [id, origin])),
      },
    })),
  setUrlLoadStatus: (urlLoadStatus) => set({ urlLoadStatus }),
});
