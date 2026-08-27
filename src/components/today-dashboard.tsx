import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useCookingSession } from '@/context/cooking-session-context';
import { localDateKey, useHealth } from '@/context/health-context';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { localizeContent } from '@/data/content-translations';

type TodayDashboardProps = {
  onOpenShopping: () => void;
  onOpenUrgentItem: () => void;
};

const mainMealTypes = ['breakfast', 'lunch', 'dinner'] as const;

export function TodayDashboard({ onOpenShopping, onOpenUrgentItem }: TodayDashboardProps) {
  const router = useRouter();
  const { language, text } = useLanguage();
  const { inventory, recipes, shoppingList } = useKitchen();
  const { mealRecords, drinkRecords, dailyFluidGoal, plannedRecipeId } = useHealth();
  const { session, requestCookingResume } = useCookingSession();

  const today = localDateKey();
  const todayMeals = mealRecords.filter((record) => record.date === today);
  const recordedMainMeals = mainMealTypes.filter((type) =>
    todayMeals.some((record) => record.type === type)
  ).length;
  const snackCount = todayMeals.filter((record) => record.type === 'snack').length;
  const totalFluid = drinkRecords
    .filter((record) => record.date === today)
    .reduce((sum, record) => sum + record.volumeMl, 0);
  const urgentItems = inventory
    .filter((item) => item.quantity > 0 && item.expiryDate && item.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const pendingShopping = shoppingList.filter((item) => !item.checked).length;
  const plannedRecipe = recipes.find((recipe) => recipe.id === plannedRecipeId);
  const firstMissingMeal = mainMealTypes.find(
    (type) => !todayMeals.some((record) => record.type === type)
  );
  const missingMealName = firstMissingMeal
    ? {
        breakfast: text('早餐', 'breakfast'),
        lunch: text('午餐', 'lunch'),
        dinner: text('晚餐', 'dinner'),
      }[firstMissingMeal]
    : null;
  const headline = plannedRecipe
    ? text(
        `下一餐已计划：${plannedRecipe.name}`,
        `Next meal planned: ${localizeContent(plannedRecipe.name, language)}`
      )
    : missingMealName
      ? text(`下一步：记录${missingMealName}`, `Next: record ${missingMealName}`)
      : text('今天三餐已记录完成', 'All three meals are recorded');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{text('今天', 'TODAY')}</Text>
          <Text style={styles.title}>{headline}</Text>
        </View>
        <Text style={styles.headerEmoji}>{plannedRecipe?.emoji ?? '🌿'}</Text>
      </View>

      {session ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text(`继续烹饪${session.recipeName}`, `Resume cooking ${session.recipeNameEn}`)}
          onPress={() => {
            requestCookingResume();
            router.push('/recipes');
          }}
          style={({ pressed }) => [styles.cookingStrip, pressed && styles.pressed]}>
          <Text style={styles.cookingEmoji}>{session.recipeEmoji}</Text>
          <View style={styles.cookingCopy}>
            <Text style={styles.cookingLabel}>{text('正在烹饪', 'COOKING NOW')}</Text>
            <Text style={styles.cookingTitle} numberOfLines={1}>
              {language === 'en' ? session.recipeNameEn : session.recipeName}
            </Text>
          </View>
          <Text style={styles.cookingProgress}>{session.stepIndex + 1}/{session.totalSteps}</Text>
          <Text style={styles.cookingArrow}>›</Text>
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text(`查看${urgentItems.length}项快到期物品`, `View ${urgentItems.length} expiring items`)}
          disabled={urgentItems.length === 0}
          onPress={onOpenUrgentItem}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}>
          <View style={[styles.metricIcon, styles.expiryIcon]}><Text style={styles.metricEmoji}>⏳</Text></View>
          <Text style={styles.metricValue}>{urgentItems.length}</Text>
          <Text style={styles.metricLabel}>{text('快到期', 'Expiring')}</Text>
          <Text style={styles.metricDetail} numberOfLines={1}>
            {urgentItems[0]
              ? text(`先用 ${urgentItems[0].name}`, `Use ${localizeContent(urgentItems[0].name, language)} first`)
              : text('暂时都新鲜', 'All fresh for now')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text(`打开购物清单，${pendingShopping}项待购买`, `Open shopping list, ${pendingShopping} items`)}
          onPress={onOpenShopping}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}>
          <View style={[styles.metricIcon, styles.shoppingIcon]}><Text style={styles.metricEmoji}>🛒</Text></View>
          <Text style={styles.metricValue}>{pendingShopping}</Text>
          <Text style={styles.metricLabel}>{text('待购买', 'To buy')}</Text>
          <Text style={styles.metricDetail} numberOfLines={1}>
            {pendingShopping > 0 ? text('继续补齐缺料', 'Keep restocking') : text('清单已清空', 'List is clear')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('打开健康报告查看今日用餐', 'Open health report for today’s meals')}
          onPress={() => router.push('/recommend')}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}>
          <View style={[styles.metricIcon, styles.mealIcon]}><Text style={styles.metricEmoji}>🍽️</Text></View>
          <Text style={styles.metricValue}>{recordedMainMeals}<Text style={styles.metricGoal}>/3</Text></Text>
          <Text style={styles.metricLabel}>{text('今日三餐', 'Meals today')}</Text>
          <Text style={styles.metricDetail} numberOfLines={1}>
            {snackCount > 0 ? text(`另有 ${snackCount} 次加餐`, `Plus ${snackCount} snack${snackCount > 1 ? 's' : ''}`) : text('还没有加餐', 'No snacks logged')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('打开健康报告查看今日饮水量', 'Open health report for today’s water intake')}
          onPress={() => router.push('/recommend')}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}>
          <View style={[styles.metricIcon, styles.waterIcon]}><Text style={styles.metricEmoji}>💧</Text></View>
          <Text style={styles.metricValue}>{totalFluid}<Text style={styles.metricGoal}>mL</Text></Text>
          <Text style={styles.metricLabel}>{text('今日饮水量', 'Water intake')}</Text>
          <Text style={styles.metricDetail} numberOfLines={1}>
            {text(`目标 ${dailyFluidGoal}mL`, `Goal ${dailyFluidGoal}mL`)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 13, padding: 15, borderRadius: 25, backgroundColor: '#1D4C39' },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  eyebrow: { color: '#B9DCC7', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '900' },
  headerEmoji: { fontSize: 32 },
  cookingStrip: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderRadius: 17, backgroundColor: '#FFFFFF17', borderWidth: 1, borderColor: '#FFFFFF24' },
  cookingEmoji: { fontSize: 23 },
  cookingCopy: { flex: 1, gap: 1 },
  cookingLabel: { color: '#F4CE8D', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  cookingTitle: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
  cookingProgress: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '900' },
  cookingArrow: { color: '#FFFFFF', fontSize: 24, lineHeight: 25 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metric: { width: '48.5%', minHeight: 126, gap: 3, padding: 11, borderRadius: 18, backgroundColor: '#FFFFFF' },
  metricIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 2, borderRadius: 10 },
  metricEmoji: { fontSize: 17 },
  expiryIcon: { backgroundColor: Colors.light.warningSoft },
  shoppingIcon: { backgroundColor: '#F2EAF9' },
  mealIcon: { backgroundColor: '#EAF4ED' },
  waterIcon: { backgroundColor: '#E8F3FA' },
  metricValue: { color: Colors.light.text, fontSize: 19, fontWeight: '900' },
  metricGoal: { color: Colors.light.textSecondary, fontSize: 9, fontWeight: '800' },
  metricLabel: { color: Colors.light.text, fontSize: 11, fontWeight: '900' },
  metricDetail: { marginTop: 1, color: Colors.light.textSecondary, fontSize: 8.5, lineHeight: 12 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
