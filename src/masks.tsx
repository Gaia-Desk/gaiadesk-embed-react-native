// Marking views as masked: `<GaiaDeskMasked>` (a View) or `useGaiaDeskMask()`
// (for your own View). Each marked view is measured with `measureInWindow`
// (layout units relative to the window: iOS points; Android dp, which the
// native module turns into window pixels) on layout, at `start`, and every
// half second while a session runs, and the running session's masks follow.

import React, { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent, ViewProps } from 'react-native';

import type { Rect } from './config.ts';
import { maskRegistry } from './maskRegistry.ts';
import { requestMaskRefresh } from './embed.ts';

/** Anything with `measureInWindow` (every host component instance). */
export interface Measurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}

/** A view's rect in the window, in layout units; null when it is not laid out. */
export function measureRect(node: Measurable | null): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!node) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      const ok = [x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v));
      resolve(ok ? { x, y, w: width, h: height } : null);
    });
  });
}

export interface GaiaDeskMask {
  /** Put on the View to mask (a callback ref). */
  ref: (node: Measurable | null) => void;
  /** Put on the same View's `onLayout`. */
  onLayout: () => void;
  /** Measure again now (after a change `onLayout` does not see). */
  refresh: () => void;
}

/**
 * Mask your own View: `const mask = useGaiaDeskMask();` then
 * `<View ref={mask.ref} onLayout={mask.onLayout} collapsable={false}>`.
 * The view is painted out of everything shared while it is mounted.
 */
export function useGaiaDeskMask(): GaiaDeskMask {
  const node = useRef<Measurable | null>(null);
  const id = useRef<number | null>(null);

  const refresh = useCallback(() => {
    const at = id.current;
    if (at === null) return;
    measureRect(node.current).then(
      (r) => maskRegistry.set(at, r),
      () => {},
    );
  }, []);

  useEffect(() => {
    id.current = maskRegistry.register(() => measureRect(node.current));
    refresh();
    return () => {
      if (id.current !== null) maskRegistry.unregister(id.current);
      id.current = null;
    };
  }, [refresh]);

  const ref = useCallback(
    (n: Measurable | null) => {
      node.current = n;
      if (n) refresh();
      else if (id.current !== null) maskRegistry.set(id.current, null);
    },
    [refresh],
  );

  return { ref, onLayout: refresh, refresh };
}

/**
 * A View painted out of everything shared with support (card numbers,
 * balances, passwords). Takes every View prop.
 */
export function GaiaDeskMasked(props: ViewProps): React.JSX.Element {
  const { ref, onLayout: measure } = useGaiaDeskMask();
  const { onLayout } = props;
  const layout = useCallback(
    (e: LayoutChangeEvent) => {
      measure();
      // A layout change here often moves other marked views too.
      requestMaskRefresh();
      onLayout?.(e);
    },
    [measure, onLayout],
  );
  return <View {...props} ref={ref} onLayout={layout} collapsable={false} />;
}

/** Measure every marked view again now (e.g. after a scroll). */
export function refreshMasks(): Promise<void> {
  return maskRegistry.refresh();
}
