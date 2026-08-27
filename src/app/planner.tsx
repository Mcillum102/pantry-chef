import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { Colors } from '@/constants/theme';
import {
  localDateKey,
  type PlannedMealType,
  type WeeklyMealPlanEntry,
  useHealth,
} from '@/context/health-context';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { localizeContent } from '@/data/content-translations';
import type { Recipe } from '@/data/kitchen-data';

const mealTypes: PlannedMealType[] = ['breakfast', 'lunch', 'dinner'];

const mealMeta: Record<PlannedMealType, { emoji: string; zh: string; en: string }> = {
  breakfast: { emoji: '☀️', zh: '早餐', en: 'Breakfast' },
  lunch: { emoji: '🍱', zh: '午餐', en: 'Lunch' },
  dinner: { emoji: '🌙', zh: '晚餐', en: 'Dinner' },
};

function dateFromToday(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

function mealAffinity(recipe: Recipe, type: PlannedMealType) {
  const search = [recipe.name, recipe.category, ...(recipe.tags ?? [])].join(' ').toLocaleLowerCase();
  if (type === 'breakfast') {
    return ['早餐', '粥', '蛋', '面包', '烘焙', '甜品', 'breakfast', 'bread', 'egg']
      .some((keyword) => search.includes(keyword)) ? 16 : 0;
  }
  if (type === 'lunch') {
    return ['午餐', '饭', '面', '主食', 'lunch', 'rice', 'noodle']
      .some((keyword) => search.includes(keyword)) ? 10 : 0;
  }
  return ['晚餐', '汤', '炖', '煎', 'dinner', 'soup', 'stew']
    .some((keyword) => search.includes(keyword)) ? 10 : 0;
}

export default function WeeklyPlannerScreen() {
  const router = useRouter();
  const { language, locale, text } = useLanguage();
  const {
    inventory,
    recipes,
    getRecipeMatch,
    addShoppingItem,
    shoppingList,
  } = useKitchen();
  const {
    weeklyMealPlan,
    setWeeklyMealPlan,
    setPlannedRecipeId,
  } = useHealth();
  const [status, setStatus] = useState<string | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const key = dateFromToday(index);
      const date = new Date(`${key}T12:00:00`);
      return {
        key,
        short: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date),
        date: new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(date),
        isToday: index === 0,
      };
    }),
    [locale]
  );

  const rankedRecipes = useMemo(() => {
    const expiringNames = new Set(
      inventory.filter((item) => item.quantity > 0 && item.daysLeft <= 3).map((item) => item.name)
    );
    return mealTypes.reduce<Record<PlannedMealType, Recipe[]>>((result, type) => {
      result[type] = [...recipes]
        .map((recipe) => {
          const match = getRecipeMatch(recipe);
          const expiringCount = recipe.ingredients.filter((ingredient) =>
            expiringNames.has(ingredient.name)
          ).length;
          return {
            recipe,
            score: match.percentage + expiringCount * 14 + mealAffinity(recipe, type),
          };
        })
        .sort((a, b) => b.score - a.score)
        .map((item) => item.recipe);
      return result;
    }, { breakfast: [], lunch: [], dinner: [] });
  }, [getRecipeMatch, inventory, recipes]);

  const planBySlot = useMemo(
    () => new Map(weeklyMealPlan.map((entry) => [`${entry.date}-${entry.type}`, entry])),
    [weeklyMealPlan]
  );
  const plannedRecipeIds = new Set(weeklyMealPlan.map((entry) => entry.recipeId));
  const planMissingCount = recipes
    .filter((recipe) => plannedRecipeIds.has(recipe.id))
    .reduce((total, recipe) => total + getRecipeMatch(recipe).missing.length, 0);
  const completedCount = weeklyMealPlan.filter((entry) => entry.completed).length;

  function generatePlan() {
    const usage = new Map<string, number>();
    const nextPlan: WeeklyMealPlanEntry[] = [];

    days.forEach((day, dayIndex) => {
      mealTypes.forEach((type, mealIndex) => {
        const candidates = rankedRecipes[type];
        if (candidates.length === 0) return;
        const rankedWithVariety = [...candidates].sort((a, b) => {
          const aUse = usage.get(a.id) ?? 0;
          const bUse = usage.get(b.id) ?? 0;
          return aUse - bUse || candidates.indexOf(a) - candidates.indexOf(b);
        });
        const recipe = rankedWithVariety[(dayIndex + mealIndex) % Math.min(rankedWithVariety.length, 5)];
        usage.set(recipe.id, (usage.get(recipe.id) ?? 0) + 1);
        nextPlan.push({
          id: `plan-${day.key}-${type}`,
          date: day.key,
          type,
          recipeId: recipe.id,
          completed: false,
        });
      });
    });

    setWeeklyMealPlan(nextPlan);
    setStatus(text('已按库存和临期优先生成本周菜单。', 'Your week was planned from your pantry and expiry dates.'));
  }

  function swapRecipe(entry: WeeklyMealPlanEntry) {
    const candidates = rankedRecipes[entry.type];
    if (candidates.length < 2) return;
    const currentIndex = Math.max(candidates.findIndex((recipe) => recipe.id === entry.recipeId), 0);
    const nextRecipe = candidates[(currentIndex + 1) % candidates.length];
    setWeeklyMealPlan((current) => current.map((item) =>
      item.id === entry.id ? { ...item, recipeId: nextRecipe.id, completed: false } : item
    ));
    setStatus(text(`已替换为「${nextRecipe.name}」。`, `Swapped to ${localizeContent(nextRecipe.name, 'en')}.`));
  }

  function addRecipeMissingToShopping(recipe: Recipe) {
    const missingNames = new Set(getRecipeMatch(recipe).missing);
    const missingIngredients = recipe.ingredients.filter((ingredient) => missingNames.has(ingredient.name));
    missingIngredients.forEach((ingredient) => addShoppingItem({
      name: ingredient.name,
      nameEn: localizeContent(ingredient.name, 'en'),
      emoji: '🛒',
      quantity: ingredient.amount,
      unit: ingredient.unit,
      sourceRecipeId: recipe.id,
      sourceRecipeName: recipe.name,
    }));
    setStatus(missingIngredients.length > 0
      ? text(`已把 ${missingIngredients.length} 项缺料加入购物清单。`, `${missingIngredients.length} missing items added to shopping.`)
      : text('这道菜的食材已经齐全。', 'You already have everything for this recipe.'));
  }

  function addAllMissingToShopping() {
    const seen = new Set<string>();
    let added = 0;
    weeklyMealPlan.forEach((entry) => {
      const recipe = recipes.find((item) => item.id === entry.recipeId);
      if (!recipe) return;
      const missingNames = new Set(getRecipeMatch(recipe).missing);
      recipe.ingredients.forEach((ingredient) => {
        const key = `${ingredient.name}-${ingredient.unit}`;
        if (!missingNames.has(ingredient.name) || seen.has(key)) return;
        seen.add(key);
        added += 1;
        addShoppingItem({
          name: ingredient.name,
          nameEn: localizeContent(ingredient.name, 'en'),
          emoji: '🛒',
          quantity: ingredient.amount,
          unit: ingredient.unit,
          sourceRecipeId: recipe.id,
          sourceRecipeName: text('本周菜单', 'Weekly plan'),
        });
      });
    });
    setStatus(added > 0
      ? text(`已合并并加入 ${added} 项采购需求。`, `${added} combined shopping needs were added.`)
      : text('本周菜单所需食材已经齐全。', 'Your pantry covers this weekly plan.'));
  }

  function startRecipe(recipe: Recipe) {
    setPlannedRecipeId(recipe.id);
    router.push('/recipes');
  }

  return (
    <AppScreen
      eyebrow={text('智能计划', 'SMART PLAN')}
      title={text('本周菜单', 'Weekly menu')}
      subtitle={text('优先使用临期库存，缺少的食材一键加入购物清单。', 'Use expiring items first and add missing ingredients to shopping.')}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('返回首页', 'Back to home')}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="close" size={23} color={Colors.light.text} />
        </Pressable>
      }>
      <View style={styles.overviewCard}>
        <View style={styles.overviewTop}>
          <View>
            <Text style={styles.overviewEyebrow}>{text('未来 7 天', 'NEXT 7 DAYS')}</Text>
            <Text style={styles.overviewTitle}>
              {weeklyMealPlan.length > 0
                ? text(`${weeklyMealPlan.length} 餐已安排`, `${weeklyMealPlan.length} meals planned`)
                : text('还没有生成菜单', 'No plan yet')}
            </Text>
          </View>
          <View style={styles.overviewEmoji}><Text style={styles.overviewEmojiText}>📅</Text></View>
        </View>
        <View style={styles.overviewStats}>
          <View style={styles.overviewStat}>
            <Text style={styles.overviewStatValue}>{completedCount}</Text>
            <Text style={styles.overviewStatLabel}>{text('已完成', 'completed')}</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewStat}>
            <Text style={styles.overviewStatValue}>{planMissingCount}</Text>
            <Text style={styles.overviewStatLabel}>{text('缺料提示', 'missing')}</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewStat}>
            <Text style={styles.overviewStatValue}>{shoppingList.filter((item) => !item.checked).length}</Text>
            <Text style={styles.overviewStatLabel}>{text('待购买', 'to buy')}</Text>
          </View>
        </View>
        <View style={styles.overviewActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('自动生成本周菜单', 'Generate weekly menu')}
            onPress={generatePlan}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="auto-fix" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>
              {weeklyMealPlan.length > 0 ? text('重新生成', 'Regenerate') : text('智能生成', 'Generate')}
            </Text>
          </Pressable>
          {weeklyMealPlan.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('把全部缺料加入购物清单', 'Add all missing items to shopping')}
              onPress={addAllMissingToShopping}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="cart-plus" size={18} color={Colors.light.primary} />
              <Text style={styles.secondaryButtonText}>{text('补齐缺料', 'Shop missing')}</Text>
            </Pressable>
          ) : null}
        </View>
        {status ? <Text style={styles.statusText}>{status}</Text> : null}
      </View>

      {weeklyMealPlan.length > 0 ? (
        <View style={styles.daysList}>
          {days.map((day) => (
            <View key={day.key} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <View style={styles.dayTitleRow}>
                  <Text style={[styles.dayName, day.isToday && styles.dayNameToday]}>
                    {day.isToday ? text('今天', 'Today') : day.short}
                  </Text>
                  <Text style={styles.dayDate}>{day.date}</Text>
                </View>
                {day.isToday ? <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>{text('进行中', 'CURRENT')}</Text></View> : null}
              </View>
              <View style={styles.mealList}>
                {mealTypes.map((type) => {
                  const entry = planBySlot.get(`${day.key}-${type}`);
                  const recipe = recipes.find((item) => item.id === entry?.recipeId);
                  if (!entry || !recipe) return null;
                  const match = getRecipeMatch(recipe);
                  return (
                    <View key={type} style={[styles.mealRow, entry.completed && styles.mealRowCompleted]}>
                      <View style={styles.mealTypeBox}>
                        <Text style={styles.mealTypeEmoji}>{mealMeta[type].emoji}</Text>
                        <Text style={styles.mealTypeLabel}>{text(mealMeta[type].zh, mealMeta[type].en)}</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={text(`查看${recipe.name}`, `View ${localizeContent(recipe.name, 'en')}`)}
                        onPress={() => startRecipe(recipe)}
                        style={({ pressed }) => [styles.mealRecipe, pressed && styles.pressed]}>
                        <Text style={styles.mealEmoji}>{recipe.emoji}</Text>
                        <View style={styles.mealCopy}>
                          <Text style={styles.mealName}>{localizeContent(recipe.name, language)}</Text>
                          <Text style={styles.mealMeta}>{recipe.timeMinutes} min · {match.percentage}% {text('齐全', 'ready')}</Text>
                        </View>
                      </Pressable>
                      <View style={styles.mealActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={text('替换菜谱', 'Swap recipe')}
                          onPress={() => swapRecipe(entry)}
                          style={styles.iconButton}>
                          <MaterialCommunityIcons name="swap-horizontal" size={18} color={Colors.light.primary} />
                        </Pressable>
                        {match.missing.length > 0 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={text('把这道菜的缺料加入购物清单', 'Add this recipe missing items to shopping')}
                            onPress={() => addRecipeMissingToShopping(recipe)}
                            style={styles.iconButton}>
                            <MaterialCommunityIcons name="cart-plus" size={17} color={Colors.light.warning} />
                          </Pressable>
                        ) : (
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: entry.completed }}
                            accessibilityLabel={text('标记这餐已完成', 'Mark meal complete')}
                            onPress={() => setWeeklyMealPlan((current) => current.map((item) =>
                              item.id === entry.id ? { ...item, completed: !item.completed } : item
                            ))}
                            style={[styles.iconButton, entry.completed && styles.completeButton]}>
                            <MaterialCommunityIcons name="check" size={18} color={entry.completed ? '#FFFFFF' : Colors.light.primary} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🗓️</Text>
          <Text style={styles.emptyTitle}>{text('让库存替你想菜单', 'Let your pantry plan the week')}</Text>
          <Text style={styles.emptyText}>{text('系统会参考食材齐全度、临期优先和餐次类型，自动安排 7 天三餐。', 'The planner considers pantry match, expiry urgency, and meal type for all 7 days.')}</Text>
          <Pressable onPress={generatePlan} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>{text('生成第一份菜单', 'Create my first plan')}</Text>
          </Pressable>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  overviewCard: { gap: 15, padding: 19, borderRadius: 26, backgroundColor: Colors.light.primary, boxShadow: '0 16px 36px rgba(47, 109, 80, 0.18)' },
  overviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overviewEyebrow: { color: '#CFE6D6', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  overviewTitle: { marginTop: 4, color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  overviewEmoji: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFFFFF16' },
  overviewEmojiText: { fontSize: 27 },
  overviewStats: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 17, backgroundColor: '#FFFFFF12' },
  overviewStat: { flex: 1, alignItems: 'center', gap: 2 },
  overviewStatValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  overviewStatLabel: { color: '#CFE6D6', fontSize: 9, fontWeight: '700' },
  overviewDivider: { width: 1, height: 26, backgroundColor: '#FFFFFF22' },
  overviewActions: { flexDirection: 'row', gap: 9 },
  primaryButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: '#FFFFFF20' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  secondaryButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: '#FFFFFF' },
  secondaryButtonText: { color: Colors.light.primary, fontSize: 12, fontWeight: '900' },
  statusText: { color: '#D8EBDE', fontSize: 10.5, lineHeight: 16, textAlign: 'center' },
  daysList: { gap: 13 },
  dayCard: { overflow: 'hidden', borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  dayHeader: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, backgroundColor: '#FBFAF6', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  dayTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  dayName: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  dayNameToday: { color: Colors.light.primary },
  dayDate: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '700' },
  todayBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.light.primarySoft },
  todayBadgeText: { color: Colors.light.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  mealList: { paddingHorizontal: 12 },
  mealRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  mealRowCompleted: { opacity: 0.52 },
  mealTypeBox: { width: 47, alignItems: 'center', gap: 3 },
  mealTypeEmoji: { fontSize: 18 },
  mealTypeLabel: { color: Colors.light.textSecondary, fontSize: 8.5, fontWeight: '800' },
  mealRecipe: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mealEmoji: { fontSize: 27 },
  mealCopy: { flex: 1, minWidth: 0, gap: 4 },
  mealName: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  mealMeta: { color: Colors.light.textSecondary, fontSize: 9, fontWeight: '600' },
  mealActions: { flexDirection: 'row', gap: 5 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: Colors.light.backgroundElement },
  completeButton: { backgroundColor: Colors.light.primary },
  emptyCard: { alignItems: 'center', gap: 9, padding: 28, borderRadius: 25, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  emptyEmoji: { fontSize: 43 },
  emptyTitle: { color: Colors.light.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { maxWidth: 310, color: Colors.light.textSecondary, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  emptyButton: { marginTop: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, backgroundColor: Colors.light.primary },
  emptyButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
