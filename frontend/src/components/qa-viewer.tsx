import { useEffect, useRef } from "react";
import { registerNiivueEvents } from "@/store/niivue-sync";
import { createStoreSyncTarget } from "@/store/niivue-store-sync";
import { useViewerOptions } from "@/hooks/use-viewer-options";
import { useLocation } from "@/hooks/use-location";
import { useVolumes } from "@/hooks/use-volumes";
import { useFileLoading } from "@/hooks/use-file-loading";
import { NiiVueGPU as Niivue } from "@niivue/niivue";
import { PanelRight } from "lucide-react";
import "../App.css";
import ViewerShell from "./viewer-shell";
import QaSidebar from "./qa-sidebar";
import SettingsDialog from "./dialogs/settings-dialog";

const nv = new Niivue({
  // MIGRATION-TODO(P2): tune fontScale (was textHeight=0.02, different units).
  backend: "webgl2", // pin during migration; auto-select in P6
  placeholderText: "",
  isDragDropEnabled: false,
  backgroundColor: [0, 0, 0, 1],
  crosshairColor: [1.0, 0.88, 0.88, 1.0],
  crosshairWidth: 0.3,
  crosshairGap: 10,
});

const noopSurface = () => {};

export default function QaViewer() {
  const nvRef = useRef<Niivue | null>(nv);

  // Event-driven store sync for this viewer's instance (see FreeBrowse).
  useEffect(() => {
    return registerNiivueEvents(nv, createStoreSyncTarget(nv));
  }, []);

  const {
    viewerOptions,
    applyViewerOptions,
    syncViewerOptionsFromNiivue,
    debouncedGLUpdate,
  } = useViewerOptions(nvRef, true);
  const { handleLocationChange } = useLocation(nvRef);
  useVolumes(
    nvRef,
    debouncedGLUpdate,
    noopSurface,
  );
  const {
    fileInputRef,
    handleFileUpload,
    handleFileChange,
  } = useFileLoading(
    nvRef,
    applyViewerOptions,
    syncViewerOptionsFromNiivue,
    () => {},
    handleLocationChange,
  );

  return (
    <ViewerShell
      nvInstance={nv}
      viewMode={viewerOptions.viewMode}
      onFileUpload={handleFileUpload}
      sidebar={<QaSidebar />}
      dialogs={<SettingsDialog nvRef={nvRef} />}
      nvCanvasEmptyState={
        <div className="flex flex-col items-center justify-center gap-4 text-center max-w-xl mx-auto">
          <div className="rounded-full bg-background p-3 shadow-sm">
            <PanelRight className="h-10 w-10 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold">Initiate QA process using the sidebar on the right</p>
        </div>
      }
    />
  );
}
