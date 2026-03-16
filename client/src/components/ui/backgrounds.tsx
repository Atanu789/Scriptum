'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/** Full-page dot-pattern background */
export function DotBackground({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn('relative min-h-screen w-full', className)}
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.18) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Radial fade to prevent dots from being too loud at centre */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,transparent_50%,rgba(255,255,255,0.82))] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,transparent_50%,rgba(2,6,23,0.82))]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Full-page grid-line background */
export function GridBackground({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn('relative min-h-screen w-full', className)}
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(99,102,241,0.10) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99,102,241,0.10) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(99,102,241,0.08)_0%,transparent_100%)]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Inline section with dot background, no min-h-screen */
export function DotSection({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('relative w-full', className)}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.15) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
