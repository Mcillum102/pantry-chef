import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Children, isValidElement, useMemo, useState, type PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors } from '@/constants/theme';
import { localDateKey, useHealth } from '@/context/health-context';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { localizeContent } from '@/data/content-translations';
import { beverageLibrary, estimateRetainedWater } from '@/data/hydration-data';
import type { InventoryItem } from '@/data/kitchen-data';
import { usePersistentState } from '@/hooks/use-persistent-state';

type HomeSectionId = 'hero' | 'brief' | 'progress' | 'planner' | 'recipe' | 'expiry' | 'quick';

type HomeSectionPreference = {
  id: HomeSectionId;
  visible: boolean;
};

const defaultHomeSections: HomeSectionPreference[] = [
  { id: 'hero', visible: true },
  { id: 'brief', visible: true },
  { id: 'progress', visible: true },
  { id: 'planner', visible: true },
  { id: 'recipe', visible: true },
  { id: 'expiry', visible: true },
  { id: 'quick', visible: true },
];

function HomeSection({ children }: PropsWithChildren<{ id: HomeSectionId }>) {
  return <View style={styles.homeSection}>{children}</View>;
}

function OrderedHomeSections({
  preferences,
  children,
}: PropsWithChildren<{ preferences: HomeSectionPreference[] }>) {
  const sectionMap = new Map<HomeSectionId, React.ReactNode>();
  Children.forEach(children, (child) => {
    if (isValidElement<{ id: HomeSectionId }>(child)) sectionMap.set(child.props.id, child);
  });

  return (
    <View style={styles.customSections}>
      {preferences
        .filter((section) => section.visible)
        .map((section) => (
          <View key={section.id}>{sectionMap.get(section.id)}</View>
        ))}
    </View>
  );
}

type SummaryCardProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
  detail: string;
  color: string;
  backgroundColor: string;
  onPress: () => void;
};

