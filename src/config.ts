// EmbedOptions → the config the native module takes. Pure. The native
// library checks every value again (and refuses with a code); this catches
// what only makes sense per platform, and spells it right.

import { EmbedError } from './errors.ts';

/** A rect in React Native layout units (points on iOS, dp on Android), relative to the app's window. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What is shared. `"screen"` is Android only (MediaProjection, opt-in). */
export type Capture = 'app' | 'screen';

/** How iOS captures the app (iOS only). */
export type CaptureMethod = 'replayKit' | 'snapshot';

/** The platforms the native SDKs exist for. */
export type MobilePlatform = 'ios' | 'android';

export interface EmbedOptions {
  /** `gdemb_…`, from your backend (`POST /v1/support/sessions`). */
  embedToken: string;
  /** Shown on the consent dialog and the indicator ("Sharing with Acme"). */
  company: string;
  /** The GaiaDesk server. Default `https://gaiadesk.net`. */
  server?: string;
  /** Allow guided input (the session must be "cobrowse" too). Default false. */
  guided?: boolean;
  /** Frames per second, 1 to 30. Default 15. */
  fps?: number;
  /**
   * Regions painted out from the very first frame, in layout units relative
   * to the window (what `measureInWindow` gives). Views wrapped in
   * `<GaiaDeskMasked>` are added for you.
   */
  masks?: readonly Rect[];
  /**
   * `"app"` (default): this app only. `"screen"`: the whole screen, Android
   * only, through MediaProjection (Android asks the user too; see README).
   */
  capture?: Capture;
  /**
   * iOS only. `"replayKit"` (default): ReplayKit in-app capture, exactly what
   * the app shows; iOS asks once. `"snapshot"`: a snapshot of the app's
   * windows, no system prompt (use it in the Simulator).
   */
  captureMethod?: CaptureMethod;
}

/** Your user's answer to a consent dialog. */
export interface Consent {
  consentGranted: boolean;
}

/** What `GaiaDeskEmbed.requestConsent` takes besides the company. */
export interface ConsentOptions {
  guided?: boolean;
  capture?: Capture;
}

const bad = (message: string): EmbedError => new EmbedError('bad_config', message);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The rects, checked (finite, non-negative size) and copied. @throws EmbedError `bad_rects`. */
export function checkRects(rects: readonly Rect[]): Rect[] {
  if (!Array.isArray(rects)) throw new EmbedError('bad_rects', 'masks must be an array of { x, y, w, h }');
  return rects.map((r, i) => {
    if (typeof r !== 'object' || r === null || !finite(r.x) || !finite(r.y) || !finite(r.w) || !finite(r.h) || r.w < 0 || r.h < 0) {
      throw new EmbedError('bad_rects', `mask ${i} is not a { x, y, w, h } rect with finite numbers and a non-negative size`);
    }
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  });
}

/** `capture` for this platform. @throws EmbedError `bad_config`. */
export function checkCapture(capture: unknown, platform: MobilePlatform): Capture {
  if (capture === undefined) return 'app';
  if (capture !== 'app' && capture !== 'screen') throw bad(`capture must be "app" or "screen", not ${JSON.stringify(capture)}`);
  if (capture === 'screen' && platform === 'ios') {
    throw bad('capture "screen" is Android only: on iOS the embed shares this app only');
  }
  return capture;
}

/** The platform as the native SDKs know it. @throws EmbedError `unsupported_platform`. */
export function mobilePlatform(os: string): MobilePlatform {
  if (os === 'ios' || os === 'android') return os;
  throw new EmbedError('unsupported_platform', `GaiaDesk embed for React Native runs on iOS and Android, not ${os}`);
}

/**
 * The config JSON the native module takes: snake_case keys; `guided`
 * always present; `server`, `fps`, `masks` only when set; `capture` on
 * Android, `capture_method` on iOS. `extraMasks` (from `<GaiaDeskMasked>`)
 * are added to `options.masks`.
 *
 * @throws EmbedError `bad_config` or `bad_rects`.
 */
export function nativeConfig(options: EmbedOptions, platform: MobilePlatform, extraMasks: readonly Rect[] = []): string {
  if (typeof options !== 'object' || options === null) throw bad('options must be an object');
  if (typeof options.embedToken !== 'string') throw bad('embedToken must be a string (gdemb_…, from your backend)');
  if (typeof options.company !== 'string' || options.company.trim() === '') throw bad('company must be a non-empty string');
  if (options.server !== undefined && typeof options.server !== 'string') throw bad('server must be a string URL');
  if (options.guided !== undefined && typeof options.guided !== 'boolean') throw bad('guided must be a boolean');
  if (options.fps !== undefined && (!Number.isInteger(options.fps) || options.fps < 1 || options.fps > 30)) {
    throw bad('fps must be an integer from 1 to 30');
  }
  const capture = checkCapture(options.capture, platform);
  const o: Record<string, unknown> = {
    embed_token: options.embedToken,
    company: options.company,
    guided: options.guided === true,
  };
  if (options.server !== undefined) o.server = options.server;
  if (options.fps !== undefined) o.fps = options.fps;
  if (platform === 'android') {
    if (options.captureMethod !== undefined) throw bad('captureMethod is iOS only');
    o.capture = capture;
  } else {
    const m = options.captureMethod;
    if (m !== undefined && m !== 'replayKit' && m !== 'snapshot') {
      throw bad(`captureMethod must be "replayKit" or "snapshot", not ${JSON.stringify(m)}`);
    }
    o.capture_method = m ?? 'replayKit';
  }
  const masks = [...checkRects(options.masks ?? []), ...checkRects(extraMasks)];
  if (masks.length > 0) o.masks = masks;
  return JSON.stringify(o);
}

/** Rects → the flat `[x, y, w, h, …]` array the native module takes. */
export function flattenRects(rects: readonly Rect[]): number[] {
  const out: number[] = [];
  for (const r of rects) out.push(r.x, r.y, r.w, r.h);
  return out;
}
