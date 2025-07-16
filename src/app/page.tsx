"use client";

import { useState, useEffect, startTransition, useCallback } from "react";
import StreamViewer from "@/components/stream-viewer";
import RecordingControls from "@/components/recording-controls";
import ClipEditor from "@/components/clip-editor";
import ClipList from "../components/clip-list";
import { ClipMarker, RecordingStartedInfo } from "@/types/app";
import { IpcRendererEvent } from "electron";
import { normalizeError } from "@/utils/error-utils";
import { toast } from "sonner";
import recordingService from "@/services/recording-service";

type TabKey = "stream" | "clips" | "editor";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("stream");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [clipMarkers, setClipMarkers] = useState<ClipMarker[]>([]);
  const [selectedClip, setSelectedClip] = useState<ClipMarker | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
    null
  );
  const [currentStream, setCurrentStream] =
    useState<RecordingStartedInfo | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      // Handle recording service requests from main process
      window.electronAPI.onRequestStartRecording(
        async (event: IpcRendererEvent, { sourceId, requestId }) => {
          try {
            console.log("Received start recording request:", {
              sourceId,
              requestId,
            });
            const result = await recordingService.startRecording(sourceId);
            window.electronAPI.sendStartRecordingResponse({
              requestId,
              success: result.success,
            });
          } catch (error) {
            console.error("Failed to start recording:", error);
            window.electronAPI.sendStartRecordingResponse({
              requestId,
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      );

      window.electronAPI.onRequestStopRecording(
        async (event: IpcRendererEvent, { requestId }) => {
          try {
            console.log("Received stop recording request:", { requestId });
            recordingService.stopRecording();
            window.electronAPI.sendStopRecordingResponse({
              requestId,
              success: true,
            });
          } catch (error) {
            console.error("Failed to stop recording:", error);
            window.electronAPI.sendStopRecordingResponse({
              requestId,
              success: false,
            });
          }
        }
      );

      window.electronAPI.onRequestMarkClip(
        async (event: IpcRendererEvent, { requestId, streamStartTime }) => {
          try {
            console.log("Received mark clip request:", {
              requestId,
              streamStartTime,
            });

            if (!recordingService.isCurrentlyRecording()) {
              window.electronAPI.sendMarkClipResponse({
                requestId,
                success: false,
              });
              return;
            }

            const now = Date.now();
            const recordingStartTime = recordingService.getRecordingStartTime();

            if (!recordingStartTime) {
              window.electronAPI.sendMarkClipResponse({
                requestId,
                success: false,
              });
              return;
            }

            const relative = now - recordingStartTime;
            const bufferDuration = recordingService.getBufferDuration();

            const clipStart = Math.max(0, relative - 10_000); // 10 seconds before
            const clipEnd = Math.min(relative + 10_000, bufferDuration); // 10 seconds after

            const marker = {
              id: `clip_${now}`,
              startTime: clipStart,
              endTime: clipEnd,
              markedAt: now,
            };

            window.electronAPI.sendMarkClipResponse({
              requestId,
              success: true,
              marker,
            });
          } catch (error) {
            console.error("Failed to mark clip:", error);
            window.electronAPI.sendMarkClipResponse({
              requestId,
              success: false,
            });
          }
        }
      );

      window.electronAPI.onRequestExportClip(
        async (event, { requestId, clipData }) => {
          try {
            console.log("Received export clip request:", {
              requestId,
              clipData,
            });

            const blob = recordingService.getClipBlob(
              clipData.startTime,
              clipData.endTime
            );

            if (!blob || blob.size === 0) {
              window.electronAPI.sendExportClipResponse({
                requestId,
                success: false,
                error: "No clip data found for the specified time range",
              });
              return;
            }

            const arrayBuffer = await blob.arrayBuffer();

            window.electronAPI.sendExportClipResponse({
              requestId,
              success: true,
              blob: arrayBuffer,
            });
          } catch (error) {
            console.error("Failed to export clip:", error);
            window.electronAPI.sendExportClipResponse({
              requestId,
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      );

      // Existing listeners for UI updates
      window.electronAPI.onRecordingStarted(
        (event, data: RecordingStartedInfo) => {
          setIsRecording(true);
          setRecordingStartTime(data.startTime);
          setCurrentStream(data);
        }
      );

      window.electronAPI.onRecordingStopped(() => {
        setIsRecording(false);
        setRecordingStartTime(null);
        setCurrentStream(null);
      });

      window.electronAPI.onClipMarked((event, clipData: ClipMarker) => {
        setClipMarkers((prev: ClipMarker[]) => [...prev, clipData]);
      });

      window.electronAPI.onRecordingError((event, error: string) => {
        console.error("Recording error:", error);
        setIsRecording(false);
      });

      loadClipMarkers();
    }

    return () => {
      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.removeAllListeners("request-start-recording");
        window.electronAPI.removeAllListeners("request-stop-recording");
        window.electronAPI.removeAllListeners("request-mark-clip");
        window.electronAPI.removeAllListeners("request-export-clip");
        window.electronAPI.removeAllListeners("recording-started");
        window.electronAPI.removeAllListeners("recording-stopped");
        window.electronAPI.removeAllListeners("clip-marked");
        window.electronAPI.removeAllListeners("recording-error");
      }
    };
  }, []);

  const loadClipMarkers = async () => {
    try {
      const markers = await window.electronAPI.getClipMarkers();
      setClipMarkers(markers);
    } catch (error) {
      console.error("Failed to load clip markers:", error);
      const normalizedError = normalizeError(error);
      toast.error(`${normalizedError.message}`);
    }
  };

  const handleStartRecording = async () => {
    try {
      await window.electronAPI.startRecording();
    } catch (error) {
      console.error("Failed to start recording:", error);
      const normalizedError = normalizeError(error);
      toast.error(`${normalizedError.message}`);
    }
  };

  const handleStopRecording = async () => {
    try {
      await window.electronAPI.stopRecording();
    } catch (error) {
      console.error("Failed to stop recording:", error);
      const normalizedError = normalizeError(error);
      toast.error(`${normalizedError.message}`);
    }
  };

  const handleEditClip = (clip: ClipMarker) => {
    setSelectedClip(clip);
    startTransition(() => setActiveTab("editor"));
  };

  const handleClipExported = () => {
    loadClipMarkers();
  };

  const handleTabClick = useCallback(
    (key: TabKey) => {
      startTransition(() => {
        setActiveTab(key);
      });
    },
    [setActiveTab]
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-lg font-bold font-mono text-purple-400">
                Twitch Clip Recorder
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <RecordingControls
                isRecording={isRecording}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                recordingStartTime={recordingStartTime}
              />
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 font-sans">
            <button
              onClick={() => handleTabClick("stream")}
              className={`py-4 px-1 border-b-2 font-medium text-sm cursor-pointer ${
                activeTab === "stream"
                  ? "border-purple-500 text-purple-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Stream Viewer
            </button>
            <button
              onClick={() => handleTabClick("clips")}
              className={`py-4 px-1 border-b-2 font-medium text-sm cursor-pointer ${
                activeTab === "clips"
                  ? "border-purple-500 text-purple-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Clips ({clipMarkers.length})
            </button>
            <button
              onClick={() => handleTabClick("editor")}
              className={`py-4 px-1 border-b-2 font-medium text-sm cursor-pointer ${
                activeTab === "editor"
                  ? "border-purple-500 text-purple-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Editor
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "stream" && (
          <StreamViewer
            isRecording={isRecording}
            recordingStartTime={recordingStartTime}
          />
        )}

        {activeTab === "clips" && (
          <ClipList
            clips={clipMarkers}
            onEditClip={handleEditClip}
            onRefresh={loadClipMarkers}
          />
        )}

        {activeTab === "editor" && (
          <ClipEditor clip={selectedClip} onClipExported={handleClipExported} />
        )}
      </main>

      <div className="fixed z-20 bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <div
              className={`flex items-center space-x-2 ${
                isRecording ? "text-red-400" : "text-gray-400"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isRecording ? "bg-red-400 animate-pulse" : "bg-gray-400"
                }`}
              ></div>
              <span>{isRecording ? "Recording" : "Not Recording"}</span>
            </div>
            {isRecording && recordingStartTime && (
              <div className="text-gray-400">
                Started: {new Date(recordingStartTime).toLocaleTimeString()}
              </div>
            )}
          </div>
          <div className="text-gray-400">
            Hotkeys:{" "}
            <kbd className="px-2 py-1 bg-gray-700 rounded-md text-white font-mono text-xs">
              Ctrl+Shift+M
            </kbd>{" "}
            (Mark),{" "}
            <kbd className="px-2 py-1 bg-gray-700 rounded-md text-white font-mono text-xs">
              Ctrl+Shift+R
            </kbd>{" "}
            (Record)
          </div>
        </div>
      </div>
    </div>
  );
}
