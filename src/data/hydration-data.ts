export type BeverageDefinition = {
  key: string;
  emoji: string;
  nameZh: string;
  nameEn: string;
  aliases: string[];
  retentionIndex: number;
  evidence: 'study' | 'blend-estimate';
  noteZh: string;
  noteEn: string;
};

export const hydrationStudyUrl = 'https://pubmed.ncbi.nlm.nih.gov/26702122/';
export const fluidGuidanceUrl =
  'https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/';
export const nutrientReferenceUrl =
  'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients.html';

export const beverageLibrary: BeverageDefinition[] = [
  {
    key: 'water',
    emoji: '💧',
    nameZh: '白水',
    nameEn: 'Water',
    aliases: ['水', '矿泉水', '纯净水', 'water', 'still water'],
    retentionIndex: 1,
    evidence: 'study',
    noteZh: '作为短时水分留存力的基准。',
    noteEn: 'The baseline for short-term fluid retention.',
  },
  {
    key: 'sparkling-water',
    emoji: '🫧',
    nameZh: '无糖气泡水',
    nameEn: 'Sparkling water',
    aliases: ['苏打水', '气泡水', 'sparkling', 'soda water'],
    retentionIndex: 1,
    evidence: 'study',
    noteZh: '研究中的 4 小时尿量与白水无显著差异。',
    noteEn: 'Four-hour urine output did not differ significantly from water.',
  },
  {
    key: 'coffee',
    emoji: '☕️',
    nameZh: '黑咖啡',
    nameEn: 'Black coffee',
    aliases: ['美式', '咖啡', 'americano', 'coffee'],
    retentionIndex: 1,
    evidence: 'study',
    noteZh: '适量咖啡也计入饮水量；研究中与白水无显著差异。',
    noteEn: 'Moderate coffee counts as fluid; the study found no significant difference from water.',
  },
  {
    key: 'tea',
    emoji: '🍵',
    nameZh: '茶',
    nameEn: 'Tea',
    aliases: ['绿茶', '红茶', '乌龙茶', 'tea', 'green tea', 'black tea'],
    retentionIndex: 1,
    evidence: 'study',
    noteZh: '无糖茶可计入饮水量；研究中与白水无显著差异。',
    noteEn: 'Unsweetened tea counts as fluid; the study found no significant difference from water.',
  },
  {
    key: 'milk',
    emoji: '🥛',
    nameZh: '牛奶',
    nameEn: 'Milk',
    aliases: ['全脂奶', '脱脂奶', '鲜奶', 'milk', 'skim milk', 'whole milk'],
    retentionIndex: 1.5,
    evidence: 'study',
    noteZh: '该试验中牛奶 2 小时水合指数约为白水的 1.5 倍。',
    noteEn: 'Milk had a two-hour hydration index of about 1.5 versus water in the trial.',
  },
  {
    key: 'latte',
    emoji: '☕️',
    nameZh: '拿铁 / 牛奶咖啡',
    nameEn: 'Latte / milk coffee',
    aliases: ['拿铁', '奶咖', '牛奶咖啡', 'latte', 'milk coffee', 'cafe au lait'],
    retentionIndex: 1.25,
    evidence: 'blend-estimate',
    noteZh: '按约一半咖啡、一半牛奶估算；实际会随配方变化。',
    noteEn: 'Estimated from a roughly half-coffee, half-milk recipe; recipes vary.',
  },
  {
    key: 'orange-juice',
    emoji: '🍊',
    nameZh: '橙汁',
    nameEn: 'Orange juice',
    aliases: ['果汁', '橙汁', 'orange juice', 'juice'],
    retentionIndex: 1,
    evidence: 'study',
    noteZh: '研究中与白水无显著差异；含糖饮料仍需留意糖分。',
    noteEn: 'No significant difference from water in the trial; sugars still matter.',
  },
  {
    key: 'sports-drink',
    emoji: '⚡️',
    nameZh: '运动饮料',
    nameEn: 'Sports drink',
    aliases: ['电解质饮料', '运动饮料', 'sports drink', 'electrolyte drink'],
    retentionIndex: 1,
    evidence: 'study',
    noteZh: '研究中与白水无显著差异；日常饮用需留意糖和钠。',
    noteEn: 'No significant difference from water in the trial; consider sugar and sodium.',
  },
  {
    key: 'cola',
    emoji: '🥤',
    nameZh: '可乐',
    nameEn: 'Cola',
    aliases: ['汽水', '可乐', 'cola', 'soda', 'soft drink'],
    retentionIndex: 1,
    evidence: 'study',
    noteZh: '可计入饮水量，但不代表营养上等同白水。',
    noteEn: 'It counts as fluid, but is not nutritionally equivalent to water.',
  },
  {
    key: 'ors',
    emoji: '🧃',
    nameZh: '口服补液盐',
    nameEn: 'Oral rehydration solution',
    aliases: ['补液盐', '口服补液', 'ors', 'oral rehydration'],
    retentionIndex: 1.54,
    evidence: 'study',
    noteZh: '试验中的水合指数约 1.54；应按产品或医疗说明使用。',
    noteEn: 'Hydration index was about 1.54 in the trial; follow product or medical directions.',
  },
];

export function localizeBeverage(beverage: BeverageDefinition, language: 'zh' | 'en') {
  return language === 'en' ? beverage.nameEn : beverage.nameZh;
}

export function estimateRetainedWater(volumeMl: number, retentionIndex: number) {
  return Math.round(volumeMl * retentionIndex);
}
