import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';

import {
  daysUntilDate,
  initialInventory,
  initialStorageLocations,
  inventoryLibraries,
  recipes as builtInRecipes,
  type InventoryLibrary,
  type InventoryLibraryDefinition,
  type InventoryItem,
  type InventoryTransaction,
  type CookingHistoryRecord,
  type CookingHistoryUsage,
  type Recipe,
  type StorageLocation,
} from '@/data/kitchen-data';
import {
  amountFromBaseUnit,
  amountInBaseUnit,
  availableIngredientAmount,
  canonicalIngredientId,
  inventoryIngredientId,
  recipeIngredientId,
} from '@/data/inventory-utils';
import { usePersistentState } from '@/hooks/use-persistent-state';

type NewInventoryItem = {
  name: string;
  emoji: string;
  quantity: number;
  unit: string;
  storage: StorageLocation;
  library: InventoryLibrary;
  purchaseDate: string;
  expiryDate?: string;
  cookingSuggestions?: string[];
  volumeMlPerUnit?: number;
  barcode?: string;
};

export type RecipeMatch = {
  percentage: number;
  availableCount: number;
  totalCount: number;
  missing: string[];
};

type KitchenContextValue = {
  isHydrated: boolean;
  transactions: InventoryTransaction[];
  inventory: InventoryItem[];
  libraries: InventoryLibraryDefinition[];
  storageLocations: StorageLocation[];
  recipes: Recipe[];
  cookingHistory: CookingHistoryRecord[];
  addInventoryItem: (item: NewInventoryItem) => void;
  updateInventoryItem: (id: string, item: NewInventoryItem) => void;
  deleteInventoryItem: (id: string) => void;
  adjustInventoryQuantity: (id: string, delta: number) => void;
  addInventoryLibrary: (library: InventoryLibraryDefinition) => void;
  addStorageLocation: (location: StorageLocation) => void;
  addRecipe: (recipe: Omit<Recipe, 'id'>) => Recipe;
  deleteRecipe: (id: string) => void;
  updateRecipeCategories: (updates: { id: string; category: string }[]) => void;
  cookRecipe: (
    recipe: Recipe,
    servingMultiplier: number,
    metadata: {
      historyId: string;
      servings: number;
      mealType: CookingHistoryRecord['mealType'];
      mealRecordId: string;
      mealFoods: string;
      mealFoodsEn: string;
      carbsGrams: number;
    }
  ) => CookingHistoryRecord;
  undoCookedRecipe: (historyId: string) => CookingHistoryRecord | null;
  getRecipeMatch: (recipe: Recipe, servingMultiplier?: number) => RecipeMatch;
};

const KitchenContext = createContext<KitchenContextValue | null>(null);

function recipeMatch(recipe: Recipe, inventory: InventoryItem[], servingMultiplier = 1): RecipeMatch {
  const checks = recipe.ingredients.map((ingredient) => {
    const available = availableIngredientAmount(inventory, ingredient);
    const needed = amountInBaseUnit(
      ingredient.amount * servingMultiplier,
      ingredient.unit
    ).amount;
    return available >= needed;
  });
  const availableCount = checks.filter(Boolean).length;

  return {
    percentage: Math.round((availableCount / recipe.ingredients.length) * 100),
    availableCount,
    totalCount: recipe.ingredients.length,
    missing: recipe.ingredients.filter((_, index) => !checks[index]).map((item) => item.name),
  };
}

function consumeRecipeInventory(
  inventory: InventoryItem[],
  recipe: Recipe,
  servingMultiplier: number
) {
  const next = inventory.map((item) => ({ ...item }));
  const usages: CookingHistoryUsage[] = [];

  recipe.ingredients.forEach((ingredient) => {
    const ingredientId = recipeIngredientId(ingredient);
    const neededUnit = amountInBaseUnit(1, ingredient.unit);
    let remaining = amountInBaseUnit(
      ingredient.amount * servingMultiplier,
      ingredient.unit
    ).amount;
    const candidates = next
      .filter(
        (item) =>
          item.quantity > 0 &&
          inventoryIngredientId(item) === ingredientId &&
          amountInBaseUnit(item.quantity, item.unit).dimension === neededUnit.dimension
      )
      .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999'));

    candidates.forEach((item) => {
      if (remaining <= 0) return;
      const stock = amountInBaseUnit(item.quantity, item.unit);
      const consumedBase = Math.min(stock.amount, remaining);
      const consumed = amountFromBaseUnit(consumedBase, item.unit);
      const existingUsage = usages.find((usage) => usage.itemId === item.id);

      item.quantity = Math.max(0, item.quantity - consumed);
      remaining -= consumedBase;

      if (existingUsage) {
        existingUsage.amount += consumed;
        existingUsage.amountBase += consumedBase;
      } else {
        usages.push({
          itemId: item.id,
          itemName: item.name,
          amount: consumed,
          amountBase: consumedBase,
          dimension: stock.dimension,
          unit: item.unit,
          itemSnapshot: { ...item, quantity: item.quantity + consumed },
        });
      }
    });
  });

  return { inventory: next, usages };
}

