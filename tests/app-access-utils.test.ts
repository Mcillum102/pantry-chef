import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowKitchenLoading } from '../src/data/app-access-utils.ts';

test('keeps the loading screen visible while an authenticated household is loading', () => {
  assert.equal(shouldShowKitchenLoading({
    configured: true,
    status: 'syncing',
    hasSession: true,
    hasHousehold: false,
  }), true);
});

test('does not mistake a missing household for a loading household', () => {
  assert.equal(shouldShowKitchenLoading({
    configured: true,
    status: 'needs-household',
    hasSession: true,
    hasHousehold: false,
  }), false);
});

test('shows account setup for a signed-out user', () => {
  assert.equal(shouldShowKitchenLoading({
    configured: true,
    status: 'signed-out',
    hasSession: false,
    hasHousehold: false,
  }), false);
});

test('shows the retry state instead of an endless loader after an initialization error', () => {
  assert.equal(shouldShowKitchenLoading({
    configured: true,
    status: 'error',
    hasSession: true,
    hasHousehold: false,
  }), false);
});
