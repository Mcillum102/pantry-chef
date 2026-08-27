import assert from 'node:assert/strict';
import test from 'node:test';

import {
  amountFromBaseUnit,
  amountInBaseUnit,
  availableIngredientAmount,
  canonicalIngredientId,
} from '../src/data/inventory-utils.ts';

test('normalizes ingredient aliases in Chinese and English', () => {
  assert.equal(canonicalIngredientId(' 番茄 '), 'tomato');
  assert.equal(canonicalIngredientId('Tomato'), 'tomato');
  assert.equal(canonicalIngredientId('鸡蛋'), 'egg');
});

test('converts mass and volume units without mixing dimensions', () => {
  assert.deepEqual(amountInBaseUnit(1.5, '千克'), { amount: 1500, dimension: 'mass' });
  assert.deepEqual(amountInBaseUnit(2, '升'), { amount: 2000, dimension: 'volume' });
  assert.equal(amountFromBaseUnit(1500, '千克'), 1.5);
});

test('sums compatible inventory batches only', () => {
  const inventory = [
    { id: 'a', name: '番茄', emoji: '🍅', library: '食材', category: '蔬菜', quantity: 500, unit: '克', storage: '冷藏', daysLeft: 2, purchaseDate: '2026-08-20' },
    { id: 'b', name: '西红柿', emoji: '🍅', library: '食材', category: '蔬菜', quantity: 1, unit: '千克', storage: '冷藏', daysLeft: 4, purchaseDate: '2026-08-21' },
    { id: 'c', name: '番茄', emoji: '🍅', library: '食材', category: '蔬菜', quantity: 2, unit: '个', storage: '冷藏', daysLeft: 3, purchaseDate: '2026-08-21' },
  ];
  assert.equal(availableIngredientAmount(inventory, { name: '番茄', amount: 100, unit: '克' }), 1500);
  assert.equal(availableIngredientAmount(inventory, { name: '番茄', amount: 1, unit: '个' }), 2);
});
