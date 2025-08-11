import { useState } from "react";
import { Video, Crop, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import React from "react";
import { DEFAULT_ASPECT_RATIO, DEFAULT_CROP_MODE } from "@/constants/app";
import { CropMode } from "@/types/app";

interface AspectRatioSelectorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsApplied: (convertAspectRatio: string, cropMode: CropMode) => void;
}

const AspectRatioSelector = ({
  isOpen,
  onOpenChange,
  onSettingsApplied,
}: AspectRatioSelectorProps) => {
  const [convertAspectRatio, setConvertAspectRatio] =
    useState(DEFAULT_ASPECT_RATIO);
  const [cropMode, setCropMode] = useState(DEFAULT_CROP_MODE);

  const aspectRatios = [
    { value: "original", label: "Keep Original", description: "No conversion" },
    { value: "16:9", label: "16:9", description: "Widescreen (YouTube, TV)" },
    { value: "9:16", label: "9:16", description: "Portrait (TikTok, Stories)" },
    { value: "1:1", label: "1:1", description: "Square (Instagram)" },
    { value: "4:3", label: "4:3", description: "Standard (Old TV)" },
    { value: "21:9", label: "21:9", description: "Ultra-wide (Cinema)" },
    { value: "3:4", label: "3:4", description: "Portrait Standard" },
  ];

  const cropModes = [
    {
      value: "letterbox",
      label: "Letterbox",
      icon: <Maximize2 size={16} />,
    },
    {
      value: "crop",
      label: "Crop",
      icon: <Crop size={16} />,
    },
    {
      value: "stretch",
      label: "Stretch",
      icon: <Video size={16} />,
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adjust Aspect Ratio</DialogTitle>
          <DialogDescription>
            Configure aspect ratio and crop mode
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="aspectRatio" className="text-right text-xs">
              Aspect Ratio
            </label>
            <Select
              value={convertAspectRatio}
              onValueChange={setConvertAspectRatio}
            >
              <SelectTrigger
                id="aspectRatio"
                className="col-span-3 h-auto px-2 py-1 text-xs"
              >
                <SelectValue placeholder="Select an aspect ratio" />
              </SelectTrigger>
              <SelectContent>
                {aspectRatios.map((ratio) => (
                  <SelectItem key={ratio.value} value={ratio.value}>
                    <div className="flex items-center justify-between w-full">
                      <span>{ratio.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {ratio.description}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {convertAspectRatio !== "original" && (
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="cropMode" className="text-right text-xs">
                Crop Mode
              </label>
              <div className="col-span-3 grid grid-cols-3 gap-2">
                {cropModes.map((mode) => (
                  <Button
                    key={mode.value}
                    onClick={() => setCropMode(mode.value)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-colors space-y-1 ${
                      cropMode === mode.value
                        ? "bg-primary/20 text-primary border border-primary"
                        : "bg-surface-tertiary text-foreground-subtle hover:bg-surface-hover border border-gray-700/50"
                    }`}
                    variant="ghost"
                    size="sm"
                  >
                    <div className="flex items-center space-x-1.5">
                      {mode.icon}
                      <span className="text-xs font-medium">{mode.label}</span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              onSettingsApplied(convertAspectRatio, cropMode as CropMode);
              onOpenChange(false);
            }}
            className="w-full"
            variant="default"
            size="sm"
          >
            Apply Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AspectRatioSelector;
