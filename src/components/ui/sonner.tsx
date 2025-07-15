"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--color-gray-50)",
          "--normal-text": "var(--color-gray-900)",
          "--normal-border": "var(--color-gray-200)",
          "--success-bg": "var(--color-correct-50)",
          "--success-text": "var(--color-correct-700)",
          "--success-border": "var(--color-correct-200)",
          "--error-bg": "var(--color-incorrect-50)",
          "--error-text": "var(--color-incorrect-700)",
          "--error-border": "var(--color-incorrect-200)",
          "--warning-bg": "var(--color-pending-50)",
          "--warning-text": "var(--color-pending-700)",
          "--warning-border": "var(--color-pending-200)",
          "--info-bg": "var(--color-brand-50)",
          "--info-text": "var(--color-brand-700)",
          "--info-border": "var(--color-brand-200)",
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          background: "var(--normal-bg)",
          color: "var(--normal-text)",
          border: "1px solid var(--normal-border)",
          borderRadius: "0.75rem",
          fontSize: "0.875rem",
          fontFamily: "var(--font-sans)",
          boxShadow:
            "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        },
        className: "font-sans",
        classNames: {
          toast: "!bg-gray-50 !text-gray-900 !border-gray-200",
          title: "!text-gray-900 !font-medium",
          description: "!text-gray-700 !opacity-100",
          success: "!bg-correct-50 !text-correct-700 !border-correct-200",
          error: "!bg-incorrect-50 !text-incorrect-700 !border-incorrect-200",
          warning: "!bg-pending-50 !text-pending-700 !border-pending-200",
          info: "!bg-brand-50 !text-brand-700 !border-brand-200",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
