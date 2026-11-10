import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NiiVue } from "@/__mocks__/niivue";
import {
  describeZarr,
  isZarrUrl,
  loadZarrLevel,
  probeZarr,
  resolveZarrUrl,
} from "./zarr";

const MiB = 1024 * 1024;

/** A three-level, two-channel store as `fetchOmeZarr` describes it. */
const source = {
  info: { name: "sample" },
  levels: [
    { dims: [400, 400, 100], spacingUm: [1, 1, 2], dtype: "uint16", channelBytes: 32 * MiB },
    { dims: [200, 200, 50], spacingUm: [2, 2, 4], dtype: "uint16", channelBytes: 4 * MiB },
    { dims: [100, 100, 25], spacingUm: [4, 4, 8], dtype: "uint16", channelBytes: 0.5 * MiB },
  ],
  channelCount: 2,
  timepointCount: 1,
};

const zarrModule = vi.hoisted(() => ({
  fetchOmeZarr: vi.fn(),
  omeZarrChannelName: vi.fn(),
  defaultOmeZarrLevel: vi.fn(),
  omeZarrVolumesFrom: vi.fn(),
}));
vi.mock("@niivue/nv-ext-tile/zarr", () => zarrModule);

const asNv = (nv: NiiVue) => nv as unknown as Parameters<typeof loadZarrLevel>[0];

beforeEach(() => {
  zarrModule.fetchOmeZarr.mockReset().mockResolvedValue(source);
  zarrModule.omeZarrChannelName
    .mockReset()
    .mockImplementation((_s: unknown, c: number) => ["DAPI", "GFP"][c]);
  zarrModule.defaultOmeZarrLevel.mockReset().mockReturnValue(1);
  zarrModule.omeZarrVolumesFrom
    .mockReset()
    .mockImplementation(
      async (_s: unknown, opts: { channels?: number[] } = {}) =>
        (opts.channels ?? [0, 1]).map((c) => ({
          url: `file-${c}`,
          name: ["DAPI", "GFP"][c],
        })),
    );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isZarrUrl", () => {
  test.each([
    "https://host/data/brain.zarr",
    "https://host/data/brain.ome.zarr/",
    "https://host/data/brain.OME.ZARR",
    "https://host/data/plate.zarr/0",
    "data/local/brain.nii.zarr",
    "https://host/brain.zarr?token=abc",
  ])("%s is a zarr url", (url) => {
    expect(isZarrUrl(url)).toBe(true);
  });

  test.each([
    "https://dandiarchive.s3.amazonaws.com/zarr/427771c5-9047-4d99-bc48-a26ea3e1e56d/",
    "https://host/data/brain.nii.gz",
    "https://host/data/zarr.nii",
    "https://host/data?file=brain.zarr",
    "",
  ])("%s is not", (url) => {
    expect(isZarrUrl(url)).toBe(false);
  });
});

describe("resolveZarrUrl", () => {
  test("makes a relative url absolute and drops trailing slashes", () => {
    expect(resolveZarrUrl("data/brain.zarr/")).toBe(
      new URL("data/brain.zarr", document.baseURI).href,
    );
  });

  test("keeps the query, drops the fragment", () => {
    expect(resolveZarrUrl("https://host/a.zarr/?t=1#frag")).toBe(
      "https://host/a.zarr?t=1",
    );
  });
});

describe("probeZarr", () => {
  /** Stub fetch with a map of url suffix -> body; anything else is a 404. */
  function stubFetch(files: Record<string, string>) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        calls.push(input);
        const key = Object.keys(files).find((k) => input.endsWith(k));
        return key
          ? new Response(files[key], { status: 200 })
          : new Response("not found", { status: 404 });
      }),
    );
    return calls;
  }

  test("v3: zarr.json with zarr_format 3", async () => {
    stubFetch({ "/zarr.json": '{"zarr_format":3,"node_type":"group"}' });
    expect(await probeZarr("https://host/store/")).toBe(3);
  });

  test("v2: falls back to .zgroup, then .zattrs", async () => {
    const calls = stubFetch({ "/.zattrs": '{"multiscales":[]}' });
    expect(await probeZarr("https://host/store")).toBe(2);
    expect(calls).toEqual([
      "https://host/store/zarr.json",
      "https://host/store/.zgroup",
      "https://host/store/.zattrs",
    ]);
  });

  test("an HTML fallback page (200 for any path) is not a store", async () => {
    stubFetch({
      "/zarr.json": "<!doctype html><html></html>",
      "/.zgroup": "<!doctype html><html></html>",
      "/.zattrs": "<!doctype html><html></html>",
    });
    expect(await probeZarr("https://host/brain.nii.gz")).toBeNull();
  });

  test("a network failure is not a store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await probeZarr("https://host/store")).toBeNull();
  });
});

