import type { AppLanguage } from '@/context/language-context';
import { localizeContent } from '@/data/content-translations';
import type { InventoryLibrary, StorageLocation } from '@/data/kitchen-data';

const healthCanadaUrl =
  'https://www.canada.ca/en/health-canada/services/general-food-safety-tips/safe-food-storage.html';
const foodKeeperUrl = 'https://www.foodsafety.gov/keep-food-safe/foodkeeper-app';
const fdaStorageUrl =
  'https://www.fda.gov/consumers/consumer-updates/are-you-storing-food-safely';

type StorageGuidance = {
  rangeLabel: string;
  recommendedDays?: number;
  note: string;
};

type ShelfLifeRule = {
  keywords: string[];
  label: string;
  guidance: Partial<Record<'冷藏' | '冷冻', StorageGuidance>>;
};

export type ShelfLifeSuggestion = {
  title: string;
  rangeLabel: string;
  recommendedDays?: number;
  note: string;
  sourceLabel: string;
  sourceUrl: string;
  matched: boolean;
};

const rules: ShelfLifeRule[] = [
  {
    keywords: ['熟鸡蛋', '水煮蛋', '卤蛋', 'cooked egg', 'hard-boiled egg', 'boiled egg'],
    label: '熟鸡蛋',
    guidance: {
      冷藏: { rangeLabel: '约 1 周', recommendedDays: 7, note: '冷藏温度应保持在 4°C 或以下。' },
    },
  },
  {
    keywords: ['鸡蛋', '鸭蛋', '鲜蛋', 'egg', 'duck egg', 'fresh egg'],
    label: '带壳鲜蛋',
    guidance: {
      冷藏: {
        rangeLabel: '3–4 周',
        recommendedDays: 21,
        note: '按建议范围下限设置提醒；包装日期更早时应优先采用包装日期。',
      },
    },
  },
  {
    keywords: ['肉末', '肉馅', '绞肉', '碎肉', '汉堡肉', 'ground meat', 'minced meat', 'burger patty'],
    label: '生肉馅',
    guidance: {
      冷藏: { rangeLabel: '1–2 天', recommendedDays: 1, note: '建议尽快烹调或转入冷冻。' },
      冷冻: {
        rangeLabel: '2–3 个月（品质）',
        recommendedDays: 60,
        note: '冷冻期限主要用于维持品质。',
      },
    },
  },
  {
    keywords: ['鸡腿', '鸡胸', '鸡翅', '鸡肉', '火鸡', '鸭肉', 'chicken', 'turkey', 'duck'],
    label: '生鲜禽肉',
    guidance: {
      冷藏: { rangeLabel: '2–3 天', recommendedDays: 2, note: '生禽肉应密封并放在冰箱底层。' },
      冷冻: {
        rangeLabel: '约 6 个月（分切禽肉）',
        recommendedDays: 180,
        note: '整只禽肉可更久；此处按分切禽肉保守设置。',
      },
    },
  },
  {
    keywords: ['牛肉', '猪肉', '羊肉', '牛排', '猪排', '羊排', 'beef', 'pork', 'lamb', 'steak', 'chop'],
    label: '生鲜红肉',
    guidance: {
      冷藏: { rangeLabel: '2–4 天', recommendedDays: 2, note: '建议按范围下限设置提醒。' },
      冷冻: {
        rangeLabel: '8–12 个月（品质）',
        recommendedDays: 240,
        note: '不同肉类和切法会有差异。',
      },
    },
  },
  {
    keywords: ['虾', '扇贝', '蛤蜊', '螃蟹', '龙虾', '贝类', 'shrimp', 'prawn', 'scallop', 'clam', 'crab', 'lobster', 'shellfish'],
    label: '鲜贝类与虾',
    guidance: {
      冷藏: { rangeLabel: '1–2 天', recommendedDays: 1, note: '活贝类可能更短，应尽快处理。' },
      冷冻: {
        rangeLabel: '2–4 个月（品质）',
        recommendedDays: 60,
        note: '密封冷冻以减少品质损失。',
      },
    },
  },
  {
    keywords: ['鱼', '三文鱼', '鳕鱼', '鲈鱼', '金枪鱼', 'fish', 'salmon', 'cod', 'bass', 'tuna'],
    label: '鲜鱼',
    guidance: {
      冷藏: { rangeLabel: '3–4 天', recommendedDays: 3, note: '应密封冷藏并避免交叉污染。' },
      冷冻: {
        rangeLabel: '2–6 个月（品质）',
        recommendedDays: 60,
        note: '脂肪较多的鱼通常建议更短。',
      },
    },
  },
  {
    keywords: ['生香肠', '鲜香肠', '生腊肠', 'raw sausage', 'fresh sausage'],
    label: '生香肠',
    guidance: {
      冷藏: { rangeLabel: '1–2 天', recommendedDays: 1, note: '建议尽快烹调或冷冻。' },
      冷冻: { rangeLabel: '1–2 个月（品质）', recommendedDays: 30, note: '保持密封冷冻。' },
    },
  },
  {
    keywords: ['培根', 'bacon'],
    label: '培根',
    guidance: {
      冷藏: { rangeLabel: '约 1 周', recommendedDays: 7, note: '开封后应密封冷藏。' },
      冷冻: { rangeLabel: '约 1 个月（品质）', recommendedDays: 30, note: '冷冻期限用于品质提醒。' },
    },
  },
  {
    keywords: ['剩菜', '剩饭', '熟食', '炒饭', '焖饭', '炖菜', '熟肉', 'leftover', 'cooked rice', 'stew', 'cooked meat'],
    label: '熟食或剩菜',
    guidance: {
      冷藏: { rangeLabel: '3–4 天', recommendedDays: 3, note: '应尽快降温并用干净容器冷藏。' },
      冷冻: {
        rangeLabel: '2–3 个月（品质）',
        recommendedDays: 60,
        note: '分装密封后再冷冻。',
      },
    },
  },
  {
    keywords: ['汤', '高汤', '肉汤', '浓汤', 'soup', 'broth', 'stock'],
    label: '汤类',
    guidance: {
      冷藏: { rangeLabel: '2–3 天', recommendedDays: 2, note: '应尽快降温并密封冷藏。' },
      冷冻: { rangeLabel: '约 4 个月（品质）', recommendedDays: 120, note: '留出容器膨胀空间。' },
    },
  },
  {
    keywords: ['开封牛奶', '鲜牛奶', '牛奶', 'opened milk', 'fresh milk', 'milk'],
    label: '牛奶（开封后）',
    guidance: {
      冷藏: {
        rangeLabel: '约 3 天',
        recommendedDays: 3,
        note: '未开封时应以包装日期为准；若已开封，建议从开封日计算。',
      },
    },
  },
  {
    keywords: ['开封酸奶', '酸奶', '优格', 'opened yogurt', 'yogurt', 'yoghurt'],
    label: '酸奶（开封后）',
    guidance: {
      冷藏: {
        rangeLabel: '约 3 天',
        recommendedDays: 3,
        note: '未开封时应优先使用包装日期。',
      },
    },
  },
  {
    keywords: ['软奶酪', '软芝士', '奶油奶酪', 'soft cheese', 'cream cheese'],
    label: '软质奶酪类',
    guidance: {
      冷藏: { rangeLabel: '约 1 周', recommendedDays: 7, note: '成品甜点仍应优先遵循包装标签。' },
    },
  },
  {
    keywords: ['硬奶酪', '硬芝士', '帕玛森', 'hard cheese', 'parmesan'],
    label: '硬质奶酪',
    guidance: {
      冷藏: { rangeLabel: '最长约 10 个月', recommendedDays: 300, note: '开封和切分后通常会缩短。' },
    },
  },
  {
    keywords: ['胡萝卜', 'carrot'],
    label: '胡萝卜',
    guidance: {
      冷藏: { rangeLabel: '约 2 周', recommendedDays: 14, note: '清洗或切分后期限可能缩短。' },
    },
  },
  {
    keywords: ['生菜', '小白菜', '青菜', '油麦菜', '叶菜', 'lettuce', 'bok choy', 'leafy greens'],
    label: '叶菜',
    guidance: {
      冷藏: { rangeLabel: '3–7 天', recommendedDays: 3, note: '按较保守的范围下限设置。' },
    },
  },
  {
    keywords: ['菠菜', 'spinach'],
    label: '菠菜',
    guidance: {
      冷藏: { rangeLabel: '2–4 周', recommendedDays: 14, note: '清洗、切分或状态不佳时应缩短。' },
    },
  },
  {
    keywords: ['芹菜', 'celery'],
    label: '芹菜',
    guidance: {
      冷藏: { rangeLabel: '约 2 周', recommendedDays: 14, note: '切分后应适当缩短。' },
    },
  },
  {
    keywords: ['番茄', '西红柿', 'tomato'],
    label: '番茄',
    guidance: {
      冷藏: {
        rangeLabel: '通常不建议冷藏',
        note: '加拿大卫生部表格建议番茄不要冷藏；成熟后请尽快食用。',
      },
    },
  },
  {
    keywords: ['速冻水饺', '冷冻水饺', '冷冻餐', '冷冻便当', '冷冻披萨', 'frozen dumpling', 'frozen dinner', 'frozen meal', 'frozen pizza'],
    label: '冷冻成品餐',
    guidance: {
      冷冻: {
        rangeLabel: '3–4 个月（品质）',
        recommendedDays: 90,
        note: '保持在 −18°C 或以下，并优先遵循包装日期。',
      },
    },
  },
];

