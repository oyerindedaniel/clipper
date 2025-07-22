import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const TimelineSkeleton: React.FC = () => {
  return (
    <div className="relative w-full h-12 bg-surface-secondary rounded-lg overflow-hidden flex items-center p-2">
      <Skeleton className="w-full h-full bg-surface-tertiary" />
      <Skeleton className="absolute left-0 w-1/4 h-full bg-primary/30" />
      <Skeleton className="absolute left-0 w-3 h-full bg-primary rounded-sm" />
      <Skeleton className="absolute right-0 w-3 h-full bg-primary rounded-sm" />
    </div>
  );
};
