import { useCallback, useEffect, useRef } from "react";
import { useFreeBrowseStore } from "@/store";
import type { ZarrStream } from "@/store/zarr-slice";
import { SLICE_TYPE } from "@niivue/niivue";
import type {
  ChunkStreamDetail,
  NiiVue,
  NVChunkedVolume,
  PropertyChangeDetail,
  SlicePointerEvent,
} from "@niivue/niivue";
import { getFreeBrowseConfig } from "@/lib/deployment-config";
import { describeLoadError } from "@/lib/load-errors";
import { describeZarr, streamZarr } from "@/lib/zarr";

/** A store to stream, as asked for in the address or the sidebar. */
export interface ZarrStoreRequest {
  url: string;
  colormap?: string;
  channel?: number;
  timepoint?: number;
}

/**
 * niivue draws a streamed store on top of the base only while there is exactly
 * one of them (`_combinedOverlayEntries.length === 1` in its renderers): with
 * two, neither is drawn.
 */
export const MAX_ZARR_OVERLAYS = 1;

const NO_BASE_MESSAGE = "Open a store first; this one would go on top of it.";
const TOO_MANY_MESSAGE =
  "Only one store can be streamed on top of the base. Remove the current one first.";
const GRID_MISMATCH_MESSAGE =
  "This store is on a different voxel grid from the base store, so it cannot be streamed on top of it.";

/** How long the view must rest after a pan before detail is fetched for it. */
const PAN_FOCUS_DEBOUNCE_MS = 250;

/**
 * The stores named in the page address, for the zarr view: `zarr=`, the
 * parameter the default view uses for the same thing, in the hash route's own
 * query (`#/zarr?zarr=...`) or in the page's (`?zarr=...#/zarr`). It may be
 * repeated: the first store is the base. `cmap=` sets the colormap of the
 * store written just before it (one written ahead of any store goes to the
 * first).
 *
 * `url=` is accepted as an alias, but is not the documented name: Vite's dev
 * server claims a page query starting `?url` for itself and answers 403.
 */
export function zarrParamsFromLocation(location: {
  hash: string;
  search: string;
}): ZarrStoreRequest[] {
  const queryOfHash = location.hash.includes("?")
    ? location.hash.slice(location.hash.indexOf("?"))
    : "";
  for (const query of [queryOfHash, location.search]) {
    const requests: ZarrStoreRequest[] = [];
    let leadingColormap: string | undefined;
    for (const [key, value] of new URLSearchParams(query)) {
      if (!value) continue;
      if (key === "zarr" || key === "url") {
        requests.push({ url: value });
      } else if (key === "cmap") {
        const target = requests.at(-1);
        if (target) target.colormap = value;
        else leadingColormap = value;
      }
    }
    if (requests.length > 0) {
      if (leadingColormap && !requests[0].colormap)
        requests[0].colormap = leadingColormap;
      return requests;
    }
  }
  return [];
}

/**
 * Where the 2D view is centred, as a fraction of the scene, after a pan.
 *
 * niivue fetches the finest bricks around the crosshair and does not re-plan
 * for a pure pan, so a panned-to area stays coarse until the crosshair is put
 * there. This is the point to focus on instead: a slice view shows the scene
 * centre minus the pan, in its plane, at the crosshair's depth.
 *
 * Null when there is no single such point: the 3D render, or a multiplanar
 * layout before the pointer has been over one of its panels.
 */
export function viewCentreFraction(view: {
  /** `nv.pan2Dxyzmm`: pan in scene units, then zoom. */
  pan: ArrayLike<number>;
  extentsMin: ArrayLike<number>;
  extentsMax: ArrayLike<number>;
  /** `nv.crosshairPos`, a scene fraction. */
  crosshair: ArrayLike<number>;
  sliceType: number;
  /** The slice panel the pointer was last over (multiplanar layouts). */
  hoveredSlice: number | null;
}): [number, number, number] | null {
  const slice =
    view.sliceType === SLICE_TYPE.MULTIPLANAR
      ? view.hoveredSlice
      : view.sliceType;
  // The axis each slice type looks along: axial z, coronal y, sagittal x.
  const depthAxis =
    slice === SLICE_TYPE.AXIAL
      ? 2
      : slice === SLICE_TYPE.CORONAL
        ? 1
        : slice === SLICE_TYPE.SAGITTAL
          ? 0
          : null;
  if (depthAxis === null) return null;
  const fraction: [number, number, number] = [0.5, 0.5, 0.5];
  for (let axis = 0; axis < 3; axis++) {
    if (axis === depthAxis) {
      fraction[axis] = view.crosshair[axis];
      continue;
    }
    const extent = view.extentsMax[axis] - view.extentsMin[axis];
    if (!(extent > 0)) return null;
    fraction[axis] = Math.min(1, Math.max(0, 0.5 - view.pan[axis] / extent));
  }
  return fraction;
}

