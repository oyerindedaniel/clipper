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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorPicker } from "@/components/ui/color-picker";

interface TextOverlayItemProps {
  overlay: TextOverlay;
  selectedOverlay: string | null;
  duration: number;
  updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  deleteTextOverlay: (id: string) => void;
}

const fontSizes = Array.from(
  { length: Math.floor((72 - 8) / 4) + 1 },
  (_, i) => 8 + i * 4
);
const opacities = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.1);

const TextOverlayItem = ({
  overlay,
  selectedOverlay,
  duration,
  updateTextOverlay,
  deleteTextOverlay,
}: TextOverlayItemProps) => {
  return (
    <div
      className={`p-3 rounded-lg border-2 text-sm ${
        selectedOverlay === overlay.id
          ? "border-primary bg-primary/10"
          : "border-gray-700/50 bg-surface-secondary"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <Input
          type="text"
          value={overlay.text}
          onChange={(e) =>
            updateTextOverlay(overlay.id, {
              text: e.target.value,
            })
          }
          className="flex-1 px-2 py-1 text-sm"
          placeholder="Text content"
        />
        <div className="flex items-center space-x-1 ml-2">
          <Button
            onClick={() =>
              updateTextOverlay(overlay.id, {
                visible: !overlay.visible,
              })
            }
            className={`p-1 rounded ${
              overlay.visible ? "text-primary" : "text-foreground-muted"
            }`}
            variant="ghost"
            size="icon"
          >
            {overlay.visible ? <Eye size={16} /> : <EyeOff size={16} />}
          </Button>
          <Button
            onClick={() => deleteTextOverlay(overlay.id)}
            className="p-1 text-error hover:text-error/80"
            variant="ghost"
            size="icon"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {selectedOverlay === overlay.id && (
        <div className="space-y-3 mt-3 pt-3 border-t border-gray-700/50">
          <div>
            <label className="block text-xs text-foreground-subtle mb-1">
              Display Type
            </label>
            <Select
              value={overlay.endTime === duration ? "persistent" : "timed"}
              onValueChange={(value) => {
                if (value === "persistent") {
                  updateTextOverlay(overlay.id, {
                    startTime: 0,
                    endTime: duration,
                  });
                } else {
                  // updateTextOverlay(overlay.id, {
                  //   startTime: currentTime,
                  //   endTime: currentTime + 5000,
                  // });
                }
              }}
            >
              <SelectTrigger className="w-full px-2 py-1 h-auto text-xs">
                <SelectValue placeholder="Select display type" />
              </SelectTrigger>
              <SelectContent>
                {/* <SelectItem value="timed">Timed (Subtitle-like)</SelectItem> */}
                <SelectItem value="persistent">
                  Persistent (Always visible)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-foreground-subtle mb-1">
                Font Size
              </label>
              <Select
                value={String(overlay.fontSize)}
                onValueChange={(value) => {
                  // updateTextOverlay(overlay.id, { fontSize: parseInt(value) })
                }}
              >
                <SelectTrigger className="w-full px-2 py-1 h-auto text-xs">
                  <SelectValue placeholder="Select font size" />
                </SelectTrigger>
                <SelectContent>
                  {fontSizes.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}px
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-foreground-subtle mb-1">
                Opacity
              </label>
              <Select
                value={String(overlay.opacity)}
                onValueChange={(value) =>
                  updateTextOverlay(overlay.id, { opacity: parseFloat(value) })
                }
              >
                <SelectTrigger className="w-full px-2 py-1 h-auto text-xs">
                  <SelectValue placeholder="Select opacity" />
                </SelectTrigger>
                <SelectContent>
                  {opacities.map((o) => (
                    <SelectItem key={o} value={String(o)}>
                      {(o * 100).toFixed(0)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              onClick={() =>
                updateTextOverlay(overlay.id, {
                  bold: !overlay.bold,
                })
              }
              className={`p-2 rounded ${
                overlay.bold ? "bg-primary" : "bg-surface-tertiary"
              }`}
              variant="ghost"
              size="icon"
            >
              <Bold size={16} />
            </Button>
            <Button
              onClick={() =>
                updateTextOverlay(overlay.id, {
                  italic: !overlay.italic,
                })
              }
              className={`p-2 rounded ${
                overlay.italic ? "bg-primary" : "bg-surface-tertiary"
              }`}
              variant="ghost"
              size="icon"
            >
              <Italic size={16} />
            </Button>
            <Button
              onClick={() =>
                updateTextOverlay(overlay.id, {
                  underline: !overlay.underline,
                })
              }
              className={`p-2 rounded ${
                overlay.underline ? "bg-primary" : "bg-surface-tertiary"
              }`}
              variant="ghost"
              size="icon"
            >
              <Underline size={16} />
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            {[
              { value: "left", icon: AlignLeft },
              { value: "center", icon: AlignCenter },
              { value: "right", icon: AlignRight },
            ].map(({ value, icon: Icon }) => (
              <Button
                key={value}
                onClick={() =>
                  updateTextOverlay(overlay.id, {
                    alignment: value as "left" | "center" | "right",
                  })
                }
                className={`p-2 rounded ${
                  overlay.alignment === value
                    ? "bg-primary"
                    : "bg-surface-tertiary"
                }`}
                variant="ghost"
                size="icon"
              >
                <Icon size={16} />
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-foreground-subtle mb-1">
                Text Color
              </label>
              <ColorPicker
                color={overlay.color}
                onChange={(value) =>
                  updateTextOverlay(overlay.id, { color: value })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-subtle mb-1">
                Background
              </label>
              <ColorPicker
                color={overlay.backgroundColor}
                onChange={(value) =>
                  updateTextOverlay(overlay.id, { backgroundColor: value })
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextOverlayItem;
