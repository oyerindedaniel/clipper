import { useRef, useState, useCallback } from "react";
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

export function calculateMaxWidth(value: number): string {
  return `${Math.round(value * 0.65)}px`;
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

  const vGuideRef = useRef<HTMLDivElement | null>(null);
  const hGuideRef = useRef<HTMLDivElement | null>(null);

  function ensureGuides(container: HTMLDivElement) {
    if (!vGuideRef.current) {
      const v = document.createElement("div");
      v.style.position = "absolute";
      v.style.top = "0";
      v.style.bottom = "0";
      v.style.width = "1px";
      v.style.background = "var(--color-primary, rgba(59,130,246,0.75))";
      v.style.pointerEvents = "none";
      v.style.zIndex = "14";
      v.style.display = "none";
      container.appendChild(v);
      vGuideRef.current = v;
    }
    if (!hGuideRef.current) {
      const h = document.createElement("div");
      h.style.position = "absolute";
      h.style.left = "0";
      h.style.right = "0";
      h.style.height = "1px";
      h.style.background = "var(--color-primary, rgba(59,130,246,0.75))";
      h.style.pointerEvents = "none";
      h.style.zIndex = "14";
      h.style.display = "none";
      container.appendChild(h);
      hGuideRef.current = h;
    }
  }

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
        maxWidth: calculateMaxWidth(videoWidth),
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

    ensureGuides(container);

    const style = window.getComputedStyle(target);
    const transformMatrix = style.transform;
    let currentX = 0;
    let currentY = 0;

    if (transformMatrix && transformMatrix !== "none") {
      const matrixValues = transformMatrix.match(
        /matrix3d\((.+)\)|matrix\((.+)\)/
      );
      if (matrixValues) {
        const values = matrixValues[1] || matrixValues[2];
        const parsedValues = values.split(",").map(parseFloat);
        if (matrixValues[1]) {
          // matrix3d
          currentX = parsedValues[12];
          currentY = parsedValues[13];
        } else {
          // matrix
          currentX = parsedValues[4];
          currentY = parsedValues[5];
        }
      }
    }

    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      element: target,
      offsetX: currentX,
      offsetY: currentY,
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

      const containerCenterX = containerRect.width / 2;
      const containerCenterY = containerRect.height / 2;
      const elementCenterX = newLeft + elementWidth / 2;
      const elementCenterY = newTop + elementHeight / 2;
      const threshold = 6; // px tolerance

      if (vGuideRef.current) {
        if (Math.abs(elementCenterX - containerCenterX) <= threshold) {
          vGuideRef.current.style.left = `${containerCenterX}px`;
          vGuideRef.current.style.display = "block";
        } else {
          vGuideRef.current.style.display = "none";
        }
      }
      if (hGuideRef.current) {
        if (Math.abs(elementCenterY - containerCenterY) <= threshold) {
          hGuideRef.current.style.top = `${containerCenterY}px`;
          hGuideRef.current.style.display = "block";
        } else {
          hGuideRef.current.style.display = "none";
        }
      }

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

      if (vGuideRef.current) vGuideRef.current.style.display = "none";
      if (hGuideRef.current) hGuideRef.current.style.display = "none";

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
