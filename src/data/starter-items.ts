import type { InventoryLibrary, StorageLocation } from '@/data/kitchen-data';

export type StarterItem = {
  name: string;
  emoji: string;
  quantity: number;
  unit: string;
  library: InventoryLibrary;
  storage: StorageLocation;
  /** 默认保质天数（从今天算起），用于自动填到期日 */
  shelfDays: number;
};

/** 库存很少时显示的「快速添加」常用食材，一点就加入，之后可以在详情里改 */
export const STARTER_ITEMS: readonly StarterItem[] = [
  { name: '鸡蛋', emoji: '🥚', quantity: 10, unit: '个', library: '食材', storage: '冷藏', shelfDays: 21 },
  { name: '鲜牛奶', emoji: '🥛', quantity: 1, unit: '盒', library: '饮料', storage: '冷藏', shelfDays: 7 },
  { name: '番茄', emoji: '🍅', quantity: 3, unit: '个', library: '食材', storage: '冷藏', shelfDays: 7 },
  { name: '小葱', emoji: '🌱', quantity: 1, unit: '把', library: '食材', storage: '冷藏', shelfDays: 5 },
  { name: '大蒜', emoji: '🧄', quantity: 1, unit: '头', library: '食材', storage: '速食柜', shelfDays: 30 },
  { name: '大米', emoji: '🍚', quantity: 1000, unit: '克', library: '食材', storage: '速食柜', shelfDays: 180 },
  { name: '嫩豆腐', emoji: '🧈', quantity: 1, unit: '盒', library: '食材', storage: '冷藏', shelfDays: 4 },
];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 生成可以直接传给 addInventoryItem 的新库存 */
export function buildStarterInventoryItem(item: StarterItem, today = new Date()) {
  const expiry = new Date(today);
  expiry.setDate(expiry.getDate() + item.shelfDays);
  return {
    name: item.name,
    emoji: item.emoji,
    quantity: item.quantity,
    unit: item.unit,
    library: item.library,
    storage: item.storage,
    purchaseDate: dateKey(today),
    expiryDate: dateKey(expiry),
  };
}

/** 还没在库存里的常用食材（按名称判断，忽略已用完的） */
export function availableStarterItems(inStockNames: readonly string[]) {
  const stocked = new Set(inStockNames.map((name) => name.trim()));
  return STARTER_ITEMS.filter((item) => !stocked.has(item.name));
}
