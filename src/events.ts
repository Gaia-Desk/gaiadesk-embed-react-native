// What the native SDK tells the app, as typed values. The native module
// forwards each GaiaDeskEmbed event as the library's own JSON (snake_case),
// tagged with the session it belongs to. `ended` is always the last event of
// a session, exactly once.

export type EmbedState = 'starting' | 'waiting' | 'connected' | 'ended';
export type SessionMode = 'view' | 'cobrowse';
export type EndReason = 'stopped' | 'app_stopped' | 'disconnected' | 'expired' | 'error';

export type EmbedEvent =
  /** The session's progress. */
  | { type: 'state'; state: EmbedState }
  /** The session is up: your customer reads `code` to the support agent. */
  | { type: 'code'; code: string; sessionId: string; mode: SessionMode }
  /** A support agent joined (their email, when known). */
  | { type: 'joined'; agent: string | null }
  /** The agent left. */
  | { type: 'left' }
  /** Guided input was paused (`false`) or allowed again (`true`). */
  | { type: 'control'; allowed: boolean }
  /**
   * An agent's guided-input request, and what became of it. `reason` is
   * null when applied; otherwise `view_only`, `control_paused`,
   * `rate_limited`, `not_focused`, `outside_app`, `masked`, `embed_ui`,
   * `unsupported`, `not_editable`, `nothing_there`, or (iOS) `hint_shown`:
   * the customer was shown a "Tap here" ring instead.
   */
  | { type: 'action'; action: string; applied: boolean; reason: string | null }
  /** Something went wrong; `ended` follows when it was fatal. */
  | { type: 'error'; code: string; message: string }
  /** The session is over. Always last, exactly once. */
  | { type: 'ended'; reason: EndReason };

/** The native module's event payload (`GaiaDeskEmbedEvent`). */
export interface NativeEventPayload {
  /** The session the event belongs to (what `start` resolved with). */
  tag: number;
  /** The event, as the library's JSON. */
  json: string;
}

/** The name the native module emits events under. */
export const EVENT_NAME = 'GaiaDeskEmbedEvent';

const STATES: readonly string[] = ['starting', 'waiting', 'connected', 'ended'];
const MODES: readonly string[] = ['view', 'cobrowse'];
const REASONS: readonly string[] = ['stopped', 'app_stopped', 'disconnected', 'expired', 'error'];

const str = (v: unknown): v is string => typeof v === 'string';
const optStr = (v: unknown): string | null | undefined => (v === undefined || v === null ? null : str(v) ? v : undefined);

/**
 * One event's JSON → an EmbedEvent, or null for a type (or value) this
 * version does not know, or a malformed event. `ended` is never lost: an
 * unknown reason reads as `"error"`.
 */
export function parseEvent(json: string): EmbedEvent | null {
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const e = o as Record<string, unknown>;
  switch (e.type) {
    case 'state':
      return str(e.state) && STATES.includes(e.state) ? { type: 'state', state: e.state as EmbedState } : null;
    case 'code':
      if (!str(e.code) || !str(e.session_id) || !str(e.mode) || !MODES.includes(e.mode)) return null;
      return { type: 'code', code: e.code, sessionId: e.session_id, mode: e.mode as SessionMode };
    case 'joined': {
      const agent = optStr(e.agent);
      return agent === undefined ? null : { type: 'joined', agent };
    }
    case 'left':
      return { type: 'left' };
    case 'control':
      return typeof e.allowed === 'boolean' ? { type: 'control', allowed: e.allowed } : null;
    case 'action': {
      const reason = optStr(e.reason);
      if (!str(e.action) || typeof e.applied !== 'boolean' || reason === undefined) return null;
      return { type: 'action', action: e.action, applied: e.applied, reason };
    }
    case 'error':
      return str(e.code) && str(e.message) ? { type: 'error', code: e.code, message: e.message } : null;
    case 'ended':
      return { type: 'ended', reason: str(e.reason) && REASONS.includes(e.reason) ? (e.reason as EndReason) : 'error' };
    default:
      return null;
  }
}

/** A native payload → its session tag and event, or null when malformed. */
export function parsePayload(payload: unknown): { tag: number; event: EmbedEvent } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.tag !== 'number' || !Number.isFinite(p.tag) || !str(p.json)) return null;
  const event = parseEvent(p.json);
  return event ? { tag: p.tag, event } : null;
}
