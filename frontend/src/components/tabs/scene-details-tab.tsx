import { useState } from "react";
import { useFreeBrowseStore } from "@/store";
import {
  ImageIcon,
  Link,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Save,
  Edit,
  Pencil,
  Download,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSliderWithInput } from "@/components/ui/labeled-slider-with-input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCapabilities } from "@/lib/capabilities";
import { deploymentConfig } from "@/lib/deployment-config";
import type { ZarrVolumeOrigin } from "@/store/zarr-slice";
import type { NiiVue, NVImage } from "@niivue/niivue";

interface SceneDetailsTabProps {
  nvRef: React.RefObject<NiiVue | null>;
  serverlessMode: boolean;
  getVolumes: () => NVImage[];
  onToggleVisibility: (id: string) => void;
  onEditVolume: (index: number) => void;
  canEditVolume: (index: number) => boolean;
  onRemoveVolume: (index: number) => void;
  onAddMoreFiles: () => void;
  onLoadUrl: (url: string) => void;
  onCreateDrawingLayer: () => void;
  onSaveScene: (isDownload: boolean) => void;
  onOpacityChange: (value: number) => void;
  onFrameChange: (value: number) => void;
  onContrastMinChange: (value: number) => void;
  onContrastMaxChange: (value: number) => void;
  onColormapChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onMoveVolumeUp: () => void;
  onMoveVolumeDown: () => void;
}

/** "zarr level 3/6 (0 = finest), 20.5 x 29 x 20.5 µm": the resolution in memory. */
function zarrSummary(origin: ZarrVolumeOrigin): string {
  const spacing = origin.spacingUm
    .map((s) => Number(s.toPrecision(3)))
    .join(" x ");
  return `zarr level ${origin.level}/${origin.levelCount - 1} (0 = finest), ${spacing} µm`;
}

