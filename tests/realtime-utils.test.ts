import assert from 'node:assert/strict';
import test from 'node:test';

import { uniqueChannelName } from '../src/data/realtime-utils.ts';

test('every subscription gets its own channel name', () => {
  const names = new Set(Array.from({ length: 200 }, () => uniqueChannelName('reminders-h1')));
  assert.equal(names.size, 200);
  for (const name of names) assert.ok(name.startsWith('reminders-h1:'));
});
