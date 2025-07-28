import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground-default bg-surface-secondary placeholder:text-foreground-muted selection:bg-primary selection:text-foreground-on-accent flex h-9 w-full min-w-0 rounded-3xl border-2 border-border-default px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-foreground-default font-mono",
        "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
        "aria-invalid:ring-error/50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
