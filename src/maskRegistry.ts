// The views marked masked (`<GaiaDeskMasked>`, `useGaiaDeskMask`): each one's
// last measured rect, in layout units relative to the window. Pure (no React
// Native import), so it is tested in Node. The running session listens and
// re-sends its masks whenever a rect changes.

import type { Rect } from './config.ts';

/**
 * Covers the whole window, whatever its size: what is masked while a marked
 * view has not been measured yet (the library clips it to the picture).
 */
export const EVERYTHING: Readonly<Rect> = Object.freeze({ x: -100000, y: -100000, w: 300000, h: 300000 });

/** Measures one view: its rect in the window, or null when it is not on screen. */
export type Measure = () => Promise<Rect | null>;

const same = (a: Rect | undefined, b: Rect | null): boolean =>
  a === undefined ? b === null : b !== null && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export class MaskRegistry {
  private readonly rectsById = new Map<number, Rect>();
  private readonly measurers = new Map<number, Measure>();
  /** Views that have had an answer (a rect, or null: not on screen). */
  private readonly measured = new Set<number>();
  private readonly listeners = new Set<() => void>();
  private nextId = 1;

  /** Add a view; returns its id. Its rect counts once `set` (or `refresh`) gives one. */
  register(measure: Measure): number {
    const id = this.nextId++;
    this.measurers.set(id, measure);
    return id;
  }

  /** Remove a view (it unmounted): its rect stops being masked. */
  unregister(id: number): void {
    this.measurers.delete(id);
    const wasUnmeasured = !this.measured.delete(id);
    if (this.rectsById.delete(id) || wasUnmeasured) this.notify();
  }

  /** A view's new rect (null: not on screen). Ignored for an unregistered id. */
  set(id: number, rect: Rect | null): void {
    if (!this.measurers.has(id)) return;
    const valid = rect !== null && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w >= 0 && rect.h >= 0;
    const next = valid ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null;
    // An invalid measurement is no answer: the view stays unmeasured (masked
    // as everything) until a real one comes.
    if (rect !== null && !valid && !this.measured.has(id)) return;
    const first = !this.measured.has(id);
    this.measured.add(id);
    if (!first && same(this.rectsById.get(id), next)) return;
    if (next) this.rectsById.set(id, next);
    else this.rectsById.delete(id);
    this.notify();
  }

  /** Every masked view's rect. */
  all(): Rect[] {
    return [...this.rectsById.values()];
  }

  /** Whether a registered view has not been measured yet. */
  get hasUnmeasured(): boolean {
    for (const id of this.measurers.keys()) if (!this.measured.has(id)) return true;
    return false;
  }

  /**
   * What to mask for the marked views: their rects, or the whole window
   * while any of them has not been measured yet (fail closed: a view that
   * is about to appear is never shown unmasked).
   */
  masks(): Rect[] {
    return this.hasUnmeasured ? [{ ...EVERYTHING }, ...this.all()] : this.all();
  }

  /** How many views are registered (measured or not). */
  get size(): number {
    return this.measurers.size;
  }

  /**
   * Measure every registered view again (a scroll or an ancestor's layout
   * change moves views without telling them). A measurement that fails or
   * does not answer within `timeoutMs` keeps the view's last rect.
   */
  async refresh(timeoutMs = 250): Promise<void> {
    const entries = [...this.measurers.entries()];
    await Promise.all(
      entries.map(async ([id, measure]) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<'late'>((resolve) => {
          timer = setTimeout(() => resolve('late'), timeoutMs);
        });
        try {
          const r = await Promise.race([measure(), late]);
          if (r !== 'late') this.set(id, r);
        } catch {
          // keep the last rect
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      }),
    );
  }

  /** Listen to changes. Returns a function that stops listening. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of [...this.listeners]) l();
  }
}

/** The app's registry: what `<GaiaDeskMasked>` and `useGaiaDeskMask` fill. */
export const maskRegistry = new MaskRegistry();
