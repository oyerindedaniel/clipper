import React, { useRef, useEffect, useCallback, useState } from "react";
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
import { EXPORT_BITRATE_MAP } from "@/constants/app";

interface ExportNamingDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (
    outputName: string,
    exportSettings: Pick<
      ExportSettings,
      | "preset"
      | "crf"
      | "fps"
      | "format"
      | "resolution"
      | "bitrate"
      | "customBitrateKbps"
    >
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

const fpsOptions: {
  value: ExportSettings["fps"];
  label: string;
  description: string;
}[] = [
  {
    value: 24,
    label: "24 FPS",
    description: "Cinematic look, smaller file size.",
  },
  { value: 30, label: "30 FPS", description: "Standard video frame rate." },
  {
    value: 60,
    label: "60 FPS",
    description: "Smoother motion, larger file size.",
  },
];

const formatOptions: {
  value: ExportSettings["format"];
  label: string;
  description: string;
}[] = [
  {
    value: "mp4",
    label: "MP4",
    description: "Widely compatible video format.",
  },
  {
    value: "webm",
    label: "WebM",
    description: "Open-source format, good for web.",
  },
  {
    value: "mov",
    label: "MOV",
    description: "Apple QuickTime format, high quality.",
  },
];

const resolutionOptions: {
  value: ExportSettings["resolution"];
  label: string;
  description: string;
}[] = [
  { value: "720p", label: "720p", description: "Standard HD (1280x720)" },
  { value: "1080p", label: "1080p", description: "Full HD (1920x1080)" },
  { value: "1440p", label: "1440p", description: "Quad HD (2560x1440)" },
  { value: "4k", label: "4K", description: "Ultra HD (3840x2160)" },
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

  const [preset, setPreset] = useState<ExportSettings["preset"]>("fast");
  const [crf, setCrf] = useState<ExportSettings["crf"]>(23);
  const [fps, setFps] = useState<ExportSettings["fps"]>(60);
  const [format, setFormat] = useState<ExportSettings["format"]>("mp4");
  const [resolution, setResolution] =
    useState<ExportSettings["resolution"]>("1080p");
  const [bitrate, setBitrate] =
    useState<ExportSettings["bitrate"]>("recommended");
  const [customBitrateKbps, setCustomBitrateKbps] = useState<number>(8000);

  const getRecommendedBitrate = useCallback(() => {
    const selectedResolution = resolution;
    const selectedFps = fps;
    return (
      EXPORT_BITRATE_MAP[selectedResolution]?.[selectedFps]?.standard || 8000
    );
  }, [resolution, fps]);

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

        setPreset("fast");
        setCrf(23);
        setFps(60);
        setFormat("mp4");
        setResolution("1080p");
        setBitrate("recommended");
        setCustomBitrateKbps(getRecommendedBitrate());
      }, 0);
    }

    return () => {
      if (dateRef.current) dateRef.current.value = "";
      if (timeRef.current) timeRef.current.value = "";
      if (clipTitleRef.current) clipTitleRef.current.value = "";
      if (streamerNameRef.current) streamerNameRef.current.value = "";
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
    onExport(outputName, {
      preset,
      crf,
      fps,
      format,
      resolution,
      bitrate,
      customBitrateKbps,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[475px] max-h-[80vh] overflow-y-auto">
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
            <label htmlFor="resolution" className="text-right text-xs">
              Resolution
            </label>
            <Select
              value={String(resolution)}
              onValueChange={(value) => {
                setResolution(value as ExportSettings["resolution"]);

                if (bitrate === "recommended") {
                  setCustomBitrateKbps(getRecommendedBitrate());
                }
              }}
            >
              <SelectTrigger
                id="resolution"
                className="col-span-3 h-auto px-2 py-1 text-xs"
              >
                <SelectValue placeholder="Select resolution" />
              </SelectTrigger>
              <SelectContent>
                {resolutionOptions.map((res) => (
                  <SelectItem key={res.value} value={res.value}>
                    <div className="flex items-center justify-between w-full">
                      <span>{res.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {res.description}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="fps" className="text-right text-xs">
              Frame Rate
            </label>
            <Select
              value={String(fps)}
              onValueChange={(value) => {
                setFps(parseInt(value) as ExportSettings["fps"]);

                if (bitrate === "recommended") {
                  setCustomBitrateKbps(getRecommendedBitrate());
                }
              }}
            >
              <SelectTrigger
                id="fps"
                className="col-span-3 h-auto px-2 py-1 text-xs"
              >
                <SelectValue placeholder="Select FPS" />
              </SelectTrigger>
              <SelectContent>
                {fpsOptions.map((f) => (
                  <SelectItem key={f.value} value={String(f.value)}>
                    <div className="flex items-center justify-between w-full">
                      <span>{f.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {f.description}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="bitrate" className="text-right text-xs">
              Bitrate
            </label>
            <Select
              value={bitrate}
              onValueChange={(value) => {
                setBitrate(value as ExportSettings["bitrate"]);
                if (value === "recommended") {
                  setCustomBitrateKbps(getRecommendedBitrate());
                } else if (value === "high") {
                  const highBitrate =
                    EXPORT_BITRATE_MAP[resolution][fps]?.high || 12000;
                  setCustomBitrateKbps(highBitrate * 1000);
                } else if (value === "min") {
                  const minBitrate =
                    EXPORT_BITRATE_MAP[resolution][fps]?.min || 4000;
                  setCustomBitrateKbps(minBitrate * 1000);
                }
              }}
            >
              <SelectTrigger
                id="bitrate"
                className="col-span-3 h-auto px-2 py-1 text-xs"
              >
                <SelectValue placeholder="Select bitrate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">
                  <div className="flex items-center justify-between w-full">
                    <span>Recommended</span>
                    <Badge variant="secondary" className="ml-2">
                      {getRecommendedBitrate()} kbps
                    </Badge>
                  </div>
                </SelectItem>
                <SelectItem value="high">
                  <div className="flex items-center justify-between w-full">
                    <span>High Quality</span>
                    <Badge variant="secondary" className="ml-2">
                      {EXPORT_BITRATE_MAP[resolution][fps]?.high || 12000} kbps
                    </Badge>
                  </div>
                </SelectItem>
                <SelectItem value="min">
                  <div className="flex items-center justify-between w-full">
                    <span>Minimum</span>
                    <Badge variant="secondary" className="ml-2">
                      {EXPORT_BITRATE_MAP[resolution][fps]?.min || 4000} kbps
                    </Badge>
                  </div>
                </SelectItem>
                <SelectItem value="custom">
                  <div className="flex items-center justify-between w-full">
                    <span>Custom</span>
                    <Badge variant="secondary" className="ml-2">
                      Manual Input
                    </Badge>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {bitrate === "custom" && (
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="customBitrate" className="text-right text-xs">
                Custom Bitrate (kbps)
              </label>
              <Input
                required
                id="customBitrate"
                type="number"
                min="1000"
                max="50000"
                defaultValue={customBitrateKbps}
                onChange={(e) => setCustomBitrateKbps(parseInt(e.target.value))}
                className="col-span-3 text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="format" className="text-right text-xs">
              Format
            </label>
            <Select
              value={format}
              onValueChange={(value) =>
                setFormat(value as ExportSettings["format"])
              }
            >
              <SelectTrigger
                id="format"
                className="col-span-3 h-auto px-2 py-1 text-xs"
              >
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {formatOptions.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    <div className="flex items-center justify-between w-full">
                      <span>{f.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {f.description}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="preset" className="text-right text-xs">
              Preset
            </label>
            <Select
              value={preset}
              onValueChange={(value) =>
                setPreset(value as ExportSettings["preset"])
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
              value={String(crf)}
              onValueChange={(value) =>
                setCrf(parseInt(value) as ExportSettings["crf"])
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
