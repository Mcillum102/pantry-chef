import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBearerToken } from '../src/data/ai-auth-utils.ts';

test('parseBearerToken extracts the token', () => {
  assert.equal(parseBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(parseBearerToken('bearer   xyz '), 'xyz');
});

test('parseBearerToken rejects missing or malformed headers', () => {
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken(undefined), null);
  assert.equal(parseBearerToken(''), null);
  assert.equal(parseBearerToken('Bearer'), null);
  assert.equal(parseBearerToken('Basic abc'), null);
  assert.equal(parseBearerToken('Bearer a b'), null);
});
