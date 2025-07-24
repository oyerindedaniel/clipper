import React from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  onChange,
}) => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <HexColorPicker color={color} onChange={onChange} className="w-full" />
      <HexColorInput
        color={color}
        onChange={onChange}
        className="w-full rounded-md border border-gray-700/50 bg-surface-secondary px-2 py-1 text-xs text-foreground-default"
      />
    </div>
  );
};
