import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { GaiaDeskEmbed, useBridge } from '../src/embed.ts';
import { EmbedError } from '../src/errors.ts';
import type { EmbedEvent } from '../src/events.ts';
import { maskRegistry } from '../src/maskRegistry.ts';
import type { Bridge, NativeEmbedModule } from '../src/native.ts';

interface Fake {
  bridge: Bridge;
  calls: Array<[string, ...unknown[]]>;
  emit(tag: number, event: Record<string, unknown>): void;
  listeners: number;
  /** What `start` does (default: resolve). */
  onStart: (tag: number) => Promise<void>;
  consentAnswer: boolean;
  buildInfo: string;
}

function fake(platform = 'ios', linked = true): Fake {
  const subs = new Set<(p: unknown) => void>();
  const f: Fake = {
    calls: [],
    listeners: 0,
    onStart: async () => {},
    consentAnswer: true,
    buildInfo: '{"version":"0.1.0","codec":"hevc","os":"ios","arch":"arm64","test_source":false}',
    emit(tag, event) {
      for (const s of [...subs]) s({ tag, json: JSON.stringify(event) });
    },
    bridge: undefined as unknown as Bridge,
  };
  const module: NativeEmbedModule = {
    start: (tag, json, consent) => {
      f.calls.push(['start', tag, JSON.parse(json), consent]);
      return f.onStart(tag);
    },
    stop: (tag) => {
      f.calls.push(['stop', tag]);
    },
    setMaskedRects: async (tag, rects) => {
      f.calls.push(['setMaskedRects', tag, rects]);
    },
    setPaused: (tag, paused) => {
      f.calls.push(['setPaused', tag, paused]);
    },
    requestConsent: async (company, guided, capture) => {
      f.calls.push(['requestConsent', company, guided, capture]);
      return f.consentAnswer;
    },
    buildInfo: async () => f.buildInfo,
  };
  f.bridge = {
    platform,
    module: linked ? module : null,
    subscribe(l) {
      subs.add(l);
      f.listeners = subs.size;
      return () => {
        subs.delete(l);
        f.listeners = subs.size;
      };
    },
  };
  useBridge(f.bridge);
  return f;
}

const opts = { embedToken: 'gdemb_x', company: 'Acme' };

async function refused(p: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => e instanceof EmbedError && e.code === code);
}

afterEach(() => useBridge(null));

test('no consent, no native call', async () => {
  const f = fake();
  await refused(GaiaDeskEmbed.start(opts, { consentGranted: false }), 'consent_required');
  await refused(GaiaDeskEmbed.start(opts, { consentGranted: 'yes' as never }), 'consent_required');
  await refused(GaiaDeskEmbed.start(opts, undefined as never), 'consent_required');
  assert.deepEqual(f.calls, []);
});

test('not linked, unsupported platform, bad options', async () => {
  fake('ios', false);
  await refused(GaiaDeskEmbed.start(opts, { consentGranted: true }), 'not_linked');
  fake('web');
  await refused(GaiaDeskEmbed.start(opts, { consentGranted: true }), 'unsupported_platform');
  const f = fake('ios');
  await refused(GaiaDeskEmbed.start({ ...opts, capture: 'screen' }, { consentGranted: true }), 'bad_config');
  assert.deepEqual(f.calls, []);
});

