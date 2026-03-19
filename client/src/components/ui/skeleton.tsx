import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  count?: number;
  baseColor?: string;
  highlightColor?: string;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, count = 1, baseColor = 'bg-slate-200 dark:bg-slate-700', highlightColor, ...props }, ref) => {
    return (
      <div ref={ref} className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'skeleton h-4 rounded',
              baseColor,
              'animate-pulse',
              className
            )}
            {...props}
          />
        ))}
      </div>
    );
  }
);

Skeleton.displayName = 'Skeleton';
