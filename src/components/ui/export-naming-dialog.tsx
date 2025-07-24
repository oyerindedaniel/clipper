import React, { useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ExportNamingDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (outputName: string) => void;
}

export const ExportNamingDialog: React.FC<ExportNamingDialogProps> = ({
  isOpen,
  onOpenChange,
  onExport,
}) => {
  const streamerNameRef = useRef<HTMLInputElement>(null);
  const clipTitleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const date = now.toISOString().split("T")[0];
      const time = now
        .toTimeString()
        .split(" ")[0]
        .substring(0, 5)
        .replace(/:/g, "-");

      if (dateRef.current) dateRef.current.value = date;
      if (timeRef.current) timeRef.current.value = time;

      window.electronAPI.getStreamerName().then((name) => {
        if (streamerNameRef.current) {
          streamerNameRef.current.value = name || "UnknownStreamer";
        }
      });

      if (clipTitleRef.current) {
        clipTitleRef.current.value = "MyClip";
      }
    }
  }, [isOpen]);

  const handleExportClick = () => {
    const streamerName = streamerNameRef.current?.value || "UnknownStreamer";
    const clipTitle = clipTitleRef.current?.value || "MyClip";
    const date = dateRef.current?.value || "";
    const time = timeRef.current?.value || "";

    const outputName = `${streamerName}_${date}_${time}_${clipTitle}`.replace(
      /[^a-zA-Z0-9-_.]/g,
      "_"
    );
    onExport(outputName);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Name Your Clip</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="streamerName" className="text-right text-xs">
              Streamer
            </label>
            <Input
              id="streamerName"
              defaultValue=""
              className="col-span-3 text-xs"
              ref={streamerNameRef}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="clipTitle" className="text-right text-xs">
              Title
            </label>
            <Input
              id="clipTitle"
              defaultValue=""
              className="col-span-3 text-xs"
              ref={clipTitleRef}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="date" className="text-right text-xs">
              Date
            </label>
            <Input
              id="date"
              type="date"
              defaultValue=""
              className="col-span-3 text-xs"
              ref={dateRef}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="time" className="text-right text-xs">
              Time
            </label>
            <Input
              id="time"
              type="time"
              defaultValue=""
              className="col-span-3 text-xs"
              ref={timeRef}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={handleExportClick}>
            Export Clip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