function SummaryCard({
  icon,
  label,
  value,
  detail,
  color,
  backgroundColor,
  onPress,
}: SummaryCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}，${value}，${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.summaryCard,
        { backgroundColor },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}1A` }]}>
        <MaterialCommunityIcons name={icon} size={21} color={color} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryDetail} numberOfLines={1}>{detail}</Text>
    </Pressable>
  );
}

function expiryText(item: InventoryItem, language: 'zh' | 'en') {
  if (!item.expiryDate) return language === 'zh' ? '无固定日期' : 'No fixed date';
  if (item.daysLeft < 0) {
    return language === 'zh'
      ? `已过期 ${Math.abs(item.daysLeft)} 天`
      : `Expired ${Math.abs(item.daysLeft)}d ago`;
  }
  if (item.daysLeft === 0) return language === 'zh' ? '今天到期' : 'Expires today';
  if (item.daysLeft === 1) return language === 'zh' ? '明天到期' : 'Expires tomorrow';
  return language === 'zh' ? `${item.daysLeft} 天后到期` : `Expires in ${item.daysLeft}d`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { language, locale, text } = useLanguage();
  const { inventory, recipes, cookingHistory, shoppingList, transactions, getRecipeMatch } = useKitchen();
  const {
    mealRecords,
    drinkRecords,
    plannedRecipeId,
    dailyCarbGoal,
    dailyFluidGoal,
  } = useHealth();
  const [homeSections, setHomeSections] = usePersistentState<HomeSectionPreference[]>(
    'home-sections-v1',
    defaultHomeSections
  );
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  const today = localDateKey();
  const activeInventory = inventory.filter((item) => item.quantity > 0);
  const expiringItems = activeInventory
    .filter((item) => item.expiryDate && item.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const overdueItems = expiringItems.filter((item) => item.daysLeft < 0);
  const recentOutcomes = transactions.filter((transaction) => {
    const createdAt = new Date(transaction.createdAt).getTime();
    return createdAt >= Date.now() - 30 * 86_400_000
      && (transaction.reason === 'finished'
        || transaction.reason === 'expired'
        || transaction.reason === 'discarded');
  });
  const finishedOutcomeCount = recentOutcomes.filter((transaction) => transaction.reason === 'finished').length;
  const expiredOutcomeCount = recentOutcomes.filter((transaction) => transaction.reason === 'expired').length;
  const discardedOutcomeCount = recentOutcomes.filter((transaction) => transaction.reason === 'discarded').length;
  const useRate = recentOutcomes.length > 0
    ? Math.round((finishedOutcomeCount / recentOutcomes.length) * 100)
    : 100;
  const mostExpiredItem = Object.entries(
    recentOutcomes
      .filter((transaction) => transaction.reason === 'expired')
      .reduce<Record<string, number>>((counts, transaction) => ({
        ...counts,
        [transaction.itemName]: (counts[transaction.itemName] ?? 0) + 1,
      }), {})
  ).sort((a, b) => b[1] - a[1])[0]?.[0];
  const todayMeals = mealRecords.filter((record) => record.date === today);
  const todayDrinks = drinkRecords.filter((record) => record.date === today);
  const mainMealCount = ['breakfast', 'lunch', 'dinner'].filter((mealType) =>
    todayMeals.some((record) => record.type === mealType)
  ).length;
  const snackCount = todayMeals.filter((record) => record.type === 'snack').length;
  const carbTotal = todayMeals.reduce((total, record) => total + record.carbsGrams, 0);
  const retainedFluid = todayDrinks.reduce((total, record) => {
    const beverage = beverageLibrary.find((item) => item.key === record.beverageKey);
    return total + estimateRetainedWater(record.volumeMl, beverage?.retentionIndex ?? 1);
  }, 0);
  const fluidProgress = Math.min(retainedFluid / Math.max(dailyFluidGoal, 1), 1);
  const carbProgress = Math.min(carbTotal / Math.max(dailyCarbGoal, 1), 1);
  const uncheckedShoppingCount = shoppingList.filter((item) => !item.checked).length;

  const recommendedRecipe = useMemo(() => {
    const planned = recipes.find((recipe) => recipe.id === plannedRecipeId);
    if (planned) return { recipe: planned, match: getRecipeMatch(planned), planned: true };

    const ranked = recipes
      .map((recipe) => {
        const match = getRecipeMatch(recipe);
        const expiringIngredientCount = recipe.ingredients.filter((ingredient) =>
          expiringItems.some((item) => item.name === ingredient.name)
        ).length;
        return {
          recipe,
          match,
          planned: false,
          score: match.percentage + expiringIngredientCount * 12,
        };
      })
      .sort((a, b) => b.score - a.score);
    return ranked[0];
  }, [expiringItems, getRecipeMatch, plannedRecipeId, recipes]);

  const hour = new Date().getHours();
  const greeting = hour < 11
    ? text('早上好', 'Good morning')
    : hour < 17
      ? text('下午好', 'Good afternoon')
      : text('晚上好', 'Good evening');
  const dateLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  const mostUrgentItem = expiringItems[0];
  const completedToday = cookingHistory.filter((record) =>
    record.completedAt.startsWith(today)
  ).length;
  const consumptionInsight = overdueItems.length > 0
    ? text(
        `库存里已有 ${overdueItems.length} 项过期，建议先确认状态并记录最后去向。`,
        `${overdueItems.length} item${overdueItems.length > 1 ? 's are' : ' is'} already expired; review and record the outcome.`
      )
    : expiredOutcomeCount > finishedOutcomeCount && recentOutcomes.length > 0
      ? text('过期次数高于正常吃完，可能是单次购买量偏多，可以缩短采购周期。', 'More items expired than were finished; try buying less, more often.')
      : expiredOutcomeCount > 0 && mostExpiredItem
        ? text(`最近最常过期的是「${mostExpiredItem}」，下次可以少买一些或提前安排进菜单。`, `${localizeContent(mostExpiredItem, 'en')} expires most often; buy less or plan it earlier.`)
        : finishedOutcomeCount > 0
          ? text(`最近正常吃完 ${finishedOutcomeCount} 项，消耗节奏保持得不错。`, `${finishedOutcomeCount} items were finished; your consumption rhythm looks steady.`)
          : text('还没有足够的处理记录；每次吃完或丢弃时记录原因，分析会逐渐更准确。', 'More outcome records are needed; log finished and discarded items to improve the analysis.');
  const normalizedHomeSections = [
    ...homeSections.filter((section) => defaultHomeSections.some((item) => item.id === section.id)),
    ...defaultHomeSections.filter((section) => !homeSections.some((item) => item.id === section.id)),
  ];

  function moveSection(id: HomeSectionId, direction: -1 | 1) {
    setHomeSections((current) => {
      const normalized = [
        ...current.filter((section) => defaultHomeSections.some((item) => item.id === section.id)),
        ...defaultHomeSections.filter((section) => !current.some((item) => item.id === section.id)),
      ];
      const index = normalized.findIndex((section) => section.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= normalized.length) return normalized;
      const next = [...normalized];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function toggleSection(id: HomeSectionId) {
    setHomeSections((current) => {
      const normalized = [
        ...current.filter((section) => defaultHomeSections.some((item) => item.id === section.id)),
        ...defaultHomeSections.filter((section) => !current.some((item) => item.id === section.id)),
      ];
      return normalized.map((section) =>
        section.id === id ? { ...section, visible: !section.visible } : section
      );
    });
  }

  const sectionLabels: Record<HomeSectionId, { zh: string; en: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = {
    hero: { zh: '今日摘要', en: 'Today summary', icon: 'sprout-outline' },
    brief: { zh: '每日简报', en: 'Daily brief', icon: 'view-grid-outline' },
    progress: { zh: '健康进度', en: 'Health progress', icon: 'chart-donut' },
    planner: { zh: '菜单与节约', en: 'Plan & savings', icon: 'calendar-week-outline' },
    recipe: { zh: '下一餐建议', en: 'Next meal', icon: 'chef-hat' },
    expiry: { zh: '最近要处理', en: 'Use soon', icon: 'clock-alert-outline' },
    quick: { zh: '快速前往', en: 'Quick access', icon: 'lightning-bolt-outline' },
  };

  return (
    <>
    <AppScreen
      eyebrow={dateLabel}
      title={greeting}
      subtitle={text('这里是今天的厨房与健康概览。', 'Here is your kitchen and health overview for today.')}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('自定义首页', 'Customize home')}
          onPress={() => setIsCustomizeOpen(true)}
          style={({ pressed }) => [styles.customizeButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="tune-variant" size={21} color={Colors.light.primary} />
        </Pressable>
      }>
      <OrderedHomeSections preferences={normalizedHomeSections}>
      <HomeSection id="hero">
      <View style={styles.heroCard}>
        <View style={styles.heroDecorationLarge} />
        <View style={styles.heroDecorationSmall} />
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{text('今日摘要', 'TODAY')}</Text>
          </View>
          <Text style={styles.heroEmoji}>🌿</Text>
        </View>
        <Text style={styles.heroTitle}>
          {mostUrgentItem
            ? text(`先用掉「${mostUrgentItem.name}」吧`, `Use ${localizeContent(mostUrgentItem.name, 'en')} first`)
            : text('今天的库存状态很轻松', 'Your pantry looks good today')}
        </Text>
        <Text style={styles.heroText}>
          {mostUrgentItem
            ? text(
                `${expiryText(mostUrgentItem, 'zh')}，另外还有 ${Math.max(expiringItems.length - 1, 0)} 项需要留意。`,
                `${expiryText(mostUrgentItem, 'en')}; ${Math.max(expiringItems.length - 1, 0)} more items need attention.`
              )
            : text('没有需要立刻处理的过期物品，可以从容安排下一餐。', 'Nothing needs urgent attention, so you can plan your next meal freely.')}
        </Text>
        <View style={styles.heroFooter}>
          <View style={styles.heroMiniStat}>
            <Text style={styles.heroMiniValue}>{activeInventory.length}</Text>
            <Text style={styles.heroMiniLabel}>{text('项库存', 'in stock')}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroMiniStat}>
            <Text style={styles.heroMiniValue}>{mainMealCount}/3</Text>
            <Text style={styles.heroMiniLabel}>{text('今日三餐', 'meals')}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroMiniStat}>
            <Text style={styles.heroMiniValue}>{completedToday}</Text>
            <Text style={styles.heroMiniLabel}>{text('今日完成', 'cooked')}</Text>
          </View>
        </View>
      </View>
      </HomeSection>

      <HomeSection id="brief">
      <View style={styles.summarySection}>
        <SectionHeader title={text('每日简报', 'Daily brief')} detail={text('实时更新', 'Live')} />
        <View style={styles.summaryGrid}>
          <SummaryCard
            icon="fridge-outline"
            label={text('库存', 'Inventory')}
            value={String(activeInventory.length)}
            detail={text(`${expiringItems.length} 项快到期`, `${expiringItems.length} expiring soon`)}
            color={Colors.light.primary}
            backgroundColor="#EEF6F0"
            onPress={() => router.push('/inventory')}
          />
          <SummaryCard
            icon="silverware-fork-knife"
            label={text('三餐', 'Meals')}
            value={`${mainMealCount}/3`}
            detail={snackCount > 0
              ? text(`${snackCount} 次加餐`, `${snackCount} snack${snackCount > 1 ? 's' : ''}`)
              : text('还没有加餐', 'No snacks yet')}
            color="#B86D28"
            backgroundColor="#FFF4E8"
            onPress={() => router.push('/recommend')}
          />
          <SummaryCard
            icon="water-outline"
            label={text('饮水量', 'Hydration')}
            value={`${retainedFluid}`}
            detail={`mL / ${dailyFluidGoal} mL`}
            color="#347FA3"
            backgroundColor="#EAF5F8"
            onPress={() => router.push('/recommend')}
          />
          <SummaryCard
            icon="cart-outline"
            label={text('待购买', 'Shopping')}
            value={String(uncheckedShoppingCount)}
            detail={uncheckedShoppingCount > 0
              ? text('清单里等待购买', 'waiting on your list')
              : text('购物清单已清空', 'list is clear')}
            color="#8A5B91"
            backgroundColor="#F5EDF7"
            onPress={() => router.push('/inventory')}
          />
        </View>
      </View>
      </HomeSection>

      <HomeSection id="progress">
      <View style={styles.progressCard}>
        <SectionHeader title={text('今日健康进度', "Today's progress")} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('打开健康报告', 'Open health report')}
          onPress={() => router.push('/recommend')}
          style={({ pressed }) => [styles.progressContent, pressed && styles.pressed]}>
          <View style={styles.progressRow}>
            <View style={styles.progressTitleRow}>
              <View style={[styles.progressDot, { backgroundColor: '#347FA3' }]} />
              <Text style={styles.progressLabel}>{text('饮水量', 'Hydration')}</Text>
            </View>
            <Text style={styles.progressValue}>{retainedFluid} / {dailyFluidGoal} mL</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${fluidProgress * 100}%`, backgroundColor: '#347FA3' }]} />
          </View>
          <View style={styles.progressRow}>
            <View style={styles.progressTitleRow}>
              <View style={[styles.progressDot, { backgroundColor: '#C87B34' }]} />
              <Text style={styles.progressLabel}>{text('碳水摄入', 'Carbohydrates')}</Text>
            </View>
            <Text style={styles.progressValue}>{carbTotal} / {dailyCarbGoal} g</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${carbProgress * 100}%`, backgroundColor: '#C87B34' }]} />
          </View>
          <View style={styles.progressLinkRow}>
            <Text style={styles.progressLink}>{text('查看完整健康报告', 'View full health report')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.light.primary} />
          </View>
        </Pressable>
      </View>
      </HomeSection>

      <HomeSection id="planner">
          <View style={styles.featureSection}>
            <SectionHeader title={text('计划与节约', 'Plan & save')} detail={text('把库存用得更好', 'Use food better')} />
            <View style={styles.featureGrid}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('打开本周菜单', 'Open weekly menu')}
                onPress={() => router.push('/planner')}
                style={({ pressed }) => [styles.featureCard, styles.plannerFeatureCard, pressed && styles.pressed]}>
                <View style={styles.featureIcon}><Text style={styles.featureEmoji}>📅</Text></View>
                <Text style={styles.featureEyebrow}>{text('智能安排', 'SMART PLAN')}</Text>
                <Text style={styles.featureTitle}>{text('本周菜单', 'Weekly menu')}</Text>
                <Text style={styles.featureText}>{text('按库存生成 7 天三餐', 'Plan 7 days from your pantry')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={19} color={Colors.light.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('打开节约报告', 'Open savings report')}
                onPress={() => router.push('/insights')}
                style={({ pressed }) => [styles.featureCard, styles.savingsFeatureCard, pressed && styles.pressed]}>
                <View style={styles.featureIcon}><Text style={styles.featureEmoji}>🌱</Text></View>
                <Text style={styles.featureEyebrow}>{text('减少浪费', 'SAVE FOOD')}</Text>
                <Text style={styles.featureTitle}>{text('节约报告', 'Savings report')}</Text>
                <Text style={styles.featureText}>{text('查看吃完与丢弃记录', 'Review outcomes and waste')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={19} color={Colors.light.primary} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('查看过期与消耗分析', 'View expiry and consumption analysis')}
              onPress={() => router.push('/insights')}
              style={({ pressed }) => [styles.habitCard, pressed && styles.pressed]}>
              <View style={styles.habitHeader}>
                <View style={styles.habitTitleRow}>
                  <View style={styles.habitIcon}>
                    <MaterialCommunityIcons name="chart-timeline-variant" size={22} color="#B95E4B" />
                  </View>
                  <View style={styles.habitTitleCopy}>
                    <Text style={styles.habitEyebrow}>{text('最近 30 天', 'LAST 30 DAYS')}</Text>
                    <Text style={styles.habitTitle}>{text('过期与消耗分析', 'Expiry & consumption')}</Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.light.textSecondary} />
              </View>
              <View style={styles.habitStats}>
                <View style={styles.habitStat}>
                  <Text style={[styles.habitStatValue, { color: overdueItems.length > 0 ? Colors.light.danger : Colors.light.primary }]}>{overdueItems.length}</Text>
                  <Text style={styles.habitStatLabel}>{text('现有已过期', 'expired now')}</Text>
                </View>
                <View style={styles.habitDivider} />
                <View style={styles.habitStat}>
                  <Text style={[styles.habitStatValue, { color: Colors.light.danger }]}>{expiredOutcomeCount}</Text>
                  <Text style={styles.habitStatLabel}>{text('过期丢弃', 'expired')}</Text>
                </View>
                <View style={styles.habitDivider} />
                <View style={styles.habitStat}>
                  <Text style={[styles.habitStatValue, { color: Colors.light.primary }]}>{recentOutcomes.length > 0 ? `${useRate}%` : '—'}</Text>
                  <Text style={styles.habitStatLabel}>{text('正常消耗率', 'use rate')}</Text>
                </View>
              </View>
              <View style={styles.habitInsight}>
                <Text style={styles.habitInsightEmoji}>{overdueItems.length > 0 || expiredOutcomeCount > 0 ? '💡' : '🌿'}</Text>
                <Text style={styles.habitInsightText}>{consumptionInsight}</Text>
              </View>
              {discardedOutcomeCount > 0 ? (
                <Text style={styles.habitFootnote}>{text(`另有 ${discardedOutcomeCount} 项因其他原因丢弃`, `${discardedOutcomeCount} also discarded for other reasons`)}</Text>
              ) : null}
            </Pressable>
          </View>
      </HomeSection>

      <HomeSection id="recipe">
      {recommendedRecipe ? (
        <View style={styles.recipeSection}>
          <SectionHeader title={text('下一餐建议', 'Next meal')} detail={recommendedRecipe.planned ? text('已计划', 'Planned') : text('按库存推荐', 'From your pantry')} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text(`查看菜谱${recommendedRecipe.recipe.name}`, `View recipe ${localizeContent(recommendedRecipe.recipe.name, 'en')}`)}
            onPress={() => router.push('/recipes')}
            style={({ pressed }) => [styles.recipeCard, pressed && styles.pressed]}>
            <View style={styles.recipeEmojiBox}>
              <Text style={styles.recipeEmoji}>{recommendedRecipe.recipe.emoji}</Text>
            </View>
            <View style={styles.recipeCopy}>
              <Text style={styles.recipeEyebrow}>{text('适合现在做', 'GOOD FOR RIGHT NOW')}</Text>
              <Text style={styles.recipeTitle}>{localizeContent(recommendedRecipe.recipe.name, language)}</Text>
              <View style={styles.recipeMetaRow}>
                <Text style={styles.recipeMeta}>{recommendedRecipe.recipe.timeMinutes} min</Text>
                <View style={styles.recipeMetaDot} />
                <Text style={styles.recipeMeta}>{localizeContent(recommendedRecipe.recipe.difficulty, language)}</Text>
                <View style={styles.recipeMetaDot} />
                <Text style={styles.recipeMeta}>{recommendedRecipe.match.percentage}% {text('食材齐全', 'ready')}</Text>
              </View>
            </View>
            <View style={styles.recipeChevron}>
              <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.light.primary} />
            </View>
          </Pressable>
        </View>
      ) : null}
      </HomeSection>

      <HomeSection id="expiry">
      <View style={styles.expirySection}>
        <SectionHeader
          title={text('最近要处理', 'Use soon')}
          detail={expiringItems.length > 3 ? text(`还有 ${expiringItems.length - 3} 项`, `${expiringItems.length - 3} more`) : undefined}
        />
        {expiringItems.length > 0 ? (
          <View style={styles.expiryList}>
            {expiringItems.slice(0, 3).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={text(`前往库存查看${item.name}`, `Open inventory for ${localizeContent(item.name, 'en')}`)}
                onPress={() => router.push('/inventory')}
                style={({ pressed }) => [styles.expiryRow, pressed && styles.rowPressed]}>
                <View style={styles.expiryEmojiBox}>
                  <Text style={styles.expiryEmoji}>{item.emoji}</Text>
                </View>
                <View style={styles.expiryCopy}>
                  <Text style={styles.expiryName}>{localizeContent(item.name, language)}</Text>
                  <Text style={styles.expiryMeta}>
                    {localizeContent(item.storage, language)} · {item.quantity}{localizeContent(item.unit, language)}
                  </Text>
                </View>
                <View style={[styles.expiryBadge, item.daysLeft <= 1 && styles.expiryBadgeUrgent]}>
                  <Text style={[styles.expiryBadgeText, item.daysLeft <= 1 && styles.expiryBadgeTextUrgent]}>
                    {expiryText(item, language)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>✨</Text>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>{text('暂时没有快过期物品', 'Nothing is expiring soon')}</Text>
              <Text style={styles.emptyText}>{text('你的库存状态保持得很好。', 'Your inventory is in great shape.')}</Text>
            </View>
          </View>
        )}
      </View>
      </HomeSection>

      <HomeSection id="quick">
      <View style={styles.quickSection}>
        <SectionHeader title={text('快速前往', 'Quick access')} />
        <View style={styles.quickActions}>
          {[
            { route: '/inventory' as const, icon: 'fridge-outline' as const, zh: '管理库存', en: 'Inventory' },
            { route: '/recipes' as const, icon: 'book-open-page-variant-outline' as const, zh: '查看菜谱', en: 'Recipes' },
            { route: '/recommend' as const, icon: 'heart-pulse' as const, zh: '健康报告', en: 'Health' },
          ].map((action) => (
            <Pressable
              key={action.route}
              accessibilityRole="button"
              accessibilityLabel={text(action.zh, action.en)}
              onPress={() => router.push(action.route)}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
              <MaterialCommunityIcons name={action.icon} size={22} color={Colors.light.primary} />
              <Text style={styles.quickActionText}>{text(action.zh, action.en)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      </HomeSection>
      </OrderedHomeSections>
    </AppScreen>

    <Modal
      visible={isCustomizeOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setIsCustomizeOpen(false)}>
      <View style={styles.customizePage}>
        <View style={styles.customizeHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('重置首页布局', 'Reset home layout')}
            onPress={() => setHomeSections(defaultHomeSections)}
            hitSlop={10}>
            <Text style={styles.customizeReset}>{text('重置', 'Reset')}</Text>
          </Pressable>
          <Text style={styles.customizeTitle}>{text('自定义首页', 'Customize home')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('完成自定义首页', 'Finish customizing home')}
            onPress={() => setIsCustomizeOpen(false)}
            style={styles.customizeDone}>
            <Text style={styles.customizeDoneText}>{text('完成', 'Done')}</Text>
          </Pressable>
        </View>
        <View style={styles.customizeIntro}>
          <View style={styles.customizeIntroIcon}>
            <MaterialCommunityIcons name="view-dashboard-edit-outline" size={25} color={Colors.light.primary} />
          </View>
          <View style={styles.customizeIntroCopy}>
            <Text style={styles.customizeIntroTitle}>{text('按你的习惯排列', 'Arrange it your way')}</Text>
            <Text style={styles.customizeIntroText}>{text('隐藏不常看的内容，或用箭头调整首页顺序。', 'Hide sections you rarely use or reorder them with the arrows.')}</Text>
          </View>
        </View>
        <View style={styles.customizeList}>
          {normalizedHomeSections.map((section, index) => {
            const meta = sectionLabels[section.id];
            return (
              <View key={section.id} style={styles.customizeRow}>
                <View style={styles.customizeRowIcon}>
                  <MaterialCommunityIcons name={meta.icon} size={21} color={section.visible ? Colors.light.primary : Colors.light.textSecondary} />
                </View>
                <View style={styles.customizeRowCopy}>
                  <Text style={[styles.customizeRowTitle, !section.visible && styles.customizeRowTitleHidden]}>{text(meta.zh, meta.en)}</Text>
                  <Text style={styles.customizeRowStatus}>{section.visible ? text('首页显示', 'Visible') : text('已隐藏', 'Hidden')}</Text>
                </View>
                <View style={styles.customizeRowActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={text(`上移${meta.zh}`, `Move ${meta.en} up`)}
                    disabled={index === 0}
                    onPress={() => moveSection(section.id, -1)}
                    style={[styles.customizeArrow, index === 0 && styles.customizeDisabled]}>
                    <MaterialCommunityIcons name="chevron-up" size={21} color={Colors.light.textSecondary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={text(`下移${meta.zh}`, `Move ${meta.en} down`)}
                    disabled={index === normalizedHomeSections.length - 1}
                    onPress={() => moveSection(section.id, 1)}
                    style={[styles.customizeArrow, index === normalizedHomeSections.length - 1 && styles.customizeDisabled]}>
                    <MaterialCommunityIcons name="chevron-down" size={21} color={Colors.light.textSecondary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: section.visible }}
                    accessibilityLabel={text(`显示${meta.zh}`, `Show ${meta.en}`)}
                    onPress={() => toggleSection(section.id)}
                    style={[styles.customizeToggle, section.visible && styles.customizeToggleOn]}>
                    <View style={[styles.customizeToggleThumb, section.visible && styles.customizeToggleThumbOn]} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  customizeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  customSections: { gap: 24 },
  homeSection: { width: '100%' },
  featureSection: { gap: 12 },
  featureGrid: { flexDirection: 'row', gap: 10 },
  featureCard: { flex: 1, minHeight: 178, gap: 6, padding: 14, borderRadius: 22, borderWidth: 1 },
  plannerFeatureCard: { backgroundColor: '#EDF6EF', borderColor: '#D7E9DC' },
  savingsFeatureCard: { backgroundColor: '#FFF5E8', borderColor: '#F0DFC7' },
  featureIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 2, borderRadius: 14, backgroundColor: '#FFFFFFB8' },
  featureEmoji: { fontSize: 23 },
  featureEyebrow: { color: Colors.light.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  featureTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  featureText: { flex: 1, color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15 },
  habitCard: { gap: 14, padding: 17, borderRadius: 24, backgroundColor: '#FFF9F4', borderWidth: 1, borderColor: '#EFDED2' },
  habitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  habitTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  habitIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FBEAE3' },
  habitTitleCopy: { flex: 1, gap: 2 },
  habitEyebrow: { color: '#B95E4B', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.7 },
  habitTitle: { color: Colors.light.text, fontSize: 15, fontWeight: '900' },
  habitStats: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderRadius: 18, backgroundColor: '#FFFFFFB8' },
  habitStat: { flex: 1, alignItems: 'center', gap: 3 },
  habitStatValue: { fontSize: 21, fontWeight: '900' },
  habitStatLabel: { color: Colors.light.textSecondary, fontSize: 8.5, fontWeight: '800', textAlign: 'center' },
  habitDivider: { width: StyleSheet.hairlineWidth, height: 31, backgroundColor: '#E9D8CC' },
  habitInsight: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  habitInsightEmoji: { fontSize: 17 },
  habitInsightText: { flex: 1, color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 17 },
  habitFootnote: { color: Colors.light.warning, fontSize: 9.5, fontWeight: '800' },
  customizePage: { flex: 1, paddingTop: 12, backgroundColor: Colors.light.background },
  customizeHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  customizeReset: { color: Colors.light.textSecondary, fontSize: 14, fontWeight: '700' },
  customizeTitle: { color: Colors.light.text, fontSize: 17, fontWeight: '900' },
  customizeDone: { minWidth: 58, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 13, backgroundColor: Colors.light.primary },
  customizeDoneText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  customizeIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 18, padding: 15, borderRadius: 20, backgroundColor: Colors.light.primarySoft },
  customizeIntroIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFFA8' },
  customizeIntroCopy: { flex: 1, gap: 3 },
  customizeIntroTitle: { color: Colors.light.primary, fontSize: 13, fontWeight: '900' },
  customizeIntroText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  customizeList: { overflow: 'hidden', marginHorizontal: 18, borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  customizeRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  customizeRowIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.backgroundElement },
  customizeRowCopy: { flex: 1, gap: 3 },
  customizeRowTitle: { color: Colors.light.text, fontSize: 12.5, fontWeight: '900' },
  customizeRowTitleHidden: { color: Colors.light.textSecondary },
  customizeRowStatus: { color: Colors.light.textSecondary, fontSize: 9.5 },
  customizeRowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customizeArrow: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.light.backgroundElement },
  customizeDisabled: { opacity: 0.28 },
  customizeToggle: { width: 47, height: 29, justifyContent: 'center', padding: 3, marginLeft: 3, borderRadius: 15, backgroundColor: Colors.light.backgroundElement },
  customizeToggleOn: { backgroundColor: Colors.light.primary },
  customizeToggleThumb: { width: 23, height: 23, borderRadius: 12, backgroundColor: Colors.light.surface, boxShadow: '0 2px 5px rgba(0,0,0,0.16)' },
  customizeToggleThumbOn: { alignSelf: 'flex-end' },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 238,
    padding: 22,
    gap: 11,
    borderRadius: 28,
    backgroundColor: Colors.light.primary,
    boxShadow: '0 18px 42px rgba(47, 109, 80, 0.22)',
  },
  heroDecorationLarge: {
    position: 'absolute',
    width: 190,
    height: 190,
    right: -52,
    top: -66,
    borderRadius: 95,
    backgroundColor: '#FFFFFF10',
  },
  heroDecorationSmall: {
    position: 'absolute',
    width: 96,
    height: 96,
    right: 58,
    bottom: -50,
    borderRadius: 48,
    backgroundColor: '#FFFFFF0C',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBadge: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF1F',
  },
  heroBadgeText: { color: '#D8EBDD', fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  heroEmoji: { fontSize: 29 },
  heroTitle: { maxWidth: '87%', color: '#FFFFFF', fontSize: 25, lineHeight: 31, fontWeight: '900', letterSpacing: -0.5 },
  heroText: { maxWidth: '92%', color: '#D8EBDD', fontSize: 13, lineHeight: 20 },
  heroFooter: {
    marginTop: 'auto',
    minHeight: 57,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF12',
  },
  heroMiniStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroMiniValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  heroMiniLabel: { color: '#CDE4D4', fontSize: 9.5, fontWeight: '700' },
  heroDivider: { width: 1, height: 28, backgroundColor: '#FFFFFF24' },
  summarySection: { gap: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    width: '48.5%',
    minHeight: 142,
    padding: 14,
    gap: 5,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  summaryIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginBottom: 2 },
  summaryLabel: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '800' },
  summaryValue: { fontSize: 26, lineHeight: 31, fontWeight: '900' },
  summaryDetail: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '600' },
  progressCard: { gap: 12 },
  progressContent: {
    gap: 10,
    padding: 18,
    borderRadius: 23,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  progressTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  progressDot: { width: 9, height: 9, borderRadius: 5 },
  progressLabel: { color: Colors.light.text, fontSize: 12, fontWeight: '800' },
  progressValue: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '700' },
  progressTrack: { height: 8, overflow: 'hidden', marginBottom: 4, borderRadius: 4, backgroundColor: Colors.light.backgroundElement },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  progressLink: { color: Colors.light.primary, fontSize: 11, fontWeight: '800' },
  recipeSection: { gap: 12 },
  recipeCard: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#FFF8E9',
    borderWidth: 1,
    borderColor: '#F0DEC0',
  },
  recipeEmojiBox: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#FFFFFFB8' },
  recipeEmoji: { fontSize: 36 },
  recipeCopy: { flex: 1, gap: 4 },
  recipeEyebrow: { color: '#A1682D', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.7 },
  recipeTitle: { color: Colors.light.text, fontSize: 18, fontWeight: '900' },
  recipeMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  recipeMeta: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '700' },
  recipeMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#C7AE8D' },
  recipeChevron: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFFFFFA8' },
  expirySection: { gap: 12 },
  expiryList: { overflow: 'hidden', borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  expiryRow: { minHeight: 79, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  rowPressed: { backgroundColor: Colors.light.backgroundSelected },
  expiryEmojiBox: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.backgroundElement },
  expiryEmoji: { fontSize: 24 },
  expiryCopy: { flex: 1, gap: 4 },
  expiryName: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  expiryMeta: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '600' },
  expiryBadge: { maxWidth: 92, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: Colors.light.warningSoft },
  expiryBadgeUrgent: { backgroundColor: Colors.light.dangerSoft },
  expiryBadgeText: { color: Colors.light.warning, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  expiryBadgeTextUrgent: { color: Colors.light.danger },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  emptyEmoji: { fontSize: 29 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  emptyText: { color: Colors.light.textSecondary, fontSize: 11 },
  quickSection: { gap: 12 },
  quickActions: { flexDirection: 'row', gap: 9 },
  quickAction: { flex: 1, minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 7, borderRadius: 19, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  quickActionText: { color: Colors.light.text, fontSize: 10.5, fontWeight: '800', textAlign: 'center' },
});