describe("describeZarr", () => {
  test("summarises levels, channels and the default level", async () => {
    const d = await describeZarr("https://host/a.zarr/");
    expect(zarrModule.fetchOmeZarr).toHaveBeenCalledWith(
      "https://host/a.zarr",
      undefined,
    );
    expect(d.url).toBe("https://host/a.zarr");
    expect(d.name).toBe("sample");
    expect(d.channels).toEqual(["DAPI", "GFP"]);
    expect(d.timepoints).toBe(1);
    expect(d.defaultLevel).toBe(1);
    expect(d.levels.map((l) => l.level)).toEqual([0, 1, 2]);
    expect(d.levels[1]).toEqual({
      level: 1,
      dims: [200, 200, 50],
      spacingUm: [2, 2, 4],
      dtype: "uint16",
      channelBytes: 4 * MiB,
    });
  });

  test("passes the level budget to the default-level pick", async () => {
    await describeZarr("https://host/a.zarr", 8 * MiB);
    expect(zarrModule.defaultOmeZarrLevel).toHaveBeenCalledWith(source, 8 * MiB);
  });

  test("a store that does not open rejects", async () => {
    zarrModule.fetchOmeZarr.mockRejectedValue(new Error("no multiscales"));
    await expect(describeZarr("https://host/a.zarr")).rejects.toThrow(
      "no multiscales",
    );
  });
});

describe("loadZarrLevel", () => {
  test("adds one volume per channel at the default level, keeping the scene", async () => {
    const nv = new NiiVue();
    await nv.addVolume({ url: "orig.nii.gz" });
    const loadVolumes = vi.spyOn(nv, "loadVolumes");

    const loaded = await loadZarrLevel(asNv(nv), "https://host/a.zarr");

    expect(zarrModule.omeZarrVolumesFrom).toHaveBeenCalledWith(source, {
      level: 1,
    });
    expect(loadVolumes).not.toHaveBeenCalled();
    expect(nv.volumes.map((v) => v.name)).toEqual([
      "orig.nii.gz",
      "sample DAPI",
      "sample GFP",
    ]);
    expect(loaded.level).toBe(1);
    expect(loaded.volumeIds).toEqual([nv.volumes[1].id, nv.volumes[2].id]);
  });

  test("an explicit level and channel subset are passed through", async () => {
    const nv = new NiiVue();
    const loaded = await loadZarrLevel(asNv(nv), "https://host/a.zarr", {
      level: 2,
      channels: [1],
    });
    expect(zarrModule.omeZarrVolumesFrom).toHaveBeenCalledWith(source, {
      level: 2,
      channels: [1],
    });
    expect(nv.volumes.map((v) => v.name)).toEqual(["sample GFP"]);
    expect(loaded.level).toBe(2);
    expect(loaded.volumeIds).toHaveLength(1);
  });

  test("names fall back to the .zarr segment, then to the channel alone", async () => {
    zarrModule.fetchOmeZarr.mockResolvedValue({
      ...source,
      info: { name: null },
      channelCount: 1,
    });
    zarrModule.omeZarrVolumesFrom.mockResolvedValue([{ url: "f", name: "x" }]);
    const nv = new NiiVue();
    await loadZarrLevel(asNv(nv), "https://host/data/brain.ome.zarr/0");
    await loadZarrLevel(asNv(nv), "https://host/zarr/1234/");
    expect(nv.volumes.map((v) => v.name)).toEqual(["brain.ome.zarr", "DAPI"]);
  });

  test("a known zarr version is passed to the open, not to the read", async () => {
    const nv = new NiiVue();
    await loadZarrLevel(asNv(nv), "https://host/a.zarr", { zarrVersion: 2 });
    expect(zarrModule.fetchOmeZarr).toHaveBeenCalledWith("https://host/a.zarr", {
      zarrVersion: 2,
    });
    expect(zarrModule.omeZarrVolumesFrom).toHaveBeenCalledWith(source, {
      level: 1,
    });
  });

  test("a failed read adds nothing", async () => {
    zarrModule.omeZarrVolumesFrom.mockRejectedValue(new Error("unsupported dtype"));
    const nv = new NiiVue();
    await expect(loadZarrLevel(asNv(nv), "https://host/a.zarr")).rejects.toThrow(
      "unsupported dtype",
    );
    expect(nv.volumes).toHaveLength(0);
  });
});
