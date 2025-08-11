import React, {
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  useState,
  memo,
} from "react";
import { GripVertical } from "lucide-react";

interface TimelineProps {
  duration: number;
  onTrim: (startTime: number, endTime: number) => void;
}

type Dir = "left" | "right";

const HANDLE_OFFSET = 8;

const Timeline: React.FC<TimelineProps> = ({ duration, onTrim }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftHandleRef = useRef<HTMLDivElement>(null);
  const rightHandleRef = useRef<HTMLDivElement>(null);
  const filledAreaRef = useRef<HTMLDivElement>(null);

  const leftTooltipContentRef = useRef<HTMLSpanElement>(null);
  const rightTooltipContentRef = useRef<HTMLSpanElement>(null);

  const trimValuesRef = useRef({ start: 0, end: duration });
  const pixelsPerMs = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const [showTooltip, setShowTooltip] = useState(false);
  const [activeHandle, setActiveHandle] = useState<Dir | null>(null);

  function formatDurationDisplay(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

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

    const leftPos = 0;
    const rightPos = duration * pixelsPerMs.current;

    if (leftHandleRef.current) {
      leftHandleRef.current.style.left = `${leftPos - HANDLE_OFFSET}px`;
    }
    if (rightHandleRef.current) {
      rightHandleRef.current.style.left = `${rightPos - HANDLE_OFFSET}px`;
    }
    if (filledAreaRef.current) {
      filledAreaRef.current.style.left = `${leftPos}px`;
      filledAreaRef.current.style.width = `${rightPos - leftPos}px`;
    }
  }, [duration, calculatePixelsPerMs]);

  const updateTooltipContent = (trimStart: number, trimEnd: number) => {
    if (leftTooltipContentRef.current) {
      leftTooltipContentRef.current.textContent = `Start: ${formatDurationDisplay(
        trimStart
      )}`;
    }

    if (rightTooltipContentRef.current) {
      rightTooltipContentRef.current.textContent = `End: ${formatDurationDisplay(
        trimEnd
      )}`;
    }
  };

  useEffect(() => {
    calculatePixelsPerMs();
    window.addEventListener("resize", calculatePixelsPerMs);
    return () => window.removeEventListener("resize", calculatePixelsPerMs);
  }, [duration, calculatePixelsPerMs]);

  const handleDrag = useCallback(
    (event: MouseEvent, handleType: Dir) => {
      event.preventDefault();
      const timelineRect = timelineRef.current?.getBoundingClientRect();
      if (!timelineRect) return;

      let isDragging = true;
      setShowTooltip(true);
      setActiveHandle(handleType);

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;

        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

        rafIdRef.current = requestAnimationFrame(() => {
          let newX = moveEvent.clientX - timelineRect.left;
          newX = Math.max(0, Math.min(newX, timelineRect.width));

          const newTime = newX / pixelsPerMs.current;

          if (handleType === "left") {
            const maxStartTime = Math.max(0, trimValuesRef.current.end - 1000);
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

            updateTooltipContent(newTrimStart, trimValuesRef.current.end);
          } else {
            const minEndTime = Math.min(
              duration,
              trimValuesRef.current.start + 1000
            );
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

            updateTooltipContent(trimValuesRef.current.start, newTrimEnd);
          }
        });
      };

      const onMouseUp = () => {
        isDragging = false;
        setShowTooltip(false);

        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

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
    <div
      className="relative w-full px-2 py-3"
      style={{ "--handle-offset": `${HANDLE_OFFSET}px` } as React.CSSProperties}
    >
      <div className="relative w-full h-8 bg-gradient-to-r from-surface-secondary via-surface-primary to-surface-secondary rounded-xl shadow-inner">
        <div
          ref={timelineRef}
          className="absolute inset-0 bg-gradient-to-b from-surface-primary to-surface-secondary"
          // style={{
          //   backgroundImage: `repeating-linear-gradient(
          //     90deg,
          //     transparent,
          //     transparent 10px,
          //     var(--surface-hover) 10px,
          //     var(--surface-hover) 11px
          //   )`,
          // }}
        >
          {/* {Array.from({ length: Math.floor(duration / 1000) }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 w-px h-full bg-surface-hover"
              style={{
                left: `${(i * 1000 * pixelsPerMs.current).toFixed(2)}px`,
              }}
            />
          ))} */}
        </div>

        <div
          ref={filledAreaRef}
          className="absolute h-full bg-gradient-to-r from-primary/40 via-primary/50 to-primary/40 backdrop-blur-[1px] border-y border-border-default/50"
          style={{
            boxShadow:
              "inset 0 1px 2px var(--primary-shadow-color), inset 0 -1px 2px var(--primary-shadow-color)",
          }}
        />

        <div
          ref={leftHandleRef}
          className={`absolute w-[calc(var(--handle-offset)*2)] -left-[var(--handle-offset)] h-full cursor-ew-resize z-20 ${
            activeHandle === "left" ? "scale-110" : "hover:scale-105"
          }`}
          onMouseDown={(e) => handleDrag(e.nativeEvent, "left")}
        >
          <div className="absolute inset-0 bg-primary rounded-xl shadow-lg opacity-20 blur-sm" />

          <div
            className={`relative w-full h-full bg-gradient-to-b from-primary to-primary-active rounded-xl shadow-md border border-border-default/50 flex items-center justify-center transition-all duration-200 ${
              activeHandle === "left"
                ? "shadow-lg shadow-primary/25"
                : "hover:shadow-md hover:shadow-primary/20"
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-transparent rounded-xl" />

            <GripVertical
              size={10}
              className="text-foreground-on-accent drop-shadow-sm relative z-10"
            />
          </div>
        </div>

        <div
          ref={rightHandleRef}
          className={`absolute w-[calc(var(--handle-offset)*2)] -left-[var(--handle-offset)] h-full cursor-ew-resize z-20 ${
            activeHandle === "right" ? "scale-110" : "hover:scale-105"
          }`}
          onMouseDown={(e) => handleDrag(e.nativeEvent, "right")}
        >
          <div className="absolute inset-0 bg-primary rounded-xl shadow-lg opacity-20 blur-sm" />

          <div
            className={`relative w-full h-full bg-gradient-to-b from-primary to-primary-active rounded-xl shadow-md border border-border-default/50 flex items-center justify-center transition-all duration-200 ${
              activeHandle === "right"
                ? "shadow-lg shadow-primary/25"
                : "hover:shadow-md hover:shadow-primary/20"
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-transparent rounded-xl" />

            <GripVertical
              size={10}
              className="text-foreground-on-accent drop-shadow-sm relative z-10"
            />
          </div>
        </div>
      </div>

      {showTooltip && (
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 z-30">
          <div className="bg-surface-secondary text-foreground-default px-3 py-1.5 rounded-xl shadow-lg text-xs font-medium whitespace-nowrap">
            <div className="flex gap-3">
              <span className="text-primary" ref={leftTooltipContentRef}>
                {formatDurationDisplay(duration)}
              </span>
              <span className="text-foreground-muted">•</span>
              <span className="text-primary" ref={rightTooltipContentRef}>
                {formatDurationDisplay(duration)}
              </span>
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-surface-secondary" />
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(Timeline);