const englishShelfLifeText: Record<string, string> = {
  熟鸡蛋: 'Cooked eggs',
  带壳鲜蛋: 'Fresh shell eggs',
  生肉馅: 'Raw ground meat',
  生鲜禽肉: 'Raw poultry',
  生鲜红肉: 'Raw red meat',
  鲜贝类与虾: 'Fresh shellfish and shrimp',
  鲜鱼: 'Fresh fish',
  生香肠: 'Raw sausage',
  培根: 'Bacon',
  熟食或剩菜: 'Cooked food or leftovers',
  汤类: 'Soup',
  '牛奶（开封后）': 'Milk (after opening)',
  '酸奶（开封后）': 'Yogurt (after opening)',
  软质奶酪类: 'Soft cheese',
  硬质奶酪: 'Hard cheese',
  胡萝卜: 'Carrots',
  叶菜: 'Leafy greens',
  菠菜: 'Spinach',
  芹菜: 'Celery',
  番茄: 'Tomatoes',
  冷冻成品餐: 'Frozen prepared meals',
  '约 1 周': 'About 1 week',
  '3–4 周': '3–4 weeks',
  '1–2 天': '1–2 days',
  '2–3 个月（品质）': '2–3 months (quality)',
  '2–3 天': '2–3 days',
  '约 6 个月（分切禽肉）': 'About 6 months (poultry pieces)',
  '2–4 天': '2–4 days',
  '8–12 个月（品质）': '8–12 months (quality)',
  '2–4 个月（品质）': '2–4 months (quality)',
  '3–4 天': '3–4 days',
  '2–6 个月（品质）': '2–6 months (quality)',
  '1–2 个月（品质）': '1–2 months (quality)',
  '约 1 个月（品质）': 'About 1 month (quality)',
  '约 4 个月（品质）': 'About 4 months (quality)',
  '约 3 天': 'About 3 days',
  '最长约 10 个月': 'Up to about 10 months',
  '约 2 周': 'About 2 weeks',
  '3–7 天': '3–7 days',
  '2–4 周': '2–4 weeks',
  通常不建议冷藏: 'Refrigeration is usually not recommended',
  '3–4 个月（品质）': '3–4 months (quality)',
  '冷藏温度应保持在 4°C 或以下。': 'Keep the refrigerator at 4°C or below.',
  '按建议范围下限设置提醒；包装日期更早时应优先采用包装日期。': 'The reminder uses the lower end of the range; use an earlier package date when available.',
  '建议尽快烹调或转入冷冻。': 'Cook soon or move it to the freezer.',
  '冷冻期限主要用于维持品质。': 'Freezer times are primarily for maintaining quality.',
  '生禽肉应密封并放在冰箱底层。': 'Seal raw poultry and store it on the bottom refrigerator shelf.',
  '整只禽肉可更久；此处按分切禽肉保守设置。': 'Whole poultry may keep longer; this uses a conservative time for poultry pieces.',
  '建议按范围下限设置提醒。': 'The reminder uses the lower end of the range.',
  '不同肉类和切法会有差异。': 'Times vary by type and cut of meat.',
  '活贝类可能更短，应尽快处理。': 'Live shellfish may keep for less time and should be used soon.',
  '密封冷冻以减少品质损失。': 'Seal well before freezing to protect quality.',
  '应密封冷藏并避免交叉污染。': 'Seal, refrigerate, and prevent cross-contamination.',
  '脂肪较多的鱼通常建议更短。': 'Fatty fish generally has a shorter recommended time.',
  '建议尽快烹调或冷冻。': 'Cook or freeze as soon as possible.',
  '保持密封冷冻。': 'Keep sealed in the freezer.',
  '开封后应密封冷藏。': 'Seal and refrigerate after opening.',
  '冷冻期限用于品质提醒。': 'The freezer time is a quality reminder.',
  '应尽快降温并用干净容器冷藏。': 'Cool promptly and refrigerate in a clean container.',
  '分装密封后再冷冻。': 'Divide into portions and seal before freezing.',
  '应尽快降温并密封冷藏。': 'Cool promptly, seal, and refrigerate.',
  '留出容器膨胀空间。': 'Leave room in the container for expansion.',
  '未开封时应以包装日期为准；若已开封，建议从开封日计算。': 'Use the package date when unopened; after opening, count from the opening date.',
  '未开封时应优先使用包装日期。': 'Use the package date when unopened.',
  '成品甜点仍应优先遵循包装标签。': 'For prepared desserts, follow the package label first.',
  '开封和切分后通常会缩短。': 'Opening or cutting usually shortens this time.',
  '清洗或切分后期限可能缩短。': 'Washing or cutting may shorten this time.',
  '按较保守的范围下限设置。': 'The reminder uses the conservative lower end of the range.',
  '清洗、切分或状态不佳时应缩短。': 'Use a shorter time if washed, cut, or already deteriorating.',
  '切分后应适当缩短。': 'Use a shorter time after cutting.',
  '加拿大卫生部表格建议番茄不要冷藏；成熟后请尽快食用。': 'Health Canada advises against refrigerating tomatoes; use them soon after ripening.',
  '保持在 −18°C 或以下，并优先遵循包装日期。': 'Keep at −18°C or below and follow the package date first.',
};

