import type { InventoryItem, RecipeIngredient } from '@/data/kitchen-data';

const aliases: Record<string, string> = {
  西红柿: 'tomato',
  番茄: 'tomato',
  tomato: 'tomato',
  鸡蛋: 'egg',
  蛋: 'egg',
  egg: 'egg',
  嫩豆腐: 'tofu',
  豆腐: 'tofu',
  tofu: 'tofu',
  鸡腿肉: 'chicken-thigh',
  鸡肉: 'chicken-thigh',
  chicken: 'chicken-thigh',
  小白菜: 'bok-choy',
  青菜: 'bok-choy',
  bokchoy: 'bok-choy',
  挂面: 'noodles',
  面条: 'noodles',
  noodles: 'noodles',
  胡萝卜: 'carrot',
  carrot: 'carrot',
  洋葱: 'onion',
  onion: 'onion',
  大米: 'rice',
  米: 'rice',
  rice: 'rice',
  肉末: 'minced-meat',
  豆瓣酱: 'chili-bean-paste',
  香蕉: 'banana',
  banana: 'banana',
  燕麦片: 'rolled-oats',
  燕麦: 'rolled-oats',
  oats: 'rolled-oats',
  低筋面粉: 'cake-flour',
  面粉: 'cake-flour',
  flour: 'cake-flour',
  蓝莓: 'blueberry',
  blueberries: 'blueberry',
  酸奶: 'yogurt',
  yogurt: 'yogurt',
};

const unitDefinitions: Record<string, { dimension: string; factor: number }> = {
  克: { dimension: 'mass', factor: 1 },
  g: { dimension: 'mass', factor: 1 },
  千克: { dimension: 'mass', factor: 1000 },
  公斤: { dimension: 'mass', factor: 1000 },
  kg: { dimension: 'mass', factor: 1000 },
  毫升: { dimension: 'volume', factor: 1 },
  mL: { dimension: 'volume', factor: 1 },
  ml: { dimension: 'volume', factor: 1 },
  升: { dimension: 'volume', factor: 1000 },
  L: { dimension: 'volume', factor: 1000 },
};

export function canonicalIngredientId(name: string) {
  const normalized = name.trim().toLocaleLowerCase().replace(/\s+/g, '');
  return aliases[normalized] ?? `custom:${normalized}`;
}

export function inventoryIngredientId(item: InventoryItem) {
  return item.ingredientId ?? canonicalIngredientId(item.name);
}

export function recipeIngredientId(ingredient: RecipeIngredient) {
  return ingredient.ingredientId ?? canonicalIngredientId(ingredient.name);
}

export function amountInBaseUnit(amount: number, unit: string) {
  const definition = unitDefinitions[unit];
  return definition
    ? { amount: amount * definition.factor, dimension: definition.dimension }
    : { amount, dimension: `count:${unit}` };
}

export function amountFromBaseUnit(amount: number, unit: string) {
  const definition = unitDefinitions[unit];
  return definition ? amount / definition.factor : amount;
}

export function availableIngredientAmount(
  inventory: InventoryItem[],
  ingredient: RecipeIngredient
) {
  const ingredientId = recipeIngredientId(ingredient);
  const neededUnit = amountInBaseUnit(1, ingredient.unit);
  return inventory.reduce((total, item) => {
    if (item.quantity <= 0 || inventoryIngredientId(item) !== ingredientId) return total;
    const stock = amountInBaseUnit(item.quantity, item.unit);
    return stock.dimension === neededUnit.dimension ? total + stock.amount : total;
  }, 0);
}
