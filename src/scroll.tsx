// Scroll containers that tell the marked views inside them they moved: each
// scroll event re-measures them at once (masks already follow every
// animation frame while a session runs; this makes the follow immediate and
// works without requestAnimationFrame too).

import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { ScrollView } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps } from 'react-native';

import { requestMaskRefresh } from './embed.ts';

type ScrollListener = () => void;

/** What a scroll container offers the marked views inside it. */
export interface MaskScrollChannel {
  subscribe(listener: ScrollListener): () => void;
}

/** @internal The nearest GaiaDesk scroll container, if any. */
export const MaskScrollContext = createContext<MaskScrollChannel | null>(null);

/** @internal A marked view listens to the scroll container around it. */
export function useMaskScroll(listener: ScrollListener): void {
  const channel = useContext(MaskScrollContext);
  useEffect(() => channel?.subscribe(listener), [channel, listener]);
}

type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

/**
 * For your own scroll container (a FlatList, SectionList, …): spread the
 * result's `props` on it and wrap its content's marked views in
 * `<result.Provider>`; or use `<GaiaDeskScrollView>`.
 */
export function useGaiaDeskScroll(onScroll?: ScrollHandler): {
  props: { onScroll: ScrollHandler; scrollEventThrottle: number };
  channel: MaskScrollChannel;
} {
  const listeners = useRef(new Set<ScrollListener>());
  const channel = useMemo<MaskScrollChannel>(
    () => ({
      subscribe(l) {
        listeners.current.add(l);
        return () => {
          listeners.current.delete(l);
        };
      },
    }),
    [],
  );
  const handler = useCallback<ScrollHandler>(
    (e) => {
      for (const l of [...listeners.current]) l();
      requestMaskRefresh();
      onScroll?.(e);
    },
    [onScroll],
  );
  return { props: { onScroll: handler, scrollEventThrottle: 16 }, channel };
}

/** A ScrollView whose marked views (`<GaiaDeskMasked>`) follow its scroll at once. */
export const GaiaDeskScrollView = forwardRef<ScrollView, ScrollViewProps>(function GaiaDeskScrollView(props, ref) {
  const { props: scrollProps, channel } = useGaiaDeskScroll(props.onScroll);
  return (
    <MaskScrollContext.Provider value={channel}>
      <ScrollView {...props} ref={ref} onScroll={scrollProps.onScroll} scrollEventThrottle={props.scrollEventThrottle ?? scrollProps.scrollEventThrottle} />
    </MaskScrollContext.Provider>
  );
});
