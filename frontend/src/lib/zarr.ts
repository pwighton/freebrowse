/**
 * OME-Zarr loading for FreeBrowse, on top of `@niivue/nv-ext-tile/zarr`.
 *
 * Two ways in. The whole-level path ({@link loadZarrLevel}) reads one pyramid
 * level fully into memory and adds it as an ordinary volume, so everything
 * that works on a NIfTI (drawing, save, voxel readout) works on it. The
 * streaming path ({@link streamZarr}) fetches bricks around the crosshair at
 * several resolutions, for stores far larger than memory; a streamed volume
 * has no voxels on the CPU, so those features do not apply to it.
 *
 * The niivue extension is imported lazily so zarrita stays out of the main
 * bundle until a store is actually opened.
 */
import type { NiiVue, NVChunkedVolume } from "@niivue/niivue";
import type { OmeZarrSource } from "@niivue/nv-ext-tile/zarr";

/**
 * Whether this build includes OME-Zarr support. The single-file build is made
 * without it (`VITE_NO_ZARR`): the env test is written inline below so the
 * bundler drops the import, and the library with it, as dead code.
 */
export const ZARR_SUPPORTED = import.meta.env.VITE_NO_ZARR !== "true";

const loadZarrModule =
  import.meta.env.VITE_NO_ZARR === "true"
    ? () =>
        Promise.reject<typeof import("@niivue/nv-ext-tile/zarr")>(
          new Error("OME-Zarr support is not included in this build."),
        )
    : () => import("@niivue/nv-ext-tile/zarr");

export interface ZarrLevelInfo {
  /** Pyramid level, 0 = finest. */
  level: number;
  /** Voxel grid in display order [x, y, z]. */
  dims: [number, number, number];
  /** Voxel spacing in display order, micrometres. */
  spacingUm: [number, number, number];
  dtype: string;
  /** Decoded bytes for one channel at one timepoint. */
  channelBytes: number;
}

export interface ZarrDescription {
  /** Absolute store URL, without a trailing slash. */
  url: string;
  /** The multiscale's stated name, or null. */
  name: string | null;
  /** Resolution levels, finest first. */
  levels: ZarrLevelInfo[];
  /** One display name per channel. */
  channels: string[];
  timepoints: number;
  /** The level a whole-level load picks when none is given. */
  defaultLevel: number;
  /** The store's zarr format, when its OME-NGFF version states it. */
  zarrVersion?: 2 | 3;
}

export interface LoadZarrLevelOptions {
  /** Pyramid level to read (0 = finest). Default: finest within the budget. */
  level?: number;
  /** Channel indices to load. Default: every channel. */
  channels?: number[];
  timepoint?: number;
  /** Per-channel budget for the automatic level pick. Default 256 MiB. */
  levelBudgetBytes?: number;
  /** The store's format when already known (see {@link probeZarr}). */
  zarrVersion?: 2 | 3;
  /** Colormap for every loaded channel, instead of the store's own colours. */
  colormap?: string;
}

export interface LoadedZarrLevel {
  description: ZarrDescription;
  /** The level that was read. */
  level: number;
  /** Ids of the volumes added to the scene, one per channel. */
  volumeIds: string[];
}

/** Absolute form of a store URL, without a trailing slash or fragment. */
export function resolveZarrUrl(url: string): string {
  const resolved = new URL(url, document.baseURI);
  resolved.hash = "";
  resolved.pathname = resolved.pathname.replace(/\/+$/, "");
  return resolved.href;
}

/** The store URL's path, or "" when it does not parse. */
function pathOf(url: string): string {
  try {
    return new URL(url, document.baseURI).pathname;
  } catch {
    return "";
  }
}

/**
 * Whether a URL names a zarr store by its path: any segment ending in `.zarr`
 * (`x.ome.zarr`, `x.nii.zarr`, `x.zarr/0`). A fast path only: stores served by
 * id, like DANDI's, need {@link probeZarr}.
 */
export function isZarrUrl(url: string): boolean {
  return pathOf(url)
    .split("/")
    .some((segment) => /\.zarr$/i.test(segment));
}

