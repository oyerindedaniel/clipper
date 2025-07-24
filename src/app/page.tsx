"use client";

import { useState, useEffect, startTransition, useCallback } from "react";
import StreamViewer from "@/components/stream-viewer";
import RecordingControls from "@/components/recording-controls";
import ClipEditor from "@/components/clip-editor";
import ClipList from "@/components/clip-list";
import { ClipMarker, RecordingStartedInfo } from "@/types/app";
import { IpcRendererEvent } from "electron";
import { normalizeError } from "@/utils/error-utils";
import { toast } from "sonner";
import recordingService from "@/services/recording-service";
import logger from "@/utils/logger";
import { waitUntilBufferCatchesUp } from "@/utils/app";
import { Button } from "@/components/ui/button";
import { Tv } from "lucide-react";

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
      window.electronAPI.onRequestStartRecording(
        async (event: IpcRendererEvent, { sourceId, requestId }) => {
          try {
            logger.log("Received start recording request:", {
              sourceId,
              requestId,
            });
            const result = await recordingService.startRecording(sourceId);
            window.electronAPI.sendStartRecordingResponse({
              requestId,
              success: result.success,
            });
          } catch (error) {
            logger.error("Failed to start recording:", error);
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
            logger.log("Received stop recording request:", { requestId });
            await recordingService.stopRecording();
            window.electronAPI.sendStopRecordingResponse({
              requestId,
              success: true,
            });
          } catch (error) {
            logger.error("Failed to stop recording:", error);
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
            logger.log("Received mark clip request:", {
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
            const desiredEnd = relative + 10_000;
            const endBuffer = 3000;
            await waitUntilBufferCatchesUp(desiredEnd + endBuffer);

            const clipStart = Math.max(0, relative - 10_000); // 10 seconds before
            const clipEnd = Math.min(
              desiredEnd,
              recordingService.getBufferDuration()
            ); // 10 seconds after

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
            logger.error("Failed to mark clip:", error);
            window.electronAPI.sendMarkClipResponse({
              requestId,
              success: false,
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
        logger.error("Recording error:", error);
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
      logger.error("Failed to load clip markers:", error);
      const normalizedError = normalizeError(error);
      toast.error(`${normalizedError.message}`);
    }
  };

  const handleStartRecording = async () => {
    try {
      await window.electronAPI.startRecording();
    } catch (error) {
      logger.error("Failed to start recording:", error);
      const normalizedError = normalizeError(error);
      toast.error(`${normalizedError.message}`);
    }
  };

  const handleStopRecording = async () => {
    try {
      await window.electronAPI.stopRecording();
    } catch (error) {
      logger.error("Failed to stop recording:", error);
      const normalizedError = normalizeError(error);
      toast.error(`${normalizedError.message}`);
    }
  };

  const handleEditClip = (clip: ClipMarker) => {
    setSelectedClip(clip);
    startTransition(() => setActiveTab("editor"));
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
    <div className="min-h-screen bg-surface-primary text-foreground-default font-sans text-sm">
      <header className="bg-surface-secondary border-b border-gray-700/50">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-lg font-bold font-mono text-primary flex items-center space-x-2">
                <Tv size={20} className="text-primary" />
                <span>Twitch Clip Recorder</span>
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

      <nav className="bg-surface-secondary border-b border-gray-700/50">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <Button
              onClick={() => handleTabClick("stream")}
              className={`rounded-none py-3 px-1 border-b-2 font-medium text-xs cursor-pointer
                ${
                  activeTab === "stream"
                    ? "border-primary text-primary"
                    : "border-transparent text-foreground-subtle hover:text-foreground-default hover:bg-surface-hover"
                }
              `}
              variant="ghost"
            >
              Stream Viewer
            </Button>
            <Button
              onClick={() => handleTabClick("clips")}
              className={`rounded-none py-3 px-1 border-b-2 font-medium text-xs cursor-pointer
                ${
                  activeTab === "clips"
                    ? "border-primary text-primary"
                    : "border-transparent text-foreground-subtle hover:text-foreground-default hover:bg-surface-hover"
                }
              `}
              variant="ghost"
            >
              Clips ({clipMarkers.length})
            </Button>
            <Button
              onClick={() => handleTabClick("editor")}
              className={`rounded-none py-3 px-1 border-b-2 font-medium text-xs cursor-pointer
                ${
                  activeTab === "editor"
                    ? "border-primary text-primary"
                    : "border-transparent text-foreground-subtle hover:text-foreground-default hover:bg-surface-hover"
                }
              `}
              variant="ghost"
            >
              Editor
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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

        {activeTab === "editor" && <ClipEditor clip={selectedClip} />}
      </main>

      <div className="fixed z-20 bottom-0 left-0 right-0 bg-surface-secondary border-t border-gray-700/50 px-4 py-2">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center space-x-3">
            <div
              className={`flex items-center space-x-2 ${
                isRecording ? "text-error" : "text-foreground-muted"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isRecording ? "bg-error animate-pulse" : "bg-foreground-muted"
                }`}
              ></div>
              <span>{isRecording ? "Recording" : "Not Recording"}</span>
            </div>
            {isRecording && recordingStartTime && (
              <div className="text-foreground-muted">
                Started: {new Date(recordingStartTime).toLocaleTimeString()}
              </div>
            )}
          </div>
          <div className="text-foreground-muted">
            Hotkeys:{" "}
            <kbd className="px-2 py-0.5 bg-surface-tertiary rounded-sm text-foreground-default font-mono text-xs border border-gray-700/50">
              Ctrl+Shift+M
            </kbd>{" "}
            (Mark),{" "}
            <kbd className="px-2 py-0.5 bg-surface-tertiary rounded-sm text-foreground-default font-mono text-xs border border-gray-700/50">
              Ctrl+Shift+R
            </kbd>{" "}
            (Record)
          </div>
        </div>
      </div>
    </div>
  );
}
