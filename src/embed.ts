// The typed API over the native module. No React Native import here: the
// bridge (bridge.ts) is set by index.ts, and tests set a fake one.

import { checkCapture, checkRects, mobilePlatform, nativeConfig } from './config.ts';
import type { Capture, Consent, ConsentOptions, EmbedOptions } from './config.ts';
import { EmbedError } from './errors.ts';
import { parsePayload } from './events.ts';
import { maskRegistry } from './maskRegistry.ts';
import type { Bridge, NativeEmbedModule } from './native.ts';
import { EmbedSession } from './session.ts';
import type { EmbedListener } from './session.ts';

/** What the bundled native library is. */
export interface BuildInfo {
  version: string;
  /** True only for GaiaDesk's own test builds (a synthetic picture). */
  testSource: boolean;
  codec: string;
  os: string;
  arch: string;
}

/** The library's token behind each Consent this module handed out (and only those). */
const consentTokens = new WeakMap<Consent, string>();

function issue(token: string, company: string, guided: boolean, capture: Capture): Consent {
  const c: Consent = Object.freeze({ consentGranted: true as const, company, guided, capture });
  consentTokens.set(c, token);
  return c;
}

let bridgeProvider: (() => Bridge) | null = null;
let bridge: Bridge | null = null;
let unsubscribe: (() => void) | null = null;
const sessions = new Map<number, EmbedSession>();
let nextTag = 1;
let latest: EmbedSession | null = null;
let poll: ReturnType<typeof setInterval> | null = null;

/** How often marked views are measured again while a session runs (scrolls move them silently). */
export const MASK_REFRESH_MS = 500;

function pollMasks(): void {
  if (poll) return;
  poll = setInterval(() => {
    if (sessions.size === 0) stopPolling();
    else requestMaskRefresh();
  }, MASK_REFRESH_MS);
}

let refreshing = false;
let again = false;

/**
 * Measure the marked views again as soon as possible: on a scroll, a layout
 * change, the keyboard, a rotation (and on the poll, which catches the
 * rest). Coalesced: one measurement in flight, at most one more queued.
 * Nothing to do when no session runs.
 */
export function requestMaskRefresh(): void {
  if (sessions.size === 0 || maskRegistry.size === 0) return;
  if (refreshing) {
    again = true;
    return;
  }
  refreshing = true;
  void maskRegistry.refresh().finally(() => {
    refreshing = false;
    if (again) {
      again = false;
      requestMaskRefresh();
    }
  });
}

/**
 * An `onScroll` for your ScrollView / FlatList: the masks inside it follow
 * the scroll at once. Calls your own handler too.
 */
export function maskedOnScroll<E>(handler?: (event: E) => void): (event: E) => void {
  return (event: E) => {
    requestMaskRefresh();
    handler?.(event);
  };
}

function stopPolling(): void {
  if (poll) clearInterval(poll);
  poll = null;
}

/** Set how the bridge is made (index.ts: React Native's). */
export function setBridgeProvider(provider: () => Bridge): void {
  bridgeProvider = provider;
}

/**
 * Use this bridge instead of React Native's (tests, or a custom host).
 * `null` forgets it, so the next call makes the real one.
 */
export function useBridge(b: Bridge | null): void {
  unsubscribe?.();
  unsubscribe = null;
  bridge = b;
  sessions.clear();
  latest = null;
  stopPolling();
}

function currentBridge(): Bridge {
  if (!bridge) {
    if (!bridgeProvider) throw new EmbedError('not_linked', 'no React Native bridge (import @gaiadesk/embed-react-native, not a deep path)');
    bridge = bridgeProvider();
  }
  return bridge;
}

function linked(b: Bridge): NativeEmbedModule {
  if (!b.module) {
    throw new EmbedError(
      'not_linked',
      "the GaiaDeskEmbed native module is not linked: run `pod install` (iOS) or rebuild the app (Android), and don't use Expo Go",
    );
  }
  return b.module;
}

function listen(b: Bridge): void {
  if (unsubscribe) return;
  unsubscribe = b.subscribe((payload) => {
    const p = parsePayload(payload);
    if (!p) return;
    const session = sessions.get(p.tag);
    if (!session) return;
    if (p.event.type === 'ended') {
      sessions.delete(p.tag);
      if (latest === session) latest = null;
      if (sessions.size === 0) stopPolling();
    }
    session.dispatch(p.event);
  });
}

export class GaiaDeskEmbed {
  private constructor() {}