/** Fetch a metadata key and parse it, or null for anything but a JSON object. */
async function fetchJsonObject(
  url: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    // A dev server or SPA host answers any path with its HTML page.
    const parsed: unknown = JSON.parse(await response.text());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Ask the server whether a URL is a zarr group: its format version, or null.
 * Looks for v3's `zarr.json`, then v2's `.zgroup` / `.zattrs`.
 */
export async function probeZarr(url: string): Promise<2 | 3 | null> {
  let base: string;
  try {
    base = resolveZarrUrl(url);
  } catch {
    return null;
  }
  const v3 = await fetchJsonObject(`${base}/zarr.json`);
  if (v3 && v3.zarr_format === 3) return 3;
  if (await fetchJsonObject(`${base}/.zgroup`)) return 2;
  if (await fetchJsonObject(`${base}/.zattrs`)) return 2;
  return null;
}

function describe(
  url: string,
  source: OmeZarrSource,
  channels: string[],
  defaultLevel: number,
): ZarrDescription {
  return {
    url,
    name: source.info.name,
    levels: source.levels.map((level, index) => ({
      level: index,
      dims: level.dims,
      spacingUm: level.spacingUm,
      dtype: level.dtype,
      channelBytes: level.channelBytes,
    })),
    channels,
    timepoints: source.timepointCount,
    defaultLevel,
    zarrVersion: zarrVersionOf(source),
  };
}

/**
 * A short name for the store: its stated name, else the `.zarr` segment of
 * its URL, else "" (a store served by id, like DANDI's, has neither).
 */
function storeLabel(url: string, source: OmeZarrSource): string {
  if (source.info.name) return source.info.name;
  const segment = pathOf(url)
    .split("/")
    .find((s) => /\.zarr$/i.test(s));
  return segment ? decodeURIComponent(segment) : "";
}

/**
 * The zarr format an opened store is in, from its OME-NGFF version: 0.5 is
 * defined on zarr v3, 0.4 and earlier on v2. Undefined when unstated.
 */
function zarrVersionOf(source: OmeZarrSource): 2 | 3 | undefined {
  const ngff = parseFloat(source.info.version ?? "");
  if (Number.isNaN(ngff)) return undefined;
  return ngff >= 0.5 ? 3 : 2;
}

/** Layer name for one channel: the store's label, plus the channel if several. */
function volumeName(
  label: string,
  channels: string[],
  channel: number,
): string {
  if (channels.length <= 1) return label || channels[0] || "zarr";
  return label ? `${label} ${channels[channel]}` : channels[channel];
}

async function openZarr(
  url: string,
  levelBudgetBytes?: number,
  zarrVersion?: 2 | 3,
) {
  const zarr = await loadZarrModule();
  const resolved = resolveZarrUrl(url);
  // A known version skips zarrita's v3-then-v2 probe (a 404 on every v2 store).
  const source = await zarr.fetchOmeZarr(
    resolved,
    zarrVersion ? { zarrVersion } : undefined,
  );
  const channels = Array.from({ length: source.channelCount }, (_, c) =>
    zarr.omeZarrChannelName(source, c),
  );
  const defaultLevel = zarr.defaultOmeZarrLevel(source, levelBudgetBytes);
  return {
    zarr,
    source,
    description: describe(resolved, source, channels, defaultLevel),
  };
}

/**
 * Read a store's metadata (levels, channels, timepoints) without reading any
 * voxels. Throws when the URL is not a readable OME-Zarr image.
 */
export async function describeZarr(
  url: string,
  levelBudgetBytes?: number,
  zarrVersion?: 2 | 3,
): Promise<ZarrDescription> {
  return (await openZarr(url, levelBudgetBytes, zarrVersion)).description;
}

/**
 * Load one whole pyramid level into memory and ADD it to the scene, one
 * volume per channel. Existing volumes are kept (`nv.loadVolumes` would
 * replace them).
 */
export async function loadZarrLevel(
  nv: NiiVue,
  url: string,
  options: LoadZarrLevelOptions = {},
): Promise<LoadedZarrLevel> {
  const { zarrVersion, colormap, ...readOptions } = options;
  const { zarr, source, description } = await openZarr(
    url,
    options.levelBudgetBytes,
    zarrVersion,
  );
  const level = options.level ?? description.defaultLevel;
  const volumes = await zarr.omeZarrVolumesFrom(source, {
    ...readOptions,
    level,
  });

  const label = storeLabel(description.url, source);
  const channels =
    options.channels ?? description.channels.map((_, index) => index);
  const before = new Set(nv.volumes.map((v) => v.id));
  for (const [i, volume] of volumes.entries()) {
    await nv.addVolume({
      ...volume,
      name: volumeName(label, description.channels, channels[i]),
      ...(colormap ? { colormap } : {}),
    });
  }
  const volumeIds = nv.volumes
    .map((v) => v.id)
    .filter((id): id is string => !!id && !before.has(id));

  return { description, level, volumeIds };
}

export interface StreamZarrOptions {
  /** Channel to stream. Default: the first. */
  channel?: number;
  timepoint?: number;
  /**
   * Remove the volumes shown once the store has opened, so a store that fails
   * to open leaves the scene as it was. Default true: a streamed volume has to
   * be the base layer.
   */
  replace?: boolean;
  /** The store's format when already known (see {@link probeZarr}). */
  zarrVersion?: 2 | 3;
  colormap?: string;
  /** Layer opacity, 0 to 1. */
  opacity?: number;
  /**
   * Show the store's coarsest level behind bricks that have not arrived.
   * Default true. Pass false for a store added on top of another: niivue
   * installs every stream's floor as the BASE volume's.
   */
  coarseFloor?: boolean;
}

export interface StreamedZarr {
  description: ZarrDescription;
  /** niivue's handle on the stream (focus, detail, budget). */
  volume: NVChunkedVolume;
  /** Id of the streamed volume in `nv.volumes`. */
  volumeId: string;
  channel: number;
}

/**
 * Stream a store into the scene. The stream's workers stop by themselves
 * once the volume is removed or the viewer destroyed.
 */
export async function streamZarr(
  nv: NiiVue,
  url: string,
  options: StreamZarrOptions = {},
): Promise<StreamedZarr> {
  const { zarr, source, description } = await openZarr(
    url,
    undefined,
    options.zarrVersion,
  );
  // niivue opens the store again for the stream. Tell it the format the first
  // open found, so it does not repeat the v3-then-v2 probe.
  const zarrVersion = options.zarrVersion ?? description.zarrVersion;
  const channel = options.channel ?? 0;
  const name = volumeName(
    storeLabel(description.url, source),
    description.channels,
    channel,
  );
  const before = new Set(nv.volumes.map((v) => v.id));
  const volume = await zarr.streamOmeZarr(
    nv,
    description.url,
    {
      channel,
      timepoint: options.timepoint,
      replace: options.replace ?? true,
      ...(zarrVersion ? { zarrVersion } : {}),
    },
    {
      name,
      ...(options.colormap ? { colormap: options.colormap } : {}),
      ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
      ...(options.coarseFloor !== undefined
        ? { coarseFloor: options.coarseFloor }
        : {}),
    },
  );
  const added = nv.volumes.find((v) => v.id && !before.has(v.id));
  return { description, volume, volumeId: added?.id ?? "", channel };
}
