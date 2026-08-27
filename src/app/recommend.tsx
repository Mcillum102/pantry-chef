import { useMemo, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors, Spacing } from '@/constants/theme';
import { useKitchen } from '@/context/kitchen-context';
import {
  localDateKey,
  type MealRecord,
  type MealType,
  useHealth,
} from '@/context/health-context';
import { useLanguage, type AppLanguage } from '@/context/language-context';
import { formatAmount, localizeContent } from '@/data/content-translations';
import {
  beverageLibrary,
  estimateRetainedWater,
  fluidGuidanceUrl,
  hydrationStudyUrl,
  localizeBeverage,
  nutrientReferenceUrl,
} from '@/data/hydration-data';

const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const mainMealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];

const mealMeta: Record<
  MealType,
  { emoji: string; zh: string; en: string; windowZh: string; windowEn: string; defaultTime: string }
> = {
  breakfast: {
    emoji: '☀️',
    zh: '早餐',
    en: 'Breakfast',
    windowZh: '建议 07:00–09:00',
    windowEn: 'Suggested 7–9 AM',
    defaultTime: '08:00',
  },
  lunch: {
    emoji: '🍱',
    zh: '午餐',
    en: 'Lunch',
    windowZh: '建议 11:30–13:30',
    windowEn: 'Suggested 11:30 AM–1:30 PM',
    defaultTime: '12:30',
  },
  dinner: {
    emoji: '🌙',
    zh: '晚餐',
    en: 'Dinner',
    windowZh: '建议 17:30–20:00',
    windowEn: 'Suggested 5:30–8 PM',
    defaultTime: '18:30',
  },
  snack: {
    emoji: '🍎',
    zh: '加餐 / 零食',
    en: 'Snack',
    windowZh: '记录时间和份量',
    windowEn: 'Record time and portion',
    defaultTime: '15:30',
  },
};

const vegetableGroups = [
  ['番茄', '西红柿', 'tomato'],
  ['小白菜', '青菜', '生菜', 'bok choy', 'lettuce', 'leafy green'],
  ['胡萝卜', 'carrot'],
  ['洋葱', 'onion'],
];

const proteinGroups = [
  ['鸡蛋', 'egg'],
  ['牛奶', 'milk', '酸奶', 'yogurt'],
  ['鸡肉', '鸡腿', 'chicken'],
  ['豆腐', 'tofu'],
  ['坚果', 'nuts'],
];

function localizedMealField(
  record: MealRecord,
  field: 'foods' | 'note',
  language: AppLanguage
) {
  if (field === 'foods') return language === 'en' ? record.foodsEn ?? record.foods : record.foods;
  return language === 'en' ? record.noteEn ?? record.note ?? '' : record.note ?? '';
}

function isValidTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function countFoodGroups(searchText: string, groups: string[][]) {
  const normalized = searchText.toLocaleLowerCase();
  return groups.filter((keywords) => keywords.some((keyword) => normalized.includes(keyword))).length;
}

