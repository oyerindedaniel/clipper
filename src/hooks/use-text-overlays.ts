import {
  useRef,
  useState,
  useCallback,
  RefObject,
  startTransition,
} from "react";
import { TextOverlay } from "@/types/app";
import { getOverlayNormalizedCoords, getVideoBoundingBox } from "@/utils/app";
import logger from "@/utils/logger";

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  element: HTMLElement | null;
  offsetX: number;
  offsetY: number;
  overlayId: string | null;
  rafId: number | null;
  finalLeft: number;
  finalTop: number;
}

/**
 * Hook for managing and dragging text overlays over a canvas.
 */
export const useTextOverlays = (
  videoRef: React.RefObject<HTMLVideoElement | null>
) => {
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    element: null,
    offsetX: 0,
    offsetY: 0,
    overlayId: null,
    rafId: null,
    finalLeft: 0,
    finalTop: 0,
  });

  const addTextOverlay = useCallback(
    (currentTime: number = 0, duration?: number) => {
      const video = videoRef.current;

      if (!video) {
        logger.warn(
          "⚠️ Cannot add text overlay: video element is not available."
        );
        return;
      }

      const { width: videoWidth } = getVideoBoundingBox(video);

      logger.log("🔍 Adding text overlay", {
        currentTime,
        duration,
        videoWidth,
      });

      const newOverlay: TextOverlay = {
        id: `text_${Date.now()}`,
        text: "New Text",
        startTime: currentTime,
        endTime: duration ?? Infinity,
        x: 0,
        y: 0,
        fontSize: 24,
        fontFamily: "Inter",
        letterSpacing: "-0.03em",
        color: "#ffffff",
        backgroundColor: "#000000",
        opacity: 0.8,
        bold: false,
        italic: false,
        underline: false,
        alignment: "center",
        visible: true,
        maxWidth: `${videoWidth * 0.7}px`,
      };

      setTextOverlays((prev) => [...prev, newOverlay]);
      setSelectedOverlay(newOverlay.id);
    },
    []
  );

  const updateTextOverlay = useCallback(
    (id: string, updates: Partial<TextOverlay>) => {
      setTextOverlays((prev) =>
        prev.map((overlay) =>
          overlay.id === id ? { ...overlay, ...updates } : overlay
        )
      );
    },
    []
  );

  const deleteTextOverlay = useCallback((id: string) => {
    setTextOverlays((prev) => prev.filter((overlay) => overlay.id !== id));
    setSelectedOverlay((prev) => (prev === id ? null : prev));
  }, []);

  const getTimeBasedOverlays = useCallback(
    (currentTime: number) =>
      textOverlays.filter(
        (overlay) =>
          overlay.visible &&
          currentTime >= overlay.startTime &&
          currentTime <= overlay.endTime
      ),
    [textOverlays]
  );

  const getAllVisibleOverlays = useCallback(
    () => textOverlays.filter((overlay) => overlay.visible),
    [textOverlays]
  );

  const startDrag = useCallback((overlayId: string, e: React.MouseEvent) => {
    const target = e.currentTarget as HTMLElement;
    const container = containerRef.current;

    if (!container) return;

    const rect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      element: target,
      offsetX: rect.left - containerRect.left,
      offsetY: rect.top - containerRect.top,
      overlayId,
      rafId: null,
      finalLeft: 0,
      finalTop: 0,
    };

    setSelectedOverlay(overlayId);

    const onMouseMove = (ev: MouseEvent) => {
      const drag = dragRef.current;

      if (!drag.isDragging || !drag.element) return;

      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const elementRect = drag.element.getBoundingClientRect();

      const elementWidth = elementRect.width;
      const elementHeight = elementRect.height;

      let newLeft = drag.offsetX + dx;
      let newTop = drag.offsetY + dy;

      newLeft = Math.max(
        0,
        Math.min(containerRect.width - elementWidth, newLeft)
      );
      newTop = Math.max(
        0,
        Math.min(containerRect.height - elementHeight, newTop)
      );

      drag.finalLeft = newLeft;
      drag.finalTop = newTop;

      if (drag.rafId) {
        cancelAnimationFrame(drag.rafId);
      }

      drag.rafId = requestAnimationFrame(() => {
        if (drag.element) {
          drag.element.style.transform = `translate3d(${newLeft}px, ${newTop}px, 0)`;
        }
      });
    };

    const onMouseUp = () => {
      const drag = dragRef.current;
      drag.isDragging = false;

      if (videoRef?.current && drag.overlayId) {
        const { x, y } = getOverlayNormalizedCoords(videoRef.current, {
          overlayX: drag.finalLeft,
          overlayY: drag.finalTop,
        });

        updateTextOverlay(drag.overlayId, {
          x,
          y,
        });

        logger.log("[Normalized Overlay Position]", { x, y });
      }

      drag.element = null;
      drag.overlayId = null;
      drag.finalLeft = 0;
      drag.finalTop = 0;

      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return {
    textOverlays,
    selectedOverlay,
    setSelectedOverlay,
    addTextOverlay,
    updateTextOverlay,
    deleteTextOverlay,
    getTimeBasedOverlays,
    getAllVisibleOverlays,
    containerRef,
    startDrag,
  };
};
