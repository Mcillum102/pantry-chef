import type {
  DeletedInventoryRecord,
  InventoryItem,
  InventoryLibrary,
  InventoryTransaction,
  StorageLocation,
} from './kitchen-data';

export type QuickInventorySuggestion = {
  name: string;
  emoji: string;
  library: InventoryLibrary;
  storage: StorageLocation;
  unit: string;
  quantity: number;
  shelfDays: number;
  volumeMlPerUnit?: number;
  addedCount: number;
  lastAddedAt: string;
};

type AdditionGroup = {
  transactions: InventoryTransaction[];
  addedCount: number;
  lastAddedAt: string;
};

const defaultShelfDays: Record<string, number> = {
  冷藏: 7,
  冷冻: 30,
  速食柜: 90,
  零食车: 60,
};

function normalizedKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function suggestionKey(transaction: InventoryTransaction) {
  return normalizedKey(transaction.ingredientId || transaction.itemName);
}

function pickMostCommon<T>(
  values: T[],
  keyForValue: (value: T) => string,
  dateForValue: (value: T) => string
) {
  const options = new Map<string, { value: T; count: number; lastUsedAt: string }>();

  values.forEach((value) => {
    const key = keyForValue(value);
    const usedAt = dateForValue(value);
    const existing = options.get(key);
    if (!existing) {
      options.set(key, { value, count: 1, lastUsedAt: usedAt });
      return;
    }
    existing.count += 1;
    if (usedAt > existing.lastUsedAt) {
      existing.value = value;
      existing.lastUsedAt = usedAt;
    }
  });

  return [...options.values()].sort(
    (a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt)
  )[0]?.value;
}

function shelfDaysForItem(item: InventoryItem | undefined) {
  if (item?.expiryDate && item.purchaseDate) {
    const purchaseTime = new Date(`${item.purchaseDate}T12:00:00`).getTime();
    const expiryTime = new Date(`${item.expiryDate}T12:00:00`).getTime();
    const duration = Math.round((expiryTime - purchaseTime) / 86_400_000);
    if (Number.isFinite(duration) && duration > 0) return duration;
  }
  return defaultShelfDays[item?.storage ?? '冷藏'] ?? 30;
}

function findItemSnapshot(
  transactions: InventoryTransaction[],
  inventory: InventoryItem[],
  deletedInventory: DeletedInventoryRecord[]
) {
  const snapshots = [
    ...inventory,
    ...deletedInventory
      .slice()
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
      .map((record) => record.item),
  ];
  const newestTransaction = transactions
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const exactItem = newestTransaction?.itemId
    ? snapshots.find((item) => item.id === newestTransaction.itemId)
    : undefined;
  if (exactItem) return exactItem;

  const ingredientKey = normalizedKey(newestTransaction?.ingredientId ?? '');
  const nameKey = normalizedKey(newestTransaction?.itemName ?? '');
  return snapshots
    .filter(
      (item) =>
        (ingredientKey && normalizedKey(item.ingredientId ?? '') === ingredientKey) ||
        normalizedKey(item.name) === nameKey
    )
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))[0];
}

export function buildQuickInventorySuggestions(
  transactions: InventoryTransaction[],
  inventory: InventoryItem[],
  deletedInventory: DeletedInventoryRecord[],
  limit = 6
): QuickInventorySuggestion[] {
  if (limit <= 0) return [];

  const groups = new Map<string, AdditionGroup>();
  transactions
    .filter(
      (transaction) =>
        transaction.reason === 'added' &&
        transaction.itemName.trim().length > 0 &&
        Number.isFinite(transaction.amount) &&
        transaction.amount > 0
    )
    .forEach((transaction) => {
      const key = suggestionKey(transaction);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          transactions: [transaction],
          addedCount: 1,
          lastAddedAt: transaction.createdAt,
        });
        return;
      }
      existing.transactions.push(transaction);
      existing.addedCount += 1;
      if (transaction.createdAt > existing.lastAddedAt) {
        existing.lastAddedAt = transaction.createdAt;
      }
    });

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.addedCount - a.addedCount || b.lastAddedAt.localeCompare(a.lastAddedAt)
    )
    .slice(0, limit)
    .map((group) => {
      const preferredUnitTransaction = pickMostCommon(
        group.transactions,
        (transaction) => normalizedKey(transaction.unit),
        (transaction) => transaction.createdAt
      ) ?? group.transactions[0];
      const preferredUnit = preferredUnitTransaction.unit;
      const transactionsForUnit = group.transactions.filter(
        (transaction) => normalizedKey(transaction.unit) === normalizedKey(preferredUnit)
      );
      const preferredQuantityTransaction = pickMostCommon(
        transactionsForUnit,
        (transaction) => String(Math.round(transaction.amount * 1000) / 1000),
        (transaction) => transaction.createdAt
      ) ?? preferredUnitTransaction;
      const item = findItemSnapshot(group.transactions, inventory, deletedInventory);
      const newestTransaction = group.transactions
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

      return {
        name: item?.name ?? newestTransaction.itemName,
        emoji: item?.emoji ?? '📦',
        library: item?.library ?? '食材',
        storage: item?.storage ?? '冷藏',
        unit: preferredUnit,
        quantity: preferredQuantityTransaction.amount,
        shelfDays: shelfDaysForItem(item),
        volumeMlPerUnit: item?.volumeMlPerUnit,
        addedCount: group.addedCount,
        lastAddedAt: group.lastAddedAt,
      };
    });
}