  /**
   * Start sharing this app's screen. `consent.consentGranted` must be your
   * user's answer to a consent dialog (`requestConsent`, or your own): this
   * layer and the native library both refuse without it. Views wrapped in
   * `<GaiaDeskMasked>` are measured and masked from the first frame. Events
   * arrive on the JS thread, in order.
   *
   * @throws EmbedError when refused (`consent_required`, `bad_config`,
   *   `bad_token`, `busy`, `no_activity`, `not_linked`, …).
   */
  static async start(options: EmbedOptions, consent: Consent, onEvent?: EmbedListener): Promise<EmbedSession> {
    const token = typeof consent === 'object' && consent !== null ? consentTokens.get(consent) : undefined;
    if (token === undefined) {
      throw new EmbedError('consent_required', "the user's consent is required: pass what requestConsent (or recordConsent, after your own dialog) returned");
    }
    if (options?.company !== consent.company) {
      throw new EmbedError('consent_required', `the user agreed to share with ${JSON.stringify(consent.company)}, not ${JSON.stringify(options?.company)}`);
    }
    if (options.guided === true && !consent.guided) {
      throw new EmbedError('consent_required', 'the user was not asked about guiding: ask again with { guided: true }');
    }
    const b = currentBridge();
    const platform = mobilePlatform(b.platform);
    // Checked before anything is measured, so a bad option fails fast.
    nativeConfig(options, platform);
    const module = linked(b);
    await maskRegistry.refresh();
    const json = nativeConfig(options, platform, maskRegistry.masks(), token);
    listen(b);
    const tag = nextTag++;
    const session = new EmbedSession(tag, module, maskRegistry, checkRects(options.masks ?? []));
    if (onEvent) session.on(onEvent);
    sessions.set(tag, session);
    try {
      await module.start(tag, json);
    } catch (e) {
      sessions.delete(tag);
      session.abandon();
      throw EmbedError.from(e);
    }
    if (!session.isEnded) {
      latest = session;
      pollMasks();
    }
    return session;
  }

  /**
   * The native SDK's consent dialog. Resolves with your user's YES (a
   * `Consent` for `start`), or null when they declined. `capture: "screen"`
   * (Android only) words it for the whole screen.
   *
   * @throws EmbedError `bad_config` (`"screen"` on iOS), `no_activity`.
   */
  static async requestConsent(company: string, options: ConsentOptions = {}): Promise<Consent | null> {
    const b = currentBridge();
    const platform = mobilePlatform(b.platform);
    if (typeof company !== 'string' || company.trim() === '') throw new EmbedError('bad_config', 'company must be a non-empty string');
    const capture = checkCapture(options.capture, platform);
    const guided = options.guided === true;
    let token: unknown;
    try {
      token = await linked(b).requestConsent(company, guided, capture);
    } catch (e) {
      throw EmbedError.from(e);
    }
    return typeof token === 'string' && token !== '' ? issue(token, company, guided, capture) : null;
  }

  /**
   * Your own consent dialog said YES: call this right then, with what it
   * asked (the company named, whether it said the agent may guide, and
   * `capture`). Never call it without asking.
   *
   * @throws EmbedError `bad_config`.
   */
  static async recordConsent(company: string, options: ConsentOptions = {}): Promise<Consent> {
    const b = currentBridge();
    const platform = mobilePlatform(b.platform);
    if (typeof company !== 'string' || company.trim() === '') throw new EmbedError('bad_config', 'company must be a non-empty string');
    const capture = checkCapture(options.capture, platform);
    const guided = options.guided === true;
    let token: unknown;
    try {
      token = await linked(b).recordConsent(company, guided, capture);
    } catch (e) {
      throw EmbedError.from(e);
    }
    if (typeof token !== 'string' || token === '') throw new EmbedError('consent_required', 'the native library did not record the consent');
    return issue(token, company, guided, capture);
  }

  /** What the bundled native library is. */
  static async buildInfo(): Promise<BuildInfo> {
    const raw = await GaiaDeskEmbed.buildInfoJson();
    let o: Record<string, unknown> = {};
    try {
      const v: unknown = JSON.parse(raw);
      if (typeof v === 'object' && v !== null) o = v as Record<string, unknown>;
    } catch {
      // reported as empty fields
    }
    const s = (v: unknown): string => (typeof v === 'string' ? v : '');
    return { version: s(o.version), testSource: o.test_source === true, codec: s(o.codec), os: s(o.os), arch: s(o.arch) };
  }

  /** The native library's build info exactly as it reports it (JSON). */
  static async buildInfoJson(): Promise<string> {
    const b = currentBridge();
    mobilePlatform(b.platform);
    try {
      return await linked(b).buildInfo();
    } catch (e) {
      throw EmbedError.from(e);
    }
  }

  /** The session running in this app (the last one started that has not ended), if any. */
  static get current(): EmbedSession | null {
    return latest;
  }
}
