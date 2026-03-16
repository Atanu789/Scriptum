'use client';

import { cn } from '@/lib/utils';

type VortexBackgroundProps = {
  className?: string;
  children?: React.ReactNode;
  compact?: boolean;
};

export function VortexBackground({ className, children, compact = false }: VortexBackgroundProps) {
  return (
    <div className={cn('relative overflow-hidden', compact ? 'rounded-2xl' : 'min-h-screen', className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(79,70,229,0.2),transparent_42%),radial-gradient(circle_at_80%_70%,rgba(14,165,233,0.15),transparent_42%),radial-gradient(circle_at_20%_75%,rgba(168,85,247,0.14),transparent_42%)]" />

    

      


      <div className="relative z-10">{children}</div>
    </div>
  );
}
