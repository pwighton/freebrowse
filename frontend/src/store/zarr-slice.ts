import type { StateCreator } from "zustand";
import type { FreeBrowseMode } from "@/lib/capabilities";
import type { ZarrDescription } from "@/lib/zarr";

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

/** One store streamed in the zarr view. */
export interface ZarrStream {
  /** The URL the store was asked for by. */
  url: string;
  description: ZarrDescription;
  /** Id of the streamed volume in `nv.volumes`. */
  volumeId: string;
  channel: number;
  timepoint: number;
}

/** Bricks still to arrive for the part of the stream being viewed. */
export interface ZarrProgress {
  remaining: number;
  total: number;
}

export interface ZarrSlice {
  /** Which UI is mounted (see `lib/capabilities.ts`). */
  appMode: FreeBrowseMode;
  /** The zarr view's streams: the base store first, then any overlay. */
  zarrStreams: ZarrStream[];
  /** Set while bricks are arriving; null once the view has settled. */
  zarrProgress: ZarrProgress | null;
  /**
   * Zarr origin by niivue volume id. Entries for volumes that have since been
   * removed are harmless and are not pruned.
   */
  zarrVolumes: Record<string, ZarrVolumeOrigin>;
  urlLoadStatus: UrlLoadStatus;
  addZarrVolumes: (ids: string[], origin: ZarrVolumeOrigin) => void;
  setUrlLoadStatus: (status: UrlLoadStatus) => void;
  setAppMode: (mode: FreeBrowseMode) => void;
  setZarrStreams: (streams: ZarrStream[]) => void;
  setZarrProgress: (progress: ZarrProgress | null) => void;
}

export const createZarrSlice: StateCreator<ZarrSlice> = (set) => ({
  appMode: "default",
  zarrStreams: [],
  zarrProgress: null,
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
  setAppMode: (appMode) => set({ appMode }),
  setZarrStreams: (zarrStreams) => set({ zarrStreams }),
  setZarrProgress: (zarrProgress) => set({ zarrProgress }),
});
