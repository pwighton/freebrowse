import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@niivue/niivue", () => import("@/__mocks__/niivue"));

import { NiiVue, SLICE_TYPE } from "@/__mocks__/niivue";
import { useFreeBrowseStore } from "@/store";
import {
  useZarrStream,
  viewCentreFraction,
  zarrParamsFromLocation,
} from "./use-zarr-stream";

const zarr = vi.hoisted(() => ({
  streamZarr: vi.fn(),
  describeZarr: vi.fn(),
}));
vi.mock("@/lib/zarr", () => zarr);

type StreamRef = Parameters<typeof useZarrStream>[0];
const refOf = (nv: NiiVue) => ({ current: nv }) as unknown as StreamRef;

/** A store's description; `dims` is its finest level's grid. */
const describe_ = (url: string, dims = [100, 80, 60]) => ({
  url,
  channels: ["c0", "c1"],
  timepoints: 1,
  zarrVersion: 2,
  levels: [{ level: 0, dims }],
});

/** niivue's handle on a stream, as far as the hook drives it. */
const handles = new Map<string, { setFocus: ReturnType<typeof vi.fn> }>();

function withCanvas() {
  const nv = new NiiVue();
  Object.assign(nv, {
    canvas: {},
    pan2Dxyzmm: [0, 0, 0, 1],
    crosshairPos: [0.5, 0.5, 0.5],
  });
  Object.assign(nv.model, { extentsMin: [0, 0, 0], extentsMax: [200, 100, 50] });
  return nv;
}

const emit = (nv: NiiVue, type: string, detail: unknown) =>
  nv.dispatchEvent(new CustomEvent(type, { detail }));

beforeEach(() => {
  handles.clear();
  useFreeBrowseStore.setState({
    appMode: "zarr",
    zarrStreams: [],
    zarrProgress: null,
    urlLoadStatus: { state: "idle" },
    showUploader: true,
    currentImageIndex: null,
  });
  zarr.describeZarr.mockReset().mockImplementation(async (url: string) => describe_(url));
  zarr.streamZarr
    .mockReset()
    .mockImplementation(
      async (
        nv: NiiVue,
        url: string,
        options: { replace?: boolean; channel?: number; colormap?: string },
      ) => {
        if (options.replace !== false) await nv.removeAllVolumes();
        await nv.addVolume({ url: `streamed://${url}`, name: url, colormap: options.colormap });
        const volumeId = nv.volumes.at(-1)?.id as string;
        const volume = { setFocus: vi.fn() };
        handles.set(volumeId, volume);
        return { description: describe_(url), volume, volumeId, channel: options.channel ?? 0 };
      },
    );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  useFreeBrowseStore.setState({ appMode: "default", zarrStreams: [] });
});

describe("zarrParamsFromLocation", () => {
  test.each([
    [{ hash: "#/zarr?zarr=https://h/s/", search: "" }, [{ url: "https://h/s/" }]],
    [{ hash: "#/zarr", search: "?zarr=https://h/s/" }, [{ url: "https://h/s/" }]],
    [{ hash: "#/zarr?url=https://h/s/", search: "" }, [{ url: "https://h/s/" }]],
    [{ hash: "", search: "?zarr=a%2Fb.zarr" }, [{ url: "a/b.zarr" }]],
    [{ hash: "#/zarr?zarr=inner", search: "?zarr=outer" }, [{ url: "inner" }]],
    [
      { hash: "", search: "?zarr=a&cmap=gold&zarr=b&cmap=red&zarr=c" },
      [{ url: "a", colormap: "gold" }, { url: "b", colormap: "red" }, { url: "c" }],
    ],
    [
      { hash: "", search: "?cmap=gold&zarr=a&zarr=b" },
      [{ url: "a", colormap: "gold" }, { url: "b" }],
    ],
    [{ hash: "#/zarr", search: "" }, []],
    [{ hash: "", search: "?vol=x.nii.gz&cmap=hot" }, []],
  ])("%o -> %o", (location, expected) => {
    expect(zarrParamsFromLocation(location)).toEqual(expected);
  });
});

