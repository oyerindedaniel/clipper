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
  onSave: (preDurationMs: number, postDurationMs: number) => void;
  currentPreDurationMs: number;
  currentPostDurationMs: number;
}

export const ClipDurationDialog: React.FC<ClipDurationDialogProps> = ({
  isOpen,
  onOpenChange,
  onSave,
  currentPreDurationMs,
  currentPostDurationMs,
}) => {
  const preDurationRef = useRef<HTMLInputElement>(null);
  const postDurationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      if (isOpen) {
        if (preDurationRef.current) {
          preDurationRef.current.value = String(currentPreDurationMs / 1000);
        }
        if (postDurationRef.current) {
          postDurationRef.current.value = String(currentPostDurationMs / 1000);
        }
      }
    }, 0);
  }, [isOpen, currentPostDurationMs]);

  const handleSave = () => {
    const pre = parseFloat(preDurationRef.current?.value || "");
    const post = parseFloat(postDurationRef.current?.value || "");

    if (!isNaN(pre) && pre > 0 && !isNaN(post) && post > 0) {
      onSave(pre * 1000, post * 1000);
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set Clip Duration</DialogTitle>
          <DialogDescription>
            Adjust the default duration of clips (pre-mark | post-mark) in
            seconds.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="duration" className="text-right text-xs">
              Pre Duration (seconds)
            </label>
            <Input
              id="preDuration"
              type="number"
              min={1}
              ref={preDurationRef}
              className="col-span-3"
              autoFocus
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="duration" className="text-right text-xs">
              Post Duration (seconds)
            </label>
            <Input
              id="postDuration"
              type="number"
              min={1}
              ref={postDurationRef}
              className="col-span-3"
              onKeyDown={handleKeyDown}
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
