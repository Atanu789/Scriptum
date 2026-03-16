'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  MotionValue,
} from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface DockItem {
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

function DockIcon({
  item,
  mouseX,
  magnify,
}: {
  item: DockItem;
  mouseX: MotionValue<number>;
  magnify: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val) => {
    if (!ref.current || !magnify) return Infinity;
    const bounds = ref.current.getBoundingClientRect();
    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-120, 0, 120], [40, 64, 40]);
  const heightTransform = useTransform(distance, [-120, 0, 120], [40, 64, 40]);
  const width  = useSpring(widthTransform,  { mass: 0.1, stiffness: 180, damping: 16 });
  const height = useSpring(heightTransform, { mass: 0.1, stiffness: 180, damping: 16 });

  const yTransform = useTransform(distance, [-120, 0, 120], [0, -10, 0]);
  const y = useSpring(yTransform, { mass: 0.1, stiffness: 180, damping: 16 });

  const iconSize = magnify ? undefined : 42;
  const iconLift = magnify ? y : 0;

  const [hovered, setHovered] = useState(false);

  const inner = (
    <motion.div
      ref={ref}
      style={{ width: iconSize ?? width, height: iconSize ?? height, y: iconLift }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative flex items-center justify-center rounded-xl cursor-pointer transition-colors',
        // light mode
        'bg-slate-100/90 border border-slate-200 shadow-sm',
        'hover:bg-slate-200',
        item.active && 'bg-indigo-50 border-indigo-300',
        // dark mode
        'dark:bg-slate-800/80 dark:border-slate-700/80 dark:hover:bg-slate-700/90',
        item.active && 'dark:bg-indigo-500/20 dark:border-indigo-400/45',
      )}
    >
      {item.active && (
        <span className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-indigo-500 dark:bg-indigo-300" />
      )}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm pointer-events-none dark:bg-black/80"
          >
            {item.title}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="h-5 w-5 text-slate-700 dark:text-slate-100">{item.icon}</div>
    </motion.div>
  );

  if (item.href) {
    return <Link href={item.href}>{inner}</Link>;
  }
  return <div onClick={item.onClick}>{inner}</div>;
}

export function FloatingDock({ items }: { items: DockItem[] }) {
  const mouseX = useMotionValue(Infinity);
  const [magnify, setMagnify] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)');
    const sync = () => setMagnify(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return (
    <motion.nav
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        'fixed bottom-6 left-1/2 z-50 -translate-x-1/2',
        'flex items-end gap-1.5 rounded-2xl px-3 py-2 md:gap-2 md:px-4 md:py-3',
        // light mode – visible white card with subtle border and shadow
        'bg-white/88 backdrop-blur-xl border border-slate-200/90 shadow-[0_8px_30px_rgba(2,8,23,0.15)]',
        // dark mode
        'dark:bg-slate-950/68 dark:border-slate-800/85 dark:shadow-[0_10px_34px_rgba(2,8,23,0.55)]',
      )}
    >
      {items.map((item) => (
        <DockIcon key={item.title} item={item} mouseX={mouseX} magnify={magnify} />
      ))}
    </motion.nav>
  );
}
