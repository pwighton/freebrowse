import { describe, expect, test } from "vitest";

import { capabilitiesFor } from "./capabilities";

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