describe("viewCentreFraction", () => {
  const view = {
    pan: [50, -10, 5, 4],
    extentsMin: [0, 0, 0],
    extentsMax: [200, 100, 50],
    crosshair: [0.1, 0.2, 0.3],
    hoveredSlice: null,
  };

  test("a slice shows the scene centre minus the pan, at the crosshair's depth", () => {
    expect(viewCentreFraction({ ...view, sliceType: SLICE_TYPE.AXIAL })).toEqual([
      0.25, 0.6, 0.3,
    ]);
    expect(viewCentreFraction({ ...view, sliceType: SLICE_TYPE.CORONAL })).toEqual([
      0.25, 0.2, 0.4,
    ]);
    expect(viewCentreFraction({ ...view, sliceType: SLICE_TYPE.SAGITTAL })).toEqual([
      0.1, 0.6, 0.4,
    ]);
  });

  test("multiplanar uses the panel the pointer was last over", () => {
    const multiplanar = { ...view, sliceType: SLICE_TYPE.MULTIPLANAR };
    expect(viewCentreFraction(multiplanar)).toBeNull();
    expect(
      viewCentreFraction({ ...multiplanar, hoveredSlice: SLICE_TYPE.CORONAL }),
    ).toEqual([0.25, 0.2, 0.4]);
  });

  test("the 3D render has no such point", () => {
    expect(viewCentreFraction({ ...view, sliceType: SLICE_TYPE.RENDER })).toBeNull();
  });

  test("a pan past the edge is clamped to the volume", () => {
    expect(
      viewCentreFraction({ ...view, pan: [500, -500, 0, 1], sliceType: SLICE_TYPE.AXIAL }),
    ).toEqual([0, 1, 0.3]);
  });
});

describe("useZarrStream — opening a store", () => {
  test("streams it as the base and records it", async () => {
    const nv = withCanvas();
    const { result } = renderHook(() => useZarrStream(refOf(nv)));
    let error: string | null = "unset";
    await act(async () => {
      error = await result.current.openZarrStore("  https://host/a.zarr ", {
        colormap: "hot",
      });
    });
    expect(error).toBeNull();
    expect(zarr.streamZarr).toHaveBeenCalledWith(nv, "https://host/a.zarr", {
      channel: undefined,
      timepoint: undefined,
      colormap: "Hot",
    });
    const state = useFreeBrowseStore.getState();
    expect(state.zarrStreams).toEqual([
      {
        url: "https://host/a.zarr",
        description: describe_("https://host/a.zarr"),
        volumeId: nv.volumes[0].id,
        channel: 0,
        timepoint: 0,
      },
    ]);
    expect(state.showUploader).toBe(false);
    expect(state.currentImageIndex).toBe(0);
    expect(state.urlLoadStatus).toEqual({ state: "idle" });
  });

  test("a failure is reported and the opener comes back", async () => {
    const notFound = new Error("Not found: v2 group");
    notFound.name = "NotFoundError";
    zarr.streamZarr.mockRejectedValue(notFound);
    const nv = withCanvas();
    const { result } = renderHook(() => useZarrStream(refOf(nv)));
    await act(async () => {
      await result.current.openZarrStore("https://host/nope/");
    });
    const state = useFreeBrowseStore.getState();
    expect(state.urlLoadStatus).toEqual({
      state: "error",
      url: "https://host/nope/",
      message: "No OME-Zarr store found at this URL.",
    });
    expect(state.showUploader).toBe(true);
    expect(state.zarrStreams).toEqual([]);
  });

  test("an unknown colormap streams with the default and says so", async () => {
    const nv = withCanvas();
    const { result } = renderHook(() => useZarrStream(refOf(nv)));
    await act(async () => {
      await result.current.openZarrStore("https://host/a.zarr", {
        colormap: "nosuchmap",
      });
    });
    expect(zarr.streamZarr.mock.calls[0][2]).not.toHaveProperty("colormap");
    expect(nv.volumes).toHaveLength(1);
    expect(useFreeBrowseStore.getState().urlLoadStatus).toEqual({
      state: "error",
      url: "https://host/a.zarr",
      message: 'Unknown colormap "nosuchmap"; streaming with the default.',
    });
  });

  test("blank input does nothing", async () => {
    const nv = withCanvas();
    const { result } = renderHook(() => useZarrStream(refOf(nv)));
    await act(async () => {
      await result.current.openZarrStore("   ");
    });
    expect(zarr.streamZarr).not.toHaveBeenCalled();
  });
});

