// The TurboModule spec (React Native's codegen reads this file: keep it to
// the types codegen understands). Generates `NativeGaiaDeskEmbedSpec` (Java,
// net.gaiadesk.reactnative) and `<RNGaiaDeskEmbedSpec/RNGaiaDeskEmbedSpec.h>`
// (iOS). The old architecture finds the same methods in NativeModules.

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  start(tag: number, configJson: string): Promise<void>;
  stop(tag: number): void;
  setMaskedRects(tag: number, rects: Array<number>): Promise<void>;
  setPaused(tag: number, paused: boolean): void;
  requestConsent(company: string, guided: boolean, capture: string): Promise<string>;
  recordConsent(company: string, guided: boolean, capture: string): Promise<string>;
  buildInfo(): Promise<string>;

  // NativeEventEmitter's contract (events: `GaiaDeskEmbedEvent`).
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('GaiaDeskEmbed');
