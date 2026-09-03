import assert from 'node:assert/strict';
import test from 'node:test';

import { formatBadgeCount } from '../src/data/badge-utils.ts';

test('hides the badge when there are no pending items', () => {
  assert.equal(formatBadgeCount(0), null);
  assert.equal(formatBadgeCount(-3), null);
});

test('shows the exact pending count up to 99', () => {
  assert.equal(formatBadgeCount(1), '1');
  assert.equal(formatBadgeCount(99), '99');
});

test('caps shopping badge text at 99+', () => {
  assert.equal(formatBadgeCount(100), '99+');
  assert.equal(formatBadgeCount(427), '99+');
});