describe("useZarrStream — a second store on top", () => {
  async function withBase() {
    const nv = withCanvas();
    const hook = renderHook(() => useZarrStream(refOf(nv)));
    await act(async () => {
      await hook.result.current.openZarrStore("https://host/a.zarr");
    });
    return { nv, ...hook };
  }
  const status = () => useFreeBrowseStore.getState().urlLoadStatus;

  test("keeps the base, has no backdrop of its own, and is red by default", async () => {
    const { nv, result } = await withBase();
    await act(async () => {
      await result.current.addZarrStore("https://host/b.zarr");
    });
    expect(zarr.streamZarr).toHaveBeenLastCalledWith(nv, "https://host/b.zarr", {
      channel: undefined,
      timepoint: undefined,
      colormap: "Red",
      zarrVersion: 2,
      replace: false,
      coarseFloor: false,
    });
    expect(nv.volumes).toHaveLength(2);
    const state = useFreeBrowseStore.getState();
    expect(state.zarrStreams.map((s) => s.url)).toEqual([
      "https://host/a.zarr",
      "https://host/b.zarr",
    ]);
    expect(state.currentImageIndex).toBe(1);
    expect(status()).toEqual({ state: "idle" });
  });

  test("needs a base", async () => {
    const nv = withCanvas();
    const { result } = renderHook(() => useZarrStream(refOf(nv)));
    await act(async () => {
      await result.current.addZarrStore("https://host/b.zarr");
    });
    expect(zarr.streamZarr).not.toHaveBeenCalled();
    expect(status()).toMatchObject({ state: "error", message: /Open a store first/ });
  });

  test("a store on another grid is refused, and the base stays", async () => {
    const { nv, result } = await withBase();
    zarr.describeZarr.mockResolvedValue(describe_("https://host/b.zarr", [100, 80, 61]));
    await act(async () => {
      await result.current.addZarrStore("https://host/b.zarr");
    });
    expect(zarr.streamZarr).toHaveBeenCalledTimes(1);
    expect(nv.volumes).toHaveLength(1);
    expect(status()).toMatchObject({ state: "error", message: /different voxel grid/ });
    expect(useFreeBrowseStore.getState().showUploader).toBe(false);
  });

  test("only one: niivue draws none when there are two", async () => {
    const { nv, result } = await withBase();
    await act(async () => {
      await result.current.addZarrStore("https://host/b.zarr");
      await result.current.addZarrStore("https://host/c.zarr");
    });
    expect(nv.volumes).toHaveLength(2);
    expect(status()).toMatchObject({ state: "error", message: /Only one store/ });
  });
});

describe("useZarrStream — the address", () => {
  test("opens every store in order and reports the one too many", async () => {
    window.history.replaceState(
      null,
      "",
      "/#/zarr?zarr=https://host/a.zarr&cmap=hot&zarr=https://host/b.zarr&zarr=https://host/c.zarr",
    );
    const nv = withCanvas();
    renderHook(() => useZarrStream(refOf(nv)));
    await waitFor(() =>
      expect(useFreeBrowseStore.getState().urlLoadStatus.state).toBe("error"),
    );
    expect(nv.volumes.map((v) => [v.name, v.colormap])).toEqual([
      ["https://host/a.zarr", "Hot"],
      ["https://host/b.zarr", "Red"],
    ]);
    expect(useFreeBrowseStore.getState().urlLoadStatus).toMatchObject({
      url: "https://host/c.zarr",
      message: /Only one store/,
    });
  });

  test("in the default view the address is left to the default loader", async () => {
    useFreeBrowseStore.setState({ appMode: "default" });
    window.history.replaceState(null, "", "/?zarr=https://host/a.zarr");
    const nv = withCanvas();
    renderHook(() => useZarrStream(refOf(nv)));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(zarr.streamZarr).not.toHaveBeenCalled();
  });
});

