import React from "react";
import { cn } from "@/lib/utils";

interface ShortcutBadgeProps {
  shortcut: string;
  className?: React.HTMLAttributes<HTMLDivElement>["className"];
  size?: "sm" | "md" | "lg";
}

function ShortcutBadgeComponent({
  shortcut,
  className,
  size = "sm",
}: ShortcutBadgeProps) {
  const keys = shortcut.split(" + ");

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 min-w-[1.25rem] h-5",
    md: "text-sm px-2 py-1 min-w-[1.5rem] h-6",
    lg: "text-base px-2.5 py-1.5 min-w-[2rem] h-8",
  };

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          <kbd
            className={cn(
              "inline-flex items-center justify-center font-mono font-medium",
              "bg-surface-tertiary border border-default rounded-md",
              "text-foreground-subtle transition-colors",
              "shadow-sm",
              sizeClasses[size]
            )}
          >
            {key}
          </kbd>
          {index < keys.length - 1 && (
            <span className="text-foreground-muted text-xs mx-0.5">+</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export const ShortcutBadge = React.memo(ShortcutBadgeComponent);
