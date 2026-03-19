import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ hover = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl border border-slate-200 dark:border-slate-700',
          'bg-white dark:bg-slate-900',
          'shadow-soft dark:shadow-dark-soft',
          'transition-all duration-200',
          hover && 'hover:shadow-soft-lg dark:hover:shadow-dark-soft-md hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer hover:scale-[1.01] active:scale-95',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