describe("useZarrStream — following niivue", () => {
  async function withTwo() {
    const nv = withCanvas();
    const hook = renderHook(() => useZarrStream(refOf(nv)));
    await act(async () => {
      await hook.result.current.openZarrStore("https://host/a.zarr");
      await hook.result.current.addZarrStore("https://host/b.zarr");
    });
    return { nv, ...hook };
  }
  const urls = () => useFreeBrowseStore.getState().zarrStreams.map((s) => s.url);

  test("removing the store on top leaves the base", async () => {
    const { nv } = await withTwo();
    act(() => nv.removeVolume(1));
    expect(urls()).toEqual(["https://host/a.zarr"]);
    expect(useFreeBrowseStore.getState().showUploader).toBe(false);
  });

  test("removing the base removes everything and brings the opener back", async () => {
    const { nv } = await withTwo();
    await act(async () => nv.removeVolume(0));
    expect(nv.volumes).toHaveLength(0);
    expect(urls()).toEqual([]);
    const state = useFreeBrowseStore.getState();
    expect(state.showUploader).toBe(true);
    expect(state.currentImageIndex).toBeNull();
  });

  test("progress is the bricks still to arrive, cleared when the view settles", async () => {
    const { nv } = await withTwo();
    act(() => emit(nv, "chunkStreamProgress", { pending: 5, inFlight: 2, total: 128 }));
    expect(useFreeBrowseStore.getState().zarrProgress).toEqual({ remaining: 7, total: 128 });
    act(() => emit(nv, "chunkStreamIdle", { pending: 0, inFlight: 0, total: 128 }));
    expect(useFreeBrowseStore.getState().zarrProgress).toBeNull();
  });

  test("after a pan the base stream is focused on the centre of the view", async () => {
    const { nv } = await withTwo();
    const [base, overlay] = nv.volumes.map((v) => handles.get(v.id as string));
    nv.sliceType = SLICE_TYPE.AXIAL;
    Object.assign(nv, { pan2Dxyzmm: [50, -10, 0, 4] });
    emit(nv, "change", { property: "pan2Dxyzmm" });
    await waitFor(() => expect(base?.setFocus).toHaveBeenCalledWith([0.25, 0.6, 0.5]));
    expect(overlay?.setFocus).not.toHaveBeenCalled();
  });

  test("a zoom alone is left to niivue", async () => {
    const { nv } = await withTwo();
    const base = handles.get(nv.volumes[0].id as string);
    nv.sliceType = SLICE_TYPE.AXIAL;
    Object.assign(nv, { pan2Dxyzmm: [0, 0, 0, 1] });
    emit(nv, "change", { property: "pan2Dxyzmm" });
    await new Promise((resolve) => setTimeout(resolve, 350));
    base?.setFocus.mockClear();
    Object.assign(nv, { pan2Dxyzmm: [0, 0, 0, 3] });
    emit(nv, "change", { property: "pan2Dxyzmm" });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(base?.setFocus).not.toHaveBeenCalled();
  });

  test("another channel streams every store again, the chosen one changed", async () => {
    const { nv, result } = await withTwo();
    zarr.streamZarr.mockClear();
    await act(async () => {
      await result.current.selectZarrFrame(nv.volumes[1].id as string, { channel: 1 });
    });
    expect(zarr.streamZarr.mock.calls.map((c) => [c[1], c[2].channel, c[2].colormap])).toEqual([
      ["https://host/a.zarr", 0, undefined],
      ["https://host/b.zarr", 1, "Red"],
    ]);
    expect(useFreeBrowseStore.getState().zarrStreams.map((s) => s.channel)).toEqual([0, 1]);
  });
});
