import { useFreeBrowseStore } from "@/store";
import { cn } from "@/lib/utils";

export default function Footer() {
  const locationData = useFreeBrowseStore((s) => s.locationData);
  // A zarr store's spacing is in micrometres, and niivue places a streamed
  // store with its corner at the origin: not scanner (RAS) millimetres.
  const zarrMode = useFreeBrowseStore((s) => s.appMode === "zarr");

  return (
    <footer className="border-t bg-background px-4 py-4 flex-shrink-0">
      {locationData ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[50%_auto_1fr] gap-4 items-center text-sm">
            <div></div>
            <div className="text-muted-foreground font-mono whitespace-nowrap">
              <span className="inline-block w-16">
                {zarrMode ? "µm" : "RAS"}
              </span>
              [
              {locationData.mm[0].toFixed(1)},{" "}
              {locationData.mm[1].toFixed(1)},{" "}
              {locationData.mm[2].toFixed(1)}]
            </div>
            <div></div>
          </div>
          {locationData.voxels.map((vol, index) => (
            <div
              key={index}
              className={cn(
                "grid grid-cols-[50%_auto_1fr] gap-4 items-center text-sm px-2 py-1 rounded-sm",
                index % 2 === 1 && "bg-accent",
              )}
            >
              <div className="font-medium overflow-x-auto whitespace-nowrap">
                {vol.name}:
              </div>
              <div className="text-muted-foreground font-mono whitespace-nowrap">
                <span className="inline-block w-16">Voxel</span>[
                {vol.voxel[0]}, {vol.voxel[1]}, {vol.voxel[2]}]
              </div>
              <div
                className="text-muted-foreground"
                title={
                  vol.streamed
                    ? "Streamed volumes are not held in memory, so there is no voxel value to read"
                    : undefined
                }
              >
                Value: {vol.streamed ? "—" : vol.value.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Load images to see coordinates
        </p>
      )}
    </footer>
  );
}
