import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@niivue/niivue", () => import("@/__mocks__/niivue"));

import { DRAG_MODE, NiiVue } from "@/__mocks__/niivue";
import { useFreeBrowseStore } from "@/store";
import { useDeepZoom } from "./use-deep-zoom";

type Ref = Parameters<typeof useDeepZoom>[0];
const refOf = (nv: NiiVue) => ({ current: nv }) as unknown as Ref;

/** A viewer showing a long streamed volume, zoomed to `zoom` in pan/zoom mode. */
function viewer(zoom: number, hit: { isRender: boolean } | null = { isRender: false }) {
  const nv = new NiiVue();
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  nv.volumes.push({ id: "v", dimsRAS: [3, 16340, 2048, 2048] });
  Object.assign(nv, {
    canvas,
    pan2Dxyzmm: [0, 0, 0, zoom],
    effectiveDevicePixelRatio: 1,
    hitTest: () => hit,
    getCrosshairPos: () => [100, 50, 25],
  });
  Object.assign(nv.model, { extentsMin: [0, 0, 0], extentsMax: [200, 100, 50] });
  nv.secondaryDragMode = DRAG_MODE.pan;
  return { nv, canvas };
}

/** One wheel notch on the canvas; returns the event so its handling can be read. */
function notch(canvas: HTMLCanvasElement, deltaY: number) {
  const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
  canvas.dispatchEvent(event);
  return event;
}
const zoomOf = (nv: NiiVue) => (nv as unknown as { pan2Dxyzmm: number[] }).pan2Dxyzmm[3];

beforeEach(() => {
  useFreeBrowseStore.setState({ appMode: "zarr" });
});

afterEach(() => {
  useFreeBrowseStore.setState({ appMode: "default" });
  document.body.innerHTML = "";
});

describe("useDeepZoom", () => {
  test("at niivue's limit a notch inward zooms on and is kept from niivue", () => {
    const { nv, canvas } = viewer(10);
    const reachedCanvas = vi.fn();
    canvas.addEventListener("wheel", reachedCanvas);
    renderHook(() => useDeepZoom(refOf(nv)));
    const event = notch(canvas, -100);
    expect(zoomOf(nv)).toBeCloseTo(11);
    expect(event.defaultPrevented).toBe(true);
    expect(reachedCanvas).not.toHaveBeenCalled();
  });

  test("above the limit a notch outward steps back", () => {
    const { nv, canvas } = viewer(110);
    renderHook(() => useDeepZoom(refOf(nv)));
    notch(canvas, 100);
    expect(zoomOf(nv)).toBeCloseTo(100);
  });

  test("below the limit the wheel is left to niivue", () => {
    const { nv, canvas } = viewer(5);
    const reachedCanvas = vi.fn();
    canvas.addEventListener("wheel", reachedCanvas);
    renderHook(() => useDeepZoom(refOf(nv)));
    const event = notch(canvas, -100);
    expect(zoomOf(nv)).toBe(5);
    expect(event.defaultPrevented).toBe(false);
    expect(reachedCanvas).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["in windowing mode", (nv: NiiVue) => { nv.secondaryDragMode = DRAG_MODE.windowing; }],
    ["in the default view", () => useFreeBrowseStore.setState({ appMode: "default" })],
  ])("%s the wheel is niivue's at any zoom", (_name, arrange) => {
    const { nv, canvas } = viewer(10);
    arrange(nv);
    renderHook(() => useDeepZoom(refOf(nv)));
    expect(notch(canvas, -100).defaultPrevented).toBe(false);
    expect(zoomOf(nv)).toBe(10);
  });

  test("over the 3D render the wheel is niivue's", () => {
    const { nv, canvas } = viewer(10, { isRender: true });
    renderHook(() => useDeepZoom(refOf(nv)));
    expect(notch(canvas, -100).defaultPrevented).toBe(false);
    expect(zoomOf(nv)).toBe(10);
  });

  test("a wheel elsewhere on the page is not touched", () => {
    const { nv } = viewer(10);
    renderHook(() => useDeepZoom(refOf(nv)));
    const event = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(zoomOf(nv)).toBe(10);
  });

  test("unmounting gives the wheel back", () => {
    const { nv, canvas } = viewer(10);
    const { unmount } = renderHook(() => useDeepZoom(refOf(nv)));
    unmount();
    expect(notch(canvas, -100).defaultPrevented).toBe(false);
  });
});
