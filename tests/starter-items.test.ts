import assert from 'node:assert/strict';
import test from 'node:test';

import { availableStarterItems, buildStarterInventoryItem, STARTER_ITEMS } from '../src/data/starter-items.ts';
import { matchTone, missingIngredientsForRecipe } from '../src/data/inventory-utils.ts';

test('builds a starter item with purchase and expiry dates', () => {
  const egg = STARTER_ITEMS.find((item) => item.name === '鸡蛋')!;
  const item = buildStarterInventoryItem(egg, new Date(2026, 10, 14));
  assert.equal(item.purchaseDate, '2026-11-14');
  assert.equal(item.expiryDate, '2026-12-05');
  assert.equal(item.quantity, 10);
});

test('hides starter items that are already in stock', () => {
  const names = availableStarterItems(['鸡蛋', '番茄']).map((item) => item.name);
  assert.ok(!names.includes('鸡蛋'));
  assert.ok(!names.includes('番茄'));
  assert.ok(names.includes('大米'));
});

test('match tone thresholds', () => {
  assert.equal(matchTone(100), 'high');
  assert.equal(matchTone(70), 'high');
  assert.equal(matchTone(50), 'mid');
  assert.equal(matchTone(10), 'low');
});

test('lists only the shortfall of missing ingredients', () => {
  const inventory = [
    { id: 'a', name: '鸡蛋', emoji: '🥚', quantity: 1, unit: '个', storage: '冷藏', library: '食材', purchaseDate: '2026-11-01', daysLeft: 9 },
  ] as never;
  const missing = missingIngredientsForRecipe(inventory, [
    { name: '鸡蛋', amount: 3, unit: '个' },
    { name: '番茄', amount: 2, unit: '个' },
  ]);
  assert.deepEqual(missing, [
    { name: '鸡蛋', quantity: 2, unit: '个' },
    { name: '番茄', quantity: 2, unit: '个' },
  ]);
});
