// React Native's side of the bridge: the TurboModule under the new
// architecture, NativeModules.GaiaDeskEmbed under the old one; events through
// NativeEventEmitter (`GaiaDeskEmbedEvent`).

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import NativeGaiaDeskEmbed from './NativeGaiaDeskEmbed.ts';
import type { Spec } from './NativeGaiaDeskEmbed.ts';
import { EVENT_NAME } from './events.ts';
import type { Bridge, NativeEmbedModule } from './native.ts';

function findModule(): Spec | null {
  if (NativeGaiaDeskEmbed) return NativeGaiaDeskEmbed;
  const legacy = (NativeModules as Record<string, unknown>).GaiaDeskEmbed;
  return legacy ? (legacy as Spec) : null;
}

/** The bridge to the native module linked into this app. */
export function reactNativeBridge(): Bridge {
  const spec = findModule();
  const module: NativeEmbedModule | null = spec
    ? {
        start: (tag, json) => spec.start(tag, json),
        stop: (tag) => spec.stop(tag),
        setMaskedRects: (tag, rects) => spec.setMaskedRects(tag, rects),
        setPaused: (tag, paused) => spec.setPaused(tag, paused),
        setSecretFocus: (secret) => spec.setSecretFocus(secret),
        requestConsent: (company, guided, capture) => spec.requestConsent(company, guided, capture),
        recordConsent: (company, guided, capture) => spec.recordConsent(company, guided, capture),
        buildInfo: () => spec.buildInfo(),
      }
    : null;
  return {
    platform: Platform.OS,
    module,
    subscribe(listener) {
      if (!spec) return () => {};
      // iOS's emitter needs the module (addListener/removeListeners); Android's does not.
      const emitter = new NativeEventEmitter(Platform.OS === 'ios' ? spec : undefined);
      const sub = emitter.addListener(EVENT_NAME, listener);
      return () => sub.remove();
    },
  };
}
