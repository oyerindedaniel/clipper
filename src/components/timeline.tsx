import React, { useRef, useEffect, useState, useCallback } from "react";
import { GripVertical } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { startTransition } from "react";

interface TimelineProps {
  duration: number; // Total duration in milliseconds
  currentTime: number; // Current playback time in milliseconds
  onTrim: (startTime: number, endTime: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ duration, onTrim }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftHandleRef = useRef<HTMLDivElement>(null);
  const rightHandleRef = useRef<HTMLDivElement>(null);

  const [trimStart, setTrimStart] = useState(0); // in milliseconds
  const [trimEnd, setTrimEnd] = useState(duration); // in milliseconds
  const [scrubDuration, setScrubDuration] = useState("00:00");
  const [showTooltip, setShowTooltip] = useState(false);

  const pixelsPerMs = useRef(0);

  const calculatePixelsPerMs = useCallback(() => {
    if (timelineRef.current) {
      const timelineWidth = timelineRef.current.offsetWidth;
      pixelsPerMs.current = duration > 0 ? timelineWidth / duration : 0;
    }
  }, [duration]);

  useEffect(() => {
    calculatePixelsPerMs();
    window.addEventListener("resize", calculatePixelsPerMs);
    return () => window.removeEventListener("resize", calculatePixelsPerMs);
  }, [duration, calculatePixelsPerMs]);

  useEffect(() => {
    setTrimEnd(duration);
  }, [duration]);

  const formatDurationDisplay = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  const handleDrag = useCallback(
    (event: MouseEvent, handleType: "left" | "right") => {
      event.preventDefault();
      const timelineRect = timelineRef.current?.getBoundingClientRect();
      if (!timelineRect) return;

      let isDragging = true;
      setShowTooltip(true);

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;

        requestAnimationFrame(() => {
          let newX = moveEvent.clientX - timelineRect.left;
          newX = Math.max(0, Math.min(newX, timelineRect.width));

          const newTime = newX / pixelsPerMs.current;

          if (handleType === "left") {
            const maxStartTime = Math.max(0, trimEnd - 1000); // Minimum 1 second clip
            const newTrim = Math.max(0, Math.min(newTime, maxStartTime));
            setTrimStart(newTrim);
            startTransition(() => {
              setScrubDuration(formatDurationDisplay(trimEnd - newTrim));
            });
          } else {
            const minEndTime = Math.min(duration, trimStart + 1000); // Minimum 1 second clip
            const newTrim = Math.min(duration, Math.max(newTime, minEndTime));
            setTrimEnd(newTrim);
            startTransition(() => {
              setScrubDuration(formatDurationDisplay(newTrim - trimStart));
            });
          }
        });
      };

      const onMouseUp = () => {
        isDragging = false;
        setShowTooltip(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        onTrim(trimStart, trimEnd);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [duration, trimStart, trimEnd, onTrim]
  );

  const leftHandlePosition = trimStart * pixelsPerMs.current;
  const rightHandlePosition = trimEnd * pixelsPerMs.current;

  return (
    <div className="relative w-full h-12 bg-surface-secondary rounded-lg overflow-hidden flex items-center">
      <div
        ref={timelineRef}
        className="absolute inset-0 bg-surface-tertiary"
      ></div>

      <div
        className="absolute h-full bg-primary/30"
        style={{
          left: leftHandlePosition,
          width: rightHandlePosition - leftHandlePosition,
        }}
      ></div>

      <Tooltip open={showTooltip} delayDuration={0}>
        <TooltipTrigger asChild>
          <div
            ref={leftHandleRef}
            className="absolute w-4 h-full bg-primary cursor-ew-resize rounded-sm shadow-md flex items-center justify-center border border-primary-hover"
            style={{ left: leftHandlePosition - 8, zIndex: 2 }}
            onMouseDown={(e) => handleDrag(e.nativeEvent, "left")}
          >
            <GripVertical size={12} className="text-foreground-on-accent" />
          </div>
        </TooltipTrigger>
        <TooltipContent sideOffset={5} container={leftHandleRef.current}>
          {scrubDuration}
        </TooltipContent>
      </Tooltip>

      <Tooltip open={showTooltip} delayDuration={0}>
        <TooltipTrigger asChild>
          <div
            ref={rightHandleRef}
            className="absolute w-4 h-full bg-primary cursor-ew-resize rounded-sm shadow-md flex items-center justify-center border border-primary-hover"
            style={{ left: rightHandlePosition - 8, zIndex: 2 }}
            onMouseDown={(e) => handleDrag(e.nativeEvent, "right")}
          >
            <GripVertical size={12} className="text-foreground-on-accent" />
          </div>
        </TooltipTrigger>
        <TooltipContent sideOffset={5} container={rightHandleRef.current}>
          {scrubDuration}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
