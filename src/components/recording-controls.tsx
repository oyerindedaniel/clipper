import { useState, useEffect } from "react";
import { Play, Square, Circle } from "lucide-react";

interface RecordingControlsProps {
  isRecording: boolean;
  recordingStartTime: number | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export default function RecordingControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  recordingStartTime,
}: RecordingControlsProps) {
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  const startTime = recordingStartTime || Date.now();

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(Date.now() - startTime);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, startTime]);

  const formatDuration = (duration: number): string => {
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return `${hours.toString().padStart(2, "0")}:${(minutes % 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center space-x-4">
      {isRecording && (
        <div className="flex items-center space-x-2 text-red-400">
          <Circle size={8} className="fill-current animate-pulse" />
          <span className="font-mono text-sm">
            {formatDuration(recordingDuration)}
          </span>
        </div>
      )}

      <button
        onClick={isRecording ? onStopRecording : onStartRecording}
        className={`px-4 py-2 rounded-md flex items-center space-x-2 font-medium transition-colors ${
          isRecording
            ? "bg-red-600 hover:bg-red-700 text-white"
            : "bg-green-600 hover:bg-green-700 text-white"
        }`}
      >
        {isRecording ? (
          <>
            <Square size={16} />
            <span>Stop Recording</span>
          </>
        ) : (
          <>
            <Play size={16} />
            <span>Start Recording</span>
          </>
        )}
      </button>
    </div>
  );
}
