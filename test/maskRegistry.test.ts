import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Rect } from '../src/config.ts';
import { EVERYTHING, MaskRegistry } from '../src/maskRegistry.ts';

test('set, change and unregister notify; same rect does not', () => {
  const r = new MaskRegistry();
  let n = 0;
  const off = r.subscribe(() => n++);
  const id = r.register(async () => null);
  r.set(id, { x: 1, y: 2, w: 3, h: 4 });
  r.set(id, { x: 1, y: 2, w: 3, h: 4 });
  assert.equal(n, 1);
  r.set(id, { x: 1, y: 9, w: 3, h: 4 });
  assert.equal(n, 2);
  assert.deepEqual(r.all(), [{ x: 1, y: 9, w: 3, h: 4 }]);
  r.unregister(id);
  assert.equal(n, 3);
  assert.deepEqual(r.all(), []);
  r.set(id, { x: 0, y: 0, w: 1, h: 1 }); // gone: ignored
  assert.equal(n, 3);
  off();
});

test('an invalid or null rect removes the view from the masks', () => {
  const r = new MaskRegistry();
  const id = r.register(async () => null);
  r.set(id, { x: 1, y: 2, w: 3, h: 4 });
  r.set(id, { x: Number.NaN, y: 2, w: 3, h: 4 });
  assert.deepEqual(r.all(), []);
  r.set(id, { x: 1, y: 2, w: 3, h: 4 });
  r.set(id, null);
  assert.deepEqual(r.all(), []);
});

test('refresh measures every view; a failing or late one keeps its last rect', async () => {
  const r = new MaskRegistry();
  let next: Rect = { x: 10, y: 20, w: 30, h: 40 };
  const a = r.register(async () => next);
  const b = r.register(() => Promise.reject(new Error('gone')));
  const c = r.register(() => new Promise<Rect | null>(() => {}));
  r.set(b, { x: 1, y: 1, w: 1, h: 1 });
  r.set(c, { x: 2, y: 2, w: 2, h: 2 });
  await r.refresh(20);
  assert.deepEqual(r.all().sort((p, q) => p.x - q.x), [
    { x: 1, y: 1, w: 1, h: 1 },
    { x: 2, y: 2, w: 2, h: 2 },
    { x: 10, y: 20, w: 30, h: 40 },
  ]);
  next = { x: 11, y: 20, w: 30, h: 40 };
  await r.refresh(20);
  assert.ok(r.all().some((x) => x.x === 11));
  assert.equal(r.size, 3);
  r.unregister(a);
  assert.equal(r.size, 2);
});

test('a registered view not measured yet masks everything until it is (fail closed)', () => {
  const r = new MaskRegistry();
  assert.deepEqual(r.masks(), []);
  let n = 0;
  r.subscribe(() => n++);
  const id = r.register(() => new Promise<Rect | null>(() => {}));
  assert.equal(r.hasUnmeasured, true);
  assert.deepEqual(r.masks(), [EVERYTHING]);
  r.set(id, { x: Number.NaN, y: 0, w: 1, h: 1 }); // no answer yet
  assert.deepEqual(r.masks(), [EVERYTHING]);
  r.set(id, { x: 1, y: 2, w: 3, h: 4 });
  assert.equal(n, 1, 'measured: the masks change');
  assert.deepEqual(r.masks(), [{ x: 1, y: 2, w: 3, h: 4 }]);
  const off = r.register(async () => null);
  assert.deepEqual(r.masks(), [EVERYTHING, { x: 1, y: 2, w: 3, h: 4 }]);
  r.set(off, null); // measured: not on screen
  assert.equal(n, 2);
  assert.deepEqual(r.masks(), [{ x: 1, y: 2, w: 3, h: 4 }]);
  const gone = r.register(() => new Promise<Rect | null>(() => {}));
  r.unregister(gone); // never measured, now unmounted: everything is no longer masked
  assert.equal(n, 3);
  assert.deepEqual(r.masks(), [{ x: 1, y: 2, w: 3, h: 4 }]);
});

test('EVERYTHING covers any window', () => {
  assert.ok(EVERYTHING.x <= -10000 && EVERYTHING.y <= -10000 && EVERYTHING.x + EVERYTHING.w >= 100000 && EVERYTHING.y + EVERYTHING.h >= 100000);
});
