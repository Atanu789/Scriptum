'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type CanvasRevealCardProps = {
  children: React.ReactNode;
  className?: string;
  overlayOpacity?: number;
};

export function CanvasRevealCard({
  children,
  className,
  overlayOpacity = 0.48,
}: CanvasRevealCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let tick = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      const alphaBase = hovered ? 0.2 : 0.08;
      const alphaWave = hovered ? 0.22 : 0.1;

      for (let i = 0; i < 5; i += 1) {
        const y = (height / 6) * (i + 1);
        const amp = (hovered ? 18 : 10) + i * 2;
        const phase = tick * 0.02 + i * 0.8;

        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= width; x += 14) {
          const waveY = y + Math.sin((x / 70) + phase) * amp;
          ctx.lineTo(x, waveY);
        }

        const alpha = alphaBase + (Math.sin(phase) + 1) * 0.5 * alphaWave;
        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha.toFixed(3)})`;
        ctx.lineWidth = hovered ? 1.35 : 1;
        ctx.stroke();
      }

      tick += 1;
      raf = window.requestAnimationFrame(draw);
    };

    resize();
    draw();

    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [hovered]);

  return (
    <div
      ref={hostRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/70',
        'dark:border-slate-700/70 dark:bg-slate-900/50',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ opacity: overlayOpacity }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(99,102,241,0.14),transparent_40%)] transition-opacity duration-300 group-hover:opacity-100 opacity-70" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
