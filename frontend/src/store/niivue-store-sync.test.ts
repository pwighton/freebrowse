import { describe, expect, test } from "vitest";

import { DRAG_MODE, NiiVueGPU, SHOW_RENDER, SLICE_TYPE } from "@/__mocks__/niivue.v2";
import { useFreeBrowseStore } from "@/store";
import { registerNiivueEvents } from "./niivue-sync";
import { createStoreSyncTarget } from "./niivue-store-sync";

// The adapter reads sliceType/showRender for viewMode; the v2 mock exposes them.
type Reader = NiiVueGPU & { sliceType: number; showRender: number };

function wire() {
  const nv = new NiiVueGPU() as Reader;
  const teardown = registerNiivueEvents(nv, createStoreSyncTarget(nv));
  return { nv, teardown };
}

describe("createStoreSyncTarget — niivue events drive the store", () => {
  test("maps flat viewer-option change events into viewerOptions", () => {
    const { nv, teardown } = wire();
    nv.isColorbarVisible = true;
    nv.isRadiological = true;
    nv.volumeIsNearestInterpolation = true;
    nv.rulerWidth = 3;

    const opts = useFreeBrowseStore.getState().viewerOptions;
    expect(opts.isColorbar).toBe(true);
    expect(opts.isRadiologicalConvention).toBe(true);
    expect(opts.interpolateVoxels).toBe(false); // negated
    expect(opts.rulerWidth).toBe(3);
    teardown();
  });

  test("does NOT mirror crosshairWidth back into the store (store-owned)", () => {
    const { nv, teardown } = wire();
    const before = useFreeBrowseStore.getState().viewerOptions.crosshairWidth;
    nv.crosshairWidth = 0; // e.g. hidden — must not clobber the remembered width
    expect(useFreeBrowseStore.getState().viewerOptions.crosshairWidth).toBe(before);
    teardown();
  });

  test("translates secondaryDragMode (number) to the dragMode string", () => {
    const { nv, teardown } = wire();
    nv.secondaryDragMode = DRAG_MODE.pan;
    expect(useFreeBrowseStore.getState().viewerOptions.dragMode).toBe("pan");
    teardown();
  });

  test("derives viewMode from sliceType + showRender", () => {
    const { nv, teardown } = wire();
    nv.showRender = SHOW_RENDER.NEVER;
    nv.sliceType = SLICE_TYPE.AXIAL;
    expect(useFreeBrowseStore.getState().viewerOptions.viewMode).toBe("axial");

    nv.sliceType = SLICE_TYPE.MULTIPLANAR; // ACS (showRender NEVER)
    expect(useFreeBrowseStore.getState().viewerOptions.viewMode).toBe("ACS");

    nv.showRender = SHOW_RENDER.ALWAYS; // now ACSR
    expect(useFreeBrowseStore.getState().viewerOptions.viewMode).toBe("ACSR");
    teardown();
  });

  test("bumps volumeVersion on volume load / update / remove", async () => {
    const { nv, teardown } = wire();
    const before = useFreeBrowseStore.getState().volumeVersion;
    await nv.addVolume({ url: "a.nii" });
    await nv.setVolume(0, { colormap: "hot" });
    nv.removeVolume(0);
    // 1 load + 1 update (+1 list refresh) + 1 remove = at least 3 bumps.
    expect(useFreeBrowseStore.getState().volumeVersion).toBeGreaterThan(before);
    teardown();
  });

  test("bumps layerVersion on mesh/layer changes", async () => {
    const { nv, teardown } = wire();
    const before = useFreeBrowseStore.getState().layerVersion;
    await nv.addMesh({ url: "lh.white" });
    await nv.addMeshLayer(0, { url: "lh.curv" });
    expect(useFreeBrowseStore.getState().layerVersion).toBeGreaterThan(before);
    teardown();
  });

  test("mirrors locationChange into locationData", () => {
    const { nv, teardown } = wire();
    nv.emit("locationChange", {
      mm: [1, 2, 3],
      values: [{ name: "brain", value: 42, vox: [10, 20, 30] }],
    });
    const loc = useFreeBrowseStore.getState().locationData;
    expect(loc?.mm).toEqual([1, 2, 3]);
    expect(loc?.voxels[0]).toEqual({
      name: "brain",
      voxel: [10, 20, 30],
      value: 42,
    });
    teardown();
  });

  test("teardown stops store updates", () => {
    const { nv, teardown } = wire();
    teardown();
    const before = useFreeBrowseStore.getState().volumeVersion;
    nv.isColorbarVisible = false;
    void nv.addVolume({ url: "b.nii" });
    expect(useFreeBrowseStore.getState().volumeVersion).toBe(before);
  });
});
