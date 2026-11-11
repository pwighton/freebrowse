import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useFreeBrowseStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LabeledSliderWithInput } from "@/components/ui/labeled-slider-with-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select } from "@/components/ui/select";
import {
  formatBytes,
  GPU_MEMORY_PRESETS,
  gpuMemoryFor,
  preferredBackend,
} from "@/lib/rendering";
import {
  DETAIL_PRESETS,
  MAX_BRICKS_LIMIT,
  MIN_BRICKS_LIMIT,
  MIN_DETAIL_FALLOFF,
} from "@/lib/zarr-settings";
import type { BudgetPlanName, NiiVue, SwapPolicy } from "@niivue/niivue";

interface ZarrSettingsTabProps {
  nvRef: React.RefObject<NiiVue | null>;
  /** Restarts the view: the GPU's share is fixed when a view starts. */
  onGpuMemoryChange: (bytes: number) => void;
  /** Asks for confirmation before turning the cache on. */
  onDiskCacheChange: (enabled: boolean) => void;
  onReset: () => void;
}

const BACKEND_LABEL = { webgl2: "WebGL2", webgpu: "WebGPU" } as const;

/** What niivue reports about the bricks of the streams on screen. */
interface StreamStatus {
  resident: number;
  total: number;
  waiting: number;
  cacheBytes: number;
  cacheMaxBytes: number;
}

/** Poll niivue's stream counters while the tab is shown. */
function useStreamStatus(
  nvRef: React.RefObject<NiiVue | null>,
): StreamStatus | null {
  const [status, setStatus] = useState<StreamStatus | null>(null);
  useEffect(() => {
    const read = () => {
      const stats = nvRef.current?.chunkStreamStats?.() as
        | {
            resident: number;
            total: number;
            pending: number;
            inFlight: number;
            decoded?: { bytes: number; maxBytes: number };
          }
        | null
        | undefined;
      setStatus(
        stats && stats.total > 0
          ? {
              resident: stats.resident,
              total: stats.total,
              waiting: stats.pending + stats.inFlight,
              cacheBytes: stats.decoded?.bytes ?? 0,
              cacheMaxBytes: stats.decoded?.maxBytes ?? 0,
            }
          : null,
      );
    };
    read();
    const timer = setInterval(read, 500);
    return () => clearInterval(timer);
  }, [nvRef]);
  return status;
}

