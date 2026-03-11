'use client';

import React, { useRef, useState } from 'react';
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

  const [hovered, setHovered] = useState(false);

  const inner = (
    <motion.div
      ref={ref}
      style={{ width, height, y }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative flex items-center justify-center rounded-xl cursor-pointer transition-colors',
        // light mode
        'bg-slate-100 border border-slate-200/80 shadow-sm',
        'hover:bg-slate-200',
        item.active && 'bg-indigo-50 border-indigo-200',
        // dark mode
        'dark:bg-white/[0.08] dark:border-white/[0.12] dark:hover:bg-white/[0.14]',
        item.active && 'dark:bg-white/[0.18] dark:border-white/[0.28]',
      )}
    >
      {item.active && (
        <span className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-indigo-500 dark:bg-white/70" />
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
      <div className="h-5 w-5 text-slate-600 dark:text-white/80">{item.icon}</div>
    </motion.div>
  );

  if (item.href) {
    return <Link href={item.href}>{inner}</Link>;
  }
  return <div onClick={item.onClick}>{inner}</div>;
}

export function FloatingDock({ items }: { items: DockItem[] }) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.nav
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        'fixed bottom-6 left-1/2 z-50 -translate-x-1/2',
        'flex items-end gap-2 rounded-2xl px-4 py-3',
        // light mode – visible white card with subtle border and shadow
        'bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-[0_8px_32px_rgba(0,0,0,0.12)]',
        // dark mode
        'dark:bg-black/30 dark:border-white/10 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]',
      )}
    >
      {items.map((item) => (
        <DockIcon key={item.title} item={item} mouseX={mouseX} magnify={true} />
      ))}
    </motion.nav>
  );
}
