import { useState } from "react";
import { Play, Square, Monitor, Tv } from "lucide-react";
import type { DesktopSource } from "@/types/app";
import { normalizeError } from "@/utils/error-utils";
import { toast } from "sonner";
import DesktopSourceSkeleton from "@/components/desktop-source-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StreamViewerProps {
  isRecording: boolean;
  recordingStartTime: number | null;
}

export default function StreamViewer({
  isRecording,
  recordingStartTime,
}: StreamViewerProps) {
  const [channelName, setChannelName] = useState<string>("");
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<DesktopSource | null>(
    null
  );
  const [showSourceSelector, setShowSourceSelector] = useState<boolean>(false);
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(false);

  const handleToggleSourceSelector = async () => {
    const next = !showSourceSelector;
    setShowSourceSelector(next);

    if (next) {
      try {
        if (!window.electronAPI?.getDesktopSources) {
          console.warn("Electron desktop capture API not available.");
          return;
        }
        setIsLoadingSources(true);
        const sources = await window.electronAPI.getDesktopSources();
        setDesktopSources(sources);
      } catch (error) {
        console.error("Failed to load desktop sources:", error);
        const normalizedError = normalizeError(error);
        toast.error(
          `Failed to load desktop sources: ${normalizedError.message}`
        );
      } finally {
        setIsLoadingSources(false);
      }
    }
  };

  const handleOpenStream = async () => {
    if (!channelName.trim()) return;
    if (!window.electronAPI || !window.electronAPI.openTwitchStream) {
      console.warn(
        "Not in Electron environment or electronAPI not available for opening stream."
      );
      return;
    }

    try {
      await window.electronAPI.openTwitchStream(channelName);
      setStreamActive(true);
    } catch (error) {
      console.error("Failed to open stream:", error);
      const normalizedError = normalizeError(error);
      toast.error(`Failed to open stream: ${normalizedError.message}`);
    }
  };

  const handleStartRecording = async () => {
    if (!selectedSource) {
      setShowSourceSelector(true);
      toast.warning(
        "Please select a capture source before starting the recording."
      );
      return;
    }
    if (!window.electronAPI || !window.electronAPI.startRecording) {
      console.warn(
        "Not in Electron environment or electronAPI not available for starting recording."
      );
      return;
    }

    try {
      await window.electronAPI.startRecording(selectedSource.id);
    } catch (error) {
      console.error("Failed to start recording:", error);
      const normalizedError = normalizeError(error);
      toast.error(`Failed to start recording: ${normalizedError.message}`);
    }
  };

  const handleSourceSelect = (source: DesktopSource) => {
    setSelectedSource(source);
    setShowSourceSelector(false);
  };

  const formatDuration = (startTime: number | null) => {
    if (!startTime) return "00:00:00";

    const duration = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-surface-primary flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8 font-sans text-foreground-default text-sm">
      <div className="max-w-screen-xl w-full space-y-8">
        <section className="bg-surface-secondary rounded-lg p-6 shadow-sm border border-gray-700/50 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-surface-primary/20 to-surface-secondary/20 opacity-15 group-hover:opacity-25 transition-opacity duration-300"></div>
          <div className="relative z-10">
            <h2 className="text-xl font-extrabold font-mono text-foreground-default mb-6 flex items-center space-x-3 pb-3 border-b border-gray-700/50">
              <Tv size={16} className="text-primary flex-shrink-0" />
              <span className="tracking-tight">Twitch Stream</span>
            </h2>

            <div className="flex flex-col md:flex-row items-end gap-4">
              <div className="flex-1 w-full">
                <label
                  htmlFor="channel-name"
                  className="block text-xs font-semibold text-foreground-subtle mb-1.5"
                >
                  Enter Channel Name
                </label>
                <Input
                  autoFocus
                  id="channel-name"
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="e.g., ddg"
                  onKeyDown={(e) => e.key === "Enter" && handleOpenStream()}
                  className="px-3 py-1.5 text-xs"
                />
              </div>
              <Button
                onClick={handleOpenStream}
                disabled={!channelName.trim()}
                className="w-full md:w-auto self-end flex items-center justify-center space-x-2 px-3 py-1.5 text-xs"
                variant="default"
                size="sm"
              >
                <Play size={16} />
                <span>Open Stream</span>
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-surface-secondary rounded-lg p-6 shadow-sm border border-gray-700/50 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-surface-primary/20 to-surface-secondary/20 opacity-15 group-hover:opacity-25 transition-opacity duration-300"></div>
          <div className="relative z-10">
            <h2 className="text-xl font-mono font-extrabold text-foreground-default mb-6 flex items-center space-x-3 pb-3 border-b border-gray-700/50">
              <Monitor size={16} className="text-error flex-shrink-0" />
              <span className="tracking-tight">Screen Recording</span>
            </h2>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-foreground-subtle mb-1.5">
                Capture Source
              </label>
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                  {selectedSource ? (
                    <div className="flex items-center space-x-4 p-3 bg-surface-primary rounded-md border border-gray-700/50">
                      <img
                        src={selectedSource.thumbnail}
                        alt={selectedSource.name}
                        className="w-32 h-20 object-cover rounded-sm border border-gray-700/50 shadow-xs"
                      />
                      <div className="flex-1">
                        <p className="text-foreground-default font-bold text-sm">
                          {selectedSource.name}
                        </p>
                        <p className="text-foreground-subtle text-xs">
                          Selected Source
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-surface-primary rounded-md border-2 border-dashed border-gray-700/50 text-center flex items-center justify-center h-28">
                      <p className="text-foreground-muted font-mono text-sm font-medium">
                        No source selected. Please browse and select one.
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleToggleSourceSelector}
                  className="w-full md:w-auto flex items-center justify-center px-3 py-1.5 text-xs"
                  variant="secondary"
                  size="sm"
                >
                  {showSourceSelector ? "Hide Sources" : "Browse Sources"}
                </Button>
              </div>
            </div>

            {showSourceSelector && (
              <div className="mb-6 p-4 bg-surface-secondary rounded-md border border-gray-700/50 shadow-inner">
                <h3 className="text-sm font-bold text-foreground-subtle mb-4">
                  Available Sources
                </h3>
                {isLoadingSources ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-scroll">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <DesktopSourceSkeleton key={index} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-scroll">
                    {desktopSources.map((source) => (
                      <button
                        key={source.id}
                        onClick={() => handleSourceSelect(source)}
                        className={`relative p-2 rounded-md transition duration-200 ease-in-out group flex flex-col items-center justify-center space-y-2
                      ${
                        selectedSource?.id === source.id
                          ? "bg-primary/15 border-2 border-primary shadow-sm"
                          : "bg-surface-tertiary hover:bg-surface-hover border border-gray-700/50"
                      }`}
                      >
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full h-40 object-cover rounded-sm mb-2 border border-gray-700/50 group-hover:border-primary-hover transition-colors shadow-xs"
                        />
                        <p className="text-foreground-default text-xs font-semibold truncate w-[80%] mx-auto">
                          {source.name}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col md:flex-row items-center justify-between pt-6 border-t border-gray-700/50">
              <div className="flex items-center space-x-3 mb-3 md:mb-0">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isRecording
                      ? "bg-error animate-pulse"
                      : "bg-foreground-muted"
                  }`}
                ></div>
                <span className="font-bold text-sm text-foreground-default">
                  {isRecording ? "Recording Active" : "Ready to Record"}
                </span>
                {isRecording && (
                  <div className="text-success font-mono text-base ml-3 tracking-wide">
                    {formatDuration(recordingStartTime)}
                  </div>
                )}
              </div>

              <Button
                onClick={handleStartRecording}
                disabled={isRecording || !selectedSource}
                className="w-full md:w-auto flex items-center justify-center space-x-2 px-3 py-1.5 text-xs"
                variant="default"
                size="sm"
              >
                <Play size={16} />
                <span>Start Recording</span>
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-surface-secondary rounded-lg p-6 shadow-sm border border-gray-700/50 relative overflow-hidden md:col-span-2">
          <div className="absolute inset-0 bg-gradient-to-br from-surface-primary/20 to-surface-secondary/20 opacity-15 group-hover:opacity-25 transition-opacity duration-300"></div>
          <div className="relative z-10">
            <h2 className="text-xl font-extrabold text-foreground-default mb-6 pb-3 border-b border-gray-700/50">
              Instructions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 text-foreground-subtle">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-primary rounded-full font-mono flex items-center justify-center text-foreground-on-accent text-lg font-bold flex-shrink-0 shadow-sm">
                  1
                </div>
                <div>
                  <p className="font-extrabold text-sm font-mono mb-1 text-foreground-default">
                    Open a Twitch stream
                  </p>
                  <p className="text-xs text-foreground-subtle leading-relaxed">
                    Enter a channel name and click "Open Stream" to launch the
                    Twitch window.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-primary font-mono rounded-full flex items-center justify-center text-foreground-on-accent text-lg font-bold flex-shrink-0 shadow-sm">
                  2
                </div>
                <div>
                  <p className="font-extrabold font-mono text-sm mb-1 text-foreground-default">
                    Select capture source
                  </p>
                  <p className="text-xs text-foreground-subtle leading-relaxed">
                    Choose the window or screen you want to record from the list
                    of available sources.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 font-mono bg-primary rounded-full flex items-center justify-center text-foreground-on-accent text-xl font-bold flex-shrink-0 shadow-sm">
                  3
                </div>
                <div>
                  <p className="font-extrabold font-mono text-sm mb-1 text-foreground-default">
                    Start recording
                  </p>
                  <p className="text-xs text-foreground-subtle leading-relaxed">
                    Click "Start Recording" to begin capturing video and audio
                    from your selected source.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 font-mono bg-primary rounded-full flex items-center justify-center text-foreground-on-accent text-xl font-bold flex-shrink-0 shadow-sm">
                  4
                </div>
                <div>
                  <p className="font-extrabold font-mono text-sm mb-1 text-foreground-default">
                    Mark clips
                  </p>
                  <p className="text-xs text-foreground-subtle leading-relaxed">
                    Press{" "}
                    <kbd className="px-2 py-0.5 bg-surface-tertiary rounded-sm text-xs font-bold tracking-wide border border-gray-700/50 shadow-xs">
                      Ctrl+Shift+M
                    </kbd>{" "}
                    to instantly mark interesting moments during your recording.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
