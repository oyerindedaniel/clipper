import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Download,
  Folder,
  Scissors,
  RotateCcw,
} from "lucide-react";
import { ClipMarker } from "@/types/app";
import { normalizeError } from "@utils/error-utils";

interface ClipEditorProps {
  clip: ClipMarker | null;
  onClipExported: () => void;
}

export default function ClipEditor({ clip, onClipExported }: ClipEditorProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [outputName, setOutputName] = useState<string>("");
  const [outputPath, setOutputPath] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (clip) {
      const clipDuration = (clip.endTime - clip.startTime) / 1000;
      setDuration(clipDuration);
      setStartTime(0);
      setEndTime(clipDuration);
      setOutputName(
        `clip_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`
      );

      loadVideoBlob();
    }
  }, [clip]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      const handleExportProgress = (
        event: Electron.IpcRendererEvent,
        data: { clipId: string; progress: string }
      ) => {
        if (data.clipId === clip?.id) {
          setExportProgress(data.progress);
        }
      };
      window.electronAPI.onExportProgress(handleExportProgress);

      return () => {
        window.electronAPI.removeAllListeners("export-progress");
      };
    }
    return () => {};
  }, [clip]);

  const loadVideoBlob = async () => {
    if (!clip) return;

    if (typeof window !== "undefined" && window.recordingService) {
      const blob = window.recordingService.getClipBlob(
        clip.startTime,
        clip.endTime
      );
      if (blob) {
        setVideoBlob(blob);
        const url = URL.createObjectURL(blob);
        if (videoRef.current) {
          videoRef.current.src = url;
        }
      }
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * duration;

      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartTime = parseFloat(e.target.value);
    setStartTime(Math.max(0, Math.min(newStartTime, endTime - 0.1)));
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndTime = parseFloat(e.target.value);
    setEndTime(Math.max(startTime + 0.1, Math.min(newEndTime, duration)));
  };

  const handleSelectOutputPath = async () => {
    try {
      const path = await window.electronAPI.selectOutputFolder();
      if (path) {
        setOutputPath(path);
      }
    } catch (error: any) {
      console.error("Failed to select output path:", error);
      const normalizedError = normalizeError(error);
      alert(`Failed to select output path: ${normalizedError.message}`);
    }
  };

  const handleExport = async () => {
    if (!clip || !outputName.trim() || !outputPath) {
      alert("Please fill in all required fields");
      return;
    }

    setIsExporting(true);
    setExportProgress("Starting export...");

    try {
      const result = await window.electronAPI.exportClip({
        id: clip.id,
        startTime: startTime * 1000,
        endTime: endTime * 1000,
        outputName: outputName.trim(),
        outputPath: outputPath,
      });

      if (result.success) {
        alert(`Clip exported successfully to: ${result.outputPath}`);
        onClipExported();
      }
    } catch (error: any) {
      console.error("Export failed:", error);
      const normalizedError = normalizeError(error);
      alert(`Export failed: ${normalizedError.message}`);
    } finally {
      setIsExporting(false);
      setExportProgress("");
    }
  };

  const handleReset = () => {
    if (clip) {
      const clipDuration = (clip.endTime - clip.startTime) / 1000;
      setStartTime(0);
      setEndTime(clipDuration);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms
      .toString()
      .padStart(2, "0")}`;
  };

  if (!clip) {
    return (
      <div className="bg-gray-800 rounded-lg p-12 text-center">
        <div className="text-gray-400 text-lg mb-4">No clip selected</div>
        <div className="text-gray-500 text-sm">
          Select a clip from the clips list to edit it
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 bg-gradient-to-br from-gray-900 to-gray-950 min-h-screen text-white font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Clip Editor
        </h2>
        <div className="text-gray-400 text-sm">Clip ID: {clip.id}</div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
        <div className="aspect-video bg-black rounded-lg mb-4 relative">
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
              }
            }}
          />

          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <button
              onClick={handlePlayPause}
              className="bg-black bg-opacity-60 text-white p-4 rounded-full hover:bg-opacity-80 transition-all duration-300 transform hover:scale-110"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <div
              ref={timelineRef}
              className="h-2 bg-gray-700 rounded-full cursor-pointer relative"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-purple-500 rounded-full"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />

              <div
                className="absolute top-0 h-full bg-yellow-500 opacity-50"
                style={{
                  left: `${(startTime / duration) * 100}%`,
                  width: `${((endTime - startTime) / duration) * 100}%`,
                }}
              />

              <div
                className="absolute top-0 w-1 h-full bg-yellow-500 cursor-ew-resize"
                style={{ left: `${(startTime / duration) * 100}%` }}
              />

              <div
                className="absolute top-0 w-1 h-full bg-yellow-500 cursor-ew-resize"
                style={{ left: `${(endTime / duration) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Scissors className="mr-2" size={20} />
          Trim Settings
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Start Time (seconds)
            </label>
            <input
              type="number"
              value={startTime}
              onChange={handleStartTimeChange}
              min="0"
              max={endTime - 0.1}
              step="0.1"
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-3 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              End Time (seconds)
            </label>
            <input
              type="number"
              value={endTime}
              onChange={handleEndTimeChange}
              min={startTime + 0.1}
              max={duration}
              step="0.1"
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-3 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleReset}
              className="px-5 py-2.5 bg-gray-700 text-white rounded-lg shadow-md hover:bg-gray-750 transition-all duration-300 ease-in-out flex items-center space-x-2.5 transform hover:-translate-y-0.5"
            >
              <RotateCcw size={18} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-700 rounded-md">
          <p className="text-sm text-gray-300">
            Clip duration: {formatTime(endTime - startTime)}
          </p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Download className="mr-2" size={20} />
          Export Settings
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Output Name
            </label>
            <input
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="Enter filename (without extension)"
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-3 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Output Folder
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={outputPath}
                readOnly
                placeholder="Select output folder"
                className="flex-1 px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-3 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
              />
              <button
                onClick={handleSelectOutputPath}
                className="px-5 py-2.5 bg-gray-700 text-white rounded-lg shadow-md hover:bg-gray-750 transition-all duration-300 ease-in-out flex items-center space-x-2.5 transform hover:-translate-y-0.5"
              >
                <Folder size={18} />
                <span>Browse</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-lg shadow-md hover:from-green-700 hover:to-emerald-800 transition-all duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2.5 transform hover:-translate-y-0.5"
          >
            {isExporting ? (
              <>
                <span className="animate-spin">
                  <RotateCcw size={18} />
                </span>
                <span>Exporting... {exportProgress}</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Export Clip</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