export function KitchenProvider({ children }: PropsWithChildren) {
  const [inventory, setInventory, inventoryHydrated] = usePersistentState(
    'inventory-v1',
    initialInventory
  );
  const [libraries, setLibraries, librariesHydrated] = usePersistentState(
    'inventory-libraries-v1',
    inventoryLibraries
  );
  const [storageLocations, setStorageLocations, locationsHydrated] = usePersistentState(
    'storage-locations-v1',
    initialStorageLocations
  );
  const [transactions, setTransactions, transactionsHydrated] = usePersistentState<
    InventoryTransaction[]
  >('inventory-transactions-v1', []);
  const [customRecipes, setCustomRecipes, recipesHydrated] = usePersistentState<Recipe[]>(
    'custom-recipes-v1',
    []
  );
  const [cookingHistory, setCookingHistory, cookingHistoryHydrated] = usePersistentState<
    CookingHistoryRecord[]
  >('cooking-history-v1', []);
  const [recipeCategoryOverrides, setRecipeCategoryOverrides, categoryOverridesHydrated] =
    usePersistentState<Record<string, string>>('recipe-category-overrides-v1', {});
  const allRecipes = useMemo(
    () => [...customRecipes, ...builtInRecipes].map((recipe) => ({
      ...recipe,
      category: recipeCategoryOverrides[recipe.id] ?? recipe.category,
    })),
    [customRecipes, recipeCategoryOverrides]
  );

  const value = useMemo<KitchenContextValue>(
    () => ({
      isHydrated:
        inventoryHydrated &&
        librariesHydrated &&
        locationsHydrated &&
        transactionsHydrated &&
        recipesHydrated &&
        cookingHistoryHydrated &&
        categoryOverridesHydrated,
      transactions,
      inventory,
      libraries,
      storageLocations,
      recipes: allRecipes,
      cookingHistory,
      addInventoryItem: (item) => {
        const itemId = `custom-${Date.now()}`;
        setInventory((current) => [
          {
            ...item,
            id: itemId,
            batchId: itemId,
            ingredientId: canonicalIngredientId(item.name),
            category: '其他',
            daysLeft: item.expiryDate ? daysUntilDate(item.expiryDate) : 36_500,
          },
          ...current,
        ]);
        setTransactions((current) => [
          {
            id: `transaction-${Date.now()}`,
            itemId,
            ingredientId: canonicalIngredientId(item.name),
            itemName: item.name,
            amount: item.quantity,
            unit: item.unit,
            reason: 'added',
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
      },
      updateInventoryItem: (id, item) => {
        const previousItem = inventory.find((existing) => existing.id === id);
        setInventory((current) =>
          current.map((existing) =>
            existing.id === id
              ? {
                  ...existing,
                  ...item,
                  daysLeft: item.expiryDate ? daysUntilDate(item.expiryDate) : 36_500,
                }
              : existing
          )
        );
        if (previousItem && previousItem.quantity !== item.quantity) {
          setTransactions((current) => [
            {
              id: `transaction-${Date.now()}`,
              itemId: id,
              ingredientId: inventoryIngredientId(previousItem),
              itemName: item.name,
              amount: item.quantity - previousItem.quantity,
              unit: item.unit,
              reason: 'adjusted',
              createdAt: new Date().toISOString(),
            },
            ...current,
          ]);
        }
      },
      deleteInventoryItem: (id) => {
        const deletedItem = inventory.find((item) => item.id === id);
        setInventory((current) => current.filter((item) => item.id !== id));
        if (deletedItem) {
          setTransactions((current) => [
            {
              id: `transaction-${Date.now()}`,
              itemId: deletedItem.id,
              ingredientId: inventoryIngredientId(deletedItem),
              itemName: deletedItem.name,
              amount: -deletedItem.quantity,
              unit: deletedItem.unit,
              reason: 'deleted',
              createdAt: new Date().toISOString(),
            },
            ...current,
          ]);
        }
      },
      adjustInventoryQuantity: (id, delta) => {
        const target = inventory.find((item) => item.id === id);
        if (!target || delta === 0) return;
        const nextQuantity = Math.max(0, target.quantity + delta);
        const appliedDelta = nextQuantity - target.quantity;
        if (appliedDelta === 0) return;
        setInventory((current) =>
          current.map((item) =>
            item.id === id ? { ...item, quantity: nextQuantity } : item
          )
        );
        setTransactions((current) => [
          {
            id: `transaction-${Date.now()}`,
            itemId: id,
            ingredientId: inventoryIngredientId(target),
            itemName: target.name,
            amount: appliedDelta,
            unit: target.unit,
            reason: 'adjusted',
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
      },
      addInventoryLibrary: (library) => {
        setLibraries((current) =>
          current.some((existing) => existing.key === library.key)
            ? current
            : [...current, library]
        );
      },
      addStorageLocation: (location) => {
        setStorageLocations((current) =>
          current.includes(location) ? current : [...current, location]
        );
      },
      addRecipe: (recipe) => {
        const createdRecipe: Recipe = {
          ...recipe,
          id: `custom-recipe-${Date.now()}`,
        };
        setCustomRecipes((current) => [createdRecipe, ...current]);
        return createdRecipe;
      },
      deleteRecipe: (id) => {
        setCustomRecipes((current) => current.filter((recipe) => recipe.id !== id));
        setRecipeCategoryOverrides((current) => {
          const { [id]: _deleted, ...rest } = current;
          return rest;
        });
      },
      updateRecipeCategories: (updates) => {
        setRecipeCategoryOverrides((current) => ({
          ...current,
          ...Object.fromEntries(updates.map((update) => [update.id, update.category])),
        }));
      },
      cookRecipe: (recipe, servingMultiplier, metadata) => {
        const consumed = consumeRecipeInventory(inventory, recipe, servingMultiplier);
        const completedAt = new Date().toISOString();
        const historyRecord: CookingHistoryRecord = {
          id: metadata.historyId,
          recipeId: recipe.id,
          recipeName: recipe.name,
          recipeEmoji: recipe.emoji,
          servings: metadata.servings,
          mealType: metadata.mealType,
          completedAt,
          usages: consumed.usages,
          mealRecordId: metadata.mealRecordId,
          mealFoods: metadata.mealFoods,
          mealFoodsEn: metadata.mealFoodsEn,
          carbsGrams: metadata.carbsGrams,
        };

        setInventory(consumed.inventory);
        setTransactions((current) => [
          ...recipe.ingredients.map((ingredient, index) => ({
            id: `transaction-${metadata.historyId}-${index}`,
            ingredientId: recipeIngredientId(ingredient),
            itemName: ingredient.name,
            amount: -(ingredient.amount * servingMultiplier),
            unit: ingredient.unit,
            reason: 'cooked' as const,
            recipeId: recipe.id,
            createdAt: completedAt,
          })),
          ...current,
        ]);
        setCookingHistory((current) => [historyRecord, ...current]);
        return historyRecord;
      },
      undoCookedRecipe: (historyId) => {
        const record = cookingHistory.find((item) => item.id === historyId);
        if (!record) return null;

        setInventory((current) => {
          const next = current.map((item) => ({ ...item }));

          record.usages.forEach((usage) => {
            const existing = next.find((item) => item.id === usage.itemId);
            if (existing) {
              const currentUnit = amountInBaseUnit(1, existing.unit);
              if (currentUnit.dimension === usage.dimension) {
                existing.quantity += amountFromBaseUnit(usage.amountBase, existing.unit);
                return;
              }
            }

            next.unshift({
              ...usage.itemSnapshot,
              id: existing ? `${usage.itemId}-restored-${record.id}` : usage.itemId,
              batchId: existing ? `${usage.itemId}-restored-${record.id}` : usage.itemSnapshot.batchId,
              quantity: usage.amount,
            });
          });

          return next;
        });
        setTransactions((current) => [
          ...record.usages.map((usage, index) => ({
            id: `transaction-restore-${record.id}-${index}`,
            itemId: usage.itemId,
            ingredientId: inventoryIngredientId(usage.itemSnapshot),
            itemName: usage.itemName,
            amount: usage.amount,
            unit: usage.unit,
            reason: 'restored' as const,
            recipeId: record.recipeId,
            createdAt: new Date().toISOString(),
          })),
          ...current,
        ]);
        setCookingHistory((current) => current.filter((item) => item.id !== historyId));
        return record;
      },
      getRecipeMatch: (recipe, servingMultiplier = 1) =>
        recipeMatch(recipe, inventory, servingMultiplier),
    }),
    [
      inventory,
      inventoryHydrated,
      allRecipes,
      cookingHistory,
      cookingHistoryHydrated,
      categoryOverridesHydrated,
      libraries,
      librariesHydrated,
      locationsHydrated,
      setInventory,
      setLibraries,
      setStorageLocations,
      setCustomRecipes,
      setCookingHistory,
      setRecipeCategoryOverrides,
      setTransactions,
      transactions,
      transactionsHydrated,
      recipesHydrated,
      storageLocations,
    ]
  );

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen() {
  const context = useContext(KitchenContext);

  if (!context) {
    throw new Error('useKitchen must be used inside KitchenProvider');
  }

  return context;
}
