import { useCallback, useEffect } from "react";
import { useFreeBrowseStore } from "@/store";
import type { NiiVue } from "@niivue/niivue";
import {
  gpuMemoryFor,
  preferredBackend,
  type RenderBackend,
} from "@/lib/rendering";

/**
 * The renderer the view runs on, and the GPU memory a streamed volume gets.
 *
 * Both are read by niivue when a view starts, so changing either restarts the
 * view (`reinitializeView`). niivue keeps the scene across that: loaded
 * volumes, drawings and running streams all survive.
 *
 * With `hostInstance` the viewer belongs to an embedding page: FreeBrowse
 * reports what it runs on and changes nothing.
 */
export function useRendering(
  nvRef: React.RefObject<NiiVue | null>,
  hostInstance: boolean,
) {
  const setUseWebGpuPreference = useFreeBrowseStore((s) => s.setUseWebGpu);
  const setActiveBackend = useFreeBrowseStore((s) => s.setActiveBackend);
  const setZarrSettings = useFreeBrowseStore((s) => s.setZarrSettings);

  // Restart the view on `backend` with the memory chosen for that backend.
  const restartView = useCallback(
    async (backend: RenderBackend): Promise<void> => {
      const nv = nvRef.current;
      if (!nv) return;
      const { zarrSettings } = useFreeBrowseStore.getState();
      nv.opts.maxChunkResidencyBytes = gpuMemoryFor(
        backend,
        zarrSettings.gpuMemory,
      );
      // No view yet (nothing loaded): the options above apply when it starts.
      if (!nv.canvas) {
        nv.opts.backend = backend;
        return;
      }
      try {
        await nv.reinitializeView({ backend, forceRestart: true });
      } catch (error) {
        console.error("Error restarting the view:", error);
      }
      setActiveBackend((nv.backend as RenderBackend | undefined) ?? null);
    },
    [nvRef, setActiveBackend],
  );

  // Track the backend the view actually got. Asking for WebGPU can still land
  // on WebGL2 (no adapter), which leaves WebGPU's larger memory setting on a
  // backend that cannot hold it: correct that once.
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv) return;
    const onViewAttached = () => {
      const backend = (nv.backend as RenderBackend | undefined) ?? null;
      setActiveBackend(backend);
      if (!backend || hostInstance) return;
      const { zarrSettings } = useFreeBrowseStore.getState();
      const memory = gpuMemoryFor(backend, zarrSettings.gpuMemory);
      if (nv.opts.maxChunkResidencyBytes !== memory) void restartView(backend);
    };
    nv.addEventListener("viewAttached", onViewAttached);
    if (nv.canvas) onViewAttached();
    return () => nv.removeEventListener("viewAttached", onViewAttached);
  }, [nvRef, hostInstance, setActiveBackend, restartView]);

  // The settings dialog's WebGPU switch.
  const setUseWebGpu = useCallback(
    async (useWebGpu: boolean): Promise<void> => {
      setUseWebGpuPreference(useWebGpu);
      if (hostInstance) return;
      await restartView(preferredBackend(useWebGpu));
    },
    [hostInstance, setUseWebGpuPreference, restartView],
  );

  // The zarr settings tab's memory choice, for the backend now in use.
  const setGpuMemory = useCallback(
    async (bytes: number): Promise<void> => {
      const nv = nvRef.current;
      if (!nv || hostInstance) return;
      const state = useFreeBrowseStore.getState();
      const backend =
        state.activeBackend ?? preferredBackend(state.useWebGpu);
      setZarrSettings({
        gpuMemory: { ...state.zarrSettings.gpuMemory, [backend]: bytes },
      });
      await restartView(backend);
    },
    [nvRef, hostInstance, setZarrSettings, restartView],
  );

  return { setUseWebGpu, setGpuMemory };
}
