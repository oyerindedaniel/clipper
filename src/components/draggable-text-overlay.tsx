import React, { useEffect } from "react";
import { TextOverlay } from "@/types/app";

interface DraggableTextOverlayProps {
  overlay: TextOverlay;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDragMove: (e: MouseEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

export const DraggableTextOverlay = ({
  overlay,
  isSelected,
  onMouseDown,
  onDragMove,
  onDragEnd,
  isDragging,
}: DraggableTextOverlayProps) => {
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);

      return () => {
        document.removeEventListener("mousemove", onDragMove);
        document.removeEventListener("mouseup", onDragEnd);
      };
    }
  }, [isDragging, onDragMove, onDragEnd]);

  return (
    <div
      className={`absolute select-none cursor-move ${
        isSelected ? "ring-2 ring-blue-400" : ""
      }`}
      style={{
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        fontSize: `${overlay.fontSize}px`,
        fontFamily: overlay.fontFamily,
        letterSpacing: overlay.letterSpacing,
        color: overlay.color,
        backgroundColor: overlay.backgroundColor,
        opacity: overlay.opacity,
        fontWeight: overlay.bold ? "bold" : "normal",
        fontStyle: overlay.italic ? "italic" : "normal",
        textDecoration: overlay.underline ? "underline" : "none",
        textAlign: overlay.alignment,
        padding: "8px 12px",
        borderRadius: "4px",
        transform: "translate(-50%, -50%)",
        zIndex: isSelected ? 10 : 1,
      }}
      onMouseDown={onMouseDown}
    >
      {overlay.text}
    </div>
  );
};
