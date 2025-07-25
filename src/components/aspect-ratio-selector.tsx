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
import React from "react";
import { DEFAULT_ASPECT_RATIO, DEFAULT_CROP_MODE } from "@/constants/app";

interface AspectRatioSelectorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsApplied: (convertAspectRatio: string, cropMode: string) => void;
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
      description: "Add bars to fit content",
      icon: <Maximize2 size={16} />,
    },
    {
      value: "crop",
      label: "Crop",
      description: "Cut edges to fit ratio",
      icon: <Crop size={16} />,
    },
    {
      value: "stretch",
      label: "Stretch",
      description: "Distort to fit ratio",
      icon: <Video size={16} />,
    },
  ];

  const getPreviewText = () => {
    if (!convertAspectRatio || convertAspectRatio === "original") {
      return (
        <div className="space-y-1">
          <p className="text-foreground-default text-sm font-medium">
            Original Aspect Ratio
          </p>
          <p className="text-foreground-subtle text-xs">
            Your video's original dimensions and aspect ratio will be preserved
            without any changes.
          </p>
        </div>
      );
    }

    const ratioLabel = aspectRatios.find(
      (r) => r.value === convertAspectRatio
    )?.label;
    const mode = cropModes.find((m) => m.value === cropMode);

    if (mode) {
      let description = "";
      switch (mode.value) {
        case "letterbox":
          description = `This method adds black bars (or a solid color) to the top/bottom or sides of your video to fit it into the ${ratioLabel} frame without cropping any content.`;
          break;
        case "crop":
          description = `This method scales your video to fill the ${ratioLabel} frame and then crops out any content that extends beyond the new dimensions. This means some parts of your video might be cut off.`;
          break;
        case "stretch":
          description = `This method stretches or squashes your video to exactly fit the ${ratioLabel} frame. This can cause the video to look distorted.`;
          break;
        default:
          description =
            "A conversion method will be applied to fit your video into the new aspect ratio.";
      }
      return (
        <div className="space-y-1">
          <p className="text-foreground-default font-medium">
            Convert to {ratioLabel}
          </p>
          <p className="text-foreground-subtle text-xs">{description}</p>
        </div>
      );
    }
    return (
      <p className="text-sm text-foreground-subtle">
        Select an aspect ratio and conversion method to see a preview.
      </p>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-surface-primary rounded-lg shadow-lg space-y-6">
        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-bold text-foreground-default mb-2">
            Export Settings
          </DialogTitle>
          <DialogDescription className="text-foreground-subtle">
            Configure aspect ratio and crop mode
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground-default">
            Target Aspect Ratio
          </label>
          <Select
            value={convertAspectRatio}
            onValueChange={setConvertAspectRatio}
          >
            <SelectTrigger className="w-full border-default focus:ring-primary focus:border-primary bg-surface-primary">
              <SelectValue placeholder="Select an aspect ratio" />
            </SelectTrigger>
            <SelectContent>
              {aspectRatios.map((ratio) => (
                <SelectItem key={ratio.value} value={ratio.value}>
                  {ratio.label} - {ratio.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {convertAspectRatio && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground-default">
              Conversion Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {cropModes.map((mode) => (
                <Button
                  key={mode.value}
                  onClick={() => setCropMode(mode.value)}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-colors space-y-1
                    ${
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
                  {/* <span className="text-center text-xs text-foreground-muted leading-tight block">
                    {mode.description}
                  </span> */}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 rounded-lg border border-gray-700/50 shadow-inner bg-linear-to-r from-surface-secondary to-surface-tertiary">
          {getPreviewText()}
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              onSettingsApplied(convertAspectRatio, cropMode);
              onOpenChange(false);
            }}
            className="w-full"
            variant="default"
            size="lg"
          >
            Apply Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AspectRatioSelector;
