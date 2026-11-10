import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { NiiVue } from "@/__mocks__/niivue";
import { useFreeBrowseStore } from "@/store";
import { useFileLoading } from "./use-file-loading";

const zarr = vi.hoisted(() => ({
  isZarrUrl: vi.fn(),
  probeZarr: vi.fn(),
  loadZarrLevel: vi.fn(),
}));
vi.mock("@/lib/zarr", () => zarr);

type LoadRef = Parameters<typeof useFileLoading>[0];
const refOf = (nv: NiiVue) => ({ current: nv }) as unknown as LoadRef;
const noop = () => {};

const V9_DOC = { version: 9, scene: {}, layout: {}, clipPlanes: [], volumes: [], meshes: [] };

describe("useFileLoading — loadNvdData", () => {
  test("loads with fill: 'current' so omitted settings keep their values", async () => {
    const nv = new NiiVue();
    const load = vi.spyOn(nv, "loadDocument");
    const { result } = renderHook(() =>
      useFileLoading(refOf(nv), noop, noop, noop),
    );
    const bytes = new TextEncoder().encode(JSON.stringify(V9_DOC));
    await act(() => result.current.loadNvdData(bytes));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][1]).toEqual({ fill: "current" });
    expect(nv.lastLoadDocumentOptions).toEqual({ fill: "current" });
  });

  test("the parsed-object (embedded single-file) path uses the same policy", async () => {
    const nv = new NiiVue();
    const load = vi.spyOn(nv, "loadDocument");
    const { result } = renderHook(() =>
      useFileLoading(refOf(nv), noop, noop, noop),
    );
    await act(() => result.current.loadNvdData(V9_DOC));
    expect(load.mock.calls[0][1]).toEqual({ fill: "current" });
  });

  test("a legacy document is refused before niivue sees it", async () => {
    const nv = new NiiVue();
    const load = vi.spyOn(nv, "loadDocument");
    const { result } = renderHook(() =>
      useFileLoading(refOf(nv), noop, noop, noop),
    );
    const legacy = new TextEncoder().encode(
      JSON.stringify({ encodedImageBlobs: ["AAAA"], imageOptionsArray: [] }),
    );
    await expect(result.current.loadNvdData(legacy)).rejects.toThrow(/predates/);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("useFileLoading — zarr stores", () => {
  const description = {
    url: "https://host/a.zarr",
    levels: [
      { level: 0, spacingUm: [1, 1, 2] },
      { level: 1, spacingUm: [2, 2, 4] },
    ],
  };

  function setup() {
    const nv = new NiiVue();
    (nv as unknown as { canvas: unknown }).canvas = {};
    const addVolume = vi.spyOn(nv, "addVolume");
    const { result } = renderHook(() =>
      useFileLoading(refOf(nv), noop, noop, noop),
    );
    return { nv, addVolume, result };
  }

  beforeEach(() => {
    useFreeBrowseStore.setState({
      zarrVolumes: {},
      urlLoadStatus: { state: "idle" },
      showUploader: true,
      currentImageIndex: null,
    });
    zarr.isZarrUrl.mockReset().mockImplementation((u: string) => /\.zarr/.test(u));
    zarr.probeZarr.mockReset().mockResolvedValue(null);
    zarr.loadZarrLevel
      .mockReset()
      .mockImplementation(async (nv: NiiVue) => {
        await nv.addVolume({ url: "file", name: "a" });
        return { description, level: 1, volumeIds: [nv.volumes.at(-1)?.id] };
      });
  });

  test("a .zarr url loads a whole level and records its origin", async () => {
    const { nv, result } = setup();
    await act(() =>
      result.current.handleImagingFileSelect({
        filename: "a.zarr",
        url: "https://host/a.zarr",
      }),
    );
    expect(zarr.loadZarrLevel).toHaveBeenCalledWith(nv, "https://host/a.zarr", {
      zarrVersion: undefined,
    });
    const state = useFreeBrowseStore.getState();
    expect(state.zarrVolumes[nv.volumes[0].id as string]).toEqual({
      url: "https://host/a.zarr",
      level: 1,
      levelCount: 2,
      spacingUm: [2, 2, 4],
    });
    expect(state.urlLoadStatus).toEqual({ state: "idle" });
    expect(state.showUploader).toBe(false);
    expect(state.currentImageIndex).toBe(0);
  });

  test("a plain volume url still goes to addVolume", async () => {
    const { addVolume, result } = setup();
    await act(() =>
      result.current.handleImagingFileSelect({
        filename: "dir/brain.nii.gz",
        url: "https://host/dir/brain.nii.gz",
      }),
    );
    expect(zarr.loadZarrLevel).not.toHaveBeenCalled();
    expect(addVolume).toHaveBeenCalledWith({
      url: "https://host/dir/brain.nii.gz",
      name: "brain.nii.gz",
    });
  });

  test("the zarr flag forces the zarr path for a url without .zarr", async () => {
    const { result } = setup();
    await act(() =>
      result.current.handleImagingFileSelect({
        filename: "x",
        url: "https://host/zarr/1234/",
        zarr: true,
        zarrVersion: 2,
      }),
    );
    expect(zarr.loadZarrLevel).toHaveBeenCalledWith(
      expect.anything(),
      "https://host/zarr/1234/",
      { zarrVersion: 2 },
    );
  });

  test("a failed load reports the error and brings the drop zone back", async () => {
    zarr.loadZarrLevel.mockRejectedValue(new Error("unsupported dtype int64"));
    const { result } = setup();
    await act(() =>
      result.current.handleImagingFileSelect({
        filename: "a.zarr",
        url: "https://host/a.zarr",
      }),
    );
    const state = useFreeBrowseStore.getState();
    expect(state.urlLoadStatus).toEqual({
      state: "error",
      url: "https://host/a.zarr",
      message: "unsupported dtype int64",
    });
    expect(state.showUploader).toBe(true);
  });

  test("a fetch failure is explained as network or CORS", async () => {
    zarr.loadZarrLevel.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = setup();
    await act(() =>
      result.current.handleImagingFileSelect({
        filename: "a.zarr",
        url: "https://host/a.zarr",
      }),
    );
    const status = useFreeBrowseStore.getState().urlLoadStatus;
    expect(status.state === "error" && status.message).toMatch(/cross-origin/);
  });

  test("a missing store is reported in plain words", async () => {
    const notFound = new Error("Not found: v2 group");
    notFound.name = "NotFoundError";
    zarr.loadZarrLevel.mockRejectedValue(notFound);
    const { result } = setup();
    await act(() =>
      result.current.handleImagingFileSelect({
        filename: "a.zarr",
        url: "https://host/a.zarr",
      }),
    );
    const status = useFreeBrowseStore.getState().urlLoadStatus;
    expect(status.state === "error" && status.message).toBe(
      "No OME-Zarr store found at this URL.",
    );
  });

  test("typed url: .zarr skips the probe", async () => {
    const { result } = setup();
    await act(() => result.current.handleUrlLoad("  https://host/a.zarr  "));
    expect(zarr.probeZarr).not.toHaveBeenCalled();
    expect(zarr.loadZarrLevel).toHaveBeenCalledWith(
      expect.anything(),
      "https://host/a.zarr",
      { zarrVersion: undefined },
    );
  });

  test("typed url: a store served by id is found by probing", async () => {
    zarr.probeZarr.mockResolvedValue(2);
    const { result } = setup();
    await act(() => result.current.handleUrlLoad("https://host/zarr/1234/"));
    expect(zarr.loadZarrLevel).toHaveBeenCalledWith(
      expect.anything(),
      "https://host/zarr/1234/",
      { zarrVersion: 2 },
    );
  });

  test("typed url: anything else loads as a volume, named by its last segment", async () => {
    const { addVolume, result } = setup();
    await act(() =>
      result.current.handleUrlLoad("https://host/d/brain.nii.gz?x=1"),
    );
    expect(zarr.loadZarrLevel).not.toHaveBeenCalled();
    expect(addVolume).toHaveBeenCalledWith({
      url: "https://host/d/brain.nii.gz?x=1",
      name: "brain.nii.gz",
    });
  });

  test("typed url: blank input does nothing", async () => {
    const { addVolume, result } = setup();
    await act(() => result.current.handleUrlLoad("   "));
    expect(addVolume).not.toHaveBeenCalled();
    expect(zarr.probeZarr).not.toHaveBeenCalled();
  });
});