export default function SceneDetailsTab({
  nvRef,
  serverlessMode,
  getVolumes,
  onToggleVisibility,
  onEditVolume,
  canEditVolume,
  onRemoveVolume,
  onAddMoreFiles,
  onLoadUrl,
  onCreateDrawingLayer,
  onSaveScene,
  onOpacityChange,
  onFrameChange,
  onContrastMinChange,
  onContrastMaxChange,
  onColormapChange,
  onMoveVolumeUp,
  onMoveVolumeDown,
}: SceneDetailsTabProps) {
  const currentImageIndex = useFreeBrowseStore((s) => s.currentImageIndex);
  const setCurrentImageIndex = useFreeBrowseStore(
    (s) => s.setCurrentImageIndex,
  );
  const drawingOptions = useFreeBrowseStore((s) => s.drawingOptions);
  const zarrVolumes = useFreeBrowseStore((s) => s.zarrVolumes);
  const urlLoading = useFreeBrowseStore(
    (s) => s.urlLoadStatus.state === "loading",
  );
  const capabilities = useCapabilities();
  const zarrMode = useFreeBrowseStore((s) => s.appMode === "zarr");
  const [urlText, setUrlText] = useState("");

  const submitUrl = (event: React.FormEvent) => {
    event.preventDefault();
    if (!urlText.trim() || urlLoading) return;
    onLoadUrl(urlText);
    setUrlText("");
  };

  const colormaps: string[] = nvRef.current?.colormaps ?? [];
  const volumes = getVolumes();
  const currentVolume =
    currentImageIndex !== null ? volumes[currentImageIndex] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Volumetric Details</h2>
        <p className="text-sm text-muted-foreground">
          Manage volumes and adjust properties
        </p>
      </div>
      <ScrollArea className="max-h-[50%] min-h-0">
        {volumes.length > 0 ? (
          <div className="grid gap-2 p-4">
            {volumes.map((volume, index) => (
              <div
                key={volume.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md cursor-pointer",
                  currentImageIndex === index
                    ? "bg-muted"
                    : "hover:bg-muted/50",
                )}
                onClick={() => setCurrentImageIndex(index)}
              >
                <div className="flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      // niivue-mono assigns every loaded volume an id; the
                      // type keeps it optional, so guard rather than assert.
                      if (volume.id) onToggleVisibility(volume.id);
                    }}
                  >
                    {volume.visible !== false ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3 opacity-50" />
                    )}
                  </Button>
                </div>
                <div className="flex-1 w-0">
                  <p className="text-sm font-medium break-words">
                    {volume.name || `Volume ${index + 1}`}
                  </p>
                  {volume.id && zarrVolumes[volume.id] && (
                    <p
                      className="text-xs text-muted-foreground"
                      title={zarrVolumes[volume.id].url}
                    >
                      {zarrSummary(zarrVolumes[volume.id])}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 flex gap-1">
                  {capabilities.drawing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-blue-100 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditVolume(index);
                      }}
                      disabled={!canEditVolume(index)}
                      title={
                        canEditVolume(index)
                          ? "Edit as drawing"
                          : "Cannot edit - must match background dimensions and affine"
                      }
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveVolume(index);
                    }}
                    title="Delete volume"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 mb-2" />
            <p>No images</p>
          </div>
        )}
        <div className="p-2 border-t space-y-2">
          {capabilities.fileUpload && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onAddMoreFiles}
            >
              <Upload className="mr-2 h-4 w-4" />
              Load volumes
            </Button>
          )}
          <form className="flex gap-2" onSubmit={submitUrl}>
            <Input
              type="text"
              aria-label={zarrMode ? "OME-Zarr store URL" : "Volume or zarr URL"}
              placeholder={
                zarrMode ? "OME-Zarr store URL" : "Volume or OME-Zarr URL"
              }
              className="h-8 text-xs"
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              disabled={urlLoading}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!urlText.trim() || urlLoading}
              title={zarrMode ? "Stream this store" : "Load from URL"}
            >
              <Link className="mr-2 h-4 w-4" />
              {urlLoading ? "Loading" : zarrMode ? "Open" : "Load"}
            </Button>
          </form>
          {capabilities.drawing && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onCreateDrawingLayer}
              disabled={drawingOptions.enabled || volumes.length === 0}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Create empty drawing layer
            </Button>
          )}
          {capabilities.save && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onSaveScene(false)}
                disabled={
                  volumes.length === 0 || drawingOptions.enabled || serverlessMode
                }
              >
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onSaveScene(true)}
                disabled={
                  volumes.length === 0 ||
                  drawingOptions.enabled ||
                  deploymentConfig.downloadDisabled
                }
                title={
                  deploymentConfig.downloadDisabled
                    ? "Download is disabled in this deployment"
                    : undefined
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
      <ScrollArea className="flex-1 min-h-0">
        {currentVolume ? (
          <div className="grid gap-4 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onMoveVolumeUp}
                disabled={currentImageIndex === null || currentImageIndex === 0}
              >
                <ChevronUp className="mr-2 h-4 w-4" />
                Move up
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onMoveVolumeDown}
                disabled={
                  currentImageIndex === null ||
                  currentImageIndex === volumes.length - 1
                }
              >
                <ChevronDown className="mr-2 h-4 w-4" />
                Move down
              </Button>
            </div>
            {(currentVolume.nFrame4D || 1) > 1 && (
              <LabeledSliderWithInput
                label="Frame"
                value={currentVolume.frame4D ?? 0}
                onValueChange={onFrameChange}
                min={0}
                max={(currentVolume.nFrame4D || 1) - 1}
                step={1}
              />
            )}
            <LabeledSliderWithInput
              label="Opacity"
              value={currentVolume.opacity ?? 1}
              onValueChange={onOpacityChange}
              min={0}
              max={1}
              step={0.01}
            />
            <LabeledSliderWithInput
              label="Contrast Min"
              value={currentVolume.calMin ?? 0}
              onValueChange={onContrastMinChange}
              min={currentVolume.globalMin ?? 0}
              max={currentVolume.globalMax ?? 255}
              step={0.1}
              decimalPlaces={1}
            />
            <LabeledSliderWithInput
              label="Contrast Max"
              value={currentVolume.calMax ?? 100}
              onValueChange={onContrastMaxChange}
              min={currentVolume.globalMin ?? 0}
              max={currentVolume.globalMax ?? 255}
              step={0.1}
              decimalPlaces={1}
            />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Colormap</Label>
              <Select
                value={
                  // niivue lists canonical names ("Gray") but a loader may
                  // have set another case ("gray").
                  colormaps.find(
                    (c) =>
                      c.toLowerCase() ===
                      (currentVolume.colormap || "gray").toLowerCase(),
                  ) ?? currentVolume.colormap
                }
                onChange={onColormapChange}
              >
                {colormaps.map((colormap: string) => (
                  <option key={colormap} value={colormap}>
                    {colormap}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground"></div>
        )}
      </ScrollArea>
    </div>
  );
}
