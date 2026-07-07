import { useCallback, useEffect, useRef } from "react";
import { useFreeBrowseStore } from "@/store";
import type { NiiVueGPU as Niivue } from "@niivue/niivue";
import type { FileItem } from "@/components/file-list";

export function useFileLoading(
  nvRef: React.RefObject<Niivue | null>,
  applyViewerOptions: () => void,
  syncViewerOptionsFromNiivue: () => void,
  updateSurfaceDetails: () => void,
  handleLocationChange: (locationObject: any) => void,
  syncDrawingOptionsFromNiivue: () => void,
) {
  const showUploader = useFreeBrowseStore((s) => s.showUploader);
  const setShowUploader = useFreeBrowseStore((s) => s.setShowUploader);
  const currentImageIndex = useFreeBrowseStore((s) => s.currentImageIndex);
  const setCurrentImageIndex = useFreeBrowseStore((s) => s.setCurrentImageIndex);
  const volumeVersion = useFreeBrowseStore((s) => s.volumeVersion);
  const incrementVolumeVersion = useFreeBrowseStore((s) => s.incrementVolumeVersion);
  const currentSurfaceIndex = useFreeBrowseStore((s) => s.currentSurfaceIndex);
  const setCurrentSurfaceIndex = useFreeBrowseStore((s) => s.setCurrentSurfaceIndex);
  const setActiveTab = useFreeBrowseStore((s) => s.setActiveTab);

  const serverlessMode = import.meta.env.VITE_SERVERLESS === 'true';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const surfaceFileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to load NVD data
  const loadNvdData = useCallback(
    async (jsonData: any) => {
      // MIGRATION-TODO(P5): document load is rebuilt in the documents phase
      // around a JSON<->CBOR adapter (nvd-json.ts) + nv.loadDocument(File).
      // The old-schema path (NVDocument.loadFromJSON, encodedImageBlobs,
      // meshesString, layer-name backfill) is retired. Disabled until then.
      void jsonData;
      void syncViewerOptionsFromNiivue;
      void updateSurfaceDetails;
      console.warn("loadNvdData: document loading disabled during niivue-mono migration (P5)");
    },
    [syncViewerOptionsFromNiivue, updateSurfaceDetails],
  );

  // Add uploaded files to Niivue
  const handleFileUpload = useCallback(
    async (files: File[]) => {
      if (!nvRef.current) return;
      const nv = nvRef.current;

      if (showUploader) {
        setShowUploader(false);
      }

      let retries = 0;
      while (!nv.canvas && retries < 20) {
        console.log(
          `Waiting for canvas to be ready for file upload... attempt ${retries + 1}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }

      if (!nv.canvas) {
        throw new Error("Canvas failed to initialize after 2 seconds");
      }

      const nvdFiles = files.filter(
        (file) =>
          file.name.toLowerCase().endsWith(".nvd") ||
          file.name.toLowerCase().endsWith(".json"),
      );

      if (nvdFiles.length > 0) {
        const nvdFile = nvdFiles[0];
        try {
          const text = await nvdFile.text();
          const jsonData = JSON.parse(text);
          console.log("NVD data loaded from uploaded file:", jsonData);
          await loadNvdData(jsonData);
        } catch (error) {
          console.error("Error loading uploaded NVD file:", error);
        }
      } else {
        const promises = files.map(async (file) => {
          // niivue-mono: addVolume accepts a File directly (url: string | File);
          // the separate NVImage.loadFromFile step is gone.
          await nv.addVolume({ url: file, name: file.name });
        });

        await Promise.all(promises);

        applyViewerOptions();
        incrementVolumeVersion();

        if (currentImageIndex === null && files.length > 0) {
          setCurrentImageIndex(0);
        }
      }
    },
    [nvRef, showUploader, currentImageIndex, loadNvdData, applyViewerOptions, incrementVolumeVersion, setShowUploader, setCurrentImageIndex],
  );

  const handleImagingFileSelect = useCallback(
    async (file: FileItem) => {
      if (!nvRef.current) return;
      const nv = nvRef.current;

      try {
        if (showUploader) {
          setShowUploader(false);
        }

        let retries = 0;
        while (!nv.canvas && retries < 20) {
          console.log(
            `Waiting for canvas to be ready for imaging file... attempt ${retries + 1}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries++;
        }

        if (!nv.canvas) {
          throw new Error("Canvas failed to initialize after 2 seconds");
        }

        const basename = file.filename.split("/").pop() || file.filename;
        const volume = {
          url: file.url,
          name: basename,
        };

        console.log("Adding imaging file to scene:", volume);
        await nv.addVolume(volume);

        applyViewerOptions();
        incrementVolumeVersion();

        if (nv.volumes.length > 0) {
          setCurrentImageIndex(nv.volumes.length - 1);
        }

        console.log("Imaging file loaded successfully");
      } catch (error) {
        console.error("Error loading imaging file:", error);
      }
    },
    [nvRef, showUploader, applyViewerOptions, incrementVolumeVersion, setShowUploader, setCurrentImageIndex],
  );

  const handleNvdFileSelect = useCallback(
    async (file: FileItem) => {
      if (!nvRef.current) return;
      const nv = nvRef.current;

      try {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData = await response.json();
        console.log("json data returned from server:");
        console.log(jsonData);

        setShowUploader(false);

        let retries = 0;
        while (!nv.canvas && retries < 20) {
          console.log(`Waiting for canvas to be ready... attempt ${retries + 1}`);
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries++;
        }

        if (!nv.canvas) {
          throw new Error("Canvas failed to initialize after 2 seconds");
        }

        await loadNvdData(jsonData);
      } catch (error) {
        console.error("Error loading NVD:", error);
      }
    },
    [nvRef, loadNvdData, setShowUploader],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        handleFileUpload(files);
      }
      e.target.value = "";
    },
    [handleFileUpload],
  );

  const handleAddMoreFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAddSurfaceFiles = useCallback(() => {
    surfaceFileInputRef.current?.click();
  }, []);

  const handleSurfaceFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0 && nvRef.current) {
        const nv = nvRef.current;
        const files = Array.from(e.target.files);

        if (showUploader) {
          setShowUploader(false);
        }

        let retries = 0;
        while (!nv.canvas && retries < 20) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries++;
        }

        if (!nv.canvas) {
          console.error("Canvas failed to initialize for surface upload");
          return;
        }

        // MIGRATION-TODO(P3): surface loading moves to
        // nv.loadMeshes([{ url: File, name, color, shaderType }]) — File is
        // accepted directly (no blob URL), rgba255 -> color, meshShaderIndex ->
        // shaderType name. Disabled until the meshes phase.
        void files;
        console.warn("handleSurfaceFileChange: surface loading disabled during niivue-mono migration (P3)");

        updateSurfaceDetails();

        if (currentSurfaceIndex === null && nv.meshes.length > 0) {
          setCurrentSurfaceIndex(nv.meshes.length - files.length);
        }
      }
      e.target.value = "";
    },
    [nvRef, showUploader, currentSurfaceIndex, updateSurfaceDetails, setShowUploader, setCurrentSurfaceIndex],
  );

  // Set up Niivue event listeners (niivue-mono uses the EventTarget API rather
  // than assignable onXxx callback props).
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv) return;

    const onDragRelease = () => {
      requestAnimationFrame(() => incrementVolumeVersion());
    };
    const onLocationChange = (e: Event) =>
      handleLocationChange((e as CustomEvent).detail);

    nv.addEventListener("dragRelease", onDragRelease);
    nv.addEventListener("locationChange", onLocationChange);
    // MIGRATION-TODO(P4): the old onOptsChange sync only existed to track the
    // click-to-segment wand threshold; that opt is gone from core niivue.
    void syncDrawingOptionsFromNiivue;

    return () => {
      nv.removeEventListener("dragRelease", onDragRelease);
      nv.removeEventListener("locationChange", onLocationChange);
    };
  }, [nvRef, handleLocationChange, syncDrawingOptionsFromNiivue, incrementVolumeVersion]);

  // Enable/disable drag-and-drop based on whether volumes are loaded
  useEffect(() => {
    void volumeVersion;
    if (nvRef.current) {
      nvRef.current.isDragDropEnabled =
        showUploader && (nvRef.current.volumes?.length ?? 0) === 0;
    }
  }, [nvRef, volumeVersion, showUploader]);

  // If in serverless mode, switch to sceneDetails tab by default
  useEffect(() => {
    if (serverlessMode) {
      setActiveTab("sceneDetails");
    }
  }, [serverlessMode, setActiveTab]);

  // Load NVD from URL parameter on initial load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const nvdParam = urlParams.get("nvd");

    if (nvdParam) {
      console.log("Loading NVD from URL parameter:", nvdParam);
      const nvdFromUrl: FileItem = {
        filename: nvdParam.split("/").pop() || nvdParam,
        url: nvdParam,
      };
      handleNvdFileSelect(nvdFromUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load volume from URL parameter on initial load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const volParam = urlParams.get("vol");

    if (volParam) {
      console.log("Loading volume from URL parameter:", volParam);
      const filename = volParam.split("/").pop() || volParam;
      const fileItem: FileItem = { filename, url: volParam };
      handleImagingFileSelect(fileItem);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load embedded NVD data (for self-contained HTML files)
  useEffect(() => {
    const handleEmbeddedNvd = async (event: CustomEvent) => {
      if (!event.detail || !nvRef.current) return;

      if ((window as any).__EMBEDDED_NVD_LOADED__) return;
      (window as any).__EMBEDDED_NVD_LOADED__ = true;

      console.log('Loading embedded NVD data');
      setShowUploader(false);

      let retries = 0;
      while (!nvRef.current.canvas && retries < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      if (nvRef.current.canvas) {
        await loadNvdData(event.detail);
      }
    };

    window.addEventListener('loadEmbeddedNvd', handleEmbeddedNvd as unknown as EventListener);

    if ((window as any).__EMBEDDED_NVD_DATA__ && !(window as any).__EMBEDDED_NVD_LOADED__) {
      window.dispatchEvent(new CustomEvent('loadEmbeddedNvd', {
        detail: (window as any).__EMBEDDED_NVD_DATA__
      }));
    }

    return () => window.removeEventListener('loadEmbeddedNvd', handleEmbeddedNvd as unknown as EventListener);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    serverlessMode,
    fileInputRef,
    surfaceFileInputRef,
    loadNvdData,
    handleFileUpload,
    handleImagingFileSelect,
    handleNvdFileSelect,
    handleFileChange,
    handleAddMoreFiles,
    handleAddSurfaceFiles,
    handleSurfaceFileChange,
  };
}
