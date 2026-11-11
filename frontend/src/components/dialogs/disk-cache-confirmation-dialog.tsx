import { useFreeBrowseStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface DiskCacheConfirmationDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DiskCacheConfirmationDialog({
  onConfirm,
  onCancel,
}: DiskCacheConfirmationDialogProps) {
  const open = useFreeBrowseStore((s) => s.diskCacheConfirmDialogOpen);
  const setOpen = useFreeBrowseStore((s) => s.setDiskCacheConfirmDialogOpen);
  const skip = useFreeBrowseStore((s) => s.skipDiskCacheConfirmation);
  const setSkip = useFreeBrowseStore((s) => s.setSkipDiskCacheConfirmation);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onClose={onCancel}>
        <DialogHeader>
          <DialogTitle>Keep streamed data in the browser cache?</DialogTitle>
          <DialogDescription>
            Warning: with the disk cache on, pieces of every store you stream
            are written to this browser&rsquo;s storage and stay there after
            you close the page. That may include sensitive imaging data, and
            anyone with access to this browser profile could recover it.
            Turning the disk cache off again deletes what was stored.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center space-x-2 mt-4">
          <Checkbox
            id="skip-disk-cache-confirmation"
            checked={skip}
            onCheckedChange={(checked) => setSkip(checked === true)}
          />
          <Label htmlFor="skip-disk-cache-confirmation" className="text-sm">
            Don't ask me again to confirm turning on the disk cache
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Turn on</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
