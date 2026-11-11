import { describe, expect, test } from "vitest";

import {
  deepZoomLimit,
  nextDeepZoom,
  NIIVUE_WHEEL_ZOOM_MAX,
  panToHoldAnchor,
} from "./deep-zoom";

describe("deepZoomLimit", () => {
  test("a long volume may zoom until 64 of its voxels span the view", () => {
    expect(deepZoomLimit([16340, 2048, 2048])).toBeCloseTo(255.3, 1);
  });

  test("a small volume keeps niivue's own limit", () => {
    expect(deepZoomLimit([256, 256, 180])).toBe(NIIVUE_WHEEL_ZOOM_MAX);
    expect(deepZoomLimit([])).toBe(NIIVUE_WHEEL_ZOOM_MAX);
  });
});

describe("nextDeepZoom", () => {
  const limit = 255;

  test("below niivue's limit the wheel is niivue's", () => {
    expect(nextDeepZoom(1, 1, limit)).toBeNull();
    expect(nextDeepZoom(9, 1, limit)).toBeNull();
    expect(nextDeepZoom(5, -1, limit)).toBeNull();
  });

  test("at the limit a notch inward carries on in 10% steps", () => {
    expect(nextDeepZoom(10, 1, limit)).toBeCloseTo(11);
    // niivue keeps the zoom in a Float32Array: 10 can come back a hair off.
    expect(nextDeepZoom(Math.fround(9.9999), 1, limit)).toBeCloseTo(11, 2);
    expect(nextDeepZoom(100, 1, limit)).toBeCloseTo(110);
  });

  test("it stops at the deep limit", () => {
    expect(nextDeepZoom(250, 1, limit)).toBe(255);
    expect(nextDeepZoom(255, 1, limit)).toBe(255);
  });

  test("a notch outward steps back and lands exactly on niivue's limit", () => {
    expect(nextDeepZoom(110, -1, limit)).toBeCloseTo(100);
    expect(nextDeepZoom(10.5, -1, limit)).toBe(10);
    // From there on outward it is niivue's again.
    expect(nextDeepZoom(10, -1, limit)).toBeNull();
  });

  test("a volume with no deeper limit is left to niivue entirely", () => {
    expect(nextDeepZoom(10, 1, NIIVUE_WHEEL_ZOOM_MAX)).toBeNull();
    expect(nextDeepZoom(Number.NaN, 1, limit)).toBeNull();
  });
});

describe("panToHoldAnchor", () => {
  const min = [0, 0, 0];
  const max = [200, 100, 50];
  /** Where a scene point lands in a slice view: offset from the view centre, in view widths. */
  const onScreen = (point: number[], pan: number[], zoom: number, axis: number) => {
    const centre = (min[axis] + max[axis]) / 2 - pan[axis];
    return ((point[axis] - centre) * zoom) / (max[axis] - min[axis]);
  };

  test("the anchor stays where it was on screen", () => {
    const anchor = [150, 20, 40];
    const pan = [10, -5, 2, 10];
    const next = panToHoldAnchor(pan, 40, anchor, min, max);
    for (const axis of [0, 1, 2]) {
      expect(onScreen(anchor, next, 40, axis)).toBeCloseTo(
        onScreen(anchor, pan, 10, axis),
      );
    }
  });

  test("an anchor at the centre of an unpanned view needs no pan", () => {
    expect(panToHoldAnchor([0, 0, 0, 10], 20, [100, 50, 25], min, max)).toEqual([
      0, 0, 0,
    ]);
  });

  test("a zoom that is not a number changes nothing", () => {
    expect(panToHoldAnchor([3, 4, 5, 10], Number.NaN, [1, 1, 1], min, max)).toEqual([
      3, 4, 5,
    ]);
  });
});
