import { useState, useEffect } from "react";
import { Play, Square, Monitor, Tv } from "lucide-react";
import type { DesktopSource } from "@/types/app";
import { normalizeError } from "@utils/error-utils";

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

  useEffect(() => {
    loadDesktopSources();
  }, []);

  const loadDesktopSources = async () => {
    if (!window.electronAPI || !window.electronAPI.getDesktopSources) {
      console.warn("Not in Electron environment or electronAPI not available.");
      return;
    }
    try {
      const sources = await window.electronAPI.getDesktopSources();
      setDesktopSources(sources);
    } catch (error) {
      console.error("Failed to load desktop sources:", error);
      const normalizedError = normalizeError(error);
      alert(`Failed to load desktop sources: ${normalizedError.message}`);
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
      alert(`Failed to open stream: ${normalizedError.message}`);
    }
  };

  const handleStartRecording = async () => {
    if (!selectedSource) {
      setShowSourceSelector(true);
      return;
    }
    if (!window.electronAPI || !window.electronAPI.startRecording) {
      console.warn(
        "Not in Electron environment or electronAPI not available for starting recording."
      );
      return;
    }

    try {
      await window.electronAPI.startRecording();
    } catch (error) {
      console.error("Failed to start recording:", error);
      const normalizedError = normalizeError(error);
      alert(`Failed to start recording: ${normalizedError.message}`);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans text-white">
      <div className="max-w-4xl w-full space-y-10">
        <section className="bg-gray-800 rounded-xl p-8 shadow-2xl border border-gray-700 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800 opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-extrabold font-mono text-white mb-8 flex items-center space-x-4 pb-4 border-b border-gray-700">
              <Tv className="text-purple-400 text-4xl flex-shrink-0" />
              <span className="tracking-tight">Twitch Stream</span>
            </h2>

            <div className="flex flex-col md:flex-row items-end gap-6">
              <div className="flex-1 w-full">
                <label
                  htmlFor="channel-name"
                  className="block text-base font-semibold text-gray-300 mb-2"
                >
                  Enter Channel Name
                </label>
                <input
                  id="channel-name"
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="e.g., ddg"
                  className="w-full px-5 py-3 bg-gray-900 border font-mono border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition duration-300 ease-in-out hover:border-purple-600"
                  onKeyDown={(e) => e.key === "Enter" && handleOpenStream()}
                />
              </div>
              <button
                onClick={handleOpenStream}
                disabled={!channelName.trim()}
                className="w-full md:w-auto font-mono px-10 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center space-x-3 font-bold text-lg transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
              >
                <Play size={24} />
                <span>Open Stream</span>
              </button>
            </div>
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl p-8 shadow-2xl border border-gray-700 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800 opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
          <div className="relative z-10">
            <h2 className="text-3xl font-mono font-extrabold text-white mb-8 flex items-center space-x-4 pb-4 border-b border-gray-700">
              <Monitor className="text-red-400 text-4xl flex-shrink-0" />
              <span className="tracking-tight">Screen Recording</span>
            </h2>

            <div className="mb-8">
              <label className="block text-base font-semibold text-gray-300 mb-2">
                Capture Source
              </label>
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1 w-full">
                  {selectedSource ? (
                    <div className="flex items-center space-x-5 p-4 bg-gray-900 rounded-lg border border-gray-700">
                      <img
                        src={selectedSource.thumbnail}
                        alt={selectedSource.name}
                        className="w-36 h-24 object-cover rounded-md border border-gray-600 shadow-md"
                      />
                      <div className="flex-1">
                        <p className="text-white font-bold text-xl">
                          {selectedSource.name}
                        </p>
                        <p className="text-gray-400 text-sm">Selected Source</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-900 rounded-lg border-2 border-dashed border-gray-700 text-center flex items-center justify-center h-32">
                      <p className="text-gray-400 font-mono text-base font-medium">
                        No source selected. Please browse and select one.
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowSourceSelector(!showSourceSelector)}
                  className="w-full md:w-auto font-mono px-10 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 font-bold text-lg transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
                >
                  {showSourceSelector ? "Hide Sources" : "Browse Sources"}
                </button>
              </div>
            </div>

            {showSourceSelector && (
              <div className="mb-8 p-6 bg-gray-700 rounded-lg border border-gray-600 shadow-inner">
                <h3 className="text-xl font-bold text-gray-300 mb-5">
                  Available Sources
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-h-96 overflow-y-auto pr-2">
                  {desktopSources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => handleSourceSelect(source)}
                      className={`relative p-3 rounded-lg transition duration-200 ease-in-out group \
                      ${
                        selectedSource?.id === source.id
                          ? "bg-purple-900 border-2 border-purple-500 shadow-lg"
                          : "bg-gray-800 hover:bg-gray-700 border border-gray-700"
                      }`}
                    >
                      <img
                        src={source.thumbnail}
                        alt={source.name}
                        className="w-full h-40 object-cover rounded-md mb-3 border border-gray-600 group-hover:border-purple-400 transition-colors shadow-sm"
                      />
                      <p className="text-white text-base font-semibold truncate">
                        {source.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-gray-700">
              <div className="flex items-center space-x-4 mb-4 md:mb-0">
                <div
                  className={`w-5 h-5 rounded-full ${
                    isRecording ? "bg-red-500 animate-pulse" : "bg-gray-500"
                  }`}
                ></div>
                <span className="font-bold text-2xl text-white">
                  {isRecording ? "Recording Active" : "Ready to Record"}
                </span>
                {isRecording && (
                  <div className="text-green-400 font-mono text-xl ml-4 tracking-wide">
                    {formatDuration(recordingStartTime)}
                  </div>
                )}
              </div>

              <button
                onClick={handleStartRecording}
                disabled={isRecording || !selectedSource}
                className="w-full md:w-auto px-12 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center space-x-3 font-bold text-lg transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
              >
                <Square size={24} />
                <span>Start Recording</span>
              </button>
            </div>
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl p-8 shadow-2xl border border-gray-700 relative overflow-hidden md:col-span-2">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800 opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
          <div className="relative z-10">
            <h2 className="text-3xl font-extrabold text-white mb-8 pb-4 border-b border-gray-700">
              Instructions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 text-gray-300">
              <div className="flex items-start space-x-5">
                <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg">
                  1
                </div>
                <div>
                  <p className="font-extrabold text-xl mb-1 text-white">
                    Open a Twitch stream
                  </p>
                  <p className="text-base text-gray-400 leading-relaxed">
                    Enter a channel name and click "Open Stream" to launch the
                    Twitch window.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-5">
                <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg">
                  2
                </div>
                <div>
                  <p className="font-extrabold text-xl mb-1 text-white">
                    Select capture source
                  </p>
                  <p className="text-base text-gray-400 leading-relaxed">
                    Choose the window or screen you want to record from the list
                    of available sources.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-5">
                <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg">
                  3
                </div>
                <div>
                  <p className="font-extrabold text-xl mb-1 text-white">
                    Start recording
                  </p>
                  <p className="text-base text-gray-400 leading-relaxed">
                    Click "Start Recording" to begin capturing video and audio
                    from your selected source.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-5">
                <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg">
                  4
                </div>
                <div>
                  <p className="font-extrabold text-xl mb-1 text-white">
                    Mark clips
                  </p>
                  <p className="text-base text-gray-400 leading-relaxed">
                    Press{" "}
                    <kbd className="px-4 py-2 bg-gray-700 rounded-lg text-base font-bold tracking-wide border border-gray-600 shadow-md">
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
