import { useFreeBrowseStore } from "@/store";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ImageUploader from "./image-uploader";
import ImageCanvas from "./image-canvas";
import type { ViewMode } from "@/store/types";
import type { NiiVue } from "@niivue/niivue";

interface CanvasAreaProps {
  nvInstance: NiiVue;
  viewMode: ViewMode;
  onFileUpload: (files: File[]) => Promise<void>;
  nvCanvasEmptyState?: React.ReactNode;
}

export default function CanvasArea({
  nvInstance,
  viewMode,
  onFileUpload,
  nvCanvasEmptyState,
}: CanvasAreaProps) {
  const showUploader = useFreeBrowseStore((s) => s.showUploader);
  const urlLoadStatus = useFreeBrowseStore((s) => s.urlLoadStatus);
  const setUrlLoadStatus = useFreeBrowseStore((s) => s.setUrlLoadStatus);

  return (
    <main className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
      {urlLoadStatus.state === "loading" && (
        <div
          role="status"
          className="absolute left-1/2 top-3 z-10 max-w-[80%] -translate-x-1/2 truncate rounded-md border bg-background px-3 py-1.5 text-sm shadow"
        >
          Loading {urlLoadStatus.url}
        </div>
      )}
      {urlLoadStatus.state === "error" && (
        <div
          role="alert"
          className="absolute left-1/2 top-3 z-10 flex max-w-[80%] -translate-x-1/2 items-start gap-2 rounded-md border border-destructive bg-background px-3 py-2 text-sm shadow"
        >
          <div className="min-w-0">
            <p className="font-medium">Could not load volume</p>
            <p className="break-words text-muted-foreground">
              {urlLoadStatus.message}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {urlLoadStatus.url}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 flex-shrink-0 p-0"
            aria-label="Dismiss"
            onClick={() => setUrlLoadStatus({ state: "idle" })}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {showUploader ? (
        <div className="flex flex-1 items-center justify-center">
          {nvCanvasEmptyState ?? <ImageUploader onUpload={onFileUpload} />}
        </div>
      ) : (
        <div className="flex flex-1">
          <ImageCanvas viewMode={viewMode} nvRef={nvInstance} />
        </div>
      )}
    </main>
  );
}
