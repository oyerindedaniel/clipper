import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Download,
  Settings,
  Type,
  Music,
  Scissors,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ClipMarker,
  AudioTrack,
  ExportSettings,
  ExportProgressInfo,
  CropMode,
} from "@/types/app";
import { IpcRendererEvent } from "electron";
import { toast } from "sonner";
import { normalizeError } from "@/utils/error-utils";
import recordingService from "@/services/recording-service";
import logger from "@/utils/logger";
import { useTextOverlays } from "@/hooks/use-text-overlays";
import { DraggableTextOverlay } from "./draggable-text-overlay";
import TextOverlayItem from "./text-overlay-item";
import { redirect, RedirectType } from "next/navigation";
import { getVideoBoundingBox } from "@/utils/app";
import * as MediaPlayer from "@/components/ui/media-player";
import AspectRatioSelector from "./aspect-ratio-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDisclosure } from "@/hooks/use-disclosure";
import { DEFAULT_ASPECT_RATIO, DEFAULT_CROP_MODE } from "@/constants/app";
import { Timeline } from "@/components/timeline";
import { TimelineSkeleton } from "@/components/timeline-skeleton";

interface ClipEditorProps {
  clip: ClipMarker | null;
  onBlobLoaded: (
    clipId: string,
    dimensions: { width: number; height: number }
  ) => void;
  onExportSettingsChange: (
    convertAspectRatio: string,
    cropMode: string
  ) => void;
}

type ClipToolType = "clips" | "text" | "audio" | "export";

