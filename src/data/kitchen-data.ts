export type StorageLocation = string;
export type InventoryLibrary = string;

export type InventoryLibraryDefinition = {
  key: InventoryLibrary;
  label: string;
  emoji: string;
  description: string;
  color: string;
};

export const initialStorageLocations: StorageLocation[] = ['冷藏', '冷冻', '速食柜', '零食车'];

export const inventoryLibraries: InventoryLibraryDefinition[] = [
  { key: '食材', label: '食材库', emoji: '🥬', description: '做饭需要的基础食材', color: '#3D7F68' },
  { key: '甜品', label: '甜品库', emoji: '🍰', description: '蛋糕、布丁和冷藏甜点', color: '#B95D7D' },
  { key: '零食', label: '零食库', emoji: '🍿', description: '饼干、坚果和休闲食品', color: '#C77B2D' },
  { key: '饮料', label: '饮料库', emoji: '🥤', description: '牛奶、果汁和日常饮品', color: '#3578A8' },
  { key: '速食', label: '速食库', emoji: '🍱', description: '方便食品、冷冻主食和即食餐', color: '#735C9B' },
];

export type InventoryItem = {
  id: string;
  name: string;
  emoji: string;
  library: InventoryLibrary;
  category: string;
  quantity: number;
  unit: string;
  storage: StorageLocation;
  daysLeft: number;
  purchaseDate: string;
  expiryDate?: string;
  cookingSuggestions?: string[];
  volumeMlPerUnit?: number;
  ingredientId?: string;
  batchId?: string;
  barcode?: string;
};

