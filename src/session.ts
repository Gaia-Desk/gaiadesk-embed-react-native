// One support session, as the app holds it. Events reach it through the
// facade's dispatcher (by tag); masks come from `setMaskedRects` plus the
// views marked `<GaiaDeskMasked>`.

import { checkRects, flattenRects } from './config.ts';
import type { Rect } from './config.ts';
import { EmbedError } from './errors.ts';
import type { EmbedEvent, EndReason } from './events.ts';
import type { MaskRegistry } from './maskRegistry.ts';
import type { NativeEmbedModule } from './native.ts';

export type EmbedListener = (event: EmbedEvent) => void;

export class EmbedSession {
  /** Resolves with the reason once the session is over (exactly once). */
  readonly ended: Promise<EndReason>;
  /** This session's label in the native module's events. */
  readonly tag: number;

  private native: NativeEmbedModule | null;
  private readonly listeners = new Set<EmbedListener>();
  private readonly registry: MaskRegistry;
  private appRects: Rect[];
  private finished = false;
  private resolveEnded!: (reason: EndReason) => void;
  private unsubscribeMasks: (() => void) | null = null;
  private lastSessionId: string | null = null;

  /** @internal Made by `GaiaDeskEmbed.start`. */
  constructor(tag: number, native: NativeEmbedModule, registry: MaskRegistry, appRects: readonly Rect[]) {
    this.tag = tag;
    this.native = native;
    this.registry = registry;
    this.appRects = [...appRects];
    this.ended = new Promise((resolve) => {
      this.resolveEnded = resolve;
    });
    this.unsubscribeMasks = registry.subscribe(() => {
      this.pushMasks().catch(() => {
        // measured rects are always valid; a session that just ended refuses quietly
      });
    });
  }

  /** Whether the session is over. */
  get isEnded(): boolean {
    return this.finished;
  }

  /** The session's id once the `code` event has arrived. */
  get sessionId(): string | null {
    return this.lastSessionId;
  }

  /** Listen to events. Returns a function that stops listening. */
  on(listener: EmbedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** End the session. Safe to call more than once; `ended` follows (`app_stopped`). */
  stop(): void {
    const n = this.native;
    this.native = null;
    n?.stop(this.tag);
  }

  /**
   * Mask these rects: layout units relative to the window (what
   * `measureInWindow` gives). Replaces any earlier set; `[]` clears. Views
   * marked `<GaiaDeskMasked>` stay masked on top. Does nothing once ended.
   *
   * @throws EmbedError `bad_rects`.
   */
  async setMaskedRects(rects: readonly Rect[]): Promise<void> {
    const checked = checkRects(rects);
    if (!this.native) return;
    this.appRects = checked;
    await this.pushMasks();
  }

  /**
   * Pause (or resume) guided input. A pause your customer chose on the
   * indicator is theirs: the native SDK ignores `setPaused(false)` until they
   * lift it.
   */
  setPaused(paused: boolean): void {
    this.native?.setPaused(this.tag, paused === true);
  }

  /** The rects sent to the library: the app's plus the marked views'. */
  currentMasks(): Rect[] {
    return [...this.appRects, ...this.registry.masks()];
  }

  private async pushMasks(): Promise<void> {
    const n = this.native;
    if (!n) return;
    try {
      await n.setMaskedRects(this.tag, flattenRects(this.currentMasks()));
    } catch (e) {
      throw EmbedError.from(e);
    }
  }

  /** @internal The dispatcher's entry: one parsed event of this session. */
  dispatch(event: EmbedEvent): void {
    if (this.finished) return;
    if (event.type === 'code') this.lastSessionId = event.sessionId;
    if (event.type === 'ended') {
      this.finished = true;
      this.native = null;
      this.unsubscribeMasks?.();
      this.unsubscribeMasks = null;
      this.resolveEnded(event.reason);
    }
    let failure: unknown;
    let failed = false;
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (e) {
        if (!failed) {
          failed = true;
          failure = e;
        }
      }
    }
    if (event.type === 'ended') this.listeners.clear();
    // Every listener ran; a throwing one surfaces like any uncaught error.
    if (failed) throw failure;
  }

  /** @internal The start was refused: the session never ran. */
  abandon(): void {
    this.finished = true;
    this.native = null;
    this.unsubscribeMasks?.();
    this.unsubscribeMasks = null;
    this.listeners.clear();
  }
}
