import assert from 'node:assert/strict';
import test from 'node:test';

import { NO_KEYBOARD, visualViewportInsets } from '../src/data/keyboard-utils.ts';

test('no keyboard when the visible area fills the page', () => {
  assert.deepEqual(visualViewportInsets({ layoutHeight: 874, viewportHeight: 874, viewportOffsetTop: 0 }), NO_KEYBOARD);
});

test('small changes (Safari toolbar) are ignored', () => {
  assert.deepEqual(visualViewportInsets({ layoutHeight: 874, viewportHeight: 830, viewportOffsetTop: 0 }), NO_KEYBOARD);
});

test('keyboard height is measured from the bottom', () => {
  assert.deepEqual(visualViewportInsets({ layoutHeight: 874, viewportHeight: 538, viewportOffsetTop: 0 }), { top: 0, bottom: 336 });
});

test('a page pushed up by Safari reports both insets', () => {
  assert.deepEqual(visualViewportInsets({ layoutHeight: 874, viewportHeight: 538, viewportOffsetTop: 120 }), { top: 120, bottom: 216 });
});
