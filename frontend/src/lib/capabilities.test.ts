import { describe, expect, test } from "vitest";

import { capabilitiesFor, rightDragModeFor } from "./capabilities";

describe("capabilitiesFor", () => {
  test("the default view offers everything", () => {
    expect(Object.values(capabilitiesFor("default"))).not.toContain(false);
  });

  test("the zarr view switches off everything that needs voxels in memory", () => {
    expect(capabilitiesFor("zarr")).toEqual({
      fileUpload: false,
      drawing: false,
      save: false,
      ai: false,
      surfaces: false,
      backendBrowse: false,
    });
  });
});

describe("rightDragModeFor", () => {
  test("the zarr view takes windowing where the default view has contrast", () => {
    expect(rightDragModeFor("zarr", "contrast")).toBe("windowing");
    expect(rightDragModeFor("default", "windowing")).toBe("contrast");
  });

  test("a mode both views offer is kept", () => {
    expect(rightDragModeFor("zarr", "pan")).toBe("pan");
    expect(rightDragModeFor("default", "pan")).toBe("pan");
    expect(rightDragModeFor("default", "contrast")).toBe("contrast");
  });
});
