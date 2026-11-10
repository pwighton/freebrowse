import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NiiVue } from "@/__mocks__/niivue";
import { useFreeBrowseStore } from "@/store";
import { useZarrStream, zarrParamsFromLocation } from "./use-zarr-stream";

const zarr = vi.hoisted(() => ({ streamZarr: vi.fn() }));
vi.mock("@/lib/zarr", () => zarr);

type StreamRef = Parameters<typeof useZarrStream>[0];
const refOf = (nv: NiiVue) => ({ current: nv }) as unknown as StreamRef;

const description = { url: "https://host/a.zarr", channels: ["c0"] };
const handle = { setFocus: vi.fn() };

function withCanvas() {
  const nv = new NiiVue();
  (nv as unknown as { canvas: unknown }).canvas = {};
  return nv;
}

beforeEach(() => {
  useFreeBrowseStore.setState({
    appMode: "zarr",
    zarrStream: null,
    urlLoadStatus: { state: "idle" },
    showUploader: true,
    currentImageIndex: null,
  });
  zarr.streamZarr.mockReset().mockImplementation(async (nv: NiiVue) => {
    await nv.addVolume({ url: "streamed://1", name: "a" });
    return {
      description,
      volume: handle,
      volumeId: nv.volumes[0].id,
      channel: 0,
    };
  });
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  useFreeBrowseStore.setState({ appMode: "default", zarrStream: null });
});

describe("zarrParamsFromLocation", () => {
  test.each([
    [{ hash: "#/zarr?zarr=https://h/s/", search: "" }, { url: "https://h/s/" }],
    [{ hash: "#/zarr", search: "?zarr=https://h/s/" }, { url: "https://h/s/" }],
    [{ hash: "#/zarr?url=https://h/s/", search: "" }, { url: "https://h/s/" }],
    [{ hash: "", search: "?zarr=a%2Fb.zarr" }, { url: "a/b.zarr" }],
    [{ hash: "#/zarr?zarr=inner", search: "?zarr=outer" }, { url: "inner" }],
    [
      { hash: "", search: "?zarr=https://h/s/&cmap=gold" },
      { url: "https://h/s/", colormap: "gold" },
    ],
    [{ hash: "#/zarr", search: "" }, null],
    [{ hash: "", search: "?vol=x.nii.gz" }, null],
  ])("%o -> %o", (location, expected) => {
    expect(zarrParamsFromLocation(location)).toEqual(expected);
  });
});

describe("useZarrStream", () => {
  test("opening a store streams it and records the stream", async () => {
    const nv = withCanvas();
    const { result } = renderHook(() => useZarrStream(refOf(nv)));
    let error: string | null = "unset";
    await act(async () => {
      error = await result.current.openZarrStore("  https://host/a.zarr ");
    });
    expect(error).toBeNull();
    expect(zarr.streamZarr).toHaveBeenCalledWith(nv, "https://host/a.zarr", {});
    const state = useFreeBrowseStore.getState();
    expect(state.zarrStream).toEqual({
      description,
      volumeId: nv.volumes[0].id,
      channel: 0,
    });
    expect(result.current.streamRef.current).toBe(handle);
    expect(state.showUploader).toBe(false);
    expect(state.currentImageIndex).toBe(0);
    expect(state.urlLoadStatus).toEqual({ state: "idle" });
  });

  test("a failure is reported and the opener comes back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(state.zarrStream).toBeNull();
  });

  test("blank input does nothing", async () => {
    const nv = withCanvas();
    const { result } = renderHook(() => useZarrStream(refOf(nv)));
    await act(async () => {
      await result.current.openZarrStore("   ");
    });
    expect(zarr.streamZarr).not.toHaveBeenCalled();
  });

  test("in zarr mode the store in the address opens on mount", async () => {
    window.history.replaceState(null, "", "/#/zarr?zarr=https://host/a.zarr");
    const nv = withCanvas();
    renderHook(() => useZarrStream(refOf(nv)));
    await waitFor(() => expect(nv.volumes).toHaveLength(1));
    expect(zarr.streamZarr).toHaveBeenCalledWith(nv, "https://host/a.zarr", {});
  });

  test("cmap= in the address sets the stream's colormap, by niivue's name", async () => {
    window.history.replaceState(
      null,
      "",
      "/zarr?zarr=https://host/a.zarr&cmap=hot",
    );
    const nv = withCanvas();
    renderHook(() => useZarrStream(refOf(nv)));
    await waitFor(() => expect(nv.volumes).toHaveLength(1));
    expect(zarr.streamZarr).toHaveBeenCalledWith(nv, "https://host/a.zarr", {
      colormap: "Hot",
    });
  });

  test("an unknown colormap streams with the default and says so", async () => {
    const nv = withCanvas();
    const { result } = renderHook(() => useZarrStream(refOf(nv)));
    await act(async () => {
      await result.current.openZarrStore("https://host/a.zarr", {
        colormap: "nosuchmap",
      });
    });
    expect(zarr.streamZarr).toHaveBeenCalledWith(nv, "https://host/a.zarr", {});
    expect(nv.volumes).toHaveLength(1);
    expect(useFreeBrowseStore.getState().urlLoadStatus).toEqual({
      state: "error",
      url: "https://host/a.zarr",
      message: 'Unknown colormap "nosuchmap"; streaming with the default.',
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
