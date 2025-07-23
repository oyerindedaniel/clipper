import React, {
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import { GripVertical } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimelineProps {
  duration: number; // Total duration in milliseconds
  currentTime: number; // Current playback time in milliseconds
  onTrim: (startTime: number, endTime: number) => void;
}

const HANDLE_OFFSET = 8;

export const Timeline: React.FC<TimelineProps> = ({ duration, onTrim }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftHandleRef = useRef<HTMLDivElement>(null);
  const rightHandleRef = useRef<HTMLDivElement>(null);
  const filledAreaRef = useRef<HTMLDivElement>(null);
  const tooltipContentRef = useRef<HTMLSpanElement>(null);

  const trimValuesRef = useRef({ start: 0, end: duration });
  const pixelsPerMs = useRef(0);

  const [showTooltip, setShowTooltip] = useState(false);
  const [scrubDuration, setScrubDuration] = useState("");

  const calculatePixelsPerMs = useCallback(() => {
    if (timelineRef.current) {
      const timelineWidth = timelineRef.current.offsetWidth;
      pixelsPerMs.current =
        duration > 0 && timelineWidth > 0 ? timelineWidth / duration : 0;
    }
  }, [duration]);

  useLayoutEffect(() => {
    trimValuesRef.current = { start: 0, end: duration };
    calculatePixelsPerMs();

    // Set initial positions to show full timeline
    if (
      leftHandleRef.current &&
      rightHandleRef.current &&
      filledAreaRef.current
    ) {
      const leftPos = 0;
      const rightPos = duration * pixelsPerMs.current;

      leftHandleRef.current.style.left = `${leftPos - HANDLE_OFFSET}px`;
      rightHandleRef.current.style.left = `${rightPos - HANDLE_OFFSET}px`;
      filledAreaRef.current.style.left = `${leftPos}px`;
      filledAreaRef.current.style.width = `${rightPos - leftPos}px`;
    }
  }, [duration, calculatePixelsPerMs]);

  useEffect(() => {
    calculatePixelsPerMs();
    window.addEventListener("resize", calculatePixelsPerMs);
    return () => window.removeEventListener("resize", calculatePixelsPerMs);
  }, [duration, calculatePixelsPerMs]);

  const formatDurationDisplay = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  const updateTooltipContent = (durationMs: number) => {
    if (tooltipContentRef.current) {
      tooltipContentRef.current.textContent = formatDurationDisplay(durationMs);

      console.log({ duration: formatDurationDisplay(durationMs) });
    }
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
            const maxStartTime = Math.max(0, trimValuesRef.current.end - 1000); // Minimum 1 second clip
            const newTrimStart = Math.max(0, Math.min(newTime, maxStartTime));
            trimValuesRef.current.start = newTrimStart;

            const newLeftPos = newTrimStart * pixelsPerMs.current;
            const rightPos = trimValuesRef.current.end * pixelsPerMs.current;

            if (leftHandleRef.current) {
              leftHandleRef.current.style.left = `${
                newLeftPos - HANDLE_OFFSET
              }px`;
            }
            if (filledAreaRef.current) {
              filledAreaRef.current.style.left = `${newLeftPos}px`;
              filledAreaRef.current.style.width = `${rightPos - newLeftPos}px`;
            }

            updateTooltipContent(trimValuesRef.current.end - newTrimStart);
          } else {
            const minEndTime = Math.min(
              duration,
              trimValuesRef.current.start + 1000
            ); // Minimum 1 second clip
            const newTrimEnd = Math.min(
              duration,
              Math.max(newTime, minEndTime)
            );
            trimValuesRef.current.end = newTrimEnd;

            const leftPos = trimValuesRef.current.start * pixelsPerMs.current;
            const newRightPos = newTrimEnd * pixelsPerMs.current;

            if (rightHandleRef.current) {
              rightHandleRef.current.style.left = `${
                newRightPos - HANDLE_OFFSET
              }px`;
            }
            if (filledAreaRef.current) {
              filledAreaRef.current.style.width = `${newRightPos - leftPos}px`;
            }

            updateTooltipContent(newTrimEnd - trimValuesRef.current.start);
          }
        });
      };

      const onMouseUp = () => {
        isDragging = false;
        setShowTooltip(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);

        onTrim(trimValuesRef.current.start, trimValuesRef.current.end);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [duration, onTrim]
  );

  return (
    <div className="relative w-full h-12 bg-surface-secondary rounded-lg flex items-center">
      <div
        ref={timelineRef}
        className="absolute inset-0 bg-surface-tertiary"
      ></div>

      <div ref={filledAreaRef} className="absolute h-full bg-primary/30"></div>

      <Tooltip open={showTooltip} delayDuration={0}>
        <TooltipTrigger asChild>
          <div
            ref={leftHandleRef}
            className="absolute w-[calc(var(--handle-offset)*2)] h-full bg-primary cursor-ew-resize rounded-sm shadow-md flex items-center justify-center border border-primary-hover z-10"
            onMouseDown={(e) => handleDrag(e.nativeEvent, "left")}
            style={
              {
                "--handle-offset": `${HANDLE_OFFSET}px`,
              } as React.CSSProperties
            }
          >
            <GripVertical size={12} className="text-foreground-on-accent" />
          </div>
        </TooltipTrigger>
        <TooltipContent sideOffset={5}>
          <span ref={tooltipContentRef}>{formatDurationDisplay(duration)}</span>
        </TooltipContent>
      </Tooltip>

      <Tooltip open={showTooltip} delayDuration={0}>
        <TooltipTrigger asChild>
          <div
            data-handle-offset={HANDLE_OFFSET}
            ref={rightHandleRef}
            className="absolute w-[calc(var(--handle-offset)*2)] h-full bg-primary cursor-ew-resize rounded-sm shadow-md flex items-center justify-center border border-primary-hover z-10"
            onMouseDown={(e) => handleDrag(e.nativeEvent, "right")}
            style={
              {
                "--handle-offset": `${HANDLE_OFFSET}px`,
              } as React.CSSProperties
            }
          >
            <GripVertical size={12} className="text-foreground-on-accent" />
          </div>
        </TooltipTrigger>
        <TooltipContent sideOffset={5}>
          <span ref={tooltipContentRef}>{formatDurationDisplay(duration)}</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
