import { describe, expect, test } from "vitest";

import { budgetPlanFor, DEFAULT_ZARR_SETTINGS } from "./zarr-settings";

const GiB = 1024 ** 3;

describe("budgetPlanFor", () => {
  test("the defaults are niivue's focus plan with the given memory", () => {
    expect(budgetPlanFor(DEFAULT_ZARR_SETTINGS, 2 * GiB)).toEqual({
      focus: "crosshair",
      radius: "auto",
      detail: 1,
      budgetBytes: 2 * GiB,
      maxBricks: 240,
    });
  });

  test("each preset brings its own focus and brick ceiling", () => {
    const plan = (detailPreset: "interactive" | "uniform") =>
      budgetPlanFor({ ...DEFAULT_ZARR_SETTINGS, detailPreset }, GiB);
    expect(plan("interactive")).toMatchObject({ focus: "crosshair", maxBricks: 128 });
    expect(plan("uniform")).toMatchObject({ focus: "none", radius: "volume", maxBricks: 240 });
  });

  test("a brick ceiling of the user's replaces the preset's, within limits", () => {
    const bricks = (maxBricks: number) =>
      budgetPlanFor({ ...DEFAULT_ZARR_SETTINGS, maxBricks }, GiB).maxBricks;
    expect(bricks(64)).toBe(64);
    expect(bricks(5000)).toBe(1000);
    expect(bricks(1)).toBe(16);
  });

  test("the falloff is kept between its limits", () => {
    const detail = (detailFalloff: number) =>
      budgetPlanFor({ ...DEFAULT_ZARR_SETTINGS, detailFalloff }, GiB).detail;
    expect(detail(0.5)).toBe(0.5);
    expect(detail(3)).toBe(1);
    expect(detail(0)).toBe(0.25);
    expect(detail(Number.NaN)).toBe(1);
  });

  test("an unknown preset (settings from another build) falls back to focus", () => {
    const settings = { ...DEFAULT_ZARR_SETTINGS, detailPreset: "nope" as "focus" };
    expect(budgetPlanFor(settings, GiB)).toMatchObject({ focus: "crosshair", maxBricks: 240 });
  });
});
