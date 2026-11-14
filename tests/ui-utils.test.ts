import assert from 'node:assert/strict';
import test from 'node:test';

import { shadeColor, splitLeadingNumber } from '../src/data/ui-utils.ts';

test('splits a leading number from the rest of the label', () => {
  assert.deepEqual(splitLeadingNumber('2/3'), [2, '/3']);
  assert.deepEqual(splitLeadingNumber('650'), [650, '']);
  assert.equal(splitLeadingNumber('无'), null);
});

test('lightens and darkens hex colors', () => {
  assert.equal(shadeColor('#808080', 0), '#808080');
  assert.equal(shadeColor('#000000', 0.5), '#808080');
  assert.equal(shadeColor('#ffffff', -1), '#000000');
  assert.equal(shadeColor('red', 0.2), 'red');
});