test('start maps options, tags the session and routes its events', async () => {
  const f = fake('android');
  const seen: EmbedEvent[] = [];
  const s = await GaiaDeskEmbed.start({ ...opts, guided: true, masks: [{ x: 1, y: 2, w: 3, h: 4 }] }, { consentGranted: true }, (e) => seen.push(e));
  const [name, tag, config, consent] = f.calls[0];
  assert.equal(name, 'start');
  assert.equal(tag, s.tag);
  assert.equal(consent, true);
  assert.deepEqual(config, { embed_token: 'gdemb_x', company: 'Acme', guided: true, capture: 'app', masks: [{ x: 1, y: 2, w: 3, h: 4 }] });
  assert.equal(GaiaDeskEmbed.current, s);

  f.emit(s.tag, { type: 'state', state: 'waiting' });
  f.emit(s.tag + 100, { type: 'left' }); // another session's: not ours
  f.emit(s.tag, { type: 'telemetry' }); // unknown: ignored
  f.emit(s.tag, { type: 'code', code: '123456789', session_id: 'ss_1', mode: 'view' });
  assert.deepEqual(seen, [
    { type: 'state', state: 'waiting' },
    { type: 'code', code: '123456789', sessionId: 'ss_1', mode: 'view' },
  ]);
  assert.equal(s.sessionId, 'ss_1');
  s.stop();
  f.emit(s.tag, { type: 'ended', reason: 'app_stopped' });
  assert.equal(await s.ended, 'app_stopped');
});

test('events sent while start is still pending are not lost', async () => {
  const f = fake('ios');
  f.onStart = async (tag) => {
    f.emit(tag, { type: 'state', state: 'starting' });
  };
  const seen: string[] = [];
  const s = await GaiaDeskEmbed.start(opts, { consentGranted: true }, (e) => seen.push(e.type));
  assert.deepEqual(seen, ['state']);
  f.emit(s.tag, { type: 'ended', reason: 'stopped' });
});

test('ended resolves once; nothing follows it; stop is idempotent', async () => {
  const f = fake('ios');
  const seen: string[] = [];
  const s = await GaiaDeskEmbed.start(opts, { consentGranted: true });
  s.on((e) => seen.push(e.type));
  s.stop();
  s.stop();
  assert.deepEqual(
    f.calls.filter((c) => c[0] === 'stop'),
    [['stop', s.tag]],
  );
  f.emit(s.tag, { type: 'ended', reason: 'meteor' });
  f.emit(s.tag, { type: 'ended', reason: 'stopped' });
  f.emit(s.tag, { type: 'joined', agent: 'a@b.c' });
  assert.equal(await s.ended, 'error');
  assert.deepEqual(seen, ['ended']);
  assert.equal(s.isEnded, true);
  assert.equal(GaiaDeskEmbed.current, null);
  // after the end: no more native calls
  s.setPaused(true);
  await s.setMaskedRects([{ x: 0, y: 0, w: 1, h: 1 }]);
  s.stop();
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ['start', 'stop'],
  );
});

test('listeners unsubscribe; a throwing listener does not starve the others', async () => {
  const f = fake('ios');
  const s = await GaiaDeskEmbed.start(opts, { consentGranted: true });
  const a: string[] = [];
  const b: string[] = [];
  const offA = s.on((e) => a.push(e.type));
  s.on(() => {
    throw new Error('app bug');
  });
  s.on((e) => b.push(e.type));
  assert.throws(() => f.emit(s.tag, { type: 'left' }), /app bug/);
  offA();
  assert.throws(() => f.emit(s.tag, { type: 'control', allowed: false }), /app bug/);
  assert.deepEqual(a, ['left']);
  assert.deepEqual(b, ['left', 'control']);
  assert.throws(() => f.emit(s.tag, { type: 'ended', reason: 'stopped' }), /app bug/);
  assert.equal(await s.ended, 'stopped');
});

test('a refused start rejects with the native code and leaves nothing running', async () => {
  const f = fake('android');
  f.onStart = () => Promise.reject(Object.assign(new Error('a session is already running'), { code: 'busy' }));
  const seen: string[] = [];
  await assert.rejects(GaiaDeskEmbed.start(opts, { consentGranted: true }, (e) => seen.push(e.type)), (e: unknown) => {
    assert.ok(e instanceof EmbedError);
    assert.equal(e.code, 'busy');
    assert.equal(e.message, 'a session is already running');
    return true;
  });
  const tag = f.calls[0][1] as number;
  f.emit(tag, { type: 'left' });
  assert.deepEqual(seen, []);
  assert.equal(GaiaDeskEmbed.current, null);
});

