import { useEffect } from "react";
import { useFreeBrowseStore } from "@/store";
import { DRAG_MODE } from "@niivue/niivue";
import type { NiiVue } from "@niivue/niivue";
import {
  deepZoomLimit,
  nextDeepZoom,
  panToHoldAnchor,
} from "@/lib/deep-zoom";

/**
 * Let the wheel zoom a slice past niivue's 10x limit in the zarr view (see
 * `lib/deep-zoom.ts`). Applies where niivue's own wheel zoom does: in pan/zoom
 * mode, over a 2D slice. Inert in the default view.
 */
export function useDeepZoom(nvRef: React.RefObject<NiiVue | null>) {
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || useFreeBrowseStore.getState().appMode !== "zarr") return;

    const onWheel = (event: WheelEvent) => {
      const canvas = nv.canvas;
      if (!canvas || event.target !== canvas || event.deltaY === 0) return;
      if (nv.secondaryDragMode !== DRAG_MODE.pan) return;
      const base = nv.volumes[0];
      const dims = base?.dimsRAS;
      if (!dims) return;

      const direction = event.deltaY < 0 ? 1 : -1;
      const pan = nv.pan2Dxyzmm;
      const zoom = nextDeepZoom(
        pan[3],
        direction,
        deepZoomLimit([dims[1], dims[2], dims[3]]),
      );
      if (zoom === null) return; // niivue's range: its own handler takes it

      // Only over a slice: on the 3D render the wheel is niivue's.
      const rect = canvas.getBoundingClientRect();
      const scale = nv.effectiveDevicePixelRatio;
      const hit = nv.hitTest(
        (event.clientX - rect.left) * scale,
        (event.clientY - rect.top) * scale,
      );
      if (!hit || hit.isRender) return;

      // Ours: keep it from niivue (which would clamp to its limit) and from
      // the page (which would scroll).
      event.preventDefault();
      event.stopImmediatePropagation();
      if (zoom === pan[3]) return; // already at the deep limit
      // Hold the crosshair still, as niivue's wheel zoom does by default.
      const [x, y, z] = panToHoldAnchor(
        pan,
        zoom,
        nv.getCrosshairPos(),
        nv.model.extentsMin,
        nv.model.extentsMax,
      );
      nv.pan2Dxyzmm = [x, y, z, zoom];
    };

    // Capture on the window: ahead of niivue's listener on the canvas, and
    // unaffected by niivue replacing the canvas element (a backend switch).
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () =>
      window.removeEventListener("wheel", onWheel, { capture: true });
  }, [nvRef]);
}
