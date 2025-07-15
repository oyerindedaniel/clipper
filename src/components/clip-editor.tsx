import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Download,
  Settings,
  Type,
  Music,
  Scissors,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
} from "lucide-react";
import {
  ClipMarker,
  TextOverlay,
  AudioTrack,
  ExportSettings,
  ExportProgressInfo,
} from "@/types/app";
import { IpcRendererEvent } from "electron";
import { toast } from "sonner";
import { normalizeError } from "@/utils/error-utils";

interface ClipEditorProps {
  clip: ClipMarker | null;
  onClipExported: () => void;
}

type ClipToolType = "clips" | "text" | "audio" | "export";

const ClipEditor = ({ clip, onClipExported }: ClipEditorProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
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
  const [showPreview, setShowPreview] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime * 1000);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration * 1000);
      if (clip) {
        setTrimStart(0);
        setTrimEnd(video.duration * 1000);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [clip]);

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

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time / 1000;
  };

  const skipBackward = () => {
    seekTo(Math.max(0, currentTime - 5000));
  };

  const skipForward = () => {
    seekTo(Math.min(duration, currentTime + 5000));
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.volume = volume;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;

    setVolume(newVolume);
    if (!isMuted) {
      video.volume = newVolume;
    }
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    const timeline = timelineRef.current;
    if (!timeline) return;

    const rect = timeline.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const timelineWidth = rect.width;
    const clickTime = (clickX / timelineWidth) * duration;

    seekTo(clickTime);
  };

  const handleTrimStartChange = (newStart: number) => {
    setTrimStart(Math.max(0, Math.min(newStart, trimEnd - 1000)));
  };

  const handleTrimEndChange = (newEnd: number) => {
    setTrimEnd(Math.min(duration, Math.max(newEnd, trimStart + 1000)));
  };

  const addTextOverlay = () => {
    const newOverlay: TextOverlay = {
      id: `text_${Date.now()}`,
      text: "New Text",
      startTime: currentTime,
      endTime: currentTime + 5000,
      x: 50,
      y: 50,
      fontSize: 48,
      fontFamily: "Inter",
      letterSpacing: "-0.03em",
      color: "#ffffff",
      backgroundColor: "#000000",
      opacity: 0.8,
      bold: false,
      italic: false,
      underline: false,
      alignment: "center",
      visible: true,
    };
    setTextOverlays([...textOverlays, newOverlay]);
    setSelectedOverlay(newOverlay.id);
  };

  const updateTextOverlay = (id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(
      textOverlays.map((overlay) =>
        overlay.id === id ? { ...overlay, ...updates } : overlay
      )
    );
  };

  const deleteTextOverlay = (id: string) => {
    setTextOverlays(textOverlays.filter((overlay) => overlay.id !== id));
    if (selectedOverlay === id) {
      setSelectedOverlay(null);
    }
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
        startTime: trimStart,
        endTime: trimEnd,
        outputName: `clip_${clip.id}`,
        outputPath,
        textOverlays: textOverlays.filter((overlay) => overlay.visible),
        audioTracks: audioTracks.filter((track) => track.visible),
        exportSettings,
      };

      const result = await window.electronAPI.exportClip(exportData);

      if (result.success) {
        toast.success(`Clip exported successfully to: ${result.outputPath}`);
      } else {
        toast.error("Export failed");
      }
    } catch (error) {
      console.error("Export error:", error);
      const normalizedError = normalizeError(error);
      toast.error(`Export failed: ${normalizedError.message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
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
          const totalTime = trimEnd - trimStart;
          setExportProgress(Math.min(100, (progressTime / totalTime) * 100));
        }
      }
    };

    window.electronAPI.onExportProgress(handleExportProgress);
    return () => window.electronAPI.removeAllListeners("export-progress");
  }, [clip, trimStart, trimEnd]);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-xl font-bold">Clip Editor</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
          >
            {showPreview ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
          <button
            onClick={handleExport}
            disabled={!clip || isExporting}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Download size={20} />
            <span>{isExporting ? "Exporting..." : "Export"}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
          <div className="flex border-b border-gray-700">
            {[
              { id: "clips", label: "Clips", icon: Scissors },
              { id: "text", label: "Text", icon: Type },
              { id: "audio", label: "Audio", icon: Music },
              { id: "export", label: "Export", icon: Settings },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as ClipToolType)}
                className={`flex-1 p-3 flex items-center justify-center space-x-2 ${
                  activeTab === id
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                } transition-colors`}
              >
                <Icon size={18} />
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "clips" && clip && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Clip</h3>
                {[clip].map((clip) => (
                  <div key={clip.id}>
                    <div className="font-medium">{`Clip ${clip.id}`}</div>
                    <div className="text-sm text-gray-400">
                      {formatTime(clip.endTime - clip.startTime)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "text" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Text Overlays</h3>
                  <button
                    onClick={addTextOverlay}
                    className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {textOverlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    className={`p-3 rounded-lg border-2 ${
                      selectedOverlay === overlay.id
                        ? "border-blue-500 bg-blue-900/20"
                        : "border-gray-600 bg-gray-700/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <input
                        type="text"
                        value={overlay.text}
                        onChange={(e) =>
                          updateTextOverlay(overlay.id, {
                            text: e.target.value,
                          })
                        }
                        className="flex-1 bg-gray-800 rounded px-2 py-1 text-sm"
                        placeholder="Text content"
                      />
                      <div className="flex items-center space-x-1 ml-2">
                        <button
                          onClick={() =>
                            updateTextOverlay(overlay.id, {
                              visible: !overlay.visible,
                            })
                          }
                          className={`p-1 rounded ${
                            overlay.visible ? "text-blue-400" : "text-gray-500"
                          }`}
                        >
                          {overlay.visible ? (
                            <Eye size={16} />
                          ) : (
                            <EyeOff size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => deleteTextOverlay(overlay.id)}
                          className="p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {selectedOverlay === overlay.id && (
                      <div className="space-y-3 mt-3 pt-3 border-t border-gray-600">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              Font Size
                            </label>
                            <input
                              type="range"
                              min="12"
                              max="120"
                              value={overlay.fontSize}
                              onChange={(e) =>
                                updateTextOverlay(overlay.id, {
                                  fontSize: parseInt(e.target.value),
                                })
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              Opacity
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={overlay.opacity}
                              onChange={(e) =>
                                updateTextOverlay(overlay.id, {
                                  opacity: parseFloat(e.target.value),
                                })
                              }
                              className="w-full"
                            />
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() =>
                              updateTextOverlay(overlay.id, {
                                bold: !overlay.bold,
                              })
                            }
                            className={`p-2 rounded ${
                              overlay.bold ? "bg-blue-600" : "bg-gray-700"
                            }`}
                          >
                            <Bold size={16} />
                          </button>
                          <button
                            onClick={() =>
                              updateTextOverlay(overlay.id, {
                                italic: !overlay.italic,
                              })
                            }
                            className={`p-2 rounded ${
                              overlay.italic ? "bg-blue-600" : "bg-gray-700"
                            }`}
                          >
                            <Italic size={16} />
                          </button>
                          <button
                            onClick={() =>
                              updateTextOverlay(overlay.id, {
                                underline: !overlay.underline,
                              })
                            }
                            className={`p-2 rounded ${
                              overlay.underline ? "bg-blue-600" : "bg-gray-700"
                            }`}
                          >
                            <Underline size={16} />
                          </button>
                        </div>

                        <div className="flex items-center space-x-2">
                          {[
                            { value: "left", icon: AlignLeft },
                            { value: "center", icon: AlignCenter },
                            { value: "right", icon: AlignRight },
                          ].map(({ value, icon: Icon }) => (
                            <button
                              key={value}
                              onClick={() =>
                                updateTextOverlay(overlay.id, {
                                  alignment: value as TextOverlay["alignment"],
                                })
                              }
                              className={`p-2 rounded ${
                                overlay.alignment === value
                                  ? "bg-blue-600"
                                  : "bg-gray-700"
                              }`}
                            >
                              <Icon size={16} />
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              Text Color
                            </label>
                            <input
                              type="color"
                              value={overlay.color}
                              onChange={(e) =>
                                updateTextOverlay(overlay.id, {
                                  color: e.target.value,
                                })
                              }
                              className="w-full h-8 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              Background
                            </label>
                            <input
                              type="color"
                              value={overlay.backgroundColor}
                              onChange={(e) =>
                                updateTextOverlay(overlay.id, {
                                  backgroundColor: e.target.value,
                                })
                              }
                              className="w-full h-8 rounded"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              Start Time
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={duration}
                              value={Math.floor(overlay.startTime / 1000)}
                              onChange={(e) =>
                                updateTextOverlay(overlay.id, {
                                  startTime: parseInt(e.target.value) * 1000,
                                })
                              }
                              className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              End Time
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={duration}
                              value={Math.floor(overlay.endTime / 1000)}
                              onChange={(e) =>
                                updateTextOverlay(overlay.id, {
                                  endTime: parseInt(e.target.value) * 1000,
                                })
                              }
                              className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === "audio" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Audio Tracks</h3>
                  <button
                    onClick={addAudioTrack}
                    className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </div>

                <input
                  ref={audioFileRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioFileSelect}
                  className="hidden"
                />

                {audioTracks.map((track) => (
                  <div
                    key={track.id}
                    className="p-3 rounded-lg border-2 border-gray-600 bg-gray-700/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium truncate">{track.name}</span>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() =>
                            updateAudioTrack(track.id, {
                              visible: !track.visible,
                            })
                          }
                          className={`p-1 rounded ${
                            track.visible ? "text-blue-400" : "text-gray-500"
                          }`}
                        >
                          {track.visible ? (
                            <Eye size={16} />
                          ) : (
                            <EyeOff size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => deleteAudioTrack(track.id)}
                          className="p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Volume
                        </label>
                        <input
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
                          className="w-full"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            Start Time
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={duration}
                            value={Math.floor(track.startTime / 1000)}
                            onChange={(e) =>
                              updateAudioTrack(track.id, {
                                startTime: parseInt(e.target.value) * 1000,
                              })
                            }
                            className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            End Time
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={duration}
                            value={Math.floor(track.endTime / 1000)}
                            onChange={(e) =>
                              updateAudioTrack(track.id, {
                                endTime: parseInt(e.target.value) * 1000,
                              })
                            }
                            className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
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
                <h3 className="text-lg font-semibold">Export Settings</h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">
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
                      className="w-full bg-gray-800 rounded px-3 py-2"
                    >
                      <option value="mp4">MP4</option>
                      <option value="webm">WebM</option>
                      <option value="mov">MOV</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Quality
                    </label>
                    <select
                      value={exportSettings.quality}
                      onChange={(e) =>
                        setExportSettings({
                          ...exportSettings,
                          quality: e.target.value as ExportSettings["quality"],
                        })
                      }
                      className="w-full bg-gray-800 rounded px-3 py-2"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="ultra">Ultra</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
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
                      className="w-full bg-gray-800 rounded px-3 py-2"
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                      <option value="1440p">1440p</option>
                      <option value="4k">4K</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
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
                      className="w-full bg-gray-800 rounded px-3 py-2"
                    >
                      <option value="30">30 FPS</option>
                      <option value="60">60 FPS</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Bitrate (kbps)
                    </label>
                    <input
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
                      className="w-full bg-gray-800 rounded px-3 py-2"
                    />
                  </div>

                  {isExporting && (
                    <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm">Exporting...</span>
                        <span className="text-sm">
                          {Math.round(exportProgress)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
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

        <div className="flex-1 flex flex-col">
          {showPreview && clip && (
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                className="max-w-full max-h-full"
                src={`file://${clip.bufferFile}`}
                onError={(e) => console.error("Video load error:", e)}
              />

              <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none"
                width={videoRef.current?.videoWidth || 1920}
                height={videoRef.current?.videoHeight || 1080}
              />

              {textOverlays
                .filter(
                  (overlay) =>
                    overlay.visible &&
                    currentTime >= overlay.startTime &&
                    currentTime <= overlay.endTime
                )
                .map((overlay) => (
                  <div
                    key={overlay.id}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      fontSize: `${overlay.fontSize}px`,
                      fontFamily: overlay.fontFamily,
                      letterSpacing: overlay.letterSpacing,
                      color: overlay.color,
                      backgroundColor: overlay.backgroundColor,
                      opacity: overlay.opacity,
                      fontWeight: overlay.bold ? "bold" : "normal",
                      fontStyle: overlay.italic ? "italic" : "normal",
                      textDecoration: overlay.underline ? "underline" : "none",
                      textAlign: overlay.alignment,
                      padding: "8px 12px",
                      borderRadius: "4px",
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {overlay.text}
                  </div>
                ))}
            </div>
          )}

          <div className="bg-gray-800 p-4 border-t border-gray-700">
            <div className="mb-4">
              <div
                ref={timelineRef}
                className="relative h-12 bg-gray-700 rounded-lg cursor-pointer overflow-hidden"
                onClick={handleTimelineClick}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-900/30 to-purple-900/30" />

                <div
                  className="absolute top-0 bottom-0 bg-green-500/30 border-l-2 border-green-500"
                  style={{ left: `${(trimStart / duration) * 100}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 bg-green-500/30 border-r-2 border-green-500"
                  style={{ left: `${(trimEnd / duration) * 100}%` }}
                />

                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />

                {textOverlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    className="absolute top-0 h-2 bg-yellow-500/70 rounded"
                    style={{
                      left: `${(overlay.startTime / duration) * 100}%`,
                      width: `${
                        ((overlay.endTime - overlay.startTime) / duration) * 100
                      }%`,
                    }}
                  />
                ))}

                {audioTracks.map((track) => (
                  <div
                    key={track.id}
                    className="absolute bottom-0 h-2 bg-purple-500/70 rounded"
                    style={{
                      left: `${(track.startTime / duration) * 100}%`,
                      width: `${
                        ((track.endTime - track.startTime) / duration) * 100
                      }%`,
                    }}
                  />
                ))}
              </div>

              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{formatTime(0)}</span>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={skipBackward}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <SkipBack size={20} />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="p-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>

                <button
                  onClick={skipForward}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <SkipForward size={20} />
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>

                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) =>
                    handleVolumeChange(parseFloat(e.target.value))
                  }
                  className="w-24"
                />
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-400">Start:</label>
                  <input
                    type="number"
                    min="0"
                    max={duration / 1000}
                    value={Math.floor(trimStart / 1000)}
                    onChange={(e) =>
                      handleTrimStartChange(parseInt(e.target.value) * 1000)
                    }
                    className="w-20 bg-gray-700 rounded px-2 py-1 text-sm"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-400">End:</label>
                  <input
                    type="number"
                    min="0"
                    max={duration / 1000}
                    value={Math.floor(trimEnd / 1000)}
                    onChange={(e) =>
                      handleTrimEndChange(parseInt(e.target.value) * 1000)
                    }
                    className="w-20 bg-gray-700 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClipEditor;
