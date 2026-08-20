import { Platform } from 'react-native';

import type { InventoryLibrary, StorageLocation } from '@/data/kitchen-data';

export type BarcodeProduct = {
  barcode: string;
  name: string;
  emoji: string;
  library: InventoryLibrary;
  storage: StorageLocation;
  volumeMlPerUnit?: number;
};

type OpenFoodFactsResponse = {
  status?: number;
  product?: {
    product_name?: string;
    product_name_zh?: string;
    product_name_en?: string;
    quantity_value?: number | string;
    quantity_unit?: string;
    categories_tags_en?: string[];
  };
};

function classifyProduct(categories: string[]) {
  const text = categories.join(' ').toLocaleLowerCase();
  if (/beverage|drink|juice|milk|coffee|tea|water/.test(text)) {
    return { library: '饮料', storage: '冷藏', emoji: '🥤' } as const;
  }
  if (/dessert|cake|pudding|ice-cream/.test(text)) {
    return { library: '甜品', storage: '冷藏', emoji: '🍰' } as const;
  }
  if (/snack|biscuit|cookie|cracker|chips|nuts/.test(text)) {
    return { library: '零食', storage: '零食车', emoji: '🍿' } as const;
  }
  if (/ready-meal|instant|frozen-food|prepared-meal/.test(text)) {
    return { library: '速食', storage: '速食柜', emoji: '🍱' } as const;
  }
  return { library: '食材', storage: '冷藏', emoji: '🥬' } as const;
}

export async function lookupBarcodeProduct(
  barcode: string,
  language: 'zh' | 'en'
): Promise<BarcodeProduct | null> {
  const fields = [
    'product_name',
    'product_name_zh',
    'product_name_en',
    'quantity_value',
    'quantity_unit',
    'categories_tags_en',
  ].join(',');
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
    Platform.OS === 'web'
      ? undefined
      : { headers: { 'User-Agent': 'FreshPantry/0.1 (Expo; barcode-scan)' } }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as OpenFoodFactsResponse;
  if (data.status !== 1 || !data.product) return null;

  const product = data.product;
  const name =
    (language === 'zh' ? product.product_name_zh : product.product_name_en) ||
    product.product_name ||
    product.product_name_en ||
    product.product_name_zh;
  if (!name) return null;

  const classification = classifyProduct(product.categories_tags_en ?? []);
  const quantityValue = Number(product.quantity_value);
  const quantityUnit = product.quantity_unit?.toLocaleLowerCase();
  const volumeMlPerUnit =
    Number.isFinite(quantityValue) && quantityValue > 0
      ? quantityUnit === 'l'
        ? quantityValue * 1000
        : quantityUnit === 'ml'
          ? quantityValue
          : undefined
      : undefined;

  return {
    barcode,
    name,
    ...classification,
    volumeMlPerUnit,
  };
}
