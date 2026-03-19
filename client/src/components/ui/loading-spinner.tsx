import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  fullscreen?: boolean;
}

export const LoadingSpinner = React.forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ size = 'md', fullscreen = false, className, ...props }, ref) => {
    const sizeClasses = {
      xs: 'h-3 w-3 border',
      sm: 'h-4 w-4 border-[1.5px]',
      md: 'h-6 w-6 border-2',
      lg: 'h-8 w-8 border-2',
    };

    const spinner = (
      <div
        ref={ref}
        className={cn(
          'animate-spin rounded-full',
          'border-slate-200 dark:border-slate-700',
          'border-t-indigo-600 dark:border-t-indigo-400',
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );

    if (fullscreen) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-50">
          {spinner}
        </div>
      );
    }

    return spinner;
  }
);

LoadingSpinner.displayName = 'LoadingSpinner';
