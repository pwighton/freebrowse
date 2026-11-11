import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NiiVue } from "@/__mocks__/niivue";
import { useFreeBrowseStore } from "@/store";
import { DEFAULT_ZARR_SETTINGS } from "@/lib/zarr-settings";
import { useRendering } from "./use-rendering";

const MiB = 1024 * 1024;
type Ref = Parameters<typeof useRendering>[0];
const refOf = (nv: NiiVue) => ({ current: nv }) as unknown as Ref;

/** A viewer whose view is running on `backend`. */
function running(backend: "webgl2" | "webgpu", residency: number) {
  const nv = new NiiVue();
  Object.assign(nv, { canvas: {}, backend });
  nv.opts = { backend, maxChunkResidencyBytes: residency };
  return nv;
}

beforeEach(() => {
  Object.defineProperty(navigator, "gpu", { value: {}, configurable: true });
  useFreeBrowseStore.setState({
    useWebGpu: true,
    activeBackend: null,
    zarrSettings: DEFAULT_ZARR_SETTINGS,
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "gpu");
  vi.restoreAllMocks();
});

describe("useRendering", () => {
  test("reports the backend the view is running on", () => {
    const nv = running("webgpu", 2048 * MiB);
    renderHook(() => useRendering(refOf(nv), false));
    expect(useFreeBrowseStore.getState().activeBackend).toBe("webgpu");
  });

  test("turning WebGPU off restarts the view on WebGL2 with WebGL2's memory", async () => {
    const nv = running("webgpu", 2048 * MiB);
    const restart = vi.spyOn(nv, "reinitializeView");
    const { result } = renderHook(() => useRendering(refOf(nv), false));
    await act(() => result.current.setUseWebGpu(false));
    expect(restart).toHaveBeenCalledWith({ backend: "webgl2", forceRestart: true });
    expect(nv.opts.maxChunkResidencyBytes).toBe(1280 * MiB);
    const state = useFreeBrowseStore.getState();
    expect(state.useWebGpu).toBe(false);
    expect(state.activeBackend).toBe("webgl2");
  });

  test("before a view exists the choice is only recorded for when it starts", async () => {
    const nv = new NiiVue();
    const restart = vi.spyOn(nv, "reinitializeView");
    const { result } = renderHook(() => useRendering(refOf(nv), false));
    await act(() => result.current.setUseWebGpu(false));
    expect(restart).not.toHaveBeenCalled();
    expect(nv.opts).toEqual({ backend: "webgl2", maxChunkResidencyBytes: 1280 * MiB });
  });

  test("WebGPU that fell back to WebGL2 does not keep WebGPU's memory", async () => {
    // Asked for WebGPU with 2 GB; the view came up on WebGL2.
    const nv = running("webgl2", 2048 * MiB);
    const restart = vi.spyOn(nv, "reinitializeView");
    await act(async () => {
      renderHook(() => useRendering(refOf(nv), false));
    });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(nv.opts.maxChunkResidencyBytes).toBe(1280 * MiB);
    expect(useFreeBrowseStore.getState().activeBackend).toBe("webgl2");
  });

  test("a memory choice is stored for the backend in use and restarts the view", async () => {
    const nv = running("webgl2", 1280 * MiB);
    const restart = vi.spyOn(nv, "reinitializeView");
    const { result } = renderHook(() => useRendering(refOf(nv), false));
    await act(() => result.current.setGpuMemory(512 * MiB));
    expect(useFreeBrowseStore.getState().zarrSettings.gpuMemory).toEqual({
      webgl2: 512 * MiB,
    });
    expect(nv.opts.maxChunkResidencyBytes).toBe(512 * MiB);
    expect(restart).toHaveBeenCalledWith({ backend: "webgl2", forceRestart: true });
  });

  test("a host's own viewer is reported on and left alone", async () => {
    const nv = running("webgl2", 4096 * MiB);
    const restart = vi.spyOn(nv, "reinitializeView");
    const { result } = renderHook(() => useRendering(refOf(nv), true));
    await act(async () => {
      await result.current.setUseWebGpu(false);
      await result.current.setGpuMemory(512 * MiB);
    });
    expect(restart).not.toHaveBeenCalled();
    expect(nv.opts.maxChunkResidencyBytes).toBe(4096 * MiB);
    expect(useFreeBrowseStore.getState().activeBackend).toBe("webgl2");
  });
});
