import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQuickInventorySuggestions } from '../src/data/inventory-suggestions.ts';
import type { InventoryItem, InventoryTransaction } from '../src/data/kitchen-data.ts';

function addition(
  id: string,
  itemName: string,
  amount: number,
  unit: string,
  createdAt: string,
  ingredientId = itemName
): InventoryTransaction {
  return {
    id,
    itemId: `${ingredientId}-item`,
    ingredientId,
    itemName,
    amount,
    unit,
    reason: 'added',
    createdAt,
  };
}

test('ranks frequently added items ahead of one-off additions', () => {
  const suggestions = buildQuickInventorySuggestions(
    [
      addition('1', '鸡蛋', 6, '个', '2026-08-01T09:00:00.000Z', 'egg'),
      addition('2', '鸡蛋', 12, '个', '2026-08-05T09:00:00.000Z', 'egg'),
      addition('3', '牛奶', 1, '盒', '2026-08-10T09:00:00.000Z', 'milk'),
    ],
    [],
    []
  );

  assert.deepEqual(suggestions.map((suggestion) => suggestion.name), ['鸡蛋', '牛奶']);
  assert.equal(suggestions[0].addedCount, 2);
});

test('learns the most common unit and habitual quantity', () => {
  const suggestions = buildQuickInventorySuggestions(
    [
      addition('1', '气泡水', 6, '瓶', '2026-08-01T09:00:00.000Z', 'sparkling-water'),
      addition('2', '气泡水', 12, '瓶', '2026-08-02T09:00:00.000Z', 'sparkling-water'),
      addition('3', '气泡水', 6, '瓶', '2026-08-03T09:00:00.000Z', 'sparkling-water'),
      addition('4', '气泡水', 1, '箱', '2026-08-04T09:00:00.000Z', 'sparkling-water'),
    ],
    [],
    []
  );

  assert.equal(suggestions[0].unit, '瓶');
  assert.equal(suggestions[0].quantity, 6);
});

test('reuses item details and its recorded shelf life', () => {
  const item: InventoryItem = {
    id: 'milk-item',
    ingredientId: 'milk',
    name: '鲜牛奶',
    emoji: '🥛',
    library: '饮料',
    category: '饮料',
    quantity: 2,
    unit: '盒',
    storage: '冷藏',
    daysLeft: 7,
    purchaseDate: '2026-08-01',
    expiryDate: '2026-08-09',
    volumeMlPerUnit: 946,
  };
  const suggestions = buildQuickInventorySuggestions(
    [addition('1', '鲜牛奶', 2, '盒', '2026-08-01T09:00:00.000Z', 'milk')],
    [item],
    []
  );

  assert.deepEqual(suggestions[0], {
    name: '鲜牛奶',
    emoji: '🥛',
    library: '饮料',
    storage: '冷藏',
    unit: '盒',
    quantity: 2,
    shelfDays: 8,
    volumeMlPerUnit: 946,
    addedCount: 1,
    lastAddedAt: '2026-08-01T09:00:00.000Z',
  });
});

test('ignores non-addition events and respects the requested limit', () => {
  const adjusted = {
    ...addition('1', '番茄', 2, '个', '2026-08-01T09:00:00.000Z'),
    reason: 'adjusted' as const,
  };
  assert.deepEqual(buildQuickInventorySuggestions([adjusted], [], []), []);
  assert.deepEqual(
    buildQuickInventorySuggestions(
      [addition('2', '番茄', 2, '个', '2026-08-02T09:00:00.000Z')],
      [],
      [],
      0
    ),
    []
  );
});
