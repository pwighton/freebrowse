import { describe, expect, test } from "vitest";

// Phase 2a smoke test: verify the file:-linked niivue-mono build resolves and
// loads, exposing the new API surface FreeBrowse will migrate onto. This file
// deliberately does NOT mock "@niivue/niivue" (unlike the app's unit tests), so
// it imports the real linked bundle. Safe to delete once the app compiles
// against the new API in 2b, or keep as a link-health check.
import NiiVueGPU, { DRAG_MODE, SHOW_RENDER, SLICE_TYPE } from "@niivue/niivue";

describe("niivue-mono link (Phase 2a smoke)", () => {
  test("default export is the NiiVueGPU controller class", () => {
    expect(typeof NiiVueGPU).toBe("function");
  });

  test("enums are exported from the '.' entry with expected values", () => {
    expect(SLICE_TYPE.AXIAL).toBe(0);
    expect(SLICE_TYPE.RENDER).toBe(4);
    expect(SHOW_RENDER.NEVER).toBe(0);
    expect(DRAG_MODE.pan).toBeDefined();
  });
});
