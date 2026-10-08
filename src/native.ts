// The shape of the native module (the TurboModule spec in
// NativeGaiaDeskEmbed.ts, or the old architecture's NativeModules entry), and
// of the bridge the typed API talks through. No React Native import here:
// tests hand `useBridge` a fake.

/** The native module, as both architectures expose it. */
export interface NativeEmbedModule {
  /**
   * Start a session labelled `tag` (every event of it carries the tag).
   * Rejects with a code (`consent_required`, `bad_token`, `busy`, …).
   */
  start(tag: number, configJson: string, consentGranted: boolean): Promise<void>;
  /** End session `tag` (idempotent; `ended` follows as an event). */
  stop(tag: number): void;
  /** Replace session `tag`'s masks: flat `[x, y, w, h, …]` in layout units. */
  setMaskedRects(tag: number, rects: number[]): Promise<void>;
  /** Pause (or resume) guided input. */
  setPaused(tag: number, paused: boolean): void;
  /** The SDK's consent dialog: the user's answer. */
  requestConsent(company: string, guided: boolean, capture: string): Promise<boolean>;
  /** The native library's build info JSON. */
  buildInfo(): Promise<string>;
}

/** What the typed API needs of React Native. */
export interface Bridge {
  /** `Platform.OS`. */
  platform: string;
  /** The native module, or null when it is not linked into this app. */
  module: NativeEmbedModule | null;
  /** Listen to `GaiaDeskEmbedEvent` payloads. Returns an unsubscribe function. */
  subscribe(listener: (payload: unknown) => void): () => void;
}
