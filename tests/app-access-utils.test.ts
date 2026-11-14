import assert from 'node:assert/strict';
import test from 'node:test';

import { getKitchenAccessState } from '../src/data/app-access-utils.ts';

const base = { hasMember: true, configured: true, hasHousehold: false, status: 'loading', hasError: false };

test('asks who is using this phone before anything else', () => {
  assert.equal(getKitchenAccessState({ ...base, hasMember: false, hasHousehold: true }), 'choose-member');
});

test('keeps loading while the shared account signs in and joins the kitchen', () => {
  assert.equal(getKitchenAccessState(base), 'loading');
  assert.equal(getKitchenAccessState({ ...base, status: 'syncing' }), 'loading');
});

test('opens the app once the shared kitchen is ready', () => {
  assert.equal(getKitchenAccessState({ ...base, status: 'synced', hasHousehold: true }), 'ready');
});

test('opens in local mode when Supabase is not configured', () => {
  assert.equal(getKitchenAccessState({ ...base, configured: false, status: 'not-configured' }), 'ready');
});

test('shows the retry state instead of an endless loader after an error', () => {
  assert.equal(getKitchenAccessState({ ...base, status: 'error' }), 'error');
  assert.equal(getKitchenAccessState({ ...base, status: 'pending', hasError: true }), 'error');
});
