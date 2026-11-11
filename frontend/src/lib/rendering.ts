/**
 * Which renderer the viewer uses, and how much GPU memory a streamed volume
 * may take on each.
 *
 * niivue draws with WebGL2 unless asked for WebGPU (its default since
 * 1.0.0-rc.22). FreeBrowse asks for WebGPU wherever the browser has it,
 * unless the user turned that off in the settings dialog.
 */
export type RenderBackend = "webgl2" | "webgpu";

/** Where to send someone whose browser has no WebGPU. */
export const WEBGPU_HELP_URL =
  "https://github.com/gpuweb/gpuweb/wiki/Implementation-Status";

const MiB = 1024 * 1024;

/**
 * GPU memory a streamed volume's bricks may take, per backend.
 *
 * The two differ by an order of magnitude. A WebGL2 3D texture is one fixed
 * allocation, and niivue's own demo measured the context being dropped at
 * about 1.67 GB of bricks, so WebGL2 stays well under that. WebGPU has no such
 * ceiling; the limit there is the machine's.
 */
export const GPU_MEMORY_PRESETS: Record<RenderBackend, readonly number[]> = {
  webgl2: [512 * MiB, 768 * MiB, 1024 * MiB, 1280 * MiB],
  webgpu: [1536 * MiB, 2048 * MiB, 4096 * MiB, 8192 * MiB],
};

export const DEFAULT_GPU_MEMORY: Record<RenderBackend, number> = {
  webgl2: 1280 * MiB,
  webgpu: 2048 * MiB,
};

/** "1.25 GB", "512 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MiB) return `${Number((bytes / (1024 * MiB)).toFixed(2))} GB`;
  return `${Math.round(bytes / MiB)} MB`;
}

/** Whether this browser exposes WebGPU at all (it may still fail to start). */
export function webGpuSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu;
}

/** The backend to ask niivue for, given the user's preference. */
export function preferredBackend(useWebGpu: boolean): RenderBackend {
  return useWebGpu && webGpuSupported() ? "webgpu" : "webgl2";
}

/**
 * The memory setting to use on `backend`: the stored choice when it is one of
 * that backend's presets, else the backend's default.
 */
export function gpuMemoryFor(
  backend: RenderBackend,
  stored: Partial<Record<RenderBackend, number>>,
): number {
  const value = stored[backend];
  return value !== undefined && GPU_MEMORY_PRESETS[backend].includes(value)
    ? value
    : DEFAULT_GPU_MEMORY[backend];
}