function HealthRing({
  progress,
  color,
  value,
  unit,
  label,
}: {
  progress: number;
  color: string;
  value: string;
  unit: string;
  label: string;
}) {
  const size = 86;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedProgress = Math.max(0, Math.min(progress, 1));

  return (
    <View style={styles.ringItem}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E5EBE7"
            strokeWidth={strokeWidth}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - normalizedProgress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.ringValueWrap}>
          <Text style={styles.ringValue}>{value}</Text>
          <Text style={styles.ringUnit}>{unit}</Text>
        </View>
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

export default function HealthReportScreen() {
  const { inventory, recipes, getRecipeMatch } = useKitchen();
  const {
    mealRecords: allMealRecords,
    setMealRecords,
    drinkRecords: allDrinkRecords,
    setDrinkRecords,
    plannedRecipeId,
    setPlannedRecipeId,
    dailyCarbGoal,
    dailyFluidGoal,
    setDailyGoals,
    deleteMealRecord,
    deleteDrinkRecord,
    dietaryPreferences,
    setDietaryPreferences,
  } = useHealth();
  const { language, locale, text } = useLanguage();
  const [suggestionOffset, setSuggestionOffset] = useState(0);
  const [status, setStatus] = useState<{ zh: string; en: string } | null>(null);
  const [isMealFormOpen, setIsMealFormOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>('dinner');
  const [mealTime, setMealTime] = useState(mealMeta.dinner.defaultTime);
  const [mealFoods, setMealFoods] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [mealCarbs, setMealCarbs] = useState('0');
  const [isDrinkFormOpen, setIsDrinkFormOpen] = useState(false);
  const [drinkSearch, setDrinkSearch] = useState('');
  const [selectedBeverageKey, setSelectedBeverageKey] = useState('water');
  const [drinkVolume, setDrinkVolume] = useState('250');
  const [drinkTime, setDrinkTime] = useState('16:00');
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [goalCarbs, setGoalCarbs] = useState(String(dailyCarbGoal));
  const [goalFluid, setGoalFluid] = useState(String(dailyFluidGoal));
  const [isDietaryFormOpen, setIsDietaryFormOpen] = useState(false);
  const [allergyInput, setAllergyInput] = useState((dietaryPreferences?.allergies ?? []).join('、'));
  const [avoidInput, setAvoidInput] = useState((dietaryPreferences?.avoid ?? []).join('、'));
  const [dietaryNotes, setDietaryNotes] = useState(dietaryPreferences?.notes ?? '');

  const mealRecords = useMemo(
    () => allMealRecords.filter((record) => record.date === selectedDate),
    [allMealRecords, selectedDate]
  );
  const drinkRecords = useMemo(
    () => allDrinkRecords.filter((record) => record.date === selectedDate),
    [allDrinkRecords, selectedDate]
  );
  const selectedDateObject = new Date(`${selectedDate}T12:00:00`);
  const isToday = selectedDate === localDateKey();

  const todayLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(selectedDateObject);
  const mainMealCount = mainMealTypes.filter((type) =>
    mealRecords.some((record) => record.type === type)
  ).length;
  const snackRecords = mealRecords.filter((record) => record.type === 'snack');
  const reportCompletion = Math.round((mainMealCount / mainMealTypes.length) * 100);
  const totalCarbs = mealRecords.reduce((total, record) => total + record.carbsGrams, 0);
  const totalFluid = drinkRecords.reduce((total, record) => total + record.volumeMl, 0);
  const totalPlainWater = drinkRecords
    .filter((record) => record.beverageKey === 'water')
    .reduce((total, record) => total + record.volumeMl, 0);
  const retainedWaterEstimate = drinkRecords.reduce((total, record) => {
    const beverage = beverageLibrary.find((item) => item.key === record.beverageKey);
    return total + estimateRetainedWater(record.volumeMl, beverage?.retentionIndex ?? 1);
  }, 0);
  const weeklyTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(selectedDateObject);
    date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    const carbs = allMealRecords
      .filter((record) => record.date === key)
      .reduce((total, record) => total + record.carbsGrams, 0);
    const fluid = allDrinkRecords
      .filter((record) => record.date === key)
      .reduce((total, record) => total + record.volumeMl, 0);
    return {
      key,
      label: new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date),
      carbs,
      fluid,
    };
  });
  const allFoodText = mealRecords
    .flatMap((record) => [record.foods, record.foodsEn ?? ''])
    .join(' ');
  const vegetableCount = countFoodGroups(allFoodText, vegetableGroups);
  const proteinCount = countFoodGroups(allFoodText, proteinGroups);
  const nextMealType =
    mainMealTypes.find((type) => !mealRecords.some((record) => record.type === type)) ??
    'breakfast';
  const nextMealLabel =
    mainMealCount === mainMealTypes.length
      ? text('明日早餐', "Tomorrow's breakfast")
      : text(mealMeta[nextMealType].zh, mealMeta[nextMealType].en);

  const rankedRecipes = useMemo(() => {
    const consumedText = mealRecords
      .flatMap((record) => [record.foods, record.foodsEn ?? ''])
      .join(' ')
      .toLocaleLowerCase();
    const restrictedTerms = [
      ...(dietaryPreferences?.allergies ?? []),
      ...(dietaryPreferences?.avoid ?? []),
    ].map((term) => term.trim().toLocaleLowerCase()).filter(Boolean);
    const ranked = recipes
      .map((recipe) => {
        const match = getRecipeMatch(recipe);
        const expiringNames = recipe.ingredients
          .filter((ingredient) =>
            inventory.some(
              (item) =>
                item.name === ingredient.name && item.quantity > 0 && item.daysLeft <= 3
            )
          )
          .map((ingredient) => ingredient.name);
        const urgency = expiringNames.length / recipe.ingredients.length;
        const wasConsumed = [recipe.name, localizeContent(recipe.name, 'en')].some((name) =>
          consumedText.includes(name.toLocaleLowerCase())
        );
        const varietyBonus = Math.min(recipe.ingredients.length, 4) * 2;
        const searchableRecipe = [
          recipe.name,
          localizeContent(recipe.name, 'en'),
          recipe.description,
          ...recipe.ingredients.map((ingredient) => ingredient.name),
          ...(recipe.tags ?? []),
        ].join(' ').toLocaleLowerCase();
        const excludedBy = restrictedTerms.filter((term) => searchableRecipe.includes(term));

        return {
          recipe,
          match,
          expiringNames,
          wasConsumed,
          score: match.percentage * 0.75 + urgency * 25 + varietyBonus,
          excludedBy,
        };
      })
      .filter((item) => item.excludedBy.length === 0)
      .sort((a, b) => b.score - a.score);

    const notConsumed = ranked.filter((item) => !item.wasConsumed);
    return notConsumed.length > 0 ? notConsumed : ranked;
  }, [dietaryPreferences, getRecipeMatch, inventory, mealRecords, recipes]);

  const suggestion = rankedRecipes[suggestionOffset % rankedRecipes.length];
  const plannedRecipe = recipes.find((recipe) => recipe.id === plannedRecipeId);
  const parsedMealCarbs = Number(mealCarbs);
  const parsedDrinkVolume = Number(drinkVolume);
  const selectedBeverage =
    beverageLibrary.find((item) => item.key === selectedBeverageKey) ?? beverageLibrary[0];
  const filteredBeverages = beverageLibrary.filter((beverage) => {
    const query = drinkSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    return [beverage.nameZh, beverage.nameEn, ...beverage.aliases]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query);
  });
  const validMealForm =
    mealFoods.trim().length > 0 &&
    isValidTime(mealTime) &&
    Number.isFinite(parsedMealCarbs) &&
    parsedMealCarbs >= 0;
  const validDrinkForm =
    Number.isFinite(parsedDrinkVolume) && parsedDrinkVolume > 0 && isValidTime(drinkTime);
  const validGoals =
    Number(goalCarbs) > 0 && Number(goalFluid) > 0;

  function shiftSelectedDate(offset: number) {
    const next = new Date(selectedDateObject);
    next.setDate(next.getDate() + offset);
    if (next.getTime() > new Date(`${localDateKey()}T23:59:59`).getTime()) return;
    setSelectedDate(localDateKey(next));
    setStatus(null);
  }

  function openMealForm(type: MealType, record?: MealRecord) {
    setEditingRecordId(record?.id ?? null);
    setMealType(type);
    setMealTime(record?.time ?? mealMeta[type].defaultTime);
    setMealFoods(record ? localizedMealField(record, 'foods', language) : '');
    setMealNote(record ? localizedMealField(record, 'note', language) : '');
    setMealCarbs(String(record?.carbsGrams ?? 0));
    setIsMealFormOpen(true);
  }

  function saveMealRecord() {
    if (!validMealForm) return;

    const nextRecord: MealRecord = {
      id: editingRecordId ?? `meal-${Date.now()}`,
      date: selectedDate,
      type: mealType,
      time: mealTime,
      foods: mealFoods.trim(),
      note: mealNote.trim() || undefined,
      carbsGrams: parsedMealCarbs,
    };

    setMealRecords((current) =>
      editingRecordId
        ? current.map((record) => (record.id === editingRecordId ? nextRecord : record))
        : [...current, nextRecord]
    );
    setStatus({
      zh: `已记录${mealMeta[mealType].zh}，今日报告已更新。`,
      en: `${mealMeta[mealType].en} recorded. Today's report is updated.`,
    });
    setIsMealFormOpen(false);
  }

  function openDrinkForm() {
    setDrinkSearch('');
    setSelectedBeverageKey('water');
    setDrinkVolume('250');
    setDrinkTime('16:00');
    setIsDrinkFormOpen(true);
  }

  function saveDrinkRecord() {
    if (!validDrinkForm || !selectedBeverage) return;
    setDrinkRecords((current) => [
      ...current,
      {
        id: `drink-${Date.now()}`,
        date: selectedDate,
        beverageKey: selectedBeverage.key,
        volumeMl: parsedDrinkVolume,
        time: drinkTime,
      },
    ]);
    setStatus({
      zh: `已记录 ${selectedBeverage.nameZh} ${parsedDrinkVolume}mL。`,
      en: `Logged ${selectedBeverage.nameEn.toLocaleLowerCase()} ${parsedDrinkVolume} mL.`,
    });
    setIsDrinkFormOpen(false);
  }

  function addQuickWater(volumeMl: number) {
    setDrinkRecords((current) => [
      ...current,
      {
        id: `water-${Date.now()}`,
        date: selectedDate,
        beverageKey: 'water',
        volumeMl,
        time: new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }),
      },
    ]);
    setStatus({
      zh: `已快速记录 ${volumeMl}mL 白水。`,
      en: `Quick-added ${volumeMl} mL of water.`,
    });
  }

  function planSuggestion() {
    if (!suggestion) return;
    setPlannedRecipeId(suggestion.recipe.id);
    setStatus({
      zh: `已把“${suggestion.recipe.name}”加入下一餐计划。`,
      en: `Added “${localizeContent(suggestion.recipe.name, 'en')}” to your next-meal plan.`,
    });
  }

  function saveGoals() {
    if (!validGoals) return;
    setDailyGoals({ carbs: Number(goalCarbs), fluid: Number(goalFluid) });
    setIsGoalFormOpen(false);
    setStatus({ zh: '每日摄入目标已更新。', en: 'Daily intake goals updated.' });
  }

  function saveDietaryPreferences() {
    const parse = (value: string) => value
      .split(/[、,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    setDietaryPreferences({
      allergies: parse(allergyInput),
      avoid: parse(avoidInput),
      notes: dietaryNotes.trim(),
    });
    setIsDietaryFormOpen(false);
    setSuggestionOffset(0);
    setStatus({ zh: '过敏与忌口设置已更新，推荐已重新筛选。', en: 'Dietary preferences updated and suggestions re-filtered.' });
  }

  if (!suggestion) return null;

  const { recipe, match, expiringNames } = suggestion;

  return (
    <>
      <AppScreen
        eyebrow={todayLabel}
        title={isToday ? text('今日健康报告', 'Today’s health report') : text('健康记录', 'Health history')}
        subtitle={text(
          '记录三餐和加餐，并根据今天已经吃过的内容安排下一餐。',
          'Track meals and snacks, then plan what to eat next based on today’s record.'
        )}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('记录一餐', 'Record a meal')}
            onPress={() => openMealForm(nextMealType)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Text style={styles.addButtonText}>＋</Text>
          </Pressable>
        }>
        {status ? (
          <View style={styles.successBanner}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successText}>{text(status.zh, status.en)}</Text>
          </View>
        ) : null}

        <View style={styles.dateNavigator}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('查看前一天', 'View previous day')}
            onPress={() => shiftSelectedDate(-1)}
            style={styles.dateArrowButton}>
            <Text style={styles.dateArrow}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('返回今天', 'Return to today')}
            onPress={() => setSelectedDate(localDateKey())}
            style={styles.dateNavigatorCopy}>
            <Text style={styles.dateNavigatorTitle}>{todayLabel}</Text>
            <Text style={styles.dateNavigatorHint}>
              {isToday ? text('今天', 'Today') : text('点击返回今天', 'Tap to return to today')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('查看后一天', 'View next day')}
            disabled={isToday}
            onPress={() => shiftSelectedDate(1)}
            style={[styles.dateArrowButton, isToday && styles.dateArrowDisabled]}>
            <Text style={styles.dateArrow}>›</Text>
          </Pressable>
        </View>

        <View style={styles.reportHero}>
          <View style={styles.reportHeroHeader}>
            <View>
              <Text style={styles.reportEyebrow}>{text('三餐记录完成度', 'MAIN MEAL COMPLETION')}</Text>
              <Text style={styles.reportScore}>{reportCompletion}%</Text>
            </View>
            <View style={styles.reportBadge}>
              <Text style={styles.reportBadgeText}>
                {text(`${mainMealCount}/3 已记录`, `${mainMealCount}/3 logged`)}
              </Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${reportCompletion}%` as `${number}%` },
              ]}
            />
          </View>
          <Text style={styles.reportSummary}>
            {mainMealCount < 3
              ? text(
                  `${mealMeta[nextMealType].zh}还未记录；已结合库存准备下一餐建议。`,
                  `${mealMeta[nextMealType].en} is still open. Your next suggestion uses current inventory.`
                )
              : text('今天三餐已记录完整，可以继续补充加餐和餐后感受。', 'All three meals are logged. You can still add snacks and post-meal notes.')}
          </Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNumber}>{vegetableCount}</Text>
              <Text style={styles.heroStatLabel}>{text('种蔬菜', 'vegetables')}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNumber}>{proteinCount}</Text>
              <Text style={styles.heroStatLabel}>{text('种蛋白来源', 'protein sources')}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNumber}>{snackRecords.length}</Text>
              <Text style={styles.heroStatLabel}>{text('次加餐', 'snacks')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title={text('过敏与饮食偏好', 'Allergies & preferences')} detail={text('用于筛选推荐', 'Used to filter suggestions')} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('编辑过敏与忌口', 'Edit allergies and dietary preferences')}
            onPress={() => {
              setAllergyInput((dietaryPreferences?.allergies ?? []).join('、'));
              setAvoidInput((dietaryPreferences?.avoid ?? []).join('、'));
              setDietaryNotes(dietaryPreferences?.notes ?? '');
              setIsDietaryFormOpen(true);
            }}
            style={({ pressed }) => [styles.dietaryCard, pressed && styles.pressed]}>
            <View style={styles.dietaryIcon}><Text style={styles.dietaryEmoji}>🛡️</Text></View>
            <View style={styles.dietaryCopy}>
              <Text style={styles.dietaryTitle}>
                {(dietaryPreferences?.allergies.length ?? 0) + (dietaryPreferences?.avoid.length ?? 0) > 0
                  ? text(`已记录 ${(dietaryPreferences?.allergies.length ?? 0) + (dietaryPreferences?.avoid.length ?? 0)} 项`, `${(dietaryPreferences?.allergies.length ?? 0) + (dietaryPreferences?.avoid.length ?? 0)} preferences saved`)
                  : text('还没有设置', 'Not configured yet')}
              </Text>
              <Text style={styles.dietaryText} numberOfLines={2}>
                {text('推荐会按菜谱文字和食材名称排除匹配项；仍需亲自核对包装标签。', 'Suggestions exclude text matches in recipe ingredients; always verify package labels yourself.')}
              </Text>
            </View>
            <Text style={styles.dietaryChevron}>›</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={text('今日摄入圆环', 'Today’s intake rings')}
            detail={text('目标可个性化', 'Personalised goals')}
          />
          <View style={styles.ringsCard}>
            <View style={styles.ringsRow}>
              <HealthRing
                progress={mainMealCount / 3}
                color={Colors.light.primary}
                value={`${mainMealCount}/3`}
                unit={text('餐', 'meals')}
                label={text('三餐', 'Meals')}
              />
              <HealthRing
                progress={totalCarbs / dailyCarbGoal}
                color="#D68438"
                value={String(totalCarbs)}
                unit={`g / ${dailyCarbGoal}g`}
                label={text('碳水', 'Carbs')}
              />
              <HealthRing
                progress={totalFluid / dailyFluidGoal}
                color="#3F84B8"
                value={String(totalFluid)}
                unit={`mL / ${dailyFluidGoal}`}
                label={text('饮水量', 'Water intake')}
              />
            </View>
            <Text style={styles.ringsFootnote}>
              {text(
                '当前显示初始参考目标，可按自己的习惯修改；如有特殊健康需求，请遵循专业建议。',
                'These are editable starting goals. Follow professional guidance for specific health needs.'
              )}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('修改每日目标', 'Edit daily goals')}
              onPress={() => {
                setGoalCarbs(String(dailyCarbGoal));
                setGoalFluid(String(dailyFluidGoal));
                setIsGoalFormOpen(true);
              }}
              style={styles.goalButton}>
              <Text style={styles.goalButtonText}>{text('调整每日目标', 'Adjust daily goals')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={text('三餐记录', 'Meal timeline')}
            detail={text('点击可编辑', 'Tap to edit')}
          />
          <View style={styles.timelineCard}>
            {mainMealTypes.map((type) => {
              const meta = mealMeta[type];
              const record = mealRecords.find((item) => item.type === type);
              const isNextMeal = type === nextMealType && !record;

              return (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityLabel={
                    record
                      ? text(`编辑${meta.zh}`, `Edit ${meta.en.toLocaleLowerCase()}`)
                      : text(`记录${meta.zh}`, `Record ${meta.en.toLocaleLowerCase()}`)
                  }
                  onPress={() => openMealForm(type, record)}
                  style={({ pressed }) => [styles.mealRow, pressed && styles.mealRowPressed]}>
                  <View style={[styles.mealEmojiBox, isNextMeal && styles.mealEmojiBoxNext]}>
                    <Text style={styles.mealEmoji}>{meta.emoji}</Text>
                  </View>
                  <View style={styles.mealCopy}>
                    <View style={styles.mealTitleRow}>
                      <Text style={styles.mealTitle}>{text(meta.zh, meta.en)}</Text>
                      <Text style={styles.mealTime}>
                        {record ? record.time : text(meta.windowZh, meta.windowEn)}
                      </Text>
                    </View>
                    {record ? (
                      <>
                        <Text style={styles.mealFoods}>
                          {localizedMealField(record, 'foods', language)}
                        </Text>
                        <Text style={styles.carbInline}>
                          {text(`估算碳水 ${record.carbsGrams}g`, `Estimated carbs ${record.carbsGrams} g`)}
                        </Text>
                        {localizedMealField(record, 'note', language) ? (
                          <Text style={styles.mealNote} numberOfLines={2}>
                            {localizedMealField(record, 'note', language)}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Text style={styles.mealEmpty}>
                          {plannedRecipe && isNextMeal
                            ? text(
                                `计划：${plannedRecipe.name}`,
                                `Planned: ${localizeContent(plannedRecipe.name, language)}`
                              )
                            : text('尚未记录', 'Not logged yet')}
                        </Text>
                        <Text style={styles.mealEmptyHint}>
                          {text('点击补充吃了什么', 'Tap to add what you ate')}
                        </Text>
                      </>
                    )}
                  </View>
                  <Text style={styles.mealChevron}>›</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={text('近 7 天趋势', '7-day trend')}
            detail={text('饮水量与碳水记录', 'Water intake and carbs')}
          />
          <View style={styles.trendCard}>
            <View style={styles.trendLegend}>
              <View style={styles.trendLegendItem}><View style={[styles.trendLegendDot, { backgroundColor: '#3F84B8' }]} /><Text style={styles.trendLegendText}>{text('饮水量', 'Water')}</Text></View>
              <View style={styles.trendLegendItem}><View style={[styles.trendLegendDot, { backgroundColor: '#D68438' }]} /><Text style={styles.trendLegendText}>{text('碳水', 'Carbs')}</Text></View>
            </View>
            <View style={styles.trendBars}>
              {weeklyTrend.map((day) => (
                <View key={day.key} style={styles.trendDay}>
                  <View style={styles.trendBarTrack}>
                    <View style={[styles.trendBar, styles.trendBarFluid, { height: `${Math.max(4, Math.min(100, (day.fluid / dailyFluidGoal) * 100))}%` as `${number}%` }]} />
                    <View style={[styles.trendBar, styles.trendBarCarbs, { height: `${Math.max(4, Math.min(100, (day.carbs / dailyCarbGoal) * 100))}%` as `${number}%` }]} />
                  </View>
                  <Text style={[styles.trendDayLabel, day.key === selectedDate && styles.trendDayLabelSelected]}>{day.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={text('加餐与零食', 'Snacks & extras')}
            detail={text(`${snackRecords.length} 条记录`, `${snackRecords.length} logged`)}
          />
          <View style={styles.snackCard}>
            {snackRecords.length > 0 ? (
              snackRecords.map((record) => (
                <Pressable
                  key={record.id}
                  accessibilityRole="button"
                  accessibilityLabel={text('编辑加餐记录', 'Edit snack record')}
                  onPress={() => openMealForm('snack', record)}
                  style={({ pressed }) => [styles.snackRow, pressed && styles.mealRowPressed]}>
                  <View style={styles.snackTimeBadge}>
                    <Text style={styles.snackTime}>{record.time}</Text>
                  </View>
                  <View style={styles.snackCopy}>
                    <Text style={styles.snackFoods}>
                      {localizedMealField(record, 'foods', language)}
                    </Text>
                    <Text style={styles.carbInline}>
                      {text(`估算碳水 ${record.carbsGrams}g`, `Estimated carbs ${record.carbsGrams} g`)}
                    </Text>
                    {localizedMealField(record, 'note', language) ? (
                      <Text style={styles.snackNote}>
                        {localizedMealField(record, 'note', language)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.mealChevron}>›</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptySnackText}>
                {text('今天还没有记录加餐或零食。', 'No snacks or extras logged today.')}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('添加加餐或零食', 'Add a snack')}
              onPress={() => openMealForm('snack')}
              style={({ pressed }) => [styles.addSnackButton, pressed && styles.pressed]}>
              <Text style={styles.addSnackText}>＋ {text('添加加餐或零食', 'Add snack or extra')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={text('水与饮料', 'Water & drinks')}
            detail={text(`${totalFluid}mL 已记录`, `${totalFluid} mL logged`)}
          />
          <View style={styles.hydrationCard}>
            <View style={styles.hydrationSummary}>
              <View style={styles.hydrationStat}>
                <Text style={styles.hydrationStatValue}>{totalFluid}</Text>
                <Text style={styles.hydrationStatLabel}>{text('总饮水量 mL', 'water intake mL')}</Text>
              </View>
              <View style={styles.hydrationStatDivider} />
              <View style={styles.hydrationStat}>
                <Text style={styles.hydrationStatValue}>{totalPlainWater}</Text>
                <Text style={styles.hydrationStatLabel}>{text('其中白水 mL', 'plain water mL')}</Text>
              </View>
              <View style={styles.hydrationStatDivider} />
              <View style={styles.hydrationStat}>
                <Text style={styles.hydrationStatValue}>{retainedWaterEstimate}</Text>
                <Text style={styles.hydrationStatLabel}>{text('留存等效 mL', 'retention eq. mL')}</Text>
              </View>
            </View>

            <View style={styles.drinkList}>
              {drinkRecords.map((record) => {
                const beverage =
                  beverageLibrary.find((item) => item.key === record.beverageKey) ?? beverageLibrary[0];
                return (
                  <View key={record.id} style={styles.drinkRow}>
                    <View style={styles.drinkEmojiBox}>
                      <Text style={styles.drinkEmoji}>{beverage.emoji}</Text>
                    </View>
                    <View style={styles.drinkCopy}>
                      <Text style={styles.drinkName}>{localizeBeverage(beverage, language)}</Text>
                      <Text style={styles.drinkMeta}>
                        {record.time} · {record.volumeMl}mL · {text('补水力', 'retention')} {beverage.retentionIndex.toFixed(2)}×
                      </Text>
                    </View>
                    <Text style={styles.drinkEquivalent}>
                      ≈{estimateRetainedWater(record.volumeMl, beverage.retentionIndex)}mL
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={text('删除这条饮水记录', 'Delete this drink record')}
                      onPress={() => deleteDrinkRecord(record.id)}
                      hitSlop={8}
                      style={styles.deleteRecordButton}>
                      <Text style={styles.deleteRecordText}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.quickDrinkRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('快速添加二百五十毫升白水', 'Quick add 250 millilitres of water')}
                onPress={() => addQuickWater(250)}
                style={({ pressed }) => [styles.quickWaterButton, pressed && styles.pressed]}>
                <Text style={styles.quickWaterText}>＋250mL {text('水', 'water')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('搜索饮料并记录', 'Search and log a drink')}
                onPress={openDrinkForm}
                style={({ pressed }) => [styles.logDrinkButton, pressed && styles.pressed]}>
                <Text style={styles.logDrinkText}>{text('搜索饮料库', 'Search drink library')}</Text>
              </Pressable>
            </View>

            <View style={styles.hydrationExplanation}>
              <Text style={styles.hydrationExplanationTitle}>
                {text('“补水力”是什么？', 'What is “retention”?')}
              </Text>
              <Text style={styles.hydrationExplanationText}>
                {text(
                  '它是饮用后短时间内相对白水的水分留存指数。1.00× 表示研究中与白水没有显著差异；它不是热量、健康程度或医疗建议。',
                  'It is short-term fluid retention relative to water. 1.00× means no significant difference from water in the study; it is not a calorie, health, or medical score.'
                )}
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => WebBrowser.openBrowserAsync(hydrationStudyUrl)}
                hitSlop={8}>
                <Text style={styles.sourceLink}>{text('查看水合指数研究', 'View hydration-index study')} ↗</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title={text('今日饮食观察', 'Today’s food pattern')} />
          <View style={styles.insightCard}>
            <View style={styles.insightRow}>
              <View style={styles.insightIcon}><Text>🕐</Text></View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{text('三餐节奏', 'Meal rhythm')}</Text>
                <Text style={styles.insightText}>
                  {mainMealCount < 3
                    ? text(`已记录 ${mainMealCount}/3，下一顿是${mealMeta[nextMealType].zh}。`, `${mainMealCount}/3 logged; ${mealMeta[nextMealType].en.toLocaleLowerCase()} is next.`)
                    : text('三餐记录完整。', 'All main meals are logged.')}
                </Text>
              </View>
            </View>
            <View style={styles.insightRow}>
              <View style={styles.insightIcon}><Text>🥬</Text></View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{text('蔬菜多样性', 'Vegetable variety')}</Text>
                <Text style={styles.insightText}>
                  {text(
                    `目前识别到 ${vegetableCount} 种；下一餐建议继续搭配一份不同颜色的蔬菜。`,
                    `${vegetableCount} types found; add a different-coloured vegetable next meal.`
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.insightRow}>
              <View style={styles.insightIcon}><Text>🥚</Text></View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{text('蛋白质来源', 'Protein sources')}</Text>
                <Text style={styles.insightText}>
                  {text(
                    `今天记录中包含 ${proteinCount} 种来源，下一餐会避免只重复同一种食材。`,
                    `${proteinCount} sources are logged; the next suggestion avoids relying on only one source.`
                  )}
                </Text>
              </View>
            </View>
            <View style={[styles.insightRow, styles.insightRowLast]}>
              <View style={styles.insightIcon}><Text>🍪</Text></View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{text('加餐情况', 'Snack check')}</Text>
                <Text style={styles.insightText}>
                  {snackRecords.length > 0
                    ? text(`今天有 ${snackRecords.length} 次加餐，已经纳入下一餐判断。`, `${snackRecords.length} snack is logged and included in the next-meal suggestion.`)
                    : text('今天没有加餐记录。', 'No snack is logged today.')}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.healthDisclaimer}>
            {text(
              '以上是基于饮食记录的结构提示，不替代专业营养或医疗建议。',
              'These are record-based food pattern notes, not professional nutrition or medical advice.'
            )}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={text('下一餐推荐', 'Next-meal suggestion')}
            detail={nextMealLabel}
          />
          <View style={styles.recommendationCard}>
            <View style={styles.recommendationTop}>
              <View style={styles.recommendationEmojiBox}>
                <Text style={styles.recommendationEmoji}>{recipe.emoji}</Text>
              </View>
              <View style={styles.recommendationCopy}>
                <View style={styles.recommendationBadge}>
                  <Text style={styles.recommendationBadgeText}>
                    {match.percentage}% {text('库存匹配', 'inventory match')}
                  </Text>
                </View>
                <Text style={styles.recommendationName}>
                  {localizeContent(recipe.name, language)}
                </Text>
                <Text style={styles.recommendationDescription} numberOfLines={2}>
                  {localizeContent(recipe.description, language)}
                </Text>
              </View>
            </View>

            <View style={styles.recommendationMeta}>
              <Text style={styles.recommendationMetaText}>⏱ {recipe.timeMinutes} {text('分钟', 'min')}</Text>
              <Text style={styles.recommendationMetaText}>◉ {text(`${recipe.servings}人份`, `${recipe.servings} servings`)}</Text>
              <Text style={styles.recommendationMetaText}>◎ {localizeContent(recipe.difficulty, language)}</Text>
            </View>

            <View style={styles.reasonList}>
              <View style={styles.reasonRow}>
                <Text style={styles.reasonCheck}>✓</Text>
                <Text style={styles.reasonText}>
                  {text('今天还没有吃过这道菜，减少重复。', 'Not eaten today, so it adds variety.')}
                </Text>
              </View>
              <View style={styles.reasonRow}>
                <Text style={styles.reasonCheck}>✓</Text>
                <Text style={styles.reasonText}>
                  {expiringNames.length > 0
                    ? text(
                        `可优先消耗：${expiringNames.join('、')}`,
                        `Uses soon: ${expiringNames.map((item) => localizeContent(item, language)).join(', ')}`
                      )
                    : text('现有库存已经能覆盖主要用料。', 'Current inventory covers the main ingredients.')}
                </Text>
              </View>
            </View>

            <View style={styles.ingredientChips}>
              {recipe.ingredients.map((ingredient) => (
                <View key={ingredient.name} style={styles.ingredientChip}>
                  <Text style={styles.ingredientChipText}>
                    {localizeContent(ingredient.name, language)} ·{' '}
                    {formatAmount(ingredient.amount, ingredient.unit, language)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.recommendationActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('换一个下一餐建议', 'Show another suggestion')}
                onPress={() => {
                  setSuggestionOffset((current) => current + 1);
                  setStatus(null);
                }}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>{text('换一道', 'Another')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('加入下一餐计划', 'Add to next-meal plan')}
                onPress={planSuggestion}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>
                  {plannedRecipeId === recipe.id
                    ? text('已加入计划', 'Planned')
                    : text('加入下一餐', 'Plan this meal')}
                </Text>
              </Pressable>
            </View>
            <View style={styles.recommendationDisclosure}>
              <Text style={styles.recommendationDisclosureTitle}>{text('为什么会看到这道菜', 'How this was chosen')}</Text>
              <Text style={styles.recommendationDisclosureText}>{text('排序只使用本机/家庭中的库存匹配、临期食材、当天饮食记录与已保存的忌口；不会诊断营养或食物安全问题。过敏筛选目前是文字匹配，烹饪前请再次核对食材与包装标签。', 'Ranking uses household inventory match, expiring items, today’s meal log, and saved preferences. It does not diagnose nutrition or food safety. Allergy filtering is text-based, so re-check every ingredient and package label before cooking.')}</Text>
            </View>
          </View>
        </View>
      </AppScreen>

      <Modal visible={isDietaryFormOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsDietaryFormOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setIsDietaryFormOpen(false)} hitSlop={12}><Text style={styles.modalCancel}>{text('取消', 'Cancel')}</Text></Pressable>
            <Text style={styles.modalTitle}>{text('过敏与饮食偏好', 'Dietary preferences')}</Text>
            <Pressable onPress={saveDietaryPreferences} hitSlop={12}><Text style={styles.modalSave}>{text('保存', 'Save')}</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">
            <View style={styles.safetyBanner}>
              <Text style={styles.safetyBannerEmoji}>⚠️</Text>
              <Text style={styles.safetyBannerText}>{text('这里的筛选不能替代医生建议，也不能识别交叉污染或隐藏配料。严重过敏时请始终阅读标签并咨询专业人士。', 'This filter cannot replace medical advice or detect cross-contamination and hidden ingredients. For serious allergies, always read labels and seek professional guidance.')}</Text>
            </View>
            <Text style={styles.modalFieldLabel}>{text('过敏食物', 'Allergies')}</Text>
            <TextInput value={allergyInput} onChangeText={setAllergyInput} multiline placeholder={text('例如：花生、牛奶、虾', 'For example: peanuts, milk, shrimp')} placeholderTextColor={Colors.light.textSecondary} style={[styles.modalInput, styles.multilineInput]} />
            <Text style={styles.modalFieldHint}>{text('用逗号或顿号分隔。', 'Separate items with commas.')}</Text>
            <Text style={styles.modalFieldLabel}>{text('不吃或尽量避免', 'Avoid or limit')}</Text>
            <TextInput value={avoidInput} onChangeText={setAvoidInput} multiline placeholder={text('例如：香菜、酒精、猪肉', 'For example: cilantro, alcohol, pork')} placeholderTextColor={Colors.light.textSecondary} style={[styles.modalInput, styles.multilineInput]} />
            <Text style={styles.modalFieldLabel}>{text('补充说明', 'Notes')}</Text>
            <TextInput value={dietaryNotes} onChangeText={setDietaryNotes} multiline placeholder={text('例如：低盐、乳糖不耐受', 'For example: low sodium, lactose intolerance')} placeholderTextColor={Colors.light.textSecondary} style={[styles.modalInput, styles.multilineInput]} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isMealFormOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsMealFormOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('取消记录', 'Cancel meal record')}
              onPress={() => setIsMealFormOpen(false)}
              hitSlop={12}>
              <Text style={styles.modalCancel}>{text('取消', 'Cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingRecordId ? text('编辑饮食记录', 'Edit food record') : text('记录一餐', 'Record food')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('保存饮食记录', 'Save food record')}
              disabled={!validMealForm}
              onPress={saveMealRecord}
              hitSlop={12}>
              <Text style={[styles.modalSave, !validMealForm && styles.modalSaveDisabled]}>
                {text('保存', 'Save')}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{text('餐次', 'Meal type')}</Text>
            <View style={styles.mealTypeOptions}>
              {mealTypes.map((type) => {
                const meta = mealMeta[type];
                const selected = mealType === type;
                return (
                  <Pressable
                    key={type}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      setMealType(type);
                      if (!editingRecordId) setMealTime(meta.defaultTime);
                    }}
                    style={[styles.mealTypeOption, selected && styles.mealTypeOptionSelected]}>
                    <Text style={styles.mealTypeEmoji}>{meta.emoji}</Text>
                    <Text
                      style={[
                        styles.mealTypeText,
                        selected && styles.mealTypeTextSelected,
                      ]}>
                      {text(meta.zh, meta.en)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>{text('时间', 'Time')}</Text>
            <TextInput
              accessibilityLabel={text('用餐时间', 'Meal time')}
              value={mealTime}
              onChangeText={setMealTime}
              placeholder="HH:MM"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, !isValidTime(mealTime) && styles.inputError]}
            />
            {!isValidTime(mealTime) ? (
              <Text style={styles.fieldError}>{text('请输入 24 小时制时间，例如 18:30。', 'Enter a 24-hour time, such as 18:30.')}</Text>
            ) : null}

            <Text style={styles.fieldLabel}>{text('吃了什么', 'What did you eat?')}</Text>
            <TextInput
              accessibilityLabel={text('食物内容', 'Foods eaten')}
              value={mealFoods}
              onChangeText={setMealFoods}
              multiline
              placeholder={text('例如：鸡肉蔬菜焖饭、凉拌黄瓜', 'For example: chicken vegetable rice, cucumber salad')}
              placeholderTextColor={Colors.light.textSecondary}
              style={[styles.input, styles.foodInput]}
            />

            <Text style={styles.fieldLabel}>{text('估算碳水（克）', 'Estimated carbohydrates (g)')}</Text>
            <TextInput
              accessibilityLabel={text('碳水克数', 'Carbohydrates in grams')}
              value={mealCarbs}
              onChangeText={setMealCarbs}
              placeholder="0"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                (!Number.isFinite(parsedMealCarbs) || parsedMealCarbs < 0) && styles.inputError,
              ]}
            />
            <Text style={styles.fieldCaption}>
              {text(
                '可先按包装营养成分或常用份量手动估算，后续再接入食物数据库。',
                'For now, estimate from the nutrition label or a typical serving; a food database can be connected later.'
              )}
            </Text>

            <Text style={styles.fieldLabel}>{text('餐后感受或备注（选填）', 'After-meal note (optional)')}</Text>
            <TextInput
              accessibilityLabel={text('餐后备注', 'After-meal note')}
              value={mealNote}
              onChangeText={setMealNote}
              multiline
              placeholder={text('例如：七分饱，下午没有犯困', 'For example: comfortably full, steady energy afterward')}
              placeholderTextColor={Colors.light.textSecondary}
              style={[styles.input, styles.noteInput]}
            />

            <View style={styles.formHint}>
              <Text style={styles.formHintIcon}>💡</Text>
              <Text style={styles.formHintText}>
                {text(
                  '记录会立即更新今日报告，并影响下一餐推荐。成人碳水参考范围通常按总能量占比计算，不是固定克数。',
                  'This immediately updates today’s report and next-meal suggestion. Adult carbohydrate guidance is usually energy-based, not one fixed gram target.'
                )}
              </Text>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => WebBrowser.openBrowserAsync(nutrientReferenceUrl)}>
              <Text style={styles.sourceLink}>{text('查看加拿大膳食参考摄入量', 'View Canadian dietary reference intakes')} ↗</Text>
            </Pressable>
            {editingRecordId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('删除这条用餐记录', 'Delete this meal record')}
                onPress={() => {
                  deleteMealRecord(editingRecordId);
                  setIsMealFormOpen(false);
                  setStatus({ zh: '这条用餐记录已删除。', en: 'Meal record deleted.' });
                }}
                style={styles.deleteMealButton}>
                <Text style={styles.deleteMealButtonText}>{text('删除这条记录', 'Delete this record')}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isDrinkFormOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsDrinkFormOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('取消饮料记录', 'Cancel drink record')}
              onPress={() => setIsDrinkFormOpen(false)}
              hitSlop={12}>
              <Text style={styles.modalCancel}>{text('取消', 'Cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{text('记录水与饮料', 'Log water or a drink')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('保存饮料记录', 'Save drink record')}
              disabled={!validDrinkForm}
              onPress={saveDrinkRecord}
              hitSlop={12}>
              <Text style={[styles.modalSave, !validDrinkForm && styles.modalSaveDisabled]}>
                {text('保存', 'Save')}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{text('搜索饮料资料库', 'Search drink library')}</Text>
            <TextInput
              accessibilityLabel={text('搜索饮料', 'Search drinks')}
              value={drinkSearch}
              onChangeText={setDrinkSearch}
              placeholder={text('咖啡、牛奶、茶、果汁…', 'Coffee, milk, tea, juice…')}
              placeholderTextColor={Colors.light.textSecondary}
              style={styles.input}
            />

            <View style={styles.beverageOptions}>
              {filteredBeverages.map((beverage) => {
                const selected = beverage.key === selectedBeverageKey;
                return (
                  <Pressable
                    key={beverage.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setSelectedBeverageKey(beverage.key)}
                    style={[styles.beverageOption, selected && styles.beverageOptionSelected]}>
                    <Text style={styles.beverageOptionEmoji}>{beverage.emoji}</Text>
                    <View style={styles.beverageOptionCopy}>
                      <Text style={[styles.beverageOptionName, selected && styles.beverageOptionNameSelected]}>
                        {localizeBeverage(beverage, language)}
                      </Text>
                      <Text style={styles.beverageOptionFactor}>
                        {text('短时补水力', 'Short-term retention')} {beverage.retentionIndex.toFixed(2)}×
                        {beverage.evidence === 'blend-estimate' ? text(' · 配方估算', ' · recipe estimate') : ''}
                      </Text>
                    </View>
                    {selected ? <Text style={styles.beverageCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
              {filteredBeverages.length === 0 ? (
                <Text style={styles.noBeverageResult}>
                  {text('资料库里暂时没有这一项，可先选择最接近的饮料。', 'No match yet; choose the closest drink for now.')}
                </Text>
              ) : null}
            </View>

            <View style={styles.selectedDrinkInfo}>
              <Text style={styles.selectedDrinkTitle}>
                {selectedBeverage.emoji} {localizeBeverage(selectedBeverage, language)} · {selectedBeverage.retentionIndex.toFixed(2)}×
              </Text>
              <Text style={styles.selectedDrinkNote}>
                {text(selectedBeverage.noteZh, selectedBeverage.noteEn)}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>{text('饮用容量（mL）', 'Volume consumed (mL)')}</Text>
            <TextInput
              accessibilityLabel={text('饮用容量', 'Drink volume')}
              value={drinkVolume}
              onChangeText={setDrinkVolume}
              placeholder="250"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                (!Number.isFinite(parsedDrinkVolume) || parsedDrinkVolume <= 0) && styles.inputError,
              ]}
            />

            <Text style={styles.fieldLabel}>{text('时间', 'Time')}</Text>
            <TextInput
              accessibilityLabel={text('饮用时间', 'Drink time')}
              value={drinkTime}
              onChangeText={setDrinkTime}
              placeholder="HH:MM"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, !isValidTime(drinkTime) && styles.inputError]}
            />

            {validDrinkForm ? (
              <View style={styles.drinkEstimateCard}>
                <Text style={styles.drinkEstimateValue}>
                  {parsedDrinkVolume}mL × {selectedBeverage.retentionIndex.toFixed(2)} ≈{' '}
                  {estimateRetainedWater(parsedDrinkVolume, selectedBeverage.retentionIndex)}mL
                </Text>
                <Text style={styles.drinkEstimateLabel}>
                  {text('短时水分留存等效估算', 'estimated short-term fluid-retention equivalent')}
                </Text>
              </View>
            ) : null}

            <View style={styles.formHint}>
              <Text style={styles.formHintIcon}>ℹ️</Text>
              <Text style={styles.formHintText}>
                {text(
                  '饮水量圆环按实际喝下的容量累计；留存等效只作资料参考。含糖或含咖啡因饮料并不因此等同白水。',
                  'The water-intake ring uses actual volume consumed. Retention equivalent is informational only; sugary or caffeinated drinks are not thereby equivalent to water.'
                )}
              </Text>
            </View>
            <View style={styles.sourceLinksRow}>
              <Pressable
                accessibilityRole="link"
                onPress={() => WebBrowser.openBrowserAsync(hydrationStudyUrl)}>
                <Text style={styles.sourceLink}>{text('研究来源', 'Study source')} ↗</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => WebBrowser.openBrowserAsync(fluidGuidanceUrl)}>
                <Text style={styles.sourceLink}>{text('饮水量指南', 'Hydration guidance')} ↗</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isGoalFormOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsGoalFormOpen(false)}>
        <View style={styles.goalModalBackdrop}>
          <View style={styles.goalModalCard}>
            <View style={styles.goalModalHeader}>
              <View>
                <Text style={styles.goalModalTitle}>{text('每日摄入目标', 'Daily intake goals')}</Text>
                <Text style={styles.goalModalSubtitle}>{text('可随时根据生活状态调整', 'Adjust anytime as your routine changes')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('关闭目标设置', 'Close goal settings')}
                onPress={() => setIsGoalFormOpen(false)}
                hitSlop={10}>
                <Text style={styles.goalModalClose}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>{text('每日碳水目标（克）', 'Daily carbohydrate goal (g)')}</Text>
            <TextInput
              value={goalCarbs}
              onChangeText={setGoalCarbs}
              keyboardType="decimal-pad"
              style={[styles.input, Number(goalCarbs) <= 0 && styles.inputError]}
            />
            <Text style={styles.fieldLabel}>{text('每日饮水量目标（毫升）', 'Daily water-intake goal (mL)')}</Text>
            <TextInput
              value={goalFluid}
              onChangeText={setGoalFluid}
              keyboardType="number-pad"
              style={[styles.input, Number(goalFluid) <= 0 && styles.inputError]}
            />
            <Text style={styles.goalDisclaimer}>
              {text('这里只用于个人记录，不构成医疗或营养建议。', 'For personal tracking only; this is not medical or nutrition advice.')}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!validGoals}
              onPress={saveGoals}
              style={[styles.goalSaveButton, !validGoals && styles.modalSaveDisabled]}>
              <Text style={styles.goalSaveButtonText}>{text('保存目标', 'Save goals')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
  dateNavigator: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  dateArrowButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.backgroundElement },
  dateArrowDisabled: { opacity: 0.3 },
  dateArrow: { color: Colors.light.primary, fontSize: 28, lineHeight: 30, fontWeight: '700' },
  dateNavigatorCopy: { flex: 1, alignItems: 'center', gap: 2 },
  dateNavigatorTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  dateNavigatorHint: { color: Colors.light.primary, fontSize: 9.5, fontWeight: '800' },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.primary,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 27, lineHeight: 29, fontWeight: '500' },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.light.primarySoft,
  },
  successIcon: {
    width: 23,
    height: 23,
    borderRadius: 12,
    color: '#FFFFFF',
    backgroundColor: Colors.light.primary,
    textAlign: 'center',
    lineHeight: 23,
    fontWeight: '900',
  },
  successText: { flex: 1, color: Colors.light.primary, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  reportHero: {
    gap: 16,
    padding: 20,
    borderRadius: 26,
    backgroundColor: Colors.light.primary,
  },
  reportHeroHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  reportEyebrow: { color: '#CDE5D6', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  reportScore: { color: '#FFFFFF', fontSize: 38, lineHeight: 44, fontWeight: '900', marginTop: 3 },
  reportBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFFFFF20' },
  reportBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFFFF2B' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#FFFFFF' },
  reportSummary: { color: '#E3F0E8', fontSize: 13, lineHeight: 20 },
  heroStats: { flexDirection: 'row', alignItems: 'stretch', paddingTop: 2 },
  heroStat: { flex: 1, alignItems: 'center', gap: 3 },
  heroStatNumber: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  heroStatLabel: { color: '#CDE5D6', fontSize: 9.5, fontWeight: '700', textAlign: 'center' },
  heroStatDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#FFFFFF3A' },
  section: { gap: Spacing.three },
  ringsCard: { gap: 16, padding: 17, borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  ringsRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', gap: 4 },
  ringItem: { width: 92, alignItems: 'center', gap: 8 },
  ringValueWrap: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  ringValue: { color: Colors.light.text, fontSize: 16, lineHeight: 19, fontWeight: '900' },
  ringUnit: { maxWidth: 72, color: Colors.light.textSecondary, fontSize: 7.5, lineHeight: 10, fontWeight: '800', textAlign: 'center' },
  ringLabel: { color: Colors.light.text, fontSize: 12, fontWeight: '900' },
  ringsFootnote: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16, textAlign: 'center' },
  goalButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.backgroundElement },
  goalButtonText: { color: Colors.light.primary, fontSize: 11.5, fontWeight: '900' },
  trendCard: { gap: 16, padding: 16, borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  trendLegend: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14 },
  trendLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trendLegendDot: { width: 8, height: 8, borderRadius: 4 },
  trendLegendText: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '700' },
  trendBars: { height: 118, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  trendDay: { flex: 1, alignItems: 'center', gap: 7 },
  trendBarTrack: { width: '100%', maxWidth: 34, height: 94, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 4, paddingTop: 5, overflow: 'hidden', backgroundColor: Colors.light.backgroundElement },
  trendBar: { width: 7, minHeight: 4, borderRadius: 4 },
  trendBarFluid: { backgroundColor: '#3F84B8' },
  trendBarCarbs: { backgroundColor: '#D68438' },
  trendDayLabel: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '700' },
  trendDayLabelSelected: { color: Colors.light.primary, fontWeight: '900' },
  timelineCard: { overflow: 'hidden', borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  mealRow: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  mealRowPressed: { backgroundColor: Colors.light.backgroundElement },
  mealEmojiBox: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.backgroundElement },
  mealEmojiBoxNext: { backgroundColor: Colors.light.primarySoft },
  mealEmoji: { fontSize: 21 },
  mealCopy: { flex: 1, gap: 4 },
  mealTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  mealTitle: { color: Colors.light.text, fontSize: 15, fontWeight: '900' },
  mealTime: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '700' },
  mealFoods: { color: Colors.light.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  carbInline: { alignSelf: 'flex-start', color: '#AA651F', fontSize: 9.5, lineHeight: 13, fontWeight: '800' },
  mealNote: { color: Colors.light.textSecondary, fontSize: 11, lineHeight: 16 },
  mealEmpty: { color: Colors.light.primary, fontSize: 13, fontWeight: '800' },
  mealEmptyHint: { color: Colors.light.textSecondary, fontSize: 11 },
  mealChevron: { color: Colors.light.textSecondary, fontSize: 24, lineHeight: 26 },
  snackCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  snackRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  snackTimeBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: Colors.light.warningSoft },
  snackTime: { color: Colors.light.warning, fontSize: 11, fontWeight: '900' },
  snackCopy: { flex: 1, gap: 4 },
  snackFoods: { color: Colors.light.text, fontSize: 13, fontWeight: '800' },
  snackNote: { color: Colors.light.textSecondary, fontSize: 11 },
  emptySnackText: { color: Colors.light.textSecondary, fontSize: 12, textAlign: 'center', padding: 18 },
  addSnackButton: { minHeight: 49, alignItems: 'center', justifyContent: 'center' },
  addSnackText: { color: Colors.light.primary, fontSize: 13, fontWeight: '900' },
  hydrationCard: { overflow: 'hidden', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  hydrationSummary: { flexDirection: 'row', alignItems: 'stretch', padding: 15, backgroundColor: '#E9F4FB' },
  hydrationStat: { flex: 1, alignItems: 'center', gap: 3 },
  hydrationStatValue: { color: '#2C6F9C', fontSize: 19, fontWeight: '900' },
  hydrationStatLabel: { color: '#4D7892', fontSize: 8.5, fontWeight: '800', textAlign: 'center' },
  hydrationStatDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#AFCFDF' },
  drinkList: { paddingHorizontal: 14 },
  drinkRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  drinkEmojiBox: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9F4FB' },
  drinkEmoji: { fontSize: 18 },
  drinkCopy: { flex: 1, gap: 3 },
  drinkName: { color: Colors.light.text, fontSize: 12.5, fontWeight: '900' },
  drinkMeta: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '600' },
  drinkEquivalent: { color: '#2C6F9C', fontSize: 11, fontWeight: '900' },
  deleteRecordButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.light.backgroundElement },
  deleteRecordText: { color: Colors.light.textSecondary, fontSize: 18, lineHeight: 20 },
  quickDrinkRow: { flexDirection: 'row', gap: 9, padding: 14 },
  quickWaterButton: { minHeight: 44, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E9F4FB' },
  quickWaterText: { color: '#2C6F9C', fontSize: 11.5, fontWeight: '900' },
  logDrinkButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#3F84B8' },
  logDrinkText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' },
  hydrationExplanation: { gap: 6, margin: 14, marginTop: 0, padding: 12, borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  hydrationExplanationTitle: { color: Colors.light.text, fontSize: 11.5, fontWeight: '900' },
  hydrationExplanationText: { color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15 },
  sourceLink: { color: '#2C6F9C', fontSize: 10.5, lineHeight: 16, fontWeight: '900' },
  insightCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  insightRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  insightRowLast: { borderBottomWidth: 0 },
  insightIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.backgroundElement },
  insightCopy: { flex: 1, gap: 3 },
  insightTitle: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  insightText: { color: Colors.light.textSecondary, fontSize: 11.5, lineHeight: 17 },
  healthDisclaimer: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16, paddingHorizontal: 4 },
  dietaryCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: '#D9D3B8', backgroundColor: '#FFFBEF' },
  dietaryIcon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFF' },
  dietaryEmoji: { fontSize: 23 },
  dietaryCopy: { flex: 1, gap: 4 },
  dietaryTitle: { color: Colors.light.text, fontSize: 13.5, fontWeight: '900' },
  dietaryText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  dietaryChevron: { color: Colors.light.textSecondary, fontSize: 25 },
  recommendationCard: { gap: 16, padding: 18, borderRadius: 24, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  recommendationTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  recommendationEmojiBox: { width: 76, height: 76, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.primarySoft },
  recommendationEmoji: { fontSize: 39 },
  recommendationCopy: { flex: 1, gap: 5 },
  recommendationBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: Colors.light.primarySoft },
  recommendationBadgeText: { color: Colors.light.primary, fontSize: 9.5, fontWeight: '900' },
  recommendationName: { color: Colors.light.text, fontSize: 20, fontWeight: '900' },
  recommendationDescription: { color: Colors.light.textSecondary, fontSize: 11.5, lineHeight: 17 },
  recommendationMeta: { flexDirection: 'row', gap: 14, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: Colors.light.backgroundElement },
  recommendationMetaText: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '700' },
  reasonList: { gap: 8 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reasonCheck: { color: Colors.light.primary, fontSize: 12, fontWeight: '900' },
  reasonText: { flex: 1, color: Colors.light.text, fontSize: 11.5, lineHeight: 17, fontWeight: '600' },
  ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  ingredientChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: Colors.light.backgroundElement },
  ingredientChipText: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '700' },
  recommendationActions: { flexDirection: 'row', gap: 10 },
  recommendationDisclosure: { gap: 5, padding: 12, borderRadius: 14, backgroundColor: '#FFFBEF', borderWidth: 1, borderColor: '#E8DEC0' },
  recommendationDisclosureTitle: { color: '#765A22', fontSize: 10.5, fontWeight: '900' },
  recommendationDisclosureText: { color: '#7A6B4A', fontSize: 9.5, lineHeight: 15 },
  secondaryButton: { minWidth: 100, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.backgroundElement },
  secondaryButtonText: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  primaryButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  modalPage: { flex: 1, backgroundColor: Colors.light.background },
  modalHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 8 : 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.surface },
  modalCancel: { color: Colors.light.textSecondary, fontSize: 15, fontWeight: '700' },
  modalTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  modalSave: { color: Colors.light.primary, fontSize: 15, fontWeight: '900' },
  modalSaveDisabled: { opacity: 0.35 },
  modalForm: { gap: 11, padding: 20, paddingBottom: 48 },
  modalFieldLabel: { color: Colors.light.text, fontSize: 12, fontWeight: '900', marginTop: 4 },
  modalFieldHint: { color: Colors.light.textSecondary, fontSize: 10 },
  modalInput: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 15, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, color: Colors.light.text, fontSize: 14 },
  multilineInput: { minHeight: 78, textAlignVertical: 'top' },
  safetyBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 15, backgroundColor: Colors.light.warningSoft },
  safetyBannerEmoji: { fontSize: 17 },
  safetyBannerText: { flex: 1, color: '#765A22', fontSize: 10.5, lineHeight: 16 },
  form: { gap: 12, padding: 20, paddingBottom: 48 },
  fieldLabel: { color: Colors.light.text, fontSize: 13, fontWeight: '900', marginTop: 4 },
  mealTypeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealTypeOption: { width: '48%', minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  mealTypeOptionSelected: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primarySoft },
  mealTypeEmoji: { fontSize: 17 },
  mealTypeText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '800' },
  mealTypeTextSelected: { color: Colors.light.primary },
  input: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 15, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, color: Colors.light.text, fontSize: 14 },
  inputError: { borderColor: Colors.light.danger },
  foodInput: { minHeight: 96, textAlignVertical: 'top' },
  noteInput: { minHeight: 82, textAlignVertical: 'top' },
  fieldCaption: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  fieldError: { color: Colors.light.danger, fontSize: 11, lineHeight: 16 },
  beverageOptions: { gap: 8 },
  beverageOption: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 15, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  beverageOptionSelected: { borderColor: '#3F84B8', backgroundColor: '#E9F4FB' },
  beverageOptionEmoji: { width: 28, fontSize: 21, textAlign: 'center' },
  beverageOptionCopy: { flex: 1, gap: 3 },
  beverageOptionName: { color: Colors.light.text, fontSize: 12.5, fontWeight: '900' },
  beverageOptionNameSelected: { color: '#2C6F9C' },
  beverageOptionFactor: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 14 },
  beverageCheck: { color: '#2C6F9C', fontSize: 15, fontWeight: '900' },
  noBeverageResult: { padding: 16, borderRadius: 14, backgroundColor: Colors.light.backgroundElement, color: Colors.light.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  selectedDrinkInfo: { gap: 5, padding: 13, borderRadius: 15, backgroundColor: '#E9F4FB' },
  selectedDrinkTitle: { color: '#2C6F9C', fontSize: 13, fontWeight: '900' },
  selectedDrinkNote: { color: '#4D7892', fontSize: 10.5, lineHeight: 16 },
  drinkEstimateCard: { alignItems: 'center', gap: 3, padding: 15, borderRadius: 15, backgroundColor: '#E9F4FB' },
  drinkEstimateValue: { color: '#2C6F9C', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  drinkEstimateLabel: { color: '#4D7892', fontSize: 9.5, fontWeight: '700', textAlign: 'center' },
  sourceLinksRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  deleteMealButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 15, backgroundColor: Colors.light.dangerSoft },
  deleteMealButtonText: { color: Colors.light.danger, fontSize: 13, fontWeight: '900' },
  goalModalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(24, 35, 29, 0.28)' },
  goalModalCard: { width: '100%', maxWidth: 460, gap: 13, padding: 20, borderRadius: 25, backgroundColor: Colors.light.surface },
  goalModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  goalModalTitle: { color: Colors.light.text, fontSize: 19, fontWeight: '900' },
  goalModalSubtitle: { color: Colors.light.textSecondary, fontSize: 10.5, marginTop: 4 },
  goalModalClose: { color: Colors.light.textSecondary, fontSize: 25, lineHeight: 27 },
  goalDisclaimer: { color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15 },
  goalSaveButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primary },
  goalSaveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  formHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 14, backgroundColor: Colors.light.primarySoft },
  formHintIcon: { fontSize: 16 },
  formHintText: { flex: 1, color: Colors.light.primary, fontSize: 11.5, lineHeight: 17, fontWeight: '600' },
});
