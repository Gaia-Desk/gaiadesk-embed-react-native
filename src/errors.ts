/**
 * A refusal, from the native library or from this layer. `code` is stable
 * and meant for your code (`consent_required`, `bad_token`, `bad_server`,
 * `bad_config`, `bad_rects`, `busy`, `no_activity`, `not_linked`, …);
 * `message` is for people.
 */
export class EmbedError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EmbedError';
    this.code = code;
  }

  /**
   * A native promise rejection (React Native puts the reject code in
   * `.code`), an `"<code>: <message>"` string, or anything else, as an
   * EmbedError.
   */
  static from(e: unknown): EmbedError {
    if (e instanceof EmbedError) return e;
    if (typeof e === 'object' && e !== null) {
      const o = e as { code?: unknown; message?: unknown };
      if (typeof o.code === 'string' && /^[a-z][a-z0-9_]*$/.test(o.code)) {
        return new EmbedError(o.code, typeof o.message === 'string' ? o.message : '');
      }
    }
    const text = e instanceof Error ? e.message : String(e);
    const m = /^([a-z][a-z0-9_]*): ([\s\S]*)$/.exec(text);
    return m ? new EmbedError(m[1], m[2]) : new EmbedError('unknown', text);
  }
}
