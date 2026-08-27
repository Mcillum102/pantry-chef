import { createContext, type PropsWithChildren, useContext, useEffect, useMemo } from 'react';

import {
  daysUntilDate,
  effectiveExpiryDate,
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
  type DeletedInventoryRecord,
  type Recipe,
  type ShoppingListItem,
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
  openedAt?: string;
  openedExpiryDate?: string;
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

export type KitchenSnapshot = {
  inventory: InventoryItem[];
  libraries: InventoryLibraryDefinition[];
  storageLocations: StorageLocation[];
  transactions: InventoryTransaction[];
  customRecipes: Recipe[];
  cookingHistory: CookingHistoryRecord[];
  recipeCategoryOverrides: Record<string, string>;
  shoppingList: ShoppingListItem[];
  deletedInventory: DeletedInventoryRecord[];
};

export function createEmptyKitchenSnapshot(): KitchenSnapshot {
  return {
    inventory: [],
    libraries: inventoryLibraries.map((library) => ({ ...library })),
    storageLocations: [...initialStorageLocations],
    transactions: [],
    customRecipes: [],
    cookingHistory: [],
    recipeCategoryOverrides: {},
    shoppingList: [],
    deletedInventory: [],
  };
}

export function createSampleKitchenSnapshot(): KitchenSnapshot {
  return {
    ...createEmptyKitchenSnapshot(),
    inventory: initialInventory.map((item) => ({
      ...item,
      cookingSuggestions: item.cookingSuggestions ? [...item.cookingSuggestions] : undefined,
    })),
  };
}

type KitchenContextValue = {
  isHydrated: boolean;
  transactions: InventoryTransaction[];
  inventory: InventoryItem[];
  libraries: InventoryLibraryDefinition[];
  storageLocations: StorageLocation[];
  recipes: Recipe[];
  cookingHistory: CookingHistoryRecord[];
  shoppingList: ShoppingListItem[];
  deletedInventory: DeletedInventoryRecord[];
  snapshot: KitchenSnapshot;
  replaceSnapshot: (snapshot: KitchenSnapshot) => void;
  addShoppingItem: (item: Omit<ShoppingListItem, 'id' | 'ingredientId' | 'checked' | 'createdAt'>) => void;
  adjustShoppingItemQuantity: (id: string, delta: number) => void;
  toggleShoppingItem: (id: string) => void;
  deleteShoppingItem: (id: string) => void;
  clearCheckedShoppingItems: () => void;
  addInventoryItem: (item: NewInventoryItem) => void;
  updateInventoryItem: (id: string, item: NewInventoryItem) => void;
  deleteInventoryItem: (
    id: string,
    reason?: 'deleted' | 'finished' | 'expired' | 'discarded'
  ) => void;
  restoreDeletedInventoryItem: (recordId: string) => void;
  permanentlyDeleteInventoryItem: (recordId: string) => void;
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
  const emptySnapshot = useMemo(() => createEmptyKitchenSnapshot(), []);
  const [inventory, setInventory, inventoryHydrated] = usePersistentState(
    'inventory-v1',
    emptySnapshot.inventory
  );
  const [libraries, setLibraries, librariesHydrated] = usePersistentState(
    'inventory-libraries-v1',
    emptySnapshot.libraries
  );
  const [storageLocations, setStorageLocations, locationsHydrated] = usePersistentState(
    'storage-locations-v1',
    emptySnapshot.storageLocations
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
  const [shoppingList, setShoppingList, shoppingListHydrated] = usePersistentState<ShoppingListItem[]>(
    'shopping-list-v1',
    []
  );
  const [deletedInventory, setDeletedInventory, deletedInventoryHydrated] =
    usePersistentState<DeletedInventoryRecord[]>('deleted-inventory-v1', []);
  const allRecipes = useMemo(
    () => [...customRecipes, ...builtInRecipes].map((recipe) => ({
      ...recipe,
      category: recipeCategoryOverrides[recipe.id] ?? recipe.category,
    })),
    [customRecipes, recipeCategoryOverrides]
  );

  useEffect(() => {
    if (!inventoryHydrated) return;
    setInventory((current) => {
      let changed = false;
      const next = current.map((item) => {
        const expiry = effectiveExpiryDate(item);
        const daysLeft = expiry ? daysUntilDate(expiry) : 36_500;
        if (daysLeft === item.daysLeft) return item;
        changed = true;
        return { ...item, daysLeft };
      });
      return changed ? next : current;
    });
  }, [inventoryHydrated, setInventory]);

  const value = useMemo<KitchenContextValue>(
    () => ({
      isHydrated:
        inventoryHydrated &&
        librariesHydrated &&
        locationsHydrated &&
        transactionsHydrated &&
        recipesHydrated &&
        cookingHistoryHydrated &&
        categoryOverridesHydrated &&
        shoppingListHydrated &&
        deletedInventoryHydrated,
      transactions,
      inventory,
      libraries,
      storageLocations,
      recipes: allRecipes,
      cookingHistory,
      shoppingList,
      deletedInventory,
      snapshot: {
        inventory,
        libraries,
        storageLocations,
        transactions,
        customRecipes,
        cookingHistory,
        recipeCategoryOverrides,
        shoppingList,
        deletedInventory,
      },
      replaceSnapshot: (snapshot) => {
        setInventory(snapshot.inventory);
        setLibraries(snapshot.libraries);
        setStorageLocations(snapshot.storageLocations);
        setTransactions(snapshot.transactions);
        setCustomRecipes(snapshot.customRecipes);
        setCookingHistory(snapshot.cookingHistory);
        setRecipeCategoryOverrides(snapshot.recipeCategoryOverrides);
        setShoppingList(snapshot.shoppingList ?? []);
        setDeletedInventory(snapshot.deletedInventory ?? []);
      },
      addShoppingItem: (item) => {
        const ingredientId = canonicalIngredientId(item.name);
        setShoppingList((current) => {
          const existing = current.find(
            (entry) => !entry.checked && entry.ingredientId === ingredientId && entry.unit === item.unit
          );
          if (existing) {
            return current.map((entry) => entry.id === existing.id
              ? { ...entry, quantity: entry.quantity + item.quantity }
              : entry
            );
          }
          return [{
            ...item,
            id: `shopping-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ingredientId,
            checked: false,
            createdAt: new Date().toISOString(),
          }, ...current];
        });
      },
      adjustShoppingItemQuantity: (id, delta) => {
        setShoppingList((current) => current.map((entry) => entry.id === id
          ? { ...entry, quantity: Math.max(0.1, entry.quantity + delta) }
          : entry
        ));
      },
      toggleShoppingItem: (id) => {
        setShoppingList((current) => current.map((entry) => entry.id === id
          ? { ...entry, checked: !entry.checked }
          : entry
        ));
      },
      deleteShoppingItem: (id) => {
        setShoppingList((current) => current.filter((entry) => entry.id !== id));
      },
      clearCheckedShoppingItems: () => {
        setShoppingList((current) => current.filter((entry) => !entry.checked));
      },
      addInventoryItem: (item) => {
        const itemId = `custom-${Date.now()}`;
        setInventory((current) => [
          {
            ...item,
            id: itemId,
            batchId: itemId,
            ingredientId: canonicalIngredientId(item.name),
            category: '其他',
            daysLeft: (item.openedExpiryDate ?? item.expiryDate)
              ? daysUntilDate(item.openedExpiryDate ?? item.expiryDate!)
              : 36_500,
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
                  daysLeft: (item.openedExpiryDate ?? item.expiryDate)
                    ? daysUntilDate(item.openedExpiryDate ?? item.expiryDate!)
                    : 36_500,
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
      deleteInventoryItem: (id, reason = 'deleted') => {
        const deletedItem = inventory.find((item) => item.id === id);
        setInventory((current) => current.filter((item) => item.id !== id));
        if (deletedItem) {
          setDeletedInventory((current) => [{
            id: `deleted-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            item: deletedItem,
            reason,
            deletedAt: new Date().toISOString(),
          }, ...current].slice(0, 100));
          setTransactions((current) => [
            {
              id: `transaction-${Date.now()}`,
              itemId: deletedItem.id,
              ingredientId: inventoryIngredientId(deletedItem),
              itemName: deletedItem.name,
              amount: -deletedItem.quantity,
              unit: deletedItem.unit,
              reason,
              createdAt: new Date().toISOString(),
            },
            ...current,
          ]);
        }
      },
      restoreDeletedInventoryItem: (recordId) => {
        const record = deletedInventory.find((entry) => entry.id === recordId);
        if (!record) return;
        const restoredId = inventory.some((item) => item.id === record.item.id)
          ? `${record.item.id}-restored-${Date.now()}`
          : record.item.id;
        setInventory((current) => [{ ...record.item, id: restoredId, batchId: restoredId }, ...current]);
        setDeletedInventory((current) => current.filter((entry) => entry.id !== recordId));
        setTransactions((current) => [{
          id: `transaction-restore-delete-${Date.now()}`,
          itemId: restoredId,
          ingredientId: inventoryIngredientId(record.item),
          itemName: record.item.name,
          amount: record.item.quantity,
          unit: record.item.unit,
          reason: 'restored' as const,
          createdAt: new Date().toISOString(),
        }, ...current]);
      },
      permanentlyDeleteInventoryItem: (recordId) => {
        setDeletedInventory((current) => current.filter((entry) => entry.id !== recordId));
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
      deletedInventory,
      deletedInventoryHydrated,
      categoryOverridesHydrated,
      customRecipes,
      libraries,
      librariesHydrated,
      locationsHydrated,
      setInventory,
      setLibraries,
      setStorageLocations,
      setCustomRecipes,
      setCookingHistory,
      setDeletedInventory,
      setRecipeCategoryOverrides,
      setTransactions,
      transactions,
      transactionsHydrated,
      recipesHydrated,
      recipeCategoryOverrides,
      setShoppingList,
      shoppingList,
      shoppingListHydrated,
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
