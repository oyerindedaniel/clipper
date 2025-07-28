import React, { useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ClipDurationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (duration: number) => void;
  currentDurationMs: number;
}

export const ClipDurationDialog: React.FC<ClipDurationDialogProps> = ({
  isOpen,
  onOpenChange,
  onSave,
  currentDurationMs,
}) => {
  const durationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      if (isOpen && durationInputRef.current) {
        durationInputRef.current.value = String(currentDurationMs / 1000);
      }
    }, 0);
  }, [isOpen, currentDurationMs]);

  const handleSave = () => {
    if (durationInputRef.current) {
      const durationSeconds = parseFloat(durationInputRef.current.value);
      if (!isNaN(durationSeconds) && durationSeconds > 0) {
        onSave(durationSeconds * 1000);
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set Clip Duration</DialogTitle>
          <DialogDescription>
            Adjust the default duration of clips (post-mark) in seconds.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="duration" className="text-right text-xs">
              Duration (seconds)
            </label>
            <Input
              id="duration"
              type="number"
              ref={durationInputRef}
              className="col-span-3"
              min="1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSave();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
