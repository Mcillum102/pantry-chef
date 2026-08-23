import { organizeRecipesLocally, type AiRecipeCategory } from '@/data/recipe-ai';

export type SmartInventoryItem = {
  id: string;
  name: string;
  emoji: string;
  quantity: number;
  unit: string;
  library: '食材' | '甜品' | '零食' | '饮料' | '速食';
  storage: '冷藏' | '冷冻' | '速食柜' | '零食车';
  shelfDays: number;
};

export type ImportedRecipe = {
  name: string;
  emoji: string;
  description: string;
  timeMinutes: number;
  difficulty: '简单' | '适中';
  category: AiRecipeCategory;
  servings: number;
  carbsPerServing: number;
  ingredients: { name: string; amount: number; unit: string }[];
  steps: { instruction: string; timerMinutes: number }[];
  tip: string;
};

const chineseNumbers: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

const knownUnits = ['千克', '公斤', '毫升', '克', '斤', '升', '个', '颗', '根', '把', '片', '勺', '盒', '瓶', '袋', '包', '罐', '块', '杯', '桶'];

function inventoryMetadata(name: string) {
  if (/(牛奶|豆奶|果汁|可乐|汽水|咖啡|茶|水|啤酒|红酒|饮料)/.test(name)) {
    return { emoji: '🥤', library: '饮料' as const, storage: '冷藏' as const, shelfDays: 14 };
  }
  if (/(蛋糕|布丁|冰淇淋|甜甜圈|巧克力|甜品|奶油)/.test(name)) {
    return { emoji: '🍰', library: '甜品' as const, storage: '冷藏' as const, shelfDays: 7 };
  }
  if (/(薯片|饼干|坚果|瓜子|糖果|零食|爆米花)/.test(name)) {
    return { emoji: '🍿', library: '零食' as const, storage: '零食车' as const, shelfDays: 90 };
  }
  if (/(水饺|披萨|方便面|泡面|速冻|速食|饭团|馄饨)/.test(name)) {
    return { emoji: '🍱', library: '速食' as const, storage: '冷冻' as const, shelfDays: 45 };
  }

  const emoji = /(蛋)/.test(name) ? '🥚'
    : /(番茄|西红柿)/.test(name) ? '🍅'
      : /(胡萝卜)/.test(name) ? '🥕'
        : /(鸡|鸡腿)/.test(name) ? '🍗'
          : /(牛肉|猪肉|肉)/.test(name) ? '🥩'
            : /(鱼|虾)/.test(name) ? '🐟'
              : /(菜|生菜|白菜|菠菜)/.test(name) ? '🥬'
                : /(苹果)/.test(name) ? '🍎'
                  : /(香蕉)/.test(name) ? '🍌'
                    : '🛒';
  const storage = /(冻|冰)/.test(name) ? '冷冻' as const : '冷藏' as const;
  return { emoji, library: '食材' as const, storage, shelfDays: storage === '冷冻' ? 30 : 7 };
}

export function parseInventoryTextLocally(text: string): SmartInventoryItem[] {
  const normalized = text
    .replace(/我(今天)?(刚)?(去\S{0,5})?(买了|买|采购了|采购)/g, '')
    .replace(/(还有|以及|和|另外|顺便买了)/g, '，')
    .replace(/[；;。\n]+/g, '，');

  return normalized
    .split(/[,，、]/)
    .map((part) => part.trim().replace(/^(买了|买|采购了|采购|有|了)+/, ''))
    .filter(Boolean)
    .slice(0, 30)
    .map((part, index) => {
      const unitPattern = knownUnits.join('|');
      const match = part.match(new RegExp(`^(?:(\\d+(?:\\.\\d+)?)|([一两二三四五六七八九十]))\\s*(${unitPattern})?\\s*(.+)$`));
      const quantity = match?.[1] ? Number(match[1]) : match?.[2] ? chineseNumbers[match[2]] : 1;
      const unit = match?.[3]?.replace('公斤', '千克') ?? '个';
      const name = (match?.[4] ?? part)
        .replace(/^(新鲜|一共|大概|大约|约)/, '')
        .replace(/[了呀啊]$/, '')
        .trim();
      const metadata = inventoryMetadata(name);
      return {
        id: `smart-item-${Date.now()}-${index}`,
        name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit,
        ...metadata,
      };
    })
    .filter((item) => item.name.length > 0);
}

export function fallbackRecipeFromText(text: string): ImportedRecipe {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const name = lines[0]?.slice(0, 50) || '导入的菜谱';
  const ingredientLines = lines.filter((line) => /\d|克|个|勺|适量/.test(line)).slice(0, 20);
  const stepLines = lines.filter((line) => /^(\d+[.、]|第.+步|步骤)/.test(line)).slice(0, 20);
  const ingredients = ingredientLines.map((line) => {
    const match = line.match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*(克|千克|毫升|升|个|颗|根|把|片|勺|适量)?/);
    return { name: match?.[1]?.trim() || line, amount: Number(match?.[2] || 1), unit: match?.[3] || '份' };
  });
  const steps = (stepLines.length ? stepLines : lines.slice(1)).map((line) => ({
    instruction: line.replace(/^(\d+[.、]|第.+步[:：]?|步骤\s*\d*[:：]?)/, '').trim(),
    timerMinutes: 0,
  })).filter((step) => step.instruction);
  const category = organizeRecipesLocally([{
    id: 'fallback-import', name, description: '', timeMinutes: 20,
    ingredients, steps: steps.map((step) => step.instruction),
  }])[0]?.category ?? '其他';

  return {
    name,
    emoji: category === '烘焙谱' ? '🧁' : '🍳',
    description: '从原文智能导入的菜谱，请保存前检查内容。',
    timeMinutes: 20,
    difficulty: '简单',
    category,
    servings: 2,
    carbsPerServing: 0,
    ingredients: ingredients.length ? ingredients : [{ name: '待补充食材', amount: 1, unit: '份' }],
    steps: steps.length ? steps : [{ instruction: '请根据原文补充制作步骤', timerMinutes: 0 }],
    tip: 'AI 导入内容可能有误，请在保存前检查用量和步骤。',
  };
}
