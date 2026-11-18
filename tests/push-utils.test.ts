import assert from 'node:assert/strict';
import test from 'node:test';

import { isIosUserAgent, pushSupport, subscriptionRow } from '../src/data/push-utils.ts';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const full = { isIos: true, isStandalone: true, hasServiceWorker: true, hasPushManager: true, permission: 'default' as const };

test('detects iPhone and iPad', () => {
  assert.equal(isIosUserAgent(iphone), true);
  assert.equal(isIosUserAgent(ipad, 5), true);
  assert.equal(isIosUserAgent(ipad, 0), false);
});

test('iPhone Safari tabs must be added to the home screen first', () => {
  assert.equal(pushSupport({ ...full, isStandalone: false, hasPushManager: false }), 'needs-home-screen');
  assert.equal(pushSupport(full), 'prompt');
  assert.equal(pushSupport({ ...full, permission: 'granted' }), 'granted');
  assert.equal(pushSupport({ ...full, permission: 'denied' }), 'denied');
  assert.equal(pushSupport({ ...full, isIos: false, isStandalone: false, hasPushManager: false }), 'unsupported');
});

test('subscriptionRow needs an endpoint and both keys', () => {
  const extra = { householdId: 'h', member: 'a' as const, timezone: '', userAgent: 'x'.repeat(400) };
  assert.equal(subscriptionRow({ endpoint: 'https://web.push.apple.com/abc' }, extra), null);
  const row = subscriptionRow({ endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } }, extra);
  assert.equal(row?.timezone, 'America/Vancouver');
  assert.equal(row?.user_agent.length, 300);
});