function shelfLifeText(value: string, language: AppLanguage) {
  return language === 'en' ? englishShelfLifeText[value] ?? value : value;
}

export function getShelfLifeSuggestion(
  itemName: string,
  storage: StorageLocation,
  library: InventoryLibrary,
  language: AppLanguage = 'zh'
): ShelfLifeSuggestion | null {
  const normalizedName = itemName.trim().toLocaleLowerCase();
  if (!normalizedName) return null;

  const rule = rules.find((candidate) =>
    candidate.keywords.some((keyword) => normalizedName.includes(keyword.toLocaleLowerCase()))
  );
  const guidance = rule?.guidance[storage as '冷藏' | '冷冻'];

  if (rule && guidance) {
    return {
      title: `${shelfLifeText(rule.label, language)} · ${localizeContent(storage, language)}`,
      rangeLabel: shelfLifeText(guidance.rangeLabel, language),
      recommendedDays: guidance.recommendedDays,
      note: shelfLifeText(guidance.note, language),
      sourceLabel: language === 'zh' ? '加拿大卫生部保存表' : 'Health Canada storage chart',
      sourceUrl: healthCanadaUrl,
      matched: true,
    };
  }

  if (storage === '冷冻') {
    return {
      title: language === 'zh' ? '一般冷冻保存建议' : 'General freezer guidance',
      rangeLabel: language === 'zh' ? '建议先记录 3 个月（品质）' : 'Start with 3 months (quality)',
      recommendedDays: 90,
      note:
        language === 'zh'
          ? '−18°C 持续冷冻时安全期与品质期不同；包装日期应优先。'
          : 'At a constant −18°C, safety and quality windows differ; follow the package date first.',
      sourceLabel: language === 'zh' ? 'FDA 食品保存说明' : 'FDA food storage guidance',
      sourceUrl: fdaStorageUrl,
      matched: false,
    };
  }

  return {
    title:
      language === 'zh'
        ? `${library}暂未找到明确匹配`
        : `No clear match for ${localizeContent(library, language).toLocaleLowerCase()}`,
    rangeLabel: language === 'zh' ? '请优先使用包装日期' : 'Use the package date first',
    note:
      storage === '冷藏'
        ? language === 'zh'
          ? '冷藏应保持在 4°C 或以下；无法确认时不要只依靠气味或外观判断。'
          : 'Keep the refrigerator at 4°C or below; when uncertain, do not rely only on smell or appearance.'
        : language === 'zh'
          ? '常温与柜内食品受包装和开封状态影响较大，建议手动记录标签日期。'
          : 'Room-temperature and pantry foods depend heavily on packaging and opening status; record the label date manually.',
    sourceLabel: 'USDA FoodKeeper',
    sourceUrl: foodKeeperUrl,
    matched: false,
  };
}
