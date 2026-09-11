import { useCallback } from "react";
import { useFreeBrowseStore } from "@/store";
import { uint8ArrayToBase64 } from "@/lib/niivue-helpers";
import { requestImagingUploadConfirmation } from "@/lib/confirmations";
import type { NiiVue as NiiVue } from "@niivue/niivue";

export function useSave(nvRef: React.RefObject<NiiVue | null>) {
  const saveDialogOpen = useFreeBrowseStore((s) => s.saveDialogOpen);
  const setSaveDialogOpen = useFreeBrowseStore((s) => s.setSaveDialogOpen);
  const saveState = useFreeBrowseStore((s) => s.saveState);
  const setSaveState = useFreeBrowseStore((s) => s.setSaveState);

  const handleSaveScene = useCallback(
    async (isDownload: boolean = false) => {
      if (!nvRef.current) return;

      if (!isDownload && nvRef.current.volumes.length > 0) {
        const ok = await requestImagingUploadConfirmation();
        if (!ok) return;
      }

      const volumeStates = nvRef.current.volumes.map((volume: any) => {
        const isExternal = !!(volume.url && volume.url.startsWith("http"));
        return {
          enabled: !isExternal,
          isExternal,
          url: isDownload ? volume.name || "" : volume.url || "",
        };
      });

      setSaveState({
        isDownloadMode: isDownload,
        document: {
          enabled: false,
          location: "",
        },
        volumes: volumeStates,
      });

      setSaveDialogOpen(true);
    },
    [nvRef, setSaveState, setSaveDialogOpen],
  );

  const handleConfirmSave = useCallback(async () => {
    console.log("Saving scene to:", saveState.document.location);

    if (!nvRef.current) return;

    if (saveState.isDownloadMode) {
      // Download mode
      if (saveState.document.enabled && saveState.document.location.trim()) {
        // MIGRATION-TODO(P5): serialize the scene document via nv.serializeDocument()
        // (CBOR) through a JSON adapter, strip meshes, blank out image URLs, and
        // trigger a browser download of the resulting .nvd file.
        console.warn(
          "document serialization (download): disabled during niivue-mono migration (P5)",
        );
      }

      // Download enabled volumes
      for (let index = 0; index < saveState.volumes.length; index++) {
        const volumeState = saveState.volumes[index];
        if (
          volumeState.enabled &&
          nvRef.current &&
          nvRef.current.volumes[index]
        ) {
          const volume = nvRef.current.volumes[index];
          const filename = volumeState.url || `volume_${index + 1}.nii.gz`;

          try {
            // MIGRATION-TODO(P5): serialize the volume via nv.saveVolume(...)
            // (replaces the removed volume.saveToUint8Array) and download it.
            console.warn(
              "saveToUint8Array (download): disabled during niivue-mono migration (P5)",
            );
            void volume;
            const uint8Array = new Uint8Array();

            const blob = new Blob([uint8Array], {
              type: "application/octet-stream",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename.endsWith(".nii.gz")
              ? filename
              : `${filename}.nii.gz`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          } catch (error) {
            console.error(`Error downloading volume ${index}:`, error);
          }
        }
      }
    } else {
      // Save to backend mode
      if (saveState.document.enabled && saveState.document.location.trim()) {
        // MIGRATION-TODO(P5): serialize the scene document via
        // nv.serializeDocument() (CBOR) through a JSON adapter, remap image URLs
        // to the requested save locations, then POST it to "/data/nvd".
        console.warn(
          "document serialization (backend save): disabled during niivue-mono migration (P5)",
        );
      }

      // Save enabled volumes to backend
      const volumeSavePromises = saveState.volumes.map(
        async (volumeState, index) => {
          if (
            volumeState.enabled &&
            nvRef.current &&
            nvRef.current.volumes[index]
          ) {
            const volume = nvRef.current.volumes[index];

            if (!volumeState.url || volumeState.url.trim() === "") {
              console.log(`Skipping volume ${index}: no URL specified`);
              return;
            }

            try {
              const shouldCompress = volumeState.url
                .toLowerCase()
                .endsWith(".gz");
              const filename = shouldCompress
                ? volumeState.url
                : volumeState.url + ".gz";
              // MIGRATION-TODO(P5): serialize the volume via nv.saveVolume(...)
              // (replaces the removed volume.saveToUint8Array) and POST it.
              console.warn(
                "saveToUint8Array (backend save): disabled during niivue-mono migration (P5)",
              );
              void volume;
              void filename;
              const uint8Array = new Uint8Array();
              const base64Data = uint8ArrayToBase64(uint8Array);

              const volumeResponse = await fetch("/data/nii", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  filename: volumeState.url,
                  data: base64Data,
                }),
              });

              if (!volumeResponse.ok) {
                throw new Error(
                  `Failed to save volume ${index}: ${volumeResponse.statusText}`,
                );
              }

              const volumeResult = await volumeResponse.json();
              console.log(`Volume ${index} saved successfully:`, volumeResult);
            } catch (error) {
              console.error(`Error saving volume ${index}:`, error);
            }
          }
        },
      );

      await Promise.all(volumeSavePromises);
    }

    setSaveDialogOpen(false);
    setSaveState({
      isDownloadMode: false,
      document: {
        enabled: false,
        location: "",
      },
      volumes: [],
    });
  }, [nvRef, saveState, setSaveDialogOpen, setSaveState]);

  const handleCancelSave = useCallback(() => {
    setSaveDialogOpen(false);
    setSaveState({
      isDownloadMode: false,
      document: {
        enabled: false,
        location: "",
      },
      volumes: [],
    });
  }, [setSaveDialogOpen, setSaveState]);

  const handleVolumeUrlChange = useCallback(
    (index: number, url: string) => {
      setSaveState((prev) => ({
        ...prev,
        volumes: prev.volumes.map((state, i) =>
          i === index ? { ...state, url } : state,
        ),
      }));
    },
    [setSaveState],
  );

  const handleVolumeCheckboxChange = useCallback(
    (index: number, enabled: boolean) => {
      setSaveState((prev) => ({
        ...prev,
        volumes: prev.volumes.map((state, i) => {
          if (i === index) {
            if (enabled && state.isExternal) {
              return { ...state, enabled, url: "" };
            }
            return { ...state, enabled };
          }
          return state;
        }),
      }));
    },
    [setSaveState],
  );

  const handleDocumentLocationChange = useCallback(
    (location: string) => {
      setSaveState((prev) => ({
        ...prev,
        document: {
          ...prev.document,
          location,
        },
      }));
    },
    [setSaveState],
  );

  const handleDocumentCheckboxChange = useCallback(
    (enabled: boolean) => {
      setSaveState((prev) => ({
        ...prev,
        document: {
          ...prev.document,
          enabled,
        },
      }));
    },
    [setSaveState],
  );

  return {
    handleSaveScene,
    handleConfirmSave,
    handleCancelSave,
    handleVolumeUrlChange,
    handleVolumeCheckboxChange,
    handleDocumentLocationChange,
    handleDocumentCheckboxChange,
  };
}
