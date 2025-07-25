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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ExportSettings } from "@/types/app";

interface ExportNamingDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (
    outputName: string,
    exportSettings: Pick<ExportSettings, "preset" | "crf">
  ) => void;
}

const presets: {
  value: ExportSettings["preset"];
  label: string;
  description: string;
}[] = [
  {
    value: "fast",
    label: "Fast",
    description: "Good balance between quality and speed.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Slightly better quality, slightly slower.",
  },
  {
    value: "slow",
    label: "Slow",
    description: "Higher quality, significantly slower.",
  },
];

const crfValues: {
  value: ExportSettings["crf"];
  label: string;
  description: string;
}[] = [
  {
    value: 23,
    label: "23 (Default)",
    description: "Good quality for most uses.",
  },
  {
    value: 18,
    label: "18 (High Quality)",
    description: "Visually lossless or near-lossless.",
  },
  {
    value: 28,
    label: "28 (Lower Quality)",
    description: "More compression, lower file size.",
  },
];

export const ExportNamingDialog: React.FC<ExportNamingDialogProps> = ({
  isOpen,
  onOpenChange,
  onExport,
}) => {
  const streamerNameRef = useRef<HTMLInputElement>(null);
  const clipTitleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const presetRef = useRef<ExportSettings["preset"]>("fast");
  const crfRef = useRef<ExportSettings["crf"]>(23);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const now = new Date();
        const date = now.toISOString().split("T")[0];
        const time = now.toTimeString().split(" ")[0].substring(0, 5);

        if (dateRef.current) dateRef.current.value = date;
        if (timeRef.current) timeRef.current.value = time;
        if (clipTitleRef.current) clipTitleRef.current.value = "MyClip";

        window.electronAPI.getStreamerName().then((name) => {
          if (streamerNameRef.current) {
            streamerNameRef.current.value = name || "UnknownStreamer";
          }
        });

        // Set default values for preset and CRF
        presetRef.current = "fast";
        crfRef.current = 23;
      }, 0);
    }

    return () => {
      if (dateRef.current) dateRef.current.value = "";
      if (timeRef.current) timeRef.current.value = "";
      if (clipTitleRef.current) clipTitleRef.current.value = "";
      if (streamerNameRef.current) streamerNameRef.current.value = "";
      // No need to clear presetRef/crfRef as they are handled by onExport
    };
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
    onExport(outputName, { preset: presetRef.current, crf: crfRef.current });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[475px]">
        <DialogHeader>
          <DialogTitle>Name Your Clip</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="streamerName" className="text-right text-xs">
              Streamer
            </label>
            <Input
              required
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
              required
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
              required
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
              required
              id="time"
              type="time"
              defaultValue=""
              className="col-span-3 text-xs"
              ref={timeRef}
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="preset" className="text-right text-xs">
              Preset
            </label>
            <Select
              value={presetRef.current}
              onValueChange={(value) =>
                (presetRef.current = value as ExportSettings["preset"])
              }
            >
              <SelectTrigger
                id="preset"
                className="col-span-3 h-auto px-2 py-1 text-xs"
              >
                <SelectValue placeholder="Select preset" />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center justify-between w-full">
                      <span>{p.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {p.description}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="crf" className="text-right text-xs">
              CRF
            </label>
            <Select
              value={String(crfRef.current)}
              onValueChange={(value) =>
                (crfRef.current = parseInt(value) as ExportSettings["crf"])
              }
            >
              <SelectTrigger
                id="crf"
                className="col-span-3 h-auto px-2 py-1 text-xs"
              >
                <SelectValue placeholder="Select CRF" />
              </SelectTrigger>
              <SelectContent>
                {crfValues.map((c) => (
                  <SelectItem key={c.value} value={String(c.value)}>
                    <div className="flex items-center justify-between w-full">
                      <span>{c.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {c.description}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
