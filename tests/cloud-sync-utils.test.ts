import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRemoteSnapshot,
  isOptimisticWriteConflict,
} from '../src/data/cloud-sync-utils.ts';

test('ignores stale realtime snapshots', () => {
  assert.equal(classifyRemoteSnapshot(4, 4, false), 'ignore');
  assert.equal(classifyRemoteSnapshot(4, 3, true), 'ignore');
});

test('applies a newer remote snapshot when local state is clean', () => {
  assert.equal(classifyRemoteSnapshot(4, 5, false), 'apply');
});

test('requires a decision when both devices changed', () => {
  assert.equal(classifyRemoteSnapshot(4, 5, true), 'conflict');
  assert.equal(isOptimisticWriteConflict(4, 5), true);
  assert.equal(isOptimisticWriteConflict(5, 5), false);
});
