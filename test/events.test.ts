import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseEvent, parsePayload } from '../src/events.ts';

test('every event kind parses to its typed shape', () => {
  assert.deepEqual(parseEvent('{"type":"state","state":"waiting"}'), { type: 'state', state: 'waiting' });
  assert.deepEqual(parseEvent('{"type":"code","code":"123456789","session_id":"ss_1","mode":"cobrowse"}'), {
    type: 'code',
    code: '123456789',
    sessionId: 'ss_1',
    mode: 'cobrowse',
  });
  assert.deepEqual(parseEvent('{"type":"joined","agent":"ada@acme.test"}'), { type: 'joined', agent: 'ada@acme.test' });
  assert.deepEqual(parseEvent('{"type":"joined"}'), { type: 'joined', agent: null });
  assert.deepEqual(parseEvent('{"type":"left"}'), { type: 'left' });
  assert.deepEqual(parseEvent('{"type":"control","allowed":false}'), { type: 'control', allowed: false });
  assert.deepEqual(parseEvent('{"type":"action","action":"click","applied":false,"reason":"hint_shown"}'), {
    type: 'action',
    action: 'click',
    applied: false,
    reason: 'hint_shown',
  });
  assert.deepEqual(parseEvent('{"type":"action","action":"type","applied":true,"reason":null}'), {
    type: 'action',
    action: 'type',
    applied: true,
    reason: null,
  });
  assert.deepEqual(parseEvent('{"type":"error","code":"capture_failed","message":"no window"}'), {
    type: 'error',
    code: 'capture_failed',
    message: 'no window',
  });
  assert.deepEqual(parseEvent('{"type":"ended","reason":"stopped"}'), { type: 'ended', reason: 'stopped' });
});

test('ended is never lost: an unknown reason reads as error', () => {
  assert.deepEqual(parseEvent('{"type":"ended","reason":"meteor"}'), { type: 'ended', reason: 'error' });
  assert.deepEqual(parseEvent('{"type":"ended"}'), { type: 'ended', reason: 'error' });
});

test('unknown kinds, bad values and malformed JSON are ignored', () => {
  assert.equal(parseEvent('{"type":"telemetry"}'), null);
  assert.equal(parseEvent('{"type":"state","state":"dancing"}'), null);
  assert.equal(parseEvent('{"type":"code","code":"1","session_id":"s","mode":"remote"}'), null);
  assert.equal(parseEvent('{"type":"control","allowed":"yes"}'), null);
  assert.equal(parseEvent('{"type":"joined","agent":7}'), null);
  assert.equal(parseEvent('{"type":"action","action":"click","applied":true,"reason":3}'), null);
  assert.equal(parseEvent('{"type":"error","code":"x"}'), null);
  assert.equal(parseEvent('not json'), null);
  assert.equal(parseEvent('[1,2]'), null);
  assert.equal(parseEvent('null'), null);
});

test('payloads carry the session tag', () => {
  assert.deepEqual(parsePayload({ tag: 3, json: '{"type":"left"}' }), { tag: 3, event: { type: 'left' } });
  assert.equal(parsePayload({ tag: '3', json: '{"type":"left"}' }), null);
  assert.equal(parsePayload({ tag: 3, json: '{"type":"nope"}' }), null);
  assert.equal(parsePayload({ tag: 3 }), null);
  assert.equal(parsePayload(null), null);
  assert.equal(parsePayload('{"tag":3}'), null);
});
