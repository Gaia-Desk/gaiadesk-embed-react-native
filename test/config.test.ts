import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkRects, flattenRects, mobilePlatform, nativeConfig } from '../src/config.ts';
import { EmbedError } from '../src/errors.ts';

const base = { embedToken: 'gdemb_x', company: 'Acme' };
const json = (s: string): Record<string, unknown> => JSON.parse(s) as Record<string, unknown>;

function refuses(f: () => unknown, code: string, match?: RegExp): void {
  assert.throws(f, (e: unknown) => {
    assert.ok(e instanceof EmbedError, `not an EmbedError: ${String(e)}`);
    assert.equal(e.code, code);
    if (match) assert.match(e.message, match);
    return true;
  });
}

test('iOS: defaults, capture_method, no capture key', () => {
  assert.deepEqual(json(nativeConfig(base, 'ios')), { embed_token: 'gdemb_x', company: 'Acme', guided: false, capture_method: 'replayKit' });
  const o = json(nativeConfig({ ...base, captureMethod: 'snapshot', capture: 'app', guided: true, fps: 10, server: 'http://127.0.0.1:9000' }, 'ios'));
  assert.deepEqual(o, { embed_token: 'gdemb_x', company: 'Acme', guided: true, server: 'http://127.0.0.1:9000', fps: 10, capture_method: 'snapshot' });
});

test('Android: capture app by default, screen when asked, no capture_method key', () => {
  assert.deepEqual(json(nativeConfig(base, 'android')), { embed_token: 'gdemb_x', company: 'Acme', guided: false, capture: 'app' });
  assert.equal(json(nativeConfig({ ...base, capture: 'screen' }, 'android')).capture, 'screen');
});

test('per-platform options are refused on the other platform', () => {
  refuses(() => nativeConfig({ ...base, capture: 'screen' }, 'ios'), 'bad_config', /Android only/);
  refuses(() => nativeConfig({ ...base, captureMethod: 'snapshot' }, 'android'), 'bad_config', /iOS only/);
  refuses(() => nativeConfig({ ...base, capture: 'window' as never }, 'android'), 'bad_config');
  refuses(() => nativeConfig({ ...base, captureMethod: 'airplay' as never }, 'ios'), 'bad_config');
});

test('bad values are refused before the native side sees them', () => {
  refuses(() => nativeConfig({ ...base, company: ' ' }, 'ios'), 'bad_config');
  refuses(() => nativeConfig({ ...base, embedToken: 5 as never }, 'ios'), 'bad_config');
  refuses(() => nativeConfig({ ...base, fps: 0 }, 'ios'), 'bad_config');
  refuses(() => nativeConfig({ ...base, fps: 31 }, 'android'), 'bad_config');
  refuses(() => nativeConfig({ ...base, fps: 2.5 }, 'android'), 'bad_config');
  refuses(() => nativeConfig({ ...base, guided: 'yes' as never }, 'android'), 'bad_config');
  refuses(() => nativeConfig({ ...base, server: 1 as never }, 'android'), 'bad_config');
  refuses(() => nativeConfig(null as never, 'android'), 'bad_config');
});

test('masks: start masks plus marked views, in layout units, checked', () => {
  const o = json(nativeConfig({ ...base, masks: [{ x: 1, y: 2, w: 3, h: 4 }] }, 'android', [{ x: 5, y: 6, w: 7, h: 8 }]));
  assert.deepEqual(o.masks, [
    { x: 1, y: 2, w: 3, h: 4 },
    { x: 5, y: 6, w: 7, h: 8 },
  ]);
  assert.equal(json(nativeConfig({ ...base, masks: [] }, 'ios')).masks, undefined);
  refuses(() => nativeConfig({ ...base, masks: [{ x: 1, y: 2, w: -3, h: 4 }] }, 'ios'), 'bad_rects');
  refuses(() => nativeConfig({ ...base, masks: [{ x: Number.NaN, y: 2, w: 3, h: 4 }] }, 'ios'), 'bad_rects');
  refuses(() => checkRects('nope' as never), 'bad_rects');
  // extra fields are dropped
  assert.deepEqual(checkRects([{ x: 1, y: 2, w: 3, h: 4, z: 9 } as never]), [{ x: 1, y: 2, w: 3, h: 4 }]);
});

test('flattenRects and platforms', () => {
  assert.deepEqual(
    flattenRects([
      { x: 1, y: 2, w: 3, h: 4 },
      { x: 5, y: 6, w: 7, h: 8 },
    ]),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(mobilePlatform('ios'), 'ios');
  assert.equal(mobilePlatform('android'), 'android');
  refuses(() => mobilePlatform('web'), 'unsupported_platform');
});

test('EmbedError.from: native rejections, coded strings, anything else', () => {
  const a = EmbedError.from({ code: 'busy', message: 'a session is running' });
  assert.equal(a.code, 'busy');
  assert.equal(a.message, 'a session is running');
  assert.equal(EmbedError.from(new Error('bad_token: expired')).code, 'bad_token');
  assert.equal(EmbedError.from(new Error('boom')).code, 'unknown');
  assert.equal(EmbedError.from({ code: 'E_UNKNOWN', message: 'x' }).code, 'unknown');
  const same = new EmbedError('x', 'y');
  assert.equal(EmbedError.from(same), same);
});
