import { afterEach, describe, expect, test } from "vitest";

import {
  DEFAULT_GPU_MEMORY,
  formatBytes,
  GPU_MEMORY_PRESETS,
  gpuMemoryFor,
  preferredBackend,
  webGpuSupported,
} from "./rendering";

const MiB = 1024 * 1024;

/** Give (or take away) `navigator.gpu` for one test. */
function setGpu(present: boolean) {
  Object.defineProperty(navigator, "gpu", {
    value: present ? {} : undefined,
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "gpu");
});

describe("preferredBackend", () => {
  test("WebGPU when the browser has it and the user wants it", () => {
    setGpu(true);
    expect(webGpuSupported()).toBe(true);
    expect(preferredBackend(true)).toBe("webgpu");
    expect(preferredBackend(false)).toBe("webgl2");
  });

  test("WebGL2 when the browser has no WebGPU, whatever the preference", () => {
    setGpu(false);
    expect(webGpuSupported()).toBe(false);
    expect(preferredBackend(true)).toBe("webgl2");
  });
});

describe("gpuMemoryFor", () => {
  test("each backend has its own choice", () => {
    const stored = { webgl2: 512 * MiB, webgpu: 8192 * MiB };
    expect(gpuMemoryFor("webgl2", stored)).toBe(512 * MiB);
    expect(gpuMemoryFor("webgpu", stored)).toBe(8192 * MiB);
  });

  test("no choice, or one that is not offered on that backend, is the default", () => {
    expect(gpuMemoryFor("webgl2", {})).toBe(DEFAULT_GPU_MEMORY.webgl2);
    // WebGPU's 8 GB must never reach WebGL2.
    expect(gpuMemoryFor("webgl2", { webgl2: 8192 * MiB })).toBe(
      DEFAULT_GPU_MEMORY.webgl2,
    );
  });

  test("every WebGL2 choice stays under the size at which contexts were lost", () => {
    expect(Math.max(...GPU_MEMORY_PRESETS.webgl2)).toBeLessThan(1670 * MiB);
    expect(GPU_MEMORY_PRESETS.webgl2).toContain(DEFAULT_GPU_MEMORY.webgl2);
    expect(GPU_MEMORY_PRESETS.webgpu).toContain(DEFAULT_GPU_MEMORY.webgpu);
  });
});

describe("formatBytes", () => {
  test.each([
    [512 * MiB, "512 MB"],
    [1024 * MiB, "1 GB"],
    [1280 * MiB, "1.25 GB"],
    [8192 * MiB, "8 GB"],
    [0, "0 MB"],
  ])("%i -> %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
