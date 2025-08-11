import React from "react";
import { TextOverlay } from "@/types/app";

interface DraggableTextOverlayProps {
  overlay: TextOverlay;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Draggable overlay element rendered on top of a canvas or video.
 */
export const DraggableTextOverlay = ({
  overlay,
  isSelected,
  onMouseDown,
}: DraggableTextOverlayProps) => {
  return (
    <div
      className={`absolute select-none cursor-move ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
      style={
        {
          transform: "translate3d(0px, 0px, 0)",
          willChange: "transform",
          left: 0,
          top: 0,
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
          maxWidth: overlay.maxWidth,
          padding: "6px 8px",
          borderRadius: "4px",
          zIndex: isSelected ? 10 : 1,
          pointerEvents: "auto",
        } as React.CSSProperties
      }
      onMouseDown={onMouseDown}
      data-overlay-id={overlay.id}
    >
      {overlay.text}
    </div>
  );
};
