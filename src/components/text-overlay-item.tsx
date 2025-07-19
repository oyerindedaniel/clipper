import React from "react";
import {
  Eye,
  EyeOff,
  Trash2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { TextOverlay } from "@/types/app";

interface TextOverlayItemProps {
  overlay: TextOverlay;
  selectedOverlay: string | null;
  duration: number;
  currentTime: number;
  updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  deleteTextOverlay: (id: string) => void;
}

const TextOverlayItem = ({
  overlay,
  selectedOverlay,
  duration,
  currentTime,
  updateTextOverlay,
  deleteTextOverlay,
}: TextOverlayItemProps) => {
  return (
    <div
      className={`p-3 rounded-lg border-2 ${
        selectedOverlay === overlay.id
          ? "border-blue-500 bg-blue-900/20"
          : "border-gray-600 bg-gray-700/50"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <input
          type="text"
          value={overlay.text}
          onChange={(e) =>
            updateTextOverlay(overlay.id, {
              text: e.target.value,
            })
          }
          className="flex-1 bg-gray-800 rounded px-2 py-1 text-sm"
          placeholder="Text content"
        />
        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={() =>
              updateTextOverlay(overlay.id, {
                visible: !overlay.visible,
              })
            }
            className={`p-1 rounded ${
              overlay.visible ? "text-blue-400" : "text-gray-500"
            }`}
          >
            {overlay.visible ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button
            onClick={() => deleteTextOverlay(overlay.id)}
            className="p-1 text-red-400 hover:text-red-300"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {selectedOverlay === overlay.id && (
        <div className="space-y-3 mt-3 pt-3 border-t border-gray-600">
          {/* Display Type Selection */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Display Type
            </label>
            <select
              value={overlay.endTime === duration ? "persistent" : "timed"}
              onChange={(e) => {
                if (e.target.value === "persistent") {
                  updateTextOverlay(overlay.id, {
                    startTime: 0,
                    endTime: duration,
                  });
                } else {
                  updateTextOverlay(overlay.id, {
                    startTime: currentTime,
                    endTime: currentTime + 5000,
                  });
                }
              }}
              className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
            >
              <option value="timed">Timed (Subtitle-like)</option>
              <option value="persistent">Persistent (Always visible)</option>
            </select>
          </div>

          {/* Font Size and Opacity */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Font Size
              </label>
              <input
                type="range"
                min="12"
                max="120"
                value={overlay.fontSize}
                onChange={(e) =>
                  updateTextOverlay(overlay.id, {
                    fontSize: parseInt(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Opacity
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={overlay.opacity}
                onChange={(e) =>
                  updateTextOverlay(overlay.id, {
                    opacity: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
          </div>

          {/* Text Formatting */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() =>
                updateTextOverlay(overlay.id, {
                  bold: !overlay.bold,
                })
              }
              className={`p-2 rounded ${
                overlay.bold ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              <Bold size={16} />
            </button>
            <button
              onClick={() =>
                updateTextOverlay(overlay.id, {
                  italic: !overlay.italic,
                })
              }
              className={`p-2 rounded ${
                overlay.italic ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              <Italic size={16} />
            </button>
            <button
              onClick={() =>
                updateTextOverlay(overlay.id, {
                  underline: !overlay.underline,
                })
              }
              className={`p-2 rounded ${
                overlay.underline ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              <Underline size={16} />
            </button>
          </div>

          {/* Text Alignment */}
          <div className="flex items-center space-x-2">
            {[
              { value: "left", icon: AlignLeft },
              { value: "center", icon: AlignCenter },
              { value: "right", icon: AlignRight },
            ].map(({ value, icon: Icon }) => (
              <button
                key={value}
                onClick={() =>
                  updateTextOverlay(overlay.id, {
                    alignment: value as "left" | "center" | "right",
                  })
                }
                className={`p-2 rounded ${
                  overlay.alignment === value ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Text Color
              </label>
              <input
                type="color"
                value={overlay.color}
                onChange={(e) =>
                  updateTextOverlay(overlay.id, {
                    color: e.target.value,
                  })
                }
                className="w-full h-8 rounded"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Background
              </label>
              <input
                type="color"
                value={overlay.backgroundColor}
                onChange={(e) =>
                  updateTextOverlay(overlay.id, {
                    backgroundColor: e.target.value,
                  })
                }
                className="w-full h-8 rounded"
              />
            </div>
          </div>

          {/* Timing Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Start Time (s)
              </label>
              <input
                type="number"
                min="0"
                max={Math.floor(duration / 1000)}
                value={Math.floor(overlay.startTime / 1000)}
                onChange={(e) =>
                  updateTextOverlay(overlay.id, {
                    startTime: parseInt(e.target.value) * 1000,
                  })
                }
                className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                End Time (s)
              </label>
              <input
                type="number"
                min="0"
                max={Math.floor(duration / 1000)}
                value={Math.floor(overlay.endTime / 1000)}
                onChange={(e) =>
                  updateTextOverlay(overlay.id, {
                    endTime: parseInt(e.target.value) * 1000,
                  })
                }
                className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextOverlayItem;
