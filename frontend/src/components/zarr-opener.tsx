import { useState } from "react";
import { Layers, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFreeBrowseStore } from "@/store";

interface ZarrOpenerProps {
  onOpen: (url: string) => void;
}

/** The zarr view's empty state: asks for a store URL to stream. */
export default function ZarrOpener({ onOpen }: ZarrOpenerProps) {
  const loading = useFreeBrowseStore(
    (s) => s.urlLoadStatus.state === "loading",
  );
  const [url, setUrl] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim() || loading) return;
    onOpen(url);
  };

  return (
    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center max-w-xl mx-auto w-full">
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-background p-3 shadow-sm">
          <Layers className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="grid gap-1 text-center">
          <h3 className="text-lg font-semibold">Stream an OME-Zarr store</h3>
          <p className="text-sm text-muted-foreground">
            Enter the URL of a store. Only the part being viewed is fetched,
            so the store can be far larger than memory.
          </p>
          <p className="text-sm text-muted-foreground">
            The server must allow cross-origin requests.
          </p>
        </div>
        <form className="flex w-full gap-2" onSubmit={submit}>
          <Input
            type="text"
            aria-label="OME-Zarr store URL"
            placeholder="https://.../store.ome.zarr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" disabled={!url.trim() || loading}>
            <Link className="mr-2 h-4 w-4" />
            {loading ? "Opening" : "Open"}
          </Button>
        </form>
      </div>
    </div>
  );
}