const ClipEditor = ({
  clip,
  onBlobLoaded,
  onExportSettingsChange,
}: ClipEditorProps) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: "mp4",
    quality: "high",
    resolution: "1080p",
    fps: 60,
    bitrate: 8000,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<ClipToolType>("clips");
  const [zoomLevel, setZoomLevel] = useState(1);

  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const {
    isOpen: isAspectRatioModalOpen,
    close: closeAspectRatioModal,
    open: openAspectRatioModal,
  } = useDisclosure();
  const selectedConvertAspectRatio = useRef<string>(DEFAULT_ASPECT_RATIO);
  const selectedCropMode = useRef<CropMode>(DEFAULT_CROP_MODE);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);

  const traceRef = useRef<HTMLDivElement>(null);

  if (!clip) {
    redirect("/", RedirectType.replace);
  }

  const {
    textOverlays,
    selectedOverlay,
    setSelectedOverlay,
    addTextOverlay,
    updateTextOverlay,
    deleteTextOverlay,
    getTimeBasedOverlays,
    getAllVisibleOverlays,
    containerRef,
    startDrag,
  } = useTextOverlays(videoRef);

  const adjustOverlayBounds = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    const trace = traceRef.current;

    if (!video || !container || !trace) return;

    // Force media player client width based on container
    logger.log("-------container width", container.clientWidth);
    video.style.width = `${container.clientWidth}px`;

    logger.log("-------after - container width", container.clientWidth);

    const { x, y, width, height } = getVideoBoundingBox(video);

    trace.style.position = "absolute";
    trace.style.left = `${x}px`;
    trace.style.top = `${y}px`;
    trace.style.width = `${width}px`;
    trace.style.height = `${height}px`;
    trace.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
    trace.style.pointerEvents = "none";
    trace.style.zIndex = "99";
  }, []);

  const loadClipVideo = useCallback(async (): Promise<string | null> => {
    const video = videoRef.current;
    if (!clip || typeof window === "undefined" || !recordingService || !video)
      return null;

    logger.log("Requesting clip blob for:", {
      clipId: clip.id,
      startTime: clip.startTime,
      endTime: clip.endTime,
    });

    try {
      const blob = await recordingService.getClipBlob(
        clip.startTime,
        clip.endTime,
        {
          convertAspectRatio: selectedConvertAspectRatio.current,
          cropMode: selectedCropMode.current,
        }
      );

      if (blob && blob.size > 0) {
        const objectUrl = URL.createObjectURL(blob);
        video.src = objectUrl;
        logger.log("Set video src to blob URL:", objectUrl);
        return objectUrl;
      } else {
        logger.error("Failed to get valid clip blob:", { blob });
        return null;
      }
    } catch (err) {
      logger.error("Error loading clip blob:", err);
      return null;
    }
  }, [clip?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;

    const handleLoadedMetadata = () => {
      setIsVideoLoaded(true);
      setDuration(video.duration * 1000);

      adjustOverlayBounds();

      const dimensions = { width: video.videoWidth, height: video.videoHeight };
      onBlobLoaded(clip.id, dimensions);

      logger.log("📹 Video metadata loaded:", {
        durationMs: video.duration * 1000,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        videoSrc: video.currentSrc,
      });

      logger.log("🧱 Rendered video element dimensions:", {
        clientWidth: video.clientWidth,
        clientHeight: video.clientHeight,
      });
    };

    const handleError = (e: Event) => {
      setIsVideoLoaded(false);
      logger.error("Video load error:", e);
      const videoElement = e.target as HTMLVideoElement;
      logger.error("Video error details:", {
        error: videoElement.error,
        networkState: videoElement.networkState,
        readyState: videoElement.readyState,
        currentSrc: videoElement.currentSrc,
      });
    };

    let currentObjectUrl: string | null = null;

    (async () => {
      currentObjectUrl = await loadClipVideo();
    })();

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);

    window.addEventListener("resize", adjustOverlayBounds);

    return () => {
      logger.log("Cleaning up effect");

      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      window.removeEventListener("resize", adjustOverlayBounds);

      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [clip?.id, loadClipVideo, adjustOverlayBounds]);

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, "0")}:${(
        seconds % 60
      )
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
  };

  const addAudioTrack = () => {
    if (audioFileRef.current) {
      audioFileRef.current.click();
    }
  };

  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newTrack: AudioTrack = {
      id: `audio_${Date.now()}`,
      name: file.name,
      file,
      volume: 1,
      startTime: 0,
      endTime: duration,
      visible: true,
    };
    setAudioTracks([...audioTracks, newTrack]);
  };

  const updateAudioTrack = (id: string, updates: Partial<AudioTrack>) => {
    setAudioTracks(
      audioTracks.map((track) =>
        track.id === id ? { ...track, ...updates } : track
      )
    );
  };

  const deleteAudioTrack = (id: string) => {
    setAudioTracks(audioTracks.filter((track) => track.id !== id));
  };

  const handleExport = async () => {
    if (!clip) return;

    setIsExporting(true);
    setExportProgress(0);

    try {
      const outputPath = await window.electronAPI.selectOutputFolder();
      if (!outputPath) {
        setIsExporting(false);
        return;
      }

      const exportData = {
        id: clip.id,
        startTime: 0,
        endTime: duration,
        outputName: `${clip.id}`,
        outputPath,
        textOverlays: textOverlays.filter((overlay) => overlay.visible),
        audioTracks: audioTracks.filter((track) => track.visible),
        exportSettings: {
          ...exportSettings,
          convertAspectRatio: selectedConvertAspectRatio.current || undefined,
          cropMode: selectedCropMode.current,
        },
      };

      const result = await window.electronAPI.exportClip(exportData);

      if (result.success) {
        toast.success(`Clip exported successfully to: ${result.outputPath}`);
        closeAspectRatioModal();
        onExportSettingsChange(
          selectedConvertAspectRatio.current,
          selectedCropMode.current
        );
      } else {
        toast.error("Export failed");
      }
    } catch (error) {
      logger.error("Export error:", error);
      const normalizedError = normalizeError(error);
      toast.error(`Export failed: ${normalizedError.message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleSettingsApplied = (aspectRatio: string, cropMode: string) => {
    selectedConvertAspectRatio.current = aspectRatio;
    selectedCropMode.current = cropMode as CropMode;
    closeAspectRatioModal();
    // Reload the video with new aspect ratio and crop mode settings
    loadClipVideo();
  };

  const handleTrim = (startTime: number, endTime: number) => {
    logger.log("Trimmed video from:", startTime, "to:", endTime);
    // Dummy function for now, replace with actual trim logic
  };

  useEffect(() => {
    const handleExportProgress = (
      _: IpcRendererEvent,
      progressInfo: ExportProgressInfo
    ) => {
      if (progressInfo.clipId === clip?.id) {
        // Parse FFmpeg progress (time format: 00:00:00.00)
        const timeMatch = progressInfo.progress.match(
          /(\d+):(\d+):(\d+)\.(\d+)/
        );
        if (timeMatch) {
          const [, hours, minutes, seconds, centiseconds] = timeMatch;
          const progressTime =
            (parseInt(hours) * 3600 +
              parseInt(minutes) * 60 +
              parseInt(seconds)) *
              1000 +
            parseInt(centiseconds) * 10;
          const totalTime = duration;
          setExportProgress(Math.min(100, (progressTime / totalTime) * 100));
        }
      }
    };

    window.electronAPI.onExportProgress(handleExportProgress);
    return () => window.electronAPI.removeAllListeners("export-progress");
  }, [clip?.id]);

  return (
    <div className="flex flex-col h-screen bg-surface-primary text-foreground-default text-sm">
      <div className="max-w-screen-xl mx-auto w-full">
        <div className="flex items-center justify-between p-4 bg-surface-secondary border-b border-gray-700/50">
          <h1 className="text-lg font-bold">Clip Editor</h1>
          <div className="flex items-center space-x-2">
            <Button
              className="flex items-center space-x-2 px-3 py-1.5 text-xs"
              variant="ghost"
              onClick={() => openAspectRatioModal()}
            >
              <Settings size={16} />
              <span>Settings</span>
            </Button>

            <Button
              onClick={handleExport}
              disabled={!clip || isExporting}
              className="flex items-center space-x-2 px-3 py-1.5 text-xs"
              variant="default"
            >
              <Download size={16} />
              <span>{isExporting ? "Exporting..." : "Export"}</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-col p-4 space-y-4 overflow-hidden pb-16">
          {clip && (
            <div
              ref={containerRef}
              className="relative w-full aspect-video flex items-center justify-center overflow-hidden rounded-lg bg-surface-secondary shadow-md border border-gray-700/50"
            >
              <MediaPlayer.Root>
                <MediaPlayer.Video
                  ref={videoRef}
                  playsInline
                  className="w-full aspect-video"
                  poster="/thumbnails/video-thumb.png"
                />
                <MediaPlayer.Loading />
                <MediaPlayer.Error />
                <MediaPlayer.VolumeIndicator />
                <MediaPlayer.Controls>
                  <MediaPlayer.ControlsOverlay />
                  <MediaPlayer.Play />
                  <MediaPlayer.SeekBackward />
                  <MediaPlayer.SeekForward />
                  <MediaPlayer.Volume />
                  <MediaPlayer.Seek />
                  <MediaPlayer.Time />
                  <MediaPlayer.PlaybackSpeed />
                  <MediaPlayer.Loop />
                  <MediaPlayer.Captions />
                  <MediaPlayer.PiP />
                  <MediaPlayer.Fullscreen />
                  <MediaPlayer.Download />
                </MediaPlayer.Controls>
              </MediaPlayer.Root>

              {/* <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none"
              /> */}

              <div ref={traceRef} className="absolute" />

              {getTimeBasedOverlays(currentTime).map((overlay) => (
                <DraggableTextOverlay
                  key={overlay.id}
                  overlay={overlay}
                  isSelected={selectedOverlay === overlay.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startDrag(overlay.id, e);
                  }}
                />
              ))}

              {getAllVisibleOverlays()
                .filter(
                  (overlay) =>
                    overlay.startTime === 0 && overlay.endTime >= duration
                )
                .map((overlay) => (
                  <DraggableTextOverlay
                    key={`persistent-${overlay.id}`}
                    overlay={overlay}
                    isSelected={selectedOverlay === overlay.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startDrag(overlay.id, e);
                    }}
                  />
                ))}
            </div>
          )}

          {isVideoLoaded ? (
            <Timeline
              duration={duration}
              currentTime={currentTime}
              onTrim={handleTrim}
            />
          ) : (
            <TimelineSkeleton />
          )}

          <div className="flex-1 flex flex-col bg-surface-primary rounded-lg shadow-md overflow-hidden border border-gray-700/50">
            <div className="flex border-b border-gray-700/50">
              {[
                { id: "clips", label: "Clips", icon: Scissors },
                { id: "text", label: "Text", icon: Type },
                { id: "audio", label: "Audio", icon: Music },
                { id: "export", label: "Export", icon: Settings },
              ].map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  onClick={() => setActiveTab(id as ClipToolType)}
                  className={`flex-1 py-2 px-1 flex items-center justify-center space-x-1.5 rounded-none text-xs
                    ${
                      activeTab === id
                        ? "bg-primary text-foreground-on-accent border-b-2 border-primary"
                        : "text-foreground-subtle hover:text-foreground-default hover:bg-surface-hover"
                    }
                    transition-colors
                  `}
                  variant="ghost"
                  disabled={!isVideoLoaded}
                >
                  <Icon size={16} />
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "clips" && clip && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground-default">
                    Clip
                  </h3>
                  {[clip].map((clip) => (
                    <div key={clip.id}>
                      <div className="font-medium text-foreground-default text-sm">{`Clip ${clip.id}`}</div>
                      <div className="text-xs text-foreground-subtle">
                        {formatTime(clip.endTime - clip.startTime)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "text" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-foreground-default">
                      Text Overlays
                    </h3>
                    <Button
                      onClick={() => addTextOverlay(0, duration)}
                      className="p-1.5"
                      variant="default"
                      size="icon"
                    >
                      <Plus size={16} />
                    </Button>
                  </div>
                  {textOverlays.map((textOverlay) => (
                    <TextOverlayItem
                      key={textOverlay.id}
                      overlay={textOverlay}
                      selectedOverlay={selectedOverlay}
                      duration={duration}
                      currentTime={currentTime}
                      updateTextOverlay={updateTextOverlay}
                      deleteTextOverlay={deleteTextOverlay}
                    />
                  ))}
                </div>
              )}

              {activeTab === "audio" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-foreground-default">
                      Audio Tracks
                    </h3>
                    <Button
                      onClick={addAudioTrack}
                      className="p-1.5"
                      variant="default"
                      size="icon"
                    >
                      <Plus size={16} />
                    </Button>
                  </div>

                  <Input
                    ref={audioFileRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioFileSelect}
                    className="hidden"
                  />

                  {audioTracks.map((track) => (
                    <div
                      key={track.id}
                      className="p-3 rounded-lg border border-gray-700/50 bg-surface-secondary"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium truncate text-foreground-default text-sm">
                          {track.name}
                        </span>
                        <div className="flex items-center space-x-1">
                          <Button
                            onClick={() =>
                              updateAudioTrack(track.id, {
                                visible: !track.visible,
                              })
                            }
                            className={`p-1 rounded ${
                              track.visible
                                ? "text-accent-primary"
                                : "text-foreground-muted"
                            }`}
                            variant="ghost"
                            size="icon"
                          >
                            {track.visible ? (
                              <Eye size={14} />
                            ) : (
                              <EyeOff size={14} />
                            )}
                          </Button>
                          <Button
                            onClick={() => deleteAudioTrack(track.id)}
                            className="p-1 text-error hover:text-error/80"
                            variant="ghost"
                            size="icon"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-foreground-subtle mb-1">
                            Volume
                          </label>
                          <Input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={track.volume}
                            onChange={(e) =>
                              updateAudioTrack(track.id, {
                                volume: parseFloat(e.target.value),
                              })
                            }
                            className="h-7"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-foreground-subtle mb-1">
                              Start Time
                            </label>
                            <Input
                              type="number"
                              min="0"
                              max={duration}
                              value={Math.floor(track.startTime / 1000)}
                              onChange={(e) =>
                                updateAudioTrack(track.id, {
                                  startTime: parseInt(e.target.value) * 1000,
                                })
                              }
                              className="px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-foreground-subtle mb-1">
                              End Time
                            </label>
                            <Input
                              type="number"
                              min="0"
                              max={duration}
                              value={Math.floor(track.endTime / 1000)}
                              onChange={(e) =>
                                updateAudioTrack(track.id, {
                                  endTime: parseInt(e.target.value) * 1000,
                                })
                              }
                              className="px-2 py-1 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "export" && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground-default">
                    Export Settings
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground-default mb-1">
                        Format
                      </label>
                      <select
                        value={exportSettings.format}
                        onChange={(e) =>
                          setExportSettings({
                            ...exportSettings,
                            format: e.target.value as ExportSettings["format"],
                          })
                        }
                        className="w-full bg-surface-secondary rounded-md px-3 py-1.5 text-foreground-default border border-gray-700/50 text-xs"
                      >
                        <option value="mp4">MP4</option>
                        <option value="webm">WebM</option>
                        <option value="mov">MOV</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground-default mb-1">
                        Quality
                      </label>
                      <select
                        value={exportSettings.quality}
                        onChange={(e) =>
                          setExportSettings({
                            ...exportSettings,
                            quality: e.target
                              .value as ExportSettings["quality"],
                          })
                        }
                        className="w-full bg-surface-secondary rounded-md px-3 py-1.5 text-foreground-default border border-gray-700/50 text-xs"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="ultra">Ultra</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground-default mb-1">
                        Resolution
                      </label>
                      <select
                        value={exportSettings.resolution}
                        onChange={(e) =>
                          setExportSettings({
                            ...exportSettings,
                            resolution: e.target
                              .value as ExportSettings["resolution"],
                          })
                        }
                        className="w-full bg-surface-secondary rounded-md px-3 py-1.5 text-foreground-default border border-gray-700/50 text-xs"
                      >
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="1440p">1440p</option>
                        <option value="4k">4K</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground-default mb-1">
                        Frame Rate
                      </label>
                      <select
                        value={exportSettings.fps}
                        onChange={(e) =>
                          setExportSettings({
                            ...exportSettings,
                            fps: parseInt(
                              e.target.value
                            ) as ExportSettings["fps"],
                          })
                        }
                        className="w-full bg-surface-secondary rounded-md px-3 py-1.5 text-foreground-default border border-gray-700/50 text-xs"
                      >
                        <option value="30">30 FPS</option>
                        <option value="60">60 FPS</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground-default mb-1">
                        Bitrate (kbps)
                      </label>
                      <Input
                        type="number"
                        min="1000"
                        max="50000"
                        value={exportSettings.bitrate}
                        onChange={(e) =>
                          setExportSettings({
                            ...exportSettings,
                            bitrate: parseInt(e.target.value),
                          })
                        }
                        className="px-3 py-1.5 text-xs"
                      />
                    </div>

                    {isExporting && (
                      <div className="mt-4 p-3 bg-surface-secondary rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-foreground-default">
                            Exporting...
                          </span>
                          <span className="text-xs text-foreground-default">
                            {Math.round(exportProgress)}%
                          </span>
                        </div>
                        <div className="w-full bg-border-subtle rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${exportProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <AspectRatioSelector
          isOpen={isAspectRatioModalOpen}
          onOpenChange={closeAspectRatioModal}
          onSettingsApplied={handleSettingsApplied}
        />
      </div>
    </div>
  );
};

export default ClipEditor;
