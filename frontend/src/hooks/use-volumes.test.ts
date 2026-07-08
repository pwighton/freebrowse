import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { NiiVueGPU } from "@/__mocks__/niivue.v2";
import { useFreeBrowseStore } from "@/store";
import { useVolumes } from "./use-volumes";

type VolRef = Parameters<typeof useVolumes>[0];
const refOf = (nv: NiiVueGPU) => ({ current: nv }) as unknown as VolRef;
const noop = () => {};

const colormapEvent = (value: string) =>
  ({ target: { value } }) as unknown as React.ChangeEvent<HTMLSelectElement>;

function volumeAt0() {
  const nv = new NiiVueGPU();
  nv.volumes.push({ id: "vol-0", colormap: "gray", opacity: 1 });
  useFreeBrowseStore.setState({ currentImageIndex: 0 });
  return nv;
}

describe("useVolumes — colormap dropdown routing", () => {
  beforeEach(() => {
    useFreeBrowseStore.setState({ currentImageIndex: null });
  });

  test("categorical colormap -> setVolume + setColormapLabel(name)", () => {
    const nv = volumeAt0();
    const setVol = vi.spyOn(nv, "setVolume");
    const setLabel = vi.spyOn(nv, "setColormapLabel");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.handleColormapChange(colormapEvent("freesurfer")));
    expect(setVol).toHaveBeenCalledWith(0, { colormap: "freesurfer" });
    expect(setLabel).toHaveBeenCalledWith(0, "freesurfer");
  });

  test("categorical match is case-insensitive (canonical 'Freesurfer')", () => {
    const nv = volumeAt0();
    const setLabel = vi.spyOn(nv, "setColormapLabel");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.handleColormapChange(colormapEvent("Freesurfer")));
    expect(setLabel).toHaveBeenCalledWith(0, "Freesurfer");
  });

  test("continuous colormap -> setVolume + clears label (setColormapLabel null)", () => {
    const nv = volumeAt0();
    const setVol = vi.spyOn(nv, "setVolume");
    const setLabel = vi.spyOn(nv, "setColormapLabel");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.handleColormapChange(colormapEvent("hot")));
    expect(setVol).toHaveBeenCalledWith(0, { colormap: "hot" });
    expect(setLabel).toHaveBeenCalledWith(0, null);
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

describe("useVolumes — visibility toggle (opacity, by id)", () => {
  beforeEach(() => {
    useFreeBrowseStore.setState({ currentImageIndex: null });
  });

  test("hides a visible volume via opacity 0", () => {
    const nv = new NiiVueGPU();
    nv.volumes.push({ id: "vol-0", opacity: 1 });
    const spy = vi.spyOn(nv, "setVolume");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.toggleImageVisibility("vol-0"));
    expect(spy).toHaveBeenCalledWith(0, { opacity: 0 });
  });

  test("shows a hidden volume via opacity 1", () => {
    const nv = new NiiVueGPU();
    nv.volumes.push({ id: "vol-0", opacity: 0 });
    const spy = vi.spyOn(nv, "setVolume");
    const { result } = renderHook(() => useVolumes(refOf(nv), noop, noop));
    act(() => result.current.toggleImageVisibility("vol-0"));
    expect(spy).toHaveBeenCalledWith(0, { opacity: 1 });
  });
});