/**
 * The zarr view's loader: streams an OME-Zarr store as the base volume, and
 * optionally one more on top. Inert unless the UI is in zarr mode.
 */
export function useZarrStream(nvRef: React.RefObject<NiiVue | null>) {
  const setShowUploader = useFreeBrowseStore((s) => s.setShowUploader);
  const setCurrentImageIndex = useFreeBrowseStore(
    (s) => s.setCurrentImageIndex,
  );
  const incrementVolumeVersion = useFreeBrowseStore(
    (s) => s.incrementVolumeVersion,
  );
  const setUrlLoadStatus = useFreeBrowseStore((s) => s.setUrlLoadStatus);
  const setZarrStreams = useFreeBrowseStore((s) => s.setZarrStreams);
  const setZarrProgress = useFreeBrowseStore((s) => s.setZarrProgress);

  // niivue's handles on the streams (focus, detail, budget), by volume id. Not
  // store state: they are live objects, and only this hook drives them.
  const handlesRef = useRef(new Map<string, NVChunkedVolume>());
  // Set while this hook is itself replacing volumes, so its own removals are
  // not mistaken for the user deleting a layer.
  const busyRef = useRef(false);

  const streams = () => useFreeBrowseStore.getState().zarrStreams;

  // Stream one store and return its record. Throws on failure, with the
  // message to show; `colormapError` reports a colormap that was not found.
  const streamOne = useCallback(
    async (
      nv: NiiVue,
      request: ZarrStoreRequest,
      role: "base" | "overlay",
    ): Promise<{ stream: ZarrStream; colormapError: string | null }> => {
      // As niivue names it ("gold" -> "Gold"). An unknown name streams with
      // the default and is reported, rather than failing the load.
      const find = (name?: string) =>
        name
          ? nv.colormaps.find((c) => c.toLowerCase() === name.toLowerCase())
          : undefined;
      // A store on top needs a colour of its own to be told from the base.
      const colormap =
        find(request.colormap) ?? (role === "overlay" ? find("red") : undefined);

      let zarrVersion: 2 | 3 | undefined;
      if (role === "overlay") {
        const base = streams()[0];
        if (!base) throw new Error(NO_BASE_MESSAGE);
        if (streams().length - 1 >= MAX_ZARR_OVERLAYS)
          throw new Error(TOO_MANY_MESSAGE);
        // niivue silently skips a streamed overlay off the base's grid.
        const description = await describeZarr(request.url);
        const [a, b] = [description.levels[0].dims, base.description.levels[0].dims];
        if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2])
          throw new Error(GRID_MISMATCH_MESSAGE);
        zarrVersion = description.zarrVersion;
      }

      console.log(`Streaming zarr store (${role}):`, request.url);
      const streamed = await streamZarr(nv, request.url, {
        channel: request.channel,
        timepoint: request.timepoint,
        ...(colormap ? { colormap } : {}),
        ...(zarrVersion ? { zarrVersion } : {}),
        // An overlay keeps the scene, and leaves the coarse backdrop to the
        // base: niivue installs every stream's floor as the base volume's.
        ...(role === "overlay" ? { replace: false, coarseFloor: false } : {}),
      });
      handlesRef.current.set(streamed.volumeId, streamed.volume);
      return {
        stream: {
          url: request.url,
          description: streamed.description,
          volumeId: streamed.volumeId,
          channel: streamed.channel,
          timepoint: request.timepoint ?? 0,
        },
        colormapError:
          request.colormap && !find(request.colormap)
            ? `Unknown colormap "${request.colormap}"; streaming with the default.`
            : null,
      };
    },
    [],
  );

  // Run one load: status, canvas, bookkeeping and error reporting around
  // `work`. Resolves to null on success, else the error shown to the user.
  const runLoad = useCallback(
    async (
      url: string,
      work: (nv: NiiVue) => Promise<string | null>,
    ): Promise<string | null> => {
      const nv = nvRef.current;
      if (!nv) return null;
      setUrlLoadStatus({ state: "loading", url });
      busyRef.current = true;
      try {
        // The canvas only exists once the opener panel is gone.
        setShowUploader(false);
        let retries = 0;
        while (!nv.canvas && retries < 20) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries++;
        }
        if (!nv.canvas) {
          throw new Error("Canvas failed to initialize after 2 seconds");
        }
        const warning = await work(nv);
        incrementVolumeVersion();
        setUrlLoadStatus(
          warning
            ? { state: "error", url, message: warning }
            : { state: "idle" },
        );
        return warning;
      } catch (error) {
        console.error("Error streaming zarr store:", error);
        const message = describeLoadError(error);
        setUrlLoadStatus({ state: "error", url, message });
        // A failed open can leave the scene emptied: drop what is gone.
        const ids = new Set(nv.volumes.map((v) => v.id));
        setZarrStreams(streams().filter((s) => ids.has(s.volumeId)));
        // Nothing to look at: bring the opener back.
        if (nv.volumes.length === 0) setShowUploader(true);
        return message;
      } finally {
        busyRef.current = false;
      }
    },
    [
      nvRef,
      setShowUploader,
      incrementVolumeVersion,
      setUrlLoadStatus,
      setZarrStreams,
    ],
  );

  // Stream a store as the base, replacing whatever is shown.
  const openZarrStore = useCallback(
    (rawUrl: string, options: Omit<ZarrStoreRequest, "url"> = {}) => {
      const url = rawUrl.trim();
      if (!url) return Promise.resolve(null);
      return runLoad(url, async (nv) => {
        const { stream, colormapError } = await streamOne(
          nv,
          { ...options, url },
          "base",
        );
        // The scene was replaced: only the new stream's handle is live.
        for (const id of handlesRef.current.keys()) {
          if (id !== stream.volumeId) handlesRef.current.delete(id);
        }
        setZarrStreams([stream]);
        setCurrentImageIndex(0);
        return colormapError;
      });
    },
    [runLoad, streamOne, setZarrStreams, setCurrentImageIndex],
  );

  // Stream a store on top of the base (two stains of one sample, say).
  const addZarrStore = useCallback(
    (rawUrl: string, options: Omit<ZarrStoreRequest, "url"> = {}) => {
      const url = rawUrl.trim();
      if (!url) return Promise.resolve(null);
      return runLoad(url, async (nv) => {
        const { stream, colormapError } = await streamOne(
          nv,
          { ...options, url },
          "overlay",
        );
        setZarrStreams([...streams(), stream]);
        setCurrentImageIndex(nv.volumes.length - 1);
        return colormapError;
      });
    },
    [runLoad, streamOne, setZarrStreams, setCurrentImageIndex],
  );

  // Open several stores in order: the first is the base, the rest go on top.
  // Every one is tried; failures are reported together at the end.
  const openZarrStores = useCallback(
    async (requests: ZarrStoreRequest[]): Promise<void> => {
      const failed: { url: string; message: string }[] = [];
      for (const [index, { url, ...options }] of requests.entries()) {
        const error =
          index === 0
            ? await openZarrStore(url, options)
            : await addZarrStore(url, options);
        if (error) failed.push({ url, message: error });
      }
      // A later success cleared the status; report every failure together.
      if (failed.length > 0 && requests.length > 1) {
        setUrlLoadStatus({
          state: "error",
          url: failed.map((f) => f.url).join(", "),
          message:
            failed.length === 1
              ? failed[0].message
              : `${failed.length} of ${requests.length} could not be opened. First error: ${failed[0].message}`,
        });
      }
    },
    [openZarrStore, addZarrStore, setUrlLoadStatus],
  );

  // Show another channel or timepoint of a streamed store. A stream is fixed
  // to one of each, so every store is streamed again, the changed one with its
  // new selection; display settings are carried over.
  const selectZarrFrame = useCallback(
    async (
      volumeId: string,
      selection: { channel?: number; timepoint?: number },
    ): Promise<void> => {
      const nv = nvRef.current;
      if (!nv) return;
      const requests: ZarrStoreRequest[] = streams().map((stream) => {
        const volume = nv.volumes.find((v) => v.id === stream.volumeId);
        return {
          url: stream.url,
          colormap: volume?.colormap,
          channel: stream.channel,
          timepoint: stream.timepoint,
          ...(stream.volumeId === volumeId ? selection : {}),
        };
      });
      if (requests.length > 0) await openZarrStores(requests);
    },
    [nvRef, openZarrStores],
  );

  // Follow niivue: forget streams whose volume was removed, and report how
  // much of the viewed part is still arriving.
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || useFreeBrowseStore.getState().appMode !== "zarr") return;

    const onVolumeRemoved = () => {
      if (busyRef.current) return;
      const ids = new Set(nv.volumes.map((v) => v.id));
      const kept = streams().filter((s) => ids.has(s.volumeId));
      for (const id of handlesRef.current.keys()) {
        if (!ids.has(id)) handlesRef.current.delete(id);
      }
      // The overlay was streamed against the base's grid and without a
      // backdrop of its own: it does not stand alone.
      const baseGone = streams()[0] && !ids.has(streams()[0].volumeId);
      if (baseGone && nv.volumes.length > 0) {
        setZarrStreams([]);
        void nv.removeAllVolumes();
        return;
      }
      setZarrStreams(kept);
      if (nv.volumes.length === 0) {
        setZarrProgress(null);
        setCurrentImageIndex(null);
        setShowUploader(true);
      }
    };
    const onProgress = (event: CustomEvent<ChunkStreamDetail>) => {
      const { pending, inFlight, total } = event.detail;
      setZarrProgress({ remaining: pending + inFlight, total });
    };
    const onIdle = () => setZarrProgress(null);

    nv.addEventListener("volumeRemoved", onVolumeRemoved);
    nv.addEventListener("chunkStreamProgress", onProgress);
    nv.addEventListener("chunkStreamIdle", onIdle);
    return () => {
      nv.removeEventListener("volumeRemoved", onVolumeRemoved);
      nv.removeEventListener("chunkStreamProgress", onProgress);
      nv.removeEventListener("chunkStreamIdle", onIdle);
      setZarrProgress(null);
    };
  }, [nvRef, setZarrStreams, setZarrProgress, setCurrentImageIndex, setShowUploader]);

  // Detail follows the view: after a pan, fetch the finest bricks for what is
  // on screen (see viewCentreFraction). A crosshair move takes the focus back
  // by itself, since niivue re-plans around the crosshair on every move.
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || useFreeBrowseStore.getState().appMode !== "zarr") return;

    let hoveredSlice: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPan = "";
    const context = nv.createExtensionContext();
    context.on("slicePointerMove", (event: CustomEvent<SlicePointerEvent>) => {
      hoveredSlice = event.detail.sliceType;
    });

    const refocus = () => {
      timer = null;
      const base = streams()[0];
      const handle = base && handlesRef.current.get(base.volumeId);
      if (!handle) return;
      const fraction = viewCentreFraction({
        pan: nv.pan2Dxyzmm,
        extentsMin: nv.model.extentsMin,
        extentsMax: nv.model.extentsMax,
        crosshair: nv.crosshairPos,
        sliceType: nv.sliceType,
        hoveredSlice,
      });
      if (fraction) void handle.setFocus(fraction);
    };
    const onChange = (event: CustomEvent<PropertyChangeDetail>) => {
      if (event.detail?.property !== "pan2Dxyzmm") return;
      // The zoom is the fourth component; niivue re-plans for that itself.
      const pan = Array.from(nv.pan2Dxyzmm).slice(0, 3).join(",");
      if (pan === lastPan) return;
      lastPan = pan;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refocus, PAN_FOCUS_DEBOUNCE_MS);
    };

    nv.addEventListener("change", onChange);
    return () => {
      nv.removeEventListener("change", onChange);
      if (timer) clearTimeout(timer);
      context.dispose();
    };
  }, [nvRef]);

  // Open the stores named in the address on initial load (app only: an
  // embedding host keeps its own query string, see config.readUrlParams).
  useEffect(() => {
    if (useFreeBrowseStore.getState().appMode !== "zarr") return;
    if (!getFreeBrowseConfig().readUrlParams) return;
    const requests = zarrParamsFromLocation(window.location);
    if (requests.length > 0) void openZarrStores(requests);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    openZarrStore,
    addZarrStore,
    openZarrStores,
    selectZarrFrame,
    handlesRef,
  };
}