function dateFromToday(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function daysUntilDate(dateString: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export type RecipeIngredient = {
  name: string;
  amount: number;
  unit: string;
  ingredientId?: string;
};

export type InventoryTransaction = {
  id: string;
  itemId?: string;
  ingredientId: string;
  itemName: string;
  amount: number;
  unit: string;
  reason: 'added' | 'adjusted' | 'cooked' | 'deleted' | 'restored';
  recipeId?: string;
  createdAt: string;
};

export type CookingHistoryUsage = {
  itemId: string;
  itemName: string;
  amount: number;
  amountBase: number;
  dimension: string;
  unit: string;
  itemSnapshot: InventoryItem;
};

export type CookingHistoryRecord = {
  id: string;
  recipeId: string;
  recipeName: string;
  recipeEmoji: string;
  servings: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  completedAt: string;
  usages: CookingHistoryUsage[];
  mealRecordId: string;
  mealFoods: string;
  mealFoodsEn: string;
  carbsGrams: number;
};

export type Recipe = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  timeMinutes: number;
  difficulty: '简单' | '适中';
  category: string;
  tags?: string[];
  servings: number;
  carbsPerServing: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  stepsEn: string[];
  stepTimers?: number[];
  tip: string;
  tipEn: string;
};

export const initialInventory: InventoryItem[] = [
  {
    id: 'tofu-1',
    name: '嫩豆腐',
    emoji: '◻️',
    library: '食材',
    category: '豆制品',
    quantity: 300,
    unit: '克',
    storage: '冷藏',
    daysLeft: 1,
    purchaseDate: dateFromToday(-1),
    expiryDate: dateFromToday(1),
    cookingSuggestions: ['家常麻婆豆腐', '菌菇豆腐汤', '香煎豆腐'],
  },
  {
    id: 'tomato-1',
    name: '番茄',
    emoji: '🍅',
    library: '食材',
    category: '蔬菜',
    quantity: 4,
    unit: '个',
    storage: '冷藏',
    daysLeft: 2,
    purchaseDate: dateFromToday(-2),
    expiryDate: dateFromToday(2),
    cookingSuggestions: ['番茄炒蛋', '番茄鸡蛋面', '番茄炖牛腩'],
  },
  {
    id: 'chicken-1',
    name: '鸡腿肉',
    emoji: '🍗',
    library: '食材',
    category: '肉类',
    quantity: 450,
    unit: '克',
    storage: '冷藏',
    daysLeft: 2,
    purchaseDate: dateFromToday(-1),
    expiryDate: dateFromToday(2),
    cookingSuggestions: ['鸡肉蔬菜焖饭', '照烧鸡腿', '香煎鸡腿排'],
  },
  {
    id: 'bokchoy-1',
    name: '小白菜',
    emoji: '🥬',
    library: '食材',
    category: '蔬菜',
    quantity: 1,
    unit: '把',
    storage: '冷藏',
    daysLeft: 3,
    purchaseDate: dateFromToday(-1),
    expiryDate: dateFromToday(3),
    cookingSuggestions: ['青菜鸡蛋面', '蒜蓉小白菜', '青菜豆腐汤'],
  },
  {
    id: 'carrot-1',
    name: '胡萝卜',
    emoji: '🥕',
    library: '食材',
    category: '蔬菜',
    quantity: 3,
    unit: '根',
    storage: '冷藏',
    daysLeft: 6,
    purchaseDate: dateFromToday(-2),
    expiryDate: dateFromToday(6),
    cookingSuggestions: ['胡萝卜炒蛋', '咖喱杂蔬', '鸡肉蔬菜焖饭'],
  },
  {
    id: 'eggs-1',
    name: '鸡蛋',
    emoji: '🥚',
    library: '食材',
    category: '蛋奶',
    quantity: 8,
    unit: '个',
    storage: '冷藏',
    daysLeft: 9,
    purchaseDate: dateFromToday(-5),
    expiryDate: dateFromToday(9),
    cookingSuggestions: ['番茄炒蛋', '溏心蛋', '青菜鸡蛋面'],
  },
  {
    id: 'onion-1',
    name: '洋葱',
    emoji: '🧅',
    library: '食材',
    category: '蔬菜',
    quantity: 2,
    unit: '个',
    storage: '冷藏',
    daysLeft: 18,
    purchaseDate: dateFromToday(-4),
    expiryDate: dateFromToday(18),
    cookingSuggestions: ['洋葱炒蛋', '咖喱饭', '洋葱鸡肉焖饭'],
  },
  {
    id: 'noodles-1',
    name: '挂面',
    emoji: '🍜',
    library: '食材',
    category: '主食',
    quantity: 500,
    unit: '克',
    storage: '速食柜',
    daysLeft: 90,
    purchaseDate: dateFromToday(-30),
    expiryDate: dateFromToday(90),
    cookingSuggestions: ['青菜鸡蛋面', '番茄汤面', '葱油拌面'],
  },
  {
    id: 'rice-1',
    name: '大米',
    emoji: '🍚',
    library: '食材',
    category: '主食',
    quantity: 1500,
    unit: '克',
    storage: '速食柜',
    daysLeft: 120,
    purchaseDate: dateFromToday(-20),
    expiryDate: dateFromToday(120),
    cookingSuggestions: ['鸡肉蔬菜焖饭', '蛋炒饭', '咖喱饭'],
  },
  {
    id: 'pudding-1',
    name: '焦糖布丁',
    emoji: '🍮',
    library: '甜品',
    category: '冷藏甜点',
    quantity: 2,
    unit: '杯',
    storage: '冷藏',
    daysLeft: 2,
    purchaseDate: dateFromToday(-1),
    expiryDate: dateFromToday(2),
  },
  {
    id: 'cake-1',
    name: '芝士蛋糕',
    emoji: '🍰',
    library: '甜品',
    category: '蛋糕',
    quantity: 3,
    unit: '块',
    storage: '冷藏',
    daysLeft: 4,
    purchaseDate: dateFromToday(-1),
    expiryDate: dateFromToday(4),
  },
  {
    id: 'crackers-1',
    name: '海盐苏打饼干',
    emoji: '🍘',
    library: '零食',
    category: '饼干',
    quantity: 1,
    unit: '盒',
    storage: '零食车',
    daysLeft: 25,
    purchaseDate: dateFromToday(-8),
    expiryDate: dateFromToday(25),
  },
  {
    id: 'nuts-1',
    name: '每日坚果',
    emoji: '🥜',
    library: '零食',
    category: '坚果',
    quantity: 6,
    unit: '袋',
    storage: '零食车',
    daysLeft: 45,
    purchaseDate: dateFromToday(-5),
    expiryDate: dateFromToday(45),
  },
  {
    id: 'milk-1',
    name: '鲜牛奶',
    emoji: '🥛',
    library: '饮料',
    category: '乳饮',
    quantity: 1,
    unit: '盒',
    storage: '冷藏',
    daysLeft: 3,
    purchaseDate: dateFromToday(-1),
    expiryDate: dateFromToday(3),
    volumeMlPerUnit: 950,
  },
  {
    id: 'juice-1',
    name: '橙汁',
    emoji: '🧃',
    library: '饮料',
    category: '果汁',
    quantity: 2,
    unit: '瓶',
    storage: '冷藏',
    daysLeft: 7,
    purchaseDate: dateFromToday(-1),
    expiryDate: dateFromToday(7),
    volumeMlPerUnit: 450,
  },
  {
    id: 'sparkling-water-1',
    name: '无糖气泡水',
    emoji: '🫧',
    library: '饮料',
    category: '汽水',
    quantity: 6,
    unit: '罐',
    storage: '零食车',
    daysLeft: 120,
    purchaseDate: dateFromToday(-10),
    expiryDate: dateFromToday(120),
    volumeMlPerUnit: 330,
  },
  {
    id: 'instant-dumpling-1',
    name: '速冻水饺',
    emoji: '🥟',
    library: '速食',
    category: '冷冻速食',
    quantity: 1,
    unit: '袋',
    storage: '冷冻',
    daysLeft: 45,
    purchaseDate: dateFromToday(-10),
    expiryDate: dateFromToday(45),
  },
  {
    id: 'self-heating-rice-1',
    name: '自热米饭',
    emoji: '🍱',
    library: '速食',
    category: '即食主食',
    quantity: 2,
    unit: '盒',
    storage: '速食柜',
    daysLeft: 90,
    purchaseDate: dateFromToday(-15),
    expiryDate: dateFromToday(90),
  },
];

export const recipes: Recipe[] = [
  {
    id: 'tomato-eggs',
    name: '番茄炒蛋',
    emoji: '🍳',
    description: '酸甜下饭，优先消耗快到期的番茄。',
    timeMinutes: 15,
    difficulty: '简单',
    category: '快手菜',
    tags: ['快手', '家常', '高蛋白'],
    servings: 2,
    carbsPerServing: 18,
    ingredients: [
      { name: '番茄', amount: 2, unit: '个' },
      { name: '鸡蛋', amount: 3, unit: '个' },
    ],
    steps: ['番茄切块，鸡蛋加入少许盐后打散。', '热锅放油，将鸡蛋炒至刚凝固后盛出。', '原锅炒软番茄，加入鸡蛋快速翻匀并调味。'],
    stepsEn: ['Cut the tomatoes and whisk the eggs with a pinch of salt.', 'Scramble the eggs until just set, then remove from the pan.', 'Soften the tomatoes, return the eggs, season, and toss briefly.'],
    stepTimers: [0, 90, 120],
    tip: '番茄出汁后再放回鸡蛋，口感会更嫩。',
    tipEn: 'Return the eggs only after the tomatoes release their juices for a softer texture.',
  },
  {
    id: 'chicken-rice',
    name: '鸡肉蔬菜焖饭',
    emoji: '🍲',
    description: '一锅完成主食和蔬菜，适合工作日晚餐。',
    timeMinutes: 35,
    difficulty: '简单',
    category: '一锅料理',
    tags: ['一锅', '工作日晚餐', '高蛋白'],
    servings: 3,
    carbsPerServing: 72,
    ingredients: [
      { name: '鸡腿肉', amount: 300, unit: '克' },
      { name: '大米', amount: 300, unit: '克' },
      { name: '胡萝卜', amount: 1, unit: '根' },
      { name: '洋葱', amount: 1, unit: '个' },
    ],
    steps: ['鸡腿肉切块，胡萝卜和洋葱切丁。', '锅中煎香鸡肉和洋葱，加入胡萝卜翻炒。', '加入淘洗后的大米和适量水，焖煮至米饭熟透。', '关火焖五分钟，再翻拌均匀。'],
    stepsEn: ['Cut the chicken into chunks and dice the carrot and onion.', 'Brown the chicken and onion, then stir in the carrot.', 'Add rinsed rice and water, cover, and cook until tender.', 'Rest covered for five minutes, then fluff and serve.'],
    stepTimers: [0, 300, 1800, 300],
    tip: '鸡肉先煎出焦香，一锅饭的层次会更丰富。',
    tipEn: 'Browning the chicken first gives the whole pot a deeper flavor.',
  },
  {
    id: 'mapo-tofu',
    name: '家常麻婆豆腐',
    emoji: '🌶️',
    description: '用掉今天最需要处理的豆腐。',
    timeMinutes: 20,
    difficulty: '适中',
    category: '下饭菜',
    tags: ['下饭', '家常', '微辣'],
    servings: 2,
    carbsPerServing: 16,
    ingredients: [
      { name: '嫩豆腐', amount: 300, unit: '克' },
      { name: '肉末', amount: 120, unit: '克' },
      { name: '豆瓣酱', amount: 1, unit: '勺' },
    ],
    steps: ['豆腐切块，用淡盐水浸泡五分钟。', '炒香肉末和豆瓣酱，加入少量水煮开。', '放入豆腐小火煮入味，轻推避免破碎。', '勾薄芡后撒上葱花或花椒粉。'],
    stepsEn: ['Cube the tofu and soak it briefly in lightly salted water.', 'Cook the mince and chili bean paste, then add a little water.', 'Gently simmer the tofu until seasoned through.', 'Thicken lightly and finish with scallion or Sichuan pepper.'],
    stepTimers: [300, 180, 300, 60],
    tip: '豆腐下锅后用锅铲轻推，不要大力翻炒。',
    tipEn: 'Gently nudge the tofu with a spatula instead of stirring vigorously.',
  },
  {
    id: 'bokchoy-noodles',
    name: '青菜鸡蛋面',
    emoji: '🥢',
    description: '清爽暖胃，十几分钟就能上桌。',
    timeMinutes: 18,
    difficulty: '简单',
    category: '面食',
    tags: ['暖胃', '快手', '家常'],
    servings: 2,
    carbsPerServing: 78,
    ingredients: [
      { name: '挂面', amount: 200, unit: '克' },
      { name: '小白菜', amount: 1, unit: '把' },
      { name: '鸡蛋', amount: 2, unit: '个' },
    ],
    steps: ['烧开一锅水，先将鸡蛋煮成荷包蛋。', '放入挂面煮至接近熟透。', '加入小白菜，再煮约一分钟。', '用盐、香油或酱油调味后装碗。'],
    stepsEn: ['Bring water to a boil and poach the eggs.', 'Add the noodles and cook until nearly tender.', 'Add the bok choy and cook for about one more minute.', 'Season with salt, sesame oil, or soy sauce and serve.'],
    stepTimers: [0, 300, 60, 0],
    tip: '青菜最后一分钟再放，可以保持翠绿和脆嫩。',
    tipEn: 'Add the greens during the final minute so they stay bright and tender.',
  },
  {
    id: 'banana-oat-cookies',
    name: '香蕉燕麦软曲奇',
    emoji: '🍪',
    description: '少糖、柔软，适合早餐或下午加餐。',
    timeMinutes: 28,
    difficulty: '简单',
    category: '烘焙谱',
    tags: ['烘焙', '甜点', '少糖'],
    servings: 6,
    carbsPerServing: 21,
    ingredients: [
      { name: '香蕉', amount: 2, unit: '个' },
      { name: '燕麦片', amount: 160, unit: '克' },
      { name: '鸡蛋', amount: 1, unit: '个' },
    ],
    steps: ['烤箱预热至 175°C，烤盘铺烘焙纸。', '香蕉压成泥，与鸡蛋搅拌均匀。', '加入燕麦片拌匀，静置五分钟。', '分成六份压成小圆饼，烘烤约十五分钟。'],
    stepsEn: ['Preheat the oven to 175°C and line a tray.', 'Mash the bananas and mix with the egg.', 'Stir in the oats and rest for five minutes.', 'Shape six cookies and bake for about fifteen minutes.'],
    stepTimers: [0, 0, 300, 900],
    tip: '表面刚变金黄就取出，放凉后会更有嚼劲。',
    tipEn: 'Remove them once lightly golden; they become chewier as they cool.',
  },
  {
    id: 'blueberry-yogurt-muffins',
    name: '蓝莓酸奶玛芬',
    emoji: '🧁',
    description: '酸甜松软，一次烤好一周的早餐点心。',
    timeMinutes: 38,
    difficulty: '适中',
    category: '烘焙谱',
    tags: ['烘焙', '早餐', '甜点'],
    servings: 6,
    carbsPerServing: 34,
    ingredients: [
      { name: '低筋面粉', amount: 180, unit: '克' },
      { name: '蓝莓', amount: 100, unit: '克' },
      { name: '酸奶', amount: 120, unit: '克' },
      { name: '鸡蛋', amount: 1, unit: '个' },
    ],
    steps: ['烤箱预热至 180°C，将纸托放入模具。', '鸡蛋与酸奶搅匀，再筛入低筋面粉。', '轻轻拌入蓝莓，面糊装至纸托八分满。', '烘烤约二十二分钟，取出放凉。'],
    stepsEn: ['Preheat the oven to 180°C and line the muffin tin.', 'Whisk the egg and yogurt, then sift in the flour.', 'Fold in the blueberries and fill each cup three-quarters full.', 'Bake for about twenty-two minutes, then cool.'],
    stepTimers: [0, 0, 0, 1320],
    tip: '面糊看不到干粉后就停手，过度搅拌会让玛芬变硬。',
    tipEn: 'Stop mixing once no dry flour remains to keep the muffins tender.',
  },
];

export function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
}
