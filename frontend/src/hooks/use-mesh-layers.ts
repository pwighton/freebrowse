import { useCallback, useEffect, useRef } from "react";
import { useFreeBrowseStore } from "@/store";
import { type NiiVueGPU as Niivue } from "@niivue/niivue";

export function useMeshLayers(
  nvRef: React.RefObject<Niivue | null>,
) {
  const currentSurfaceIndex = useFreeBrowseStore((s) => s.currentSurfaceIndex);
  const selectedLayerIndex = useFreeBrowseStore((s) => s.selectedLayerIndex);
  const setSelectedLayerIndex = useFreeBrowseStore((s) => s.setSelectedLayerIndex);
  const layerVersion = useFreeBrowseStore((s) => s.layerVersion);
  const incrementLayerVersion = useFreeBrowseStore((s) => s.incrementLayerVersion);

  const layerFileInputRef = useRef<HTMLInputElement>(null);

  // Reset layer selection when surface changes
  useEffect(() => {
    setSelectedLayerIndex(null);
  }, [currentSurfaceIndex, setSelectedLayerIndex]);

  const getLayers = useCallback(() => {
    // Consume layerVersion to trigger re-renders on mutation
    void layerVersion;
    const nv = nvRef.current;
    if (!nv || currentSurfaceIndex === null || !nv.meshes[currentSurfaceIndex]) {
      return [];
    }
    // MIGRATION-TODO(P3): restore the layer-name backfill workaround (name/url
    // properties) once mesh layers are reimplemented against niivue-mono.
    const layers = nv.meshes[currentSurfaceIndex].layers || [];
    return layers;
  }, [nvRef, currentSurfaceIndex, layerVersion]);

  const addLayerFromFile = useCallback(
    async (file: File) => {
      // MIGRATION-TODO(P3): reimplement layer loading against niivue-mono
      // (was NVMesh.loadLayer + layer-name backfill + mesh.updateMesh(nv.gl)),
      // then incrementLayerVersion + setSelectedLayerIndex on success.
      console.warn("addLayerFromFile: disabled during niivue-mono migration (P3)");
      void file;
    },
    [nvRef, currentSurfaceIndex, incrementLayerVersion, setSelectedLayerIndex],
  );

  const removeLayer = useCallback(
    (layerIndex: number) => {
      const nv = nvRef.current;
      if (!nv || currentSurfaceIndex === null || !nv.meshes[currentSurfaceIndex]) {
        return;
      }
      const mesh = nv.meshes[currentSurfaceIndex];
      mesh.layers.splice(layerIndex, 1);
      // MIGRATION-TODO(P3): re-upload mesh to GPU after layer removal
      // (was mesh.updateMesh(nv.gl) + nv.updateGLVolume()).
      console.warn("removeLayer: GPU refresh disabled during niivue-mono migration (P3)");
      incrementLayerVersion();

      // Adjust selection
      if (selectedLayerIndex === layerIndex) {
        setSelectedLayerIndex(null);
      } else if (selectedLayerIndex !== null && selectedLayerIndex > layerIndex) {
        setSelectedLayerIndex(selectedLayerIndex - 1);
      }
    },
    [nvRef, currentSurfaceIndex, selectedLayerIndex, incrementLayerVersion, setSelectedLayerIndex],
  );

  const handleLayerOpacityChange = useCallback(
    (value: number) => {
      // MIGRATION-TODO(P3): apply layer opacity via the new setMeshLayerProperty
      // signature (was nv.setMeshLayerProperty(mesh.id, layerIndex, "opacity", value)).
      console.warn("handleLayerOpacityChange: disabled during niivue-mono migration (P3)");
      void value;
    },
    [nvRef, currentSurfaceIndex, selectedLayerIndex, incrementLayerVersion],
  );

  const handleLayerCalMinChange = useCallback(
    (value: number) => {
      // MIGRATION-TODO(P3): apply layer cal_min via the new setMeshLayerProperty
      // signature (was nv.setMeshLayerProperty(mesh.id, layerIndex, "cal_min", value)).
      console.warn("handleLayerCalMinChange: disabled during niivue-mono migration (P3)");
      void value;
    },
    [nvRef, currentSurfaceIndex, selectedLayerIndex, incrementLayerVersion],
  );

  const handleLayerCalMaxChange = useCallback(
    (value: number) => {
      // MIGRATION-TODO(P3): apply layer cal_max via the new setMeshLayerProperty
      // signature (was nv.setMeshLayerProperty(mesh.id, layerIndex, "cal_max", value)).
      console.warn("handleLayerCalMaxChange: disabled during niivue-mono migration (P3)");
      void value;
    },
    [nvRef, currentSurfaceIndex, selectedLayerIndex, incrementLayerVersion],
  );

  const handleLayerColormapChange = useCallback(
    async (colormap: string) => {
      // MIGRATION-TODO(P3): apply layer colormap via the new mesh layer API
      // (was mesh.setLayerProperty(layerIndex, "colormap", value, nv.gl) + nv.updateGLVolume()).
      console.warn("handleLayerColormapChange: disabled during niivue-mono migration (P3)");
      void colormap;
    },
    [nvRef, currentSurfaceIndex, selectedLayerIndex, incrementLayerVersion],
  );

  const handleLayerUseNegativeCmapChange = useCallback(
    async (checked: boolean) => {
      // MIGRATION-TODO(P3): apply layer useNegativeCmap via the new mesh layer API
      // (was mesh.setLayerProperty(layerIndex, "useNegativeCmap", value, nv.gl) + nv.updateGLVolume()).
      console.warn("handleLayerUseNegativeCmapChange: disabled during niivue-mono migration (P3)");
      void checked;
    },
    [nvRef, currentSurfaceIndex, selectedLayerIndex, incrementLayerVersion],
  );

  const handleAddLayerFiles = useCallback(() => {
    layerFileInputRef.current?.click();
  }, []);

  const handleLayerFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        for (const file of files) {
          await addLayerFromFile(file);
        }
      }
      e.target.value = "";
    },
    [addLayerFromFile],
  );

  return {
    layerFileInputRef,
    getLayers,
    addLayerFromFile,
    removeLayer,
    handleLayerOpacityChange,
    handleLayerCalMinChange,
    handleLayerCalMaxChange,
    handleLayerColormapChange,
    handleLayerUseNegativeCmapChange,
    handleAddLayerFiles,
    handleLayerFileChange,
  };
}
