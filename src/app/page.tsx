"use client";

import { useState, useEffect, startTransition, useCallback } from "react";
import StreamViewer from "@/components/stream-viewer";
import RecordingControls from "@/components/recording-controls";
import ClipEditor from "@/components/clip-editor";
import ClipList from "@/components/clip-list";
import { ClipMarker, RecordingStartedInfo } from "@/types/app";
import { normalizeError } from "@/utils/error-utils";
import { toast } from "sonner";
import logger from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Tv, Eraser, Timer } from "lucide-react";
import {
  DEFAULT_CLIP_POST_MARK_MS,
  DEFAULT_CLIP_PRE_MARK_MS,
} from "@/constants/app";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClipDurationDialog } from "@/components/clip-duration-dialog";
import { useDisclosure } from "@/hooks/use-disclosure";

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

  const {
    isOpen: isOpenClipDurationDialog,
    open: openClipDurationDialog,
    close: closeClipDurationDialog,
  } = useDisclosure();

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
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
        toast.error(error);
      });

      loadClipMarkers();
    }

    return () => {
      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.removeAllListeners("recording-started");
        window.electronAPI.removeAllListeners("recording-stopped");
        window.electronAPI.removeAllListeners("clip-marked");
        window.electronAPI.removeAllListeners("recording-error");
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === "D") {
        event.preventDefault();
        openClipDurationDialog();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openClipDurationDialog]);

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

  const handleClearMemory = () => {
    setClipMarkers([]);
    toast.success("Memory cleared successfully!");
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

  const handleSaveClipDuration = async (
    preDurationMs: number,
    postDurationMs: number
  ) => {
    await window.electronAPI.setClipDuration(preDurationMs, postDurationMs);
    toast.success(
      `Clip duration set to ${preDurationMs / 1000} seconds -> ${
        postDurationMs / 1000
      } seconds.`
    );
  };

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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleClearMemory}
                      variant="ghost"
                      size="icon"
                      className="size-8"
                    >
                      <Eraser size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear Memory (Resets clips)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={openClipDurationDialog}
                      variant="ghost"
                      size="icon"
                      className="size-8"
                    >
                      <Timer size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Set Clip Duration (Ctrl+Shift+D)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
      <ClipDurationDialog
        isOpen={isOpenClipDurationDialog}
        onOpenChange={closeClipDurationDialog}
        onSave={handleSaveClipDuration}
        currentPreDurationMs={DEFAULT_CLIP_PRE_MARK_MS}
        currentPostDurationMs={DEFAULT_CLIP_POST_MARK_MS}
      />
    </div>
  );
}
