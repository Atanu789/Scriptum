'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Comet = {
  id: number;
  top: string;
  left: string;
  delay: string;
  duration: string;
  tail: number;
};

function Comets({ count = 10 }: { count?: number }) {
  const [comets, setComets] = useState<Comet[]>([]);

  useEffect(() => {
    setComets(
      Array.from({ length: count }, (_, index) => ({
        id: index,
        top: `${Math.floor(Math.random() * 85)}%`,
        left: `${Math.floor(Math.random() * 100)}%`,
        delay: `${(Math.random() * 2.2).toFixed(2)}s`,
        duration: `${(Math.random() * 3 + 3.2).toFixed(2)}s`,
        tail: Math.floor(Math.random() * 50) + 50,
      }))
    );
  }, [count]);

  return (
    <>
      {comets.map((comet) => (
        <span
          key={comet.id}
          className="pointer-events-none absolute h-[1.5px] w-[1.5px] rounded-full bg-indigo-300/70 animate-meteor-effect"
          style={{
            top: comet.top,
            left: comet.left,
            animationDelay: comet.delay,
            animationDuration: comet.duration,
            transform: 'rotate(215deg)',
          }}
        >
          <span
            className="absolute left-full top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-indigo-300/60 to-transparent"
            style={{ width: `${comet.tail}px` }}
          />
        </span>
      ))}
    </>
  );
}

type CometCardProps = {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  cometCount?: number;
  highlight?: boolean;
};

export function CometCard({
  children,
  className,
  innerClassName,
  cometCount = 10,
  highlight = false,
}: CometCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-white/75 p-px backdrop-blur-xl',
        'border-slate-200/90 shadow-[0_12px_34px_rgba(15,23,42,0.08)]',
        'dark:border-slate-700/70 dark:bg-slate-950/70 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]',
        highlight &&
          'border-indigo-300/80 shadow-[0_18px_40px_rgba(79,70,229,0.2)] dark:border-indigo-500/55 dark:shadow-[0_22px_48px_rgba(79,70,229,0.25)]',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.16),transparent_36%),radial-gradient(circle_at_80%_90%,rgba(139,92,246,0.12),transparent_36%)]" />
      <Comets count={cometCount} />
      <div className={cn('relative z-10 h-full rounded-[inherit]', innerClassName)}>{children}</div>
    </div>
  );
}
