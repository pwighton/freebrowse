import { useCallback } from "react";
import { useFreeBrowseStore } from "@/store";
import type { NiiVueGPU as Niivue } from "@niivue/niivue";

export function useLocation(nvRef: React.RefObject<Niivue | null>) {
  const setLocationData = useFreeBrowseStore((s) => s.setLocationData);

  const handleLocationChange = useCallback(
    // niivue-mono's `locationChange` event carries per-volume readouts in
    // `detail.values` ({ name, value, vox, mm, ... }), so we no longer recompute
    // via volume.mm2vox/getValue (those helpers are gone from the NVImage type).
    // MIGRATION-TODO(P2): confirm the exact `values[]` field names against
    // NiiVueLocation during the core-viewer verification.
    (locationObject: any) => {
      if (!locationObject || !nvRef.current) return;
      const values: any[] = locationObject.values ?? [];
      const voxelData = values.map((v: any, index: number) => {
        const vox = v.vox ?? [0, 0, 0];
        return {
          name: v.name || `Volume ${index + 1}`,
          voxel: [
            Math.round(vox[0]),
            Math.round(vox[1]),
            Math.round(vox[2]),
          ] as [number, number, number],
          value: v.value,
        };
      });

      setLocationData({
        mm: locationObject.mm,
        voxels: voxelData,
      });
    },
    [nvRef, setLocationData],
  );

  return { handleLocationChange };
}
