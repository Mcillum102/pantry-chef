import assert from 'node:assert/strict';
import test from 'node:test';

import { getKitchenAccessState, isWrongPasscodeError } from '../src/data/app-access-utils.ts';

const base = {
  hasMember: true,
  configured: true,
  needsPasscode: false,
  hasHousehold: false,
  status: 'loading',
  hasError: false,
};

test('asks who is using this phone before anything else', () => {
  assert.equal(getKitchenAccessState({ ...base, hasMember: false, hasHousehold: true }), 'choose-member');
  assert.equal(getKitchenAccessState({ ...base, hasMember: false, needsPasscode: true }), 'choose-member');
});

test('asks for the kitchen passcode when this phone is not signed in yet', () => {
  assert.equal(getKitchenAccessState({ ...base, needsPasscode: true, status: 'signed-out' }), 'enter-passcode');
  assert.equal(getKitchenAccessState({ ...base, needsPasscode: true, hasError: true }), 'enter-passcode');
});

test('keeps loading while the shared account joins the kitchen', () => {
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

test('recognises a wrong passcode but not network failures', () => {
  assert.equal(isWrongPasscodeError({ code: 'invalid_credentials', status: 400 }), true);
  assert.equal(isWrongPasscodeError({ status: 400, message: 'Invalid login credentials' }), true);
  assert.equal(isWrongPasscodeError(new TypeError('Failed to fetch')), false);
  assert.equal(isWrongPasscodeError({ status: 500, message: 'Internal error' }), false);
  assert.equal(isWrongPasscodeError(null), false);
});