test('masks: the app rects plus marked views, re-sent when a view moves', async () => {
  const f = fake('ios');
  let card = { x: 20, y: 130, w: 220, h: 120 };
  const id = maskRegistry.register(async () => card);
  try {
    const s = await GaiaDeskEmbed.start({ ...opts, masks: [{ x: 1, y: 1, w: 1, h: 1 }] }, { consentGranted: true });
    // measured before start, so the first frame is covered
    assert.deepEqual((f.calls[0][2] as { masks: unknown }).masks, [
      { x: 1, y: 1, w: 1, h: 1 },
      { x: 20, y: 130, w: 220, h: 120 },
    ]);
    await s.setMaskedRects([{ x: 5, y: 6, w: 7, h: 8 }]);
    assert.deepEqual(f.calls.at(-1), ['setMaskedRects', s.tag, [5, 6, 7, 8, 20, 130, 220, 120]]);
    card = { x: 20, y: 100, w: 220, h: 120 };
    maskRegistry.set(id, card);
    await Promise.resolve();
    assert.deepEqual(f.calls.at(-1), ['setMaskedRects', s.tag, [5, 6, 7, 8, 20, 100, 220, 120]]);
    await assert.rejects(s.setMaskedRects([{ x: 0, y: 0, w: -1, h: 1 }]), (e: unknown) => e instanceof EmbedError && e.code === 'bad_rects');
    f.emit(s.tag, { type: 'ended', reason: 'stopped' });
    const before = f.calls.length;
    maskRegistry.set(id, { x: 0, y: 0, w: 9, h: 9 });
    assert.equal(f.calls.length, before, 'an ended session does not re-send masks');
  } finally {
    maskRegistry.unregister(id);
  }
});

test('setPaused passes through', async () => {
  const f = fake('android');
  const s = await GaiaDeskEmbed.start(opts, { consentGranted: true });
  s.setPaused(true);
  s.setPaused(false);
  assert.deepEqual(f.calls.slice(1), [
    ['setPaused', s.tag, true],
    ['setPaused', s.tag, false],
  ]);
  f.emit(s.tag, { type: 'ended', reason: 'stopped' });
});

test('requestConsent: per-platform capture, the answer as a boolean', async () => {
  let f = fake('ios');
  assert.equal(await GaiaDeskEmbed.requestConsent('Acme', { guided: true }), true);
  assert.deepEqual(f.calls, [['requestConsent', 'Acme', true, 'app']]);
  await refused(GaiaDeskEmbed.requestConsent('Acme', { capture: 'screen' }), 'bad_config');
  f = fake('android');
  f.consentAnswer = false;
  assert.equal(await GaiaDeskEmbed.requestConsent('Acme', { capture: 'screen' }), false);
  assert.deepEqual(f.calls, [['requestConsent', 'Acme', false, 'screen']]);
  await refused(GaiaDeskEmbed.requestConsent(''), 'bad_config');
});

test('buildInfo parses the native JSON', async () => {
  const f = fake('android');
  assert.deepEqual(await GaiaDeskEmbed.buildInfo(), { version: '0.1.0', testSource: false, codec: 'hevc', os: 'ios', arch: 'arm64' });
  f.buildInfo = 'garbage';
  assert.deepEqual(await GaiaDeskEmbed.buildInfo(), { version: '', testSource: false, codec: '', os: '', arch: '' });
});

test('the bridge is subscribed once, however many sessions', async () => {
  const f = fake('ios');
  for (let i = 0; i < 3; i++) {
    const s = await GaiaDeskEmbed.start(opts, { consentGranted: true });
    f.emit(s.tag, { type: 'ended', reason: 'stopped' });
    await s.ended;
  }
  assert.equal(f.listeners, 1);
  const tags = f.calls.filter((c) => c[0] === 'start').map((c) => c[1]);
  assert.equal(new Set(tags).size, 3);
});
