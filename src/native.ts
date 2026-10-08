// The shape of the native module (the TurboModule spec in
// NativeGaiaDeskEmbed.ts, or the old architecture's NativeModules entry), and
// of the bridge the typed API talks through. No React Native import here:
// tests hand `useBridge` a fake.

/** The native module, as both architectures expose it. */
export interface NativeEmbedModule {
  /**
   * Start a session labelled `tag` (every event of it carries the tag). The
   * consent is the config's `consent_token` (refused without it).
   * Rejects with a code (`consent_required`, `bad_token`, `busy`, …).
   */
  start(tag: number, configJson: string): Promise<void>;
  /** End session `tag` (idempotent; `ended` follows as an event). */
  stop(tag: number): void;
  /** Replace session `tag`'s masks: flat `[x, y, w, h, …]` in layout units. */
  setMaskedRects(tag: number, rects: number[]): Promise<void>;
  /** Pause (or resume) guided input. */
  setPaused(tag: number, paused: boolean): void;
  /**
   * The SDK's consent dialog: on YES, the library's consent token for
   * `start` (in the config's `consent_token`); `""` when declined.
   */
  requestConsent(company: string, guided: boolean, capture: string): Promise<string>;
  /** The app's own dialog said YES: the library's consent token. */
  recordConsent(company: string, guided: boolean, capture: string): Promise<string>;
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
