import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const TimelineSkeleton: React.FC = () => {
  return (
    <div className="relative w-full px-2 py-3">
      <div className="relative w-full h-8 bg-surface-secondary rounded-xl shadow-inner overflow-hidden flex items-center">
        <Skeleton className="absolute inset-0 w-full h-full bg-surface-tertiary rounded-xl" />
      </div>
    </div>
  );
};
