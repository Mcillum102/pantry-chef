import assert from 'node:assert/strict';
import test from 'node:test';

import { appViewportHeight } from '../src/data/viewport-utils.ts';

const iphone = { standalone: true, innerWidth: 402, screenWidth: 402, screenHeight: 874 };

test('home-screen app fills the whole screen even when iOS under-reports the height', () => {
  assert.equal(appViewportHeight({ ...iphone, innerHeight: 840 }), 874); // 少算了 Home 横条
  assert.equal(appViewportHeight({ ...iphone, innerHeight: 874 }), 874); // 没有 bug 的系统版本
  // 不同机型用各自的屏幕尺寸
  assert.equal(appViewportHeight({ standalone: true, innerWidth: 440, innerHeight: 900, screenWidth: 440, screenHeight: 956 }), 956);
});

test('landscape uses the screen width as height', () => {
  assert.equal(appViewportHeight({ ...iphone, innerWidth: 874, innerHeight: 380 }), 402);
});

test('Safari tabs, split view and odd readings keep the browser height', () => {
  assert.equal(appViewportHeight({ ...iphone, standalone: false, innerHeight: 700 }), 700);
  assert.equal(appViewportHeight({ ...iphone, innerWidth: 320, innerHeight: 600 }), 600); // 宽度对不上屏幕
  assert.equal(appViewportHeight({ ...iphone, innerHeight: 500 }), 500); // 差太多，不修正
  assert.equal(appViewportHeight({ ...iphone, innerHeight: 900 }), 900); // 只往大了修正
});
