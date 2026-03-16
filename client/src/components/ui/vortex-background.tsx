"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Vortex } from "@/components/ui/vortex";

type VortexBackgroundProps = {
  className?: string;
  children?: React.ReactNode;
  compact?: boolean;
  particleCount?: number;
};

export function VortexBackground({
  className,
  children,
  compact = false,
  particleCount = 500,
}: VortexBackgroundProps) {
  return (
    <div className={cn("relative overflow-hidden", compact ? "h-full w-full" : "min-h-screen", className)}>
      <Vortex
        particleCount={particleCount}
        baseHue={225}
        baseSpeed={0.05}
        rangeSpeed={1.2}
        backgroundColor="transparent"
        containerClassName="absolute inset-0 scale-600 opacity-75 blur-[4px]"
        className="h-full w-full"
      />

      <div className="pointer-events-none absolute inset-0 blur-xl bg-[radial-gradient(circle_at_50%_20%,rgba(79,70,229,0.2),transparent_52%),radial-gradient(circle_at_80%_70%,rgba(14,165,233,0.16),transparent_52%),radial-gradient(circle_at_20%_75%,rgba(168,85,247,0.16),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 blur-2xl bg-[radial-gradient(circle_at_50%_50%,transparent_30%,rgba(2,6,23,0.18)_100%)] dark:bg-[radial-gradient(circle_at_50%_50%,transparent_30%,rgba(2,6,23,0.56)_100%)]" />

      {children ? <div className="relative z-10">{children}</div> : null}
    </div>
  );
}
