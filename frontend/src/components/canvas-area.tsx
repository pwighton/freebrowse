import { useFreeBrowseStore } from "@/store";
import { NvScene, type NvSceneController } from "@niivue/nvreact";
import { cn } from "@/lib/utils";
import ImageUploader from "./image-uploader";

interface CanvasAreaProps {
  scene: NvSceneController;
  onFileUpload: (files: File[]) => void;
}

export default function CanvasArea({ scene, onFileUpload }: CanvasAreaProps) {
  const showUploader = useFreeBrowseStore((s) => s.showUploader);

  return (
    <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {showUploader && (
        <div className="flex flex-1 items-center justify-center">
          <ImageUploader onUpload={onFileUpload} />
        </div>
      )}
      <NvScene
        scene={scene}
        className={cn(
          "w-full h-full relative bg-[#111]",
          showUploader && "hidden",
        )}
        style={{ position: "relative" }}
      />
    </main>
  );
}
