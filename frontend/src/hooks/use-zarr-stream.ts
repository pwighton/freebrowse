import { useCallback, useEffect, useRef } from "react";
import { useFreeBrowseStore } from "@/store";
import type { NiiVue, NVChunkedVolume } from "@niivue/niivue";
import { getFreeBrowseConfig } from "@/lib/deployment-config";
import { describeLoadError } from "@/lib/load-errors";
import { streamZarr } from "@/lib/zarr";

/**
 * The store named in the page address, for the zarr view: `zarr=`, the
 * parameter the default view uses for the same thing, in the hash route's own
 * query (`#/zarr?zarr=...`) or in the page's (`?zarr=...#/zarr`). `cmap=` in
 * the same query sets its colormap.
 *
 * `url=` is accepted as an alias, but is not the documented name: Vite's dev
 * server claims a page query starting `?url` for itself and answers 403.
 */
export function zarrParamsFromLocation(location: {
  hash: string;
  search: string;
}): { url: string; colormap?: string } | null {
  const queryOfHash = location.hash.includes("?")
    ? location.hash.slice(location.hash.indexOf("?"))
    : "";
  for (const query of [queryOfHash, location.search]) {
    const params = new URLSearchParams(query);
    const url = params.get("zarr") || params.get("url");
    if (url) {
      const colormap = params.get("cmap");
      return colormap ? { url, colormap } : { url };
    }
  }
  return null;
}

/**
 * The zarr view's loader: streams one OME-Zarr store as the base volume.
 * Inert unless the UI is in zarr mode.
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
  const setZarrStream = useFreeBrowseStore((s) => s.setZarrStream);

  // niivue's handle on the stream (focus, detail, budget). Not store state:
  // it is a live object, and only this hook drives it.
  const streamRef = useRef<NVChunkedVolume | null>(null);

  // Stream a store, replacing whatever is shown. Resolves to null on success,
  // else the error shown to the user.
  const openZarrStore = useCallback(
    async (
      rawUrl: string,
      options: { colormap?: string } = {},
    ): Promise<string | null> => {
      const nv = nvRef.current;
      const url = rawUrl.trim();
      if (!nv || !url) return null;
      // As niivue names it ("gold" -> "Gold"). An unknown name streams with
      // the default and is reported, rather than failing the load.
      const colormap = options.colormap
        ? nv.colormaps.find(
            (c) => c.toLowerCase() === options.colormap?.toLowerCase(),
          )
        : undefined;

      setUrlLoadStatus({ state: "loading", url });
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

        console.log("Streaming zarr store:", url);
        const stream = await streamZarr(nv, url, colormap ? { colormap } : {});
        streamRef.current = stream.volume;
        setZarrStream({
          description: stream.description,
          volumeId: stream.volumeId,
          channel: stream.channel,
        });
        setCurrentImageIndex(0);
        incrementVolumeVersion();
        if (options.colormap && !colormap) {
          const message = `Unknown colormap "${options.colormap}"; streaming with the default.`;
          setUrlLoadStatus({ state: "error", url, message });
          return message;
        }
        setUrlLoadStatus({ state: "idle" });
        return null;
      } catch (error) {
        console.error("Error streaming zarr store:", error);
        const message = describeLoadError(error);
        setUrlLoadStatus({ state: "error", url, message });
        // Nothing to look at: bring the opener back.
        if (nv.volumes.length === 0) setShowUploader(true);
        return message;
      }
    },
    [
      nvRef,
      setShowUploader,
      setCurrentImageIndex,
      incrementVolumeVersion,
      setUrlLoadStatus,
      setZarrStream,
    ],
  );

  // Open the store named in the address on initial load (app only: an
  // embedding host keeps its own query string, see config.readUrlParams).
  useEffect(() => {
    if (useFreeBrowseStore.getState().appMode !== "zarr") return;
    if (!getFreeBrowseConfig().readUrlParams) return;
    const params = zarrParamsFromLocation(window.location);
    if (params) void openZarrStore(params.url, { colormap: params.colormap });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { openZarrStore, streamRef };
}
