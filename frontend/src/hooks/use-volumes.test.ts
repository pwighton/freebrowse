import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { NiiVue } from "@/__mocks__/niivue";
import { useFreeBrowseStore } from "@/store";
import { useVolumes } from "./use-volumes";

type VolRef = Parameters<typeof useVolumes>[0];
const refOf = (nv: NiiVue) => ({ current: nv }) as unknown as VolRef;
const noop = () => {};

const colormapEvent = (value: string) =>
  ({ target: { value } }) as unknown as React.ChangeEvent<HTMLSelectElement>;

function volumeAt0() {
  const nv = new NiiVue();
  nv.volumes.push({ id: "vol-0", colormap: "gray", opacity: 1 });
  useFreeBrowseStore.setState({ currentImageIndex: 0 });
  return nv;
}

describe("useVolumes — colormap dropdown routing", () => {
  beforeEach(() => {
    useFreeBrowseStore.setState({ currentImageIndex: null });
  });

  test("label colormap -> a single setVolume (niivue derives the label LUT)", () => {
    const nv = volumeAt0();
    const setVol = vi.spyOn(nv, "setVolume");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.handleColormapChange(colormapEvent("freesurfer")));
    expect(setVol).toHaveBeenCalledTimes(1);
    expect(setVol).toHaveBeenCalledWith(0, { colormap: "freesurfer" });
  });

  test("continuous colormap -> a single setVolume", () => {
    const nv = volumeAt0();
    const setVol = vi.spyOn(nv, "setVolume");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.handleColormapChange(colormapEvent("hot")));
    expect(setVol).toHaveBeenCalledTimes(1);
    expect(setVol).toHaveBeenCalledWith(0, { colormap: "hot" });
  });

  test("no command when no volume is selected", () => {
    const nv = volumeAt0();
    useFreeBrowseStore.setState({ currentImageIndex: null });
    const setVol = vi.spyOn(nv, "setVolume");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.handleColormapChange(colormapEvent("freesurfer")));
    expect(setVol).not.toHaveBeenCalled();
  });
});

describe("useVolumes — visibility toggle (niivue `visible`, by id)", () => {
  beforeEach(() => {
    useFreeBrowseStore.setState({ currentImageIndex: null });
  });

  test("hides a shown volume with visible: false, leaving opacity alone", () => {
    const nv = new NiiVue();
    nv.volumes.push({ id: "vol-0", opacity: 0.5 });
    const spy = vi.spyOn(nv, "setVolume");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.toggleImageVisibility("vol-0"));
    expect(spy).toHaveBeenCalledWith(0, { visible: false });
    expect(nv.volumes[0].opacity).toBe(0.5);
  });

  test("shows a hidden volume with visible: true; the opacity comes back as it was", () => {
    const nv = new NiiVue();
    nv.volumes.push({ id: "vol-0", opacity: 0.5, visible: false });
    const spy = vi.spyOn(nv, "setVolume");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.toggleImageVisibility("vol-0"));
    expect(spy).toHaveBeenCalledWith(0, { visible: true });
    expect(nv.volumes[0].opacity).toBe(0.5);
    expect(nv.volumes[0].visible).toBe(true);
  });

  test("a volume at opacity 0 is still toggled by the flag, not by opacity", () => {
    const nv = new NiiVue();
    nv.volumes.push({ id: "vol-0", opacity: 0 });
    const spy = vi.spyOn(nv, "setVolume");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.toggleImageVisibility("vol-0"));
    expect(spy).toHaveBeenCalledWith(0, { visible: false });
  });
});

describe("useVolumes — edit volume as drawing", () => {
  beforeEach(() => {
    useFreeBrowseStore.setState({ currentImageIndex: null });
  });

  test("export -> removeVolume -> loadDrawing, carrying the colormap into pen mode", async () => {
    const nv = new NiiVue();
    nv.volumes.push({ id: "vol-0", name: "orig.nii" }); // background
    nv.volumes.push({ id: "vol-1", name: "seg.nii.gz", colormap: "roi_i256" }); // overlay to edit
    useFreeBrowseStore.setState({ currentImageIndex: 1 });
    const saveSpy = vi.spyOn(nv, "saveVolume");
    const rmSpy = vi.spyOn(nv, "removeVolume");
    const loadSpy = vi.spyOn(nv, "loadDrawing");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    await act(async () => {
      await result.current.handleEditVolume(1);
    });
    expect(saveSpy).toHaveBeenCalledWith({ filename: "", volumeByIndex: 1 });
    expect(rmSpy).toHaveBeenCalledWith(1);
    expect((loadSpy.mock.calls[0][0] as File).name).toBe("seg.nii"); // .gz stripped
    expect(nv.drawColormap).toBe("Roi_i256"); // label colormap carried onto the drawing
    expect(nv.drawIsEnabled).toBe(true);
    expect(useFreeBrowseStore.getState().drawingOptions.mode).toBe("pen");
    expect(useFreeBrowseStore.getState().activeTab).toBe("drawing");
  });

  test("a continuous colormap is not carried onto the drawing", async () => {
    const nv = new NiiVue();
    nv.volumes.push({ id: "vol-0", name: "orig.nii" });
    nv.volumes.push({ id: "vol-1", name: "mask.nii.gz", colormap: "Gray" });
    nv.drawColormap = "Draw";
    useFreeBrowseStore.setState({ currentImageIndex: 1 });
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    await act(async () => {
      await result.current.handleEditVolume(1);
    });
    expect(nv.drawColormap).toBe("Draw");
    expect(nv.drawIsEnabled).toBe(true);
    expect(useFreeBrowseStore.getState().activeTab).toBe("drawing");
  });
});
