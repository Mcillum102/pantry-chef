import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePasscode, lockSecondsLeft, MAX_PASSCODE_ATTEMPTS, recordPasscodeFailure } from '../src/data/passcode-utils.ts';

test('rates passcode strength', () => {
  assert.equal(evaluatePasscode('abc').level, 0);
  assert.equal(evaluatePasscode('aaaaaaaa').level, 1);
  assert.equal(evaluatePasscode('12345678').level, 1);
  assert.ok(evaluatePasscode('tomato-egg-2026').level >= 2);
  assert.equal(evaluatePasscode('番茄炒蛋-Weekend-8').level, 3);
  assert.ok(evaluatePasscode('Csh@20020101').tips.some((tip) => tip.includes('生日')));
});

test('locks after too many wrong passcodes', () => {
  let state = { failures: 0, lockedUntil: null as number | null };
  for (let i = 0; i < MAX_PASSCODE_ATTEMPTS - 1; i += 1) state = recordPasscodeFailure(state, 1000);
  assert.equal(state.failures, MAX_PASSCODE_ATTEMPTS - 1);
  assert.equal(lockSecondsLeft(state, 1000), 0);
  state = recordPasscodeFailure(state, 1000);
  assert.equal(lockSecondsLeft(state, 1000), 60);
  assert.equal(lockSecondsLeft(state, 1000 + 60_000), 0);
});