export default function ZarrSettingsTab({
  nvRef,
  onGpuMemoryChange,
  onDiskCacheChange,
  onReset,
}: ZarrSettingsTabProps) {
  const settings = useFreeBrowseStore((s) => s.zarrSettings);
  const setSettings = useFreeBrowseStore((s) => s.setZarrSettings);
  const finestLevel = useFreeBrowseStore((s) => s.zarrFinestLevel);
  const setFinestLevel = useFreeBrowseStore((s) => s.setZarrFinestLevel);
  const activeBackend = useFreeBrowseStore((s) => s.activeBackend);
  const useWebGpu = useFreeBrowseStore((s) => s.useWebGpu);
  const baseStream = useFreeBrowseStore((s) => s.zarrStreams[0]);
  const status = useStreamStatus(nvRef);

  const backend = activeBackend ?? preferredBackend(useWebGpu);
  const gpuMemory = gpuMemoryFor(backend, settings.gpuMemory);
  const preset = DETAIL_PRESETS[settings.detailPreset] ?? DETAIL_PRESETS.focus;
  const levels = baseStream?.description.levels ?? [];
  const spacing = (s: readonly number[]) =>
    s.map((v) => Number(v.toPrecision(3))).join(" x ");

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Zarr Settings</h2>
        <p className="text-sm text-muted-foreground">
          How streamed stores are fetched and drawn
        </p>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="grid gap-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="zarr-finest-level" className="text-sm font-medium">
              Finest level
            </Label>
            <Select
              id="zarr-finest-level"
              value={String(Math.min(finestLevel, Math.max(0, levels.length - 1)))}
              disabled={levels.length === 0}
              onChange={(e) => setFinestLevel(Number(e.target.value))}
            >
              {levels.length === 0 && <option value="0">0 (full resolution)</option>}
              {levels.map((level) => (
                <option key={level.level} value={level.level}>
                  {level.level}: {spacing(level.spacingUm)} µm
                  {level.level === 0 ? " (full resolution)" : ""}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              The sharpest pyramid level a stream may use. A coarser level
              loads faster and uses less memory.
              {levels.length === 0 ? " Open a store to choose." : ""}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zarr-gpu-memory" className="text-sm font-medium">
              GPU memory ({BACKEND_LABEL[backend]})
            </Label>
            <Select
              id="zarr-gpu-memory"
              value={String(gpuMemory)}
              onChange={(e) => onGpuMemoryChange(Number(e.target.value))}
            >
              {GPU_MEMORY_PRESETS[backend].map((bytes) => (
                <option key={bytes} value={bytes}>
                  {formatBytes(bytes)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              How much the streamed bricks may take. More shows more of the
              view in fine detail. Changing it restarts the view.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zarr-detail-preset" className="text-sm font-medium">
              Detail preset
            </Label>
            <Select
              id="zarr-detail-preset"
              value={settings.detailPreset}
              onChange={(e) =>
                setSettings({ detailPreset: e.target.value as BudgetPlanName })
              }
            >
              {Object.entries(DETAIL_PRESETS).map(([name, p]) => (
                <option key={name} value={name}>
                  {p.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{preset.description}</p>
          </div>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Advanced settings
            </summary>
            <div className="grid gap-4 pt-3">
              <div className="space-y-1">
                <LabeledSliderWithInput
                  label="Maximum bricks"
                  value={settings.maxBricks ?? preset.maxBricks}
                  onValueChange={(value) => setSettings({ maxBricks: value })}
                  min={MIN_BRICKS_LIMIT}
                  max={MAX_BRICKS_LIMIT}
                  step={8}
                />
                <p className="text-xs text-muted-foreground">
                  Each brick is drawn separately, so fewer is faster.{" "}
                  {settings.maxBricks === null ? (
                    `Using the preset's ${preset.maxBricks}.`
                  ) : (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setSettings({ maxBricks: null })}
                    >
                      Use the preset's {preset.maxBricks}
                    </button>
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <LabeledSliderWithInput
                  label="Detail falloff"
                  value={settings.detailFalloff}
                  onValueChange={(value) => setSettings({ detailFalloff: value })}
                  min={MIN_DETAIL_FALLOFF}
                  max={1}
                  step={0.05}
                  decimalPlaces={2}
                />
                <p className="text-xs text-muted-foreground">
                  How far fine detail reaches from the focus. Lower values
                  coarsen sooner.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zarr-swap-policy" className="text-sm font-medium">
                  Swap policy
                </Label>
                <Select
                  id="zarr-swap-policy"
                  value={settings.swapPolicy}
                  onChange={(e) =>
                    setSettings({ swapPolicy: e.target.value as SwapPolicy })
                  }
                >
                  <option value="replace">Replace at once</option>
                  <option value="keepUntilCovered">Keep until covered</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  In the 3D view, when the focus moves: drop the old bricks at
                  once, or keep drawing them until the new ones arrive (uses
                  more memory while it swaps).
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="zarr-disk-cache"
                    checked={settings.diskCache}
                    onCheckedChange={(checked) =>
                      onDiskCacheChange(checked === true)
                    }
                  />
                  <Label htmlFor="zarr-disk-cache" className="text-sm font-medium">
                    Disk cache
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Keep downloaded data in this browser so a store opens faster
                  next time. Turning it off deletes what was kept. Changing it
                  reloads the open stores.
                </p>
              </div>
            </div>
          </details>

          <div className="rounded-md border px-3 py-2">
            <h3 className="text-sm font-medium">Status</h3>
            <dl
              aria-label="Streaming status"
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground"
            >
              <dt>Renderer</dt>
              <dd>{activeBackend ? BACKEND_LABEL[activeBackend] : "not started"}</dd>
              <dt>Bricks loaded</dt>
              <dd>{status ? `${status.resident} of ${status.total}` : "—"}</dd>
              <dt>Bricks waiting</dt>
              <dd>{status ? status.waiting : "—"}</dd>
              <dt>Memory cache</dt>
              <dd>
                {status
                  ? `${formatBytes(status.cacheBytes)} of ${formatBytes(status.cacheMaxBytes)}`
                  : "—"}
              </dd>
            </dl>
          </div>

          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to defaults
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
