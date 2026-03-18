'use client';

import { useRef, useCallback } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum ms between scroll calls to avoid layout thrashing */
const THROTTLE_MS = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAutoScrollReturn {
  /**
   * Call whenever `currentPointer` changes.
   * Scrolls the element with `data-token-index="${pointer}"` into view.
   */
  scrollToToken: (pointer: number) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Scrolls the active token into the vertical centre of its scroll container.
 *
 * Strategy:
 *  - Reads the DOM element via `data-token-index` attribute (no React state needed).
 *  - Uses `scrollIntoView({ behavior:'smooth', block:'center' })`.
 *  - Throttles to at most once per THROTTLE_MS to prevent layout thrashing.
 */
export function useAutoScroll(containerRef: React.RefObject<HTMLElement>): UseAutoScrollReturn {
  const lastScrollTimeRef  = useRef<number>(0);
  const lastPointerRef     = useRef<number>(-1);
  const rafRef             = useRef<number>(0);
  const targetTopRef       = useRef<number>(0);

  const scrollToToken = useCallback((pointer: number): void => {
    // Same pointer — nothing to do
    if (pointer === lastPointerRef.current) return;
    lastPointerRef.current = pointer;

    const now = performance.now();
    if (now - lastScrollTimeRef.current < THROTTLE_MS) return;
    lastScrollTimeRef.current = now;

    // Schedule inside rAF so we never force a synchronous layout read
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const el = container.querySelector<HTMLElement>(
        `[data-token-index="${pointer}"]`,
      );
      if (!el) return;

      const offsetWithinContainer = el.offsetTop - container.offsetTop;
      const centeredTop = Math.max(0, offsetWithinContainer - container.clientHeight * 0.45);
      targetTopRef.current = centeredTop;

      const currentTop = container.scrollTop;
      const delta = targetTopRef.current - currentTop;
      if (Math.abs(delta) < 2) return;

      container.scrollTo({
        top: currentTop + delta * 0.35,
        behavior: 'auto',
      });
    });
  }, [containerRef]);

  return { scrollToToken };
}
