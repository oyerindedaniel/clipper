import { useState, useCallback, useRef } from "react";
import { TextOverlay } from "@/types/app";

export const useTextOverlays = () => {
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
  const dragStateRef = useRef({
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    currentOverlayId: null as string | null,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const addTextOverlay = useCallback((currentTime: number = 0) => {
    const newOverlay: TextOverlay = {
      id: `text_${Date.now()}`,
      text: "New Text",
      startTime: currentTime,
      endTime: currentTime + 5000,
      x: 50,
      y: 50,
      fontSize: 48,
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
    };

    setTextOverlays((prev) => [...prev, newOverlay]);
    setSelectedOverlay(newOverlay.id);
  }, []);

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
    (currentTime: number) => {
      return textOverlays.filter(
        (overlay) =>
          overlay.visible &&
          currentTime >= overlay.startTime &&
          currentTime <= overlay.endTime
      );
    },
    [textOverlays]
  );

  const getAllVisibleOverlays = useCallback(() => {
    return textOverlays.filter((overlay) => overlay.visible);
  }, [textOverlays]);

  const startDrag = useCallback((overlayId: string, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    if (containerRect) {
      dragStateRef.current = {
        isDragging: true,
        dragStart: {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        },
        currentOverlayId: overlayId,
      };
      setSelectedOverlay(overlayId);
    }
  }, []);

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      const { isDragging, dragStart, currentOverlayId } = dragStateRef.current;
      if (!isDragging || !currentOverlayId || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newX =
        ((e.clientX - containerRect.left - dragStart.x) / containerRect.width) *
        100;
      const newY =
        ((e.clientY - containerRect.top - dragStart.y) / containerRect.height) *
        100;

      const constrainedX = Math.max(0, Math.min(100, newX));
      const constrainedY = Math.max(0, Math.min(100, newY));

      updateTextOverlay(currentOverlayId, { x: constrainedX, y: constrainedY });
    },
    [updateTextOverlay]
  );

  const endDrag = useCallback(() => {
    dragStateRef.current.isDragging = false;
    dragStateRef.current.currentOverlayId = null;
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
    handleDragMove,
    endDrag,
    dragStateRef,
  };
};
