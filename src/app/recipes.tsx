import { useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { RecipeCompletionCelebration } from '@/components/recipe-completion-celebration';
import { RecipeShelfCelebration } from '@/components/recipe-shelf-celebration';
import { Colors, Spacing } from '@/constants/theme';
import { localDateKey, type MealType, useHealth } from '@/context/health-context';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { formatAmount, localizeContent } from '@/data/content-translations';
import { type CookingHistoryRecord, type Recipe } from '@/data/kitchen-data';
import {
  amountFromBaseUnit,
  amountInBaseUnit,
  availableIngredientAmount,
} from '@/data/inventory-utils';

const recipeLibraries = [
  { key: '全部', zh: '全部菜谱', en: 'All recipes', emoji: '📚', color: '#3D7F68' },
  { key: '自定义', zh: '自定义', en: 'Custom', emoji: '✍️', color: '#5C7A68' },
  { key: '快手菜', zh: '快手菜', en: 'Quick', emoji: '⚡', color: '#D6874A' },
  { key: '一锅料理', zh: '一锅料理', en: 'One pot', emoji: '🍲', color: '#B95D7D' },
  { key: '下饭菜', zh: '下饭菜', en: 'With rice', emoji: '🍚', color: '#BA6A45' },
  { key: '面食', zh: '面食', en: 'Noodles', emoji: '🍜', color: '#735C9B' },
];
const recipeCategories = recipeLibraries.filter((library) => library.key !== '全部');
const commonRecipeTags = ['快手', '家常', '高蛋白', '早餐', '工作日晚餐', '一锅', '下饭', '暖胃', '烘焙', '甜点', '少糖'];
const bakingRecipeTags = ['烘焙', '甜点', '早餐', '少糖'];
const recipeEmojis = ['🍳', '🍲', '🥗', '🍝', '🍛', '🥘', '🥣', '🍚', '🥪', '🧁'];
const ingredientUnits = ['克', '千克', '毫升', '升', '个', '颗', '根', '把', '片', '勺', '盒', '瓶'];

type DraftIngredient = {
  id: string;
  name: string;
  amount: string;
  unit: string;
};

type DraftStep = {
  id: string;
  instruction: string;
  timerMinutes: string;
};

type MajorRecipeLibrary = 'recipes' | 'baking';

function emptyIngredient(index = 0): DraftIngredient {
  return {
    id: `draft-ingredient-${Date.now()}-${index}`,
    name: '',
    amount: '',
    unit: '克',
  };
}

function emptyStep(index = 0): DraftStep {
  return {
    id: `draft-step-${Date.now()}-${index}`,
    instruction: '',
    timerMinutes: '',
  };
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatStepDuration(seconds: number, language: 'zh' | 'en') {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return language === 'zh' ? `${remainder}秒` : `${remainder}s`;
  if (remainder === 0) return language === 'zh' ? `${minutes}分钟` : `${minutes} min`;
  return language === 'zh'
    ? `${minutes}分${remainder}秒`
    : `${minutes}m ${remainder}s`;
}
const mealOptions: { key: MealType; zh: string; en: string; emoji: string }[] = [
  { key: 'breakfast', zh: '早餐', en: 'Breakfast', emoji: '☀️' },
  { key: 'lunch', zh: '午餐', en: 'Lunch', emoji: '🍱' },
  { key: 'dinner', zh: '晚餐', en: 'Dinner', emoji: '🌙' },
  { key: 'snack', zh: '加餐', en: 'Snack', emoji: '🍎' },
];

function currentMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function currentTime() {
  return new Date().toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function removeLastListedFood(value: string, food: string, separator: string) {
  const entries = value.split(separator).map((entry) => entry.trim()).filter(Boolean);
  let index = -1;
  for (let cursor = entries.length - 1; cursor >= 0; cursor -= 1) {
    if (entries[cursor] === food) {
      index = cursor;
      break;
    }
  }
  if (index >= 0) entries.splice(index, 1);
  return entries.join(separator);
}

export default function RecipesScreen() {
  const {
    inventory,
    recipes,
    cookingHistory,
    addRecipe,
    deleteRecipe,
    getRecipeMatch,
    cookRecipe,
    undoCookedRecipe,
  } = useKitchen();
  const { mealRecords, setMealRecords } = useHealth();
  const { language, text } = useLanguage();
  const insets = useSafeAreaInsets();
  const [majorLibrary, setMajorLibrary] = useState<MajorRecipeLibrary>('recipes');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部');
  const [selectedTag, setSelectedTag] = useState('全部标签');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(2);
  const [mealType, setMealType] = useState<MealType>(currentMealType());
  const [isCooking, setIsCooking] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false);
  const [recipeCelebration, setRecipeCelebration] = useState<Recipe | null>(null);
  const [recipeCompletion, setRecipeCompletion] = useState<Recipe | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [undoCandidate, setUndoCandidate] = useState<CookingHistoryRecord | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftEmoji, setDraftEmoji] = useState('🍳');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCategory, setDraftCategory] = useState('自定义');
  const [draftMajorLibrary, setDraftMajorLibrary] = useState<MajorRecipeLibrary>('recipes');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftCustomTag, setDraftCustomTag] = useState('');
  const [draftTime, setDraftTime] = useState('20');
  const [draftServings, setDraftServings] = useState('2');
  const [draftCarbs, setDraftCarbs] = useState('0');
  const [draftDifficulty, setDraftDifficulty] = useState<'简单' | '适中'>('简单');
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredient[]>([
    emptyIngredient(),
  ]);
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>([emptyStep()]);
  const [timerDeadline, setTimerDeadline] = useState<number | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerStepIndex, setTimerStepIndex] = useState<number | null>(null);
  const [completedTimerSteps, setCompletedTimerSteps] = useState<number[]>([]);
  const [isPageTurning, setIsPageTurning] = useState(false);
  const detailReveal = useSharedValue(0);
  const pageTurn = useSharedValue(1);
  const pageDirection = useSharedValue(1);

  const detailRevealStyle = useAnimatedStyle(() => ({
    opacity: interpolate(detailReveal.value, [0, 0.35, 1], [0, 0.82, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(detailReveal.value, [0, 1], [46, 0], Extrapolation.CLAMP) },
      { scale: interpolate(detailReveal.value, [0, 1], [0.985, 1], Extrapolation.CLAMP) },
    ],
  }));

  const recipePageStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pageTurn.value, [0, 0.28, 1], [0.12, 0.72, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateX:
          interpolate(pageTurn.value, [0, 1], [108, 0], Extrapolation.CLAMP) *
          pageDirection.value,
      },
    ],
  }));

  useEffect(() => {
    if (timerDeadline === null || timerStepIndex === null) return;
    const activeStep = timerStepIndex;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
      setTimerRemaining(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        setTimerDeadline(null);
        setTimerStepIndex(null);
        setCompletedTimerSteps((current) =>
          current.includes(activeStep) ? current : [...current, activeStep]
        );
      }
    }, 250);
    return () => clearInterval(interval);
  }, [timerDeadline, timerStepIndex]);

  const libraryRecipes = useMemo(
    () => recipes.filter((recipe) => (
      majorLibrary === 'baking'
        ? recipe.category === '烘焙谱'
        : recipe.category !== '烘焙谱'
    )),
    [majorLibrary, recipes]
  );

  const visibleRecipes = useMemo(
    () =>
      libraryRecipes.filter((recipe) => {
        const normalizedSearch = search.trim().toLocaleLowerCase();
        const searchableText = [
          recipe.name,
          localizeContent(recipe.name, language),
          ...(recipe.tags ?? []).flatMap((tag) => [tag, localizeContent(tag, language)]),
          ...recipe.ingredients.flatMap((ingredient) => [
            ingredient.name,
            localizeContent(ingredient.name, language),
          ]),
        ]
          .join(' ')
          .toLocaleLowerCase();
        return (
          searchableText.includes(normalizedSearch) &&
          (majorLibrary === 'baking' || category === '全部' || recipe.category === category) &&
          (selectedTag === '全部标签' || (recipe.tags ?? []).includes(selectedTag))
        );
      }),
    [category, language, libraryRecipes, majorLibrary, search, selectedTag]
  );

  const availableRecipeTags = useMemo(
    () => [
      '全部标签',
      ...Array.from(new Set(libraryRecipes.flatMap((recipe) => recipe.tags ?? []))),
    ],
    [libraryRecipes]
  );

  const validDraftRecipe =
    draftName.trim().length > 0 &&
    Number(draftTime) > 0 &&
    Number(draftServings) > 0 &&
    Number(draftCarbs) >= 0 &&
    draftIngredients.length > 0 &&
    draftIngredients.every(
      (ingredient) =>
        ingredient.name.trim().length > 0 &&
        Number.isFinite(Number(ingredient.amount)) &&
        Number(ingredient.amount) > 0 &&
        ingredient.unit.trim().length > 0
    ) &&
    draftSteps.length > 0 &&
    draftSteps.every(
      (step) =>
        step.instruction.trim().length > 0 &&
        (step.timerMinutes.trim().length === 0 ||
          (Number.isFinite(Number(step.timerMinutes)) && Number(step.timerMinutes) > 0))
    );

  const servingMultiplier = selectedRecipe ? servings / selectedRecipe.servings : 1;
  const selectedMatch = selectedRecipe
    ? getRecipeMatch(selectedRecipe, servingMultiplier)
    : null;
  const currentStepDuration = selectedRecipe?.stepTimers?.[stepIndex] ?? 0;

  function openRecipe(recipe: Recipe) {
    detailReveal.set(0);
    pageTurn.set(1);
    pageDirection.set(1);
    setSelectedRecipe(recipe);
    setServings(recipe.servings);
    setMealType(currentMealType());
    setIsCooking(false);
    setStepIndex(0);
    setTimerDeadline(null);
    setTimerRemaining(0);
    setTimerStepIndex(null);
    setCompletedTimerSteps([]);
    setIsPageTurning(false);
    detailReveal.set(
      withDelay(
        35,
        withTiming(1, {
          duration: 440,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        })
      )
    );
  }

  function finishClosingRecipe() {
    setSelectedRecipe(null);
    setIsCooking(false);
    setStepIndex(0);
    setTimerDeadline(null);
    setTimerRemaining(0);
    setTimerStepIndex(null);
    setCompletedTimerSteps([]);
    setIsPageTurning(false);
    pageTurn.set(1);
  }

  function closeRecipe() {
    if (!selectedRecipe) return;
    detailReveal.set(
      withTiming(
        0,
        {
          duration: 310,
          easing: Easing.in(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) runOnJS(finishClosingRecipe)();
        }
      )
    );
  }

  function finishPageTurn() {
    setIsPageTurning(false);
  }

  function revealTurnedPage(direction: number) {
    pageDirection.set(direction);
    pageTurn.set(0);
    pageTurn.set(
      withTiming(
        1,
        {
          duration: 300,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) runOnJS(finishPageTurn)();
        }
      )
    );
  }

  function commitStepPage(nextStep: number, incomingDirection: number) {
    setStepIndex(nextStep);
    revealTurnedPage(incomingDirection);
  }

  function commitCookingPage(incomingDirection: number) {
    setStepIndex(0);
    setIsCooking(true);
    revealTurnedPage(incomingDirection);
  }

  function turnToStep(nextStep: number) {
    if (isPageTurning || nextStep === stepIndex) return;
    const forward = nextStep > stepIndex;
    setIsPageTurning(true);
    pageDirection.set(forward ? -1 : 1);
    pageTurn.set(
      withTiming(
        0,
        {
          duration: 230,
          easing: Easing.in(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) runOnJS(commitStepPage)(nextStep, forward ? 1 : -1);
        }
      )
    );
  }

  function turnIntoCooking() {
    if (isPageTurning) return;
    setIsPageTurning(true);
    pageDirection.set(-1);
    pageTurn.set(
      withTiming(
        0,
        {
          duration: 230,
          easing: Easing.in(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) runOnJS(commitCookingPage)(1);
        }
      )
    );
  }

  function switchMajorLibrary(nextLibrary?: MajorRecipeLibrary) {
    const next = nextLibrary ?? (majorLibrary === 'recipes' ? 'baking' : 'recipes');
    setMajorLibrary(next);
    setCategory('全部');
    setSelectedTag('全部标签');
  }

  function openRecipeForm() {
    const nextDraftLibrary = majorLibrary;
    setDraftMajorLibrary(nextDraftLibrary);
    setDraftCategory(nextDraftLibrary === 'baking' ? '烘焙谱' : '自定义');
    setDraftEmoji(nextDraftLibrary === 'baking' ? '🧁' : '🍳');
    setDraftTags(nextDraftLibrary === 'baking' ? ['烘焙'] : []);
    setIsRecipeFormOpen(true);
  }

  function changeDraftMajorLibrary(nextLibrary: MajorRecipeLibrary) {
    setDraftMajorLibrary(nextLibrary);
    setDraftCategory(nextLibrary === 'baking' ? '烘焙谱' : '自定义');
    if (nextLibrary === 'baking') {
      setDraftEmoji((current) => current === '🍳' ? '🧁' : current);
      setDraftTags((current) => current.includes('烘焙') ? current : ['烘焙', ...current].slice(0, 6));
    } else {
      setDraftTags((current) => current.filter((tag) => tag !== '烘焙'));
    }
  }

  function resetRecipeForm() {
    setDraftName('');
    setDraftEmoji('🍳');
    setDraftDescription('');
    setDraftMajorLibrary('recipes');
    setDraftCategory('自定义');
    setDraftTags([]);
    setDraftCustomTag('');
    setDraftTime('20');
    setDraftServings('2');
    setDraftCarbs('0');
    setDraftDifficulty('简单');
    setDraftIngredients([emptyIngredient()]);
    setDraftSteps([emptyStep()]);
  }

  function toggleDraftTag(tag: string) {
    setDraftTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : current.length < 6
          ? [...current, tag]
          : current
    );
  }

  function addDraftCustomTag() {
    const tag = draftCustomTag.trim().replace(/^#/, '').slice(0, 12);
    if (!tag || draftTags.includes(tag) || draftTags.length >= 6) return;
    setDraftTags((current) => [...current, tag]);
    setDraftCustomTag('');
  }

  function saveRecipe() {
    if (!validDraftRecipe) return;
    const createdRecipe = addRecipe({
      name: draftName.trim(),
      emoji: draftEmoji,
      description:
        draftDescription.trim() || text('我的自定义菜谱。', 'My custom recipe.'),
      timeMinutes: Number(draftTime),
      difficulty: draftDifficulty,
      category: draftCategory,
      tags: draftTags,
      servings: Number(draftServings),
      carbsPerServing: Number(draftCarbs),
      ingredients: draftIngredients.map((ingredient) => ({
        name: ingredient.name.trim(),
        amount: Number(ingredient.amount),
        unit: ingredient.unit.trim(),
      })),
      steps: draftSteps.map((step) => step.instruction.trim()),
      stepsEn: draftSteps.map((step) => step.instruction.trim()),
      stepTimers: draftSteps.map((step) =>
        step.timerMinutes.trim().length > 0
          ? Math.max(1, Math.round(Number(step.timerMinutes) * 60))
          : 0
      ),
      tip: '烹饪前先确认所有食材和用量。',
      tipEn: 'Check every ingredient and amount before cooking.',
    });
    setIsRecipeFormOpen(false);
    setMajorLibrary(draftMajorLibrary);
    setCategory('全部');
    setSelectedTag('全部标签');
    resetRecipeForm();
    setCompletionMessage(
      draftMajorLibrary === 'baking'
        ? text(`“${createdRecipe.name}”已经加入烘焙库。`, `“${createdRecipe.name}” joined your baking library.`)
        : text(`“${createdRecipe.name}”已经加入菜谱库。`, `“${createdRecipe.name}” joined your recipe library.`)
    );
    setRecipeCelebration(createdRecipe);
  }

  function startStepTimer(index: number) {
    const duration = selectedRecipe?.stepTimers?.[index] ?? 0;
    if (duration <= 0) return;
    setCompletedTimerSteps((current) => current.filter((item) => item !== index));
    setTimerStepIndex(index);
    setTimerRemaining(duration);
    setTimerDeadline(Date.now() + duration * 1000);
  }

  function stopTimer() {
    setTimerDeadline(null);
    setTimerStepIndex(null);
    setTimerRemaining(0);
  }

  function finishCooking() {
    if (!selectedRecipe || selectedMatch?.percentage !== 100) return;
    const recipe = selectedRecipe;
    const multiplier = servings / recipe.servings;
    const today = localDateKey();
    const localizedName = localizeContent(recipe.name, language);
    const historyId = `cooking-history-${Date.now()}`;
    const mealFoods = recipe.name;
    const mealFoodsEn = localizeContent(recipe.name, 'en');
    const carbsGrams = Math.round(recipe.carbsPerServing * servings);
    const existingMeal =
      mealType === 'snack'
        ? undefined
        : mealRecords.find((record) => record.date === today && record.type === mealType);
    const mealRecordId = existingMeal?.id ?? `recipe-meal-${historyId}`;

    setTimerDeadline(null);
    setTimerStepIndex(null);
    setTimerRemaining(0);

    cookRecipe(recipe, multiplier, {
      historyId,
      servings,
      mealType,
      mealRecordId,
      mealFoods,
      mealFoodsEn,
      carbsGrams,
    });
    setMealRecords((current) => {
      if (existingMeal) {
        return current.map((record) =>
          record.id === existingMeal.id
            ? {
                ...record,
                foods: `${record.foods}、${mealFoods}`,
                foodsEn: `${record.foodsEn ?? record.foods}, ${mealFoodsEn}`,
                carbsGrams: record.carbsGrams + carbsGrams,
                recipeId: recipe.id,
              }
            : record
        );
      }

      return [
        ...current,
        {
          id: mealRecordId,
          date: today,
          type: mealType,
          time: currentTime(),
          foods: mealFoods,
          foodsEn: mealFoodsEn,
          note: '由菜谱完成。',
          noteEn: 'Completed from a recipe.',
          carbsGrams,
          recipeId: recipe.id,
        },
      ];
    });

    setCompletionMessage(
      text(
        `已完成“${localizedName}”，库存和今日饮食记录已同步更新。`,
        `Finished “${localizedName}”. Inventory and today's meal record are updated.`
      )
    );
    setRecipeCompletion(recipe);
  }

  function confirmUndoCooking() {
    if (!undoCandidate) return;
    const record = undoCookedRecipe(undoCandidate.id);
    if (!record) {
      setUndoCandidate(null);
      return;
    }

    setMealRecords((current) =>
      current.flatMap((meal) => {
        if (meal.id !== record.mealRecordId) return [meal];
        const foods = removeLastListedFood(meal.foods, record.mealFoods, '、');
        const foodsEn = removeLastListedFood(
          meal.foodsEn ?? meal.foods,
          record.mealFoodsEn,
          ', '
        );
        if (!foods) return [];
        return [{
          ...meal,
          foods,
          foodsEn,
          carbsGrams: Math.max(0, meal.carbsGrams - record.carbsGrams),
          recipeId: meal.recipeId === record.recipeId ? undefined : meal.recipeId,
        }];
      })
    );
    setHistoryMessage(
      text(
        `已重置“${localizeContent(record.recipeName, language)}”，食材已经补回库存。`,
        `Reset “${localizeContent(record.recipeName, language)}” and restored its ingredients.`
      )
    );
    setUndoCandidate(null);
  }

  return (
    <>
      <AppScreen
        eyebrow={majorLibrary === 'baking'
          ? text('我的烘焙收藏', 'MY BAKING COLLECTION')
          : text('我的收藏与灵感', 'SAVED IDEAS & INSPIRATION')}
        title={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={majorLibrary === 'baking'
              ? text('当前为烘焙库，点击切换到菜谱库', 'Baking library, switch to recipes')
              : text('当前为菜谱库，点击切换到烘焙库', 'Recipe library, switch to baking')}
            onPress={() => switchMajorLibrary()}
            style={({ pressed }) => [styles.majorLibrarySwitch, pressed && styles.majorLibrarySwitchPressed]}>
            <Text style={[styles.majorLibraryTitle, majorLibrary === 'baking' && styles.majorLibraryTitleBaking]}>
              {majorLibrary === 'baking' ? text('烘焙库', 'Baking') : text('菜谱库', 'Recipes')}
            </Text>
            <View style={[styles.majorLibraryChevron, majorLibrary === 'baking' && styles.majorLibraryChevronBaking]}>
              <Text style={styles.majorLibraryChevronText}>⇄</Text>
            </View>
          </Pressable>
        )}
        subtitle={majorLibrary === 'baking'
          ? text('收藏甜点、面包与每一次烤箱里的期待。', 'Keep desserts, breads, and every oven-made favorite together.')
          : text('按家里的食材，快速找到今天能做的菜。', 'Find something you can make with what is already at home.')}
        action={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('查看烹饪历史', 'View cooking history')}
            onPress={() => {
              setHistoryMessage(null);
              setIsHistoryOpen(true);
            }}
            style={({ pressed }) => [styles.historyIconButton, pressed && styles.cardPressed]}>
            <Text style={styles.historyIcon}>↺</Text>
            {cookingHistory.length > 0 ? (
              <View style={styles.historyCountBadge}>
                <Text style={styles.historyCountText}>
                  {cookingHistory.length > 9 ? '9+' : cookingHistory.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )}>
        {completionMessage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('关闭完成提示', 'Dismiss completion message')}
            onPress={() => setCompletionMessage(null)}
            style={styles.successBanner}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successText}>{completionMessage}</Text>
            <Text style={styles.successClose}>×</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={majorLibrary === 'baking'
            ? text('手动添加烘焙谱', 'Add a baking recipe manually')
            : text('手动添加菜谱', 'Add a recipe manually')}
          onPress={openRecipeForm}
          style={({ pressed }) => [
            styles.addRecipeCard,
            majorLibrary === 'baking' && styles.addRecipeCardBaking,
            pressed && styles.cardPressed,
          ]}>
          <View style={styles.addRecipeIcon}>
            <Text style={styles.addRecipeIconText}>＋</Text>
          </View>
          <View style={styles.addRecipeCopy}>
            <Text style={styles.addRecipeTitle}>
              {majorLibrary === 'baking'
                ? text('手动添加烘焙谱', 'Add your own baking recipe')
                : text('手动添加菜谱', 'Add your own recipe')}
            </Text>
            <Text style={styles.addRecipeSubtitle}>
              {majorLibrary === 'baking'
                ? text('记录配方、温度和烘烤步骤', 'Enter ingredients, temperature, and baking steps')
                : text('记录食材、数量和制作步骤', 'Enter ingredients, amounts, and cooking steps')}
            </Text>
          </View>
          <Text style={styles.addRecipeChevron}>›</Text>
        </Pressable>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={majorLibrary === 'baking'
              ? text('搜索烘焙谱、原料或标签', 'Search baking recipes, ingredients, or tags')
              : text('搜索菜名、食材或标签', 'Search recipes, ingredients, or tags')}
            placeholderTextColor={Colors.light.textSecondary}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>

        {majorLibrary === 'recipes' ? <View style={styles.recipeLibrarySection}>
          <View style={styles.recipeLibraryHeader}>
            <Text style={styles.recipeLibraryHeading}>{text('菜谱分库', 'Recipe collections')}</Text>
            <Text style={styles.recipeLibraryDetail}>
              {text(`${recipeLibraries.length} 个分库`, `${recipeLibraries.length} collections`)}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recipeLibraries}>
            {recipeLibraries.map((library) => {
              const selected = category === library.key;
              const count = library.key === '全部'
                ? libraryRecipes.length
                : libraryRecipes.filter((recipe) => recipe.category === library.key).length;
              return (
                <Pressable
                  key={library.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={text(
                    `${library.zh}，${count} 道菜`,
                    `${library.en}, ${count} recipes`
                  )}
                  onPress={() => setCategory(library.key)}
                  style={[
                    styles.recipeLibraryCard,
                    { backgroundColor: selected ? library.color : `${library.color}18` },
                    selected && styles.recipeLibraryCardSelected,
                  ]}>
                  <Text style={styles.recipeLibraryEmoji}>{library.emoji}</Text>
                  <View style={styles.recipeLibraryCopy}>
                    <Text style={[styles.recipeLibraryLabel, { color: selected ? '#FFFFFF' : library.color }]}>
                      {text(library.zh, library.en)}
                    </Text>
                    <Text style={[styles.recipeLibraryCount, selected && styles.recipeLibraryCountSelected]}>
                      {text(`${count} 道`, `${count}`)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View> : (
          <View style={styles.bakingLibraryBanner}>
            <View style={styles.bakingLibraryIcon}><Text style={styles.bakingLibraryEmoji}>🧁</Text></View>
            <View style={styles.bakingLibraryCopy}>
              <Text style={styles.bakingLibraryHeading}>{text('独立烘焙收藏', 'Your baking collection')}</Text>
              <Text style={styles.bakingLibraryDetail}>
                {text(`${libraryRecipes.length} 份烘焙谱 · 点击左上角切回菜谱库`, `${libraryRecipes.length} baking recipes · Switch libraries at the top left`)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.tagFilterSection}>
          <Text style={styles.tagFilterLabel}>{text('标签筛选', 'Filter by tag')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagFilters}>
            {availableRecipeTags.map((tag) => {
              const selected = selectedTag === tag;
              return (
                <Pressable
                  key={tag}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setSelectedTag(tag)}
                  style={[styles.tagFilter, selected && styles.tagFilterSelected]}>
                  <Text style={[styles.tagFilterText, selected && styles.tagFilterTextSelected]}>
                    {tag === '全部标签' ? '🏷️ ' : '# '}{localizeContent(tag, language)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={majorLibrary === 'baking' ? text('我的烘焙谱', 'My baking recipes') : text('为你整理', 'For you')}
            detail={text(`${visibleRecipes.length} 道菜`, `${visibleRecipes.length} recipes`)}
          />
          <View style={styles.recipeList}>
            {visibleRecipes.map((recipe) => {
              const match = getRecipeMatch(recipe);
              const complete = match.percentage === 100;
              return (
                <Pressable
                  key={recipe.id}
                  accessibilityRole="button"
                  accessibilityLabel={text(`查看${recipe.name}菜谱`, `View ${localizeContent(recipe.name, 'en')} recipe`)}
                  onPress={() => openRecipe(recipe)}
                  style={({ pressed }) => [styles.recipeCard, pressed && styles.cardPressed]}>
                  <View style={styles.recipeVisual}>
                    <Text style={styles.recipeEmoji}>{recipe.emoji}</Text>
                    <View style={[styles.matchBadge, complete && styles.matchBadgeComplete]}>
                      <Text style={[styles.matchText, complete && styles.matchTextComplete]}>
                        {match.percentage}% {text('匹配', 'match')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recipeBody}>
                    <View style={styles.recipeTitleRow}>
                      <Text style={styles.recipeName}>{localizeContent(recipe.name, language)}</Text>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                    <Text style={styles.recipeDescription} numberOfLines={2}>
                      {localizeContent(recipe.description, language)}
                    </Text>
                    {(recipe.tags ?? []).length > 0 ? (
                      <View style={styles.recipeTagRow}>
                        {(recipe.tags ?? []).slice(0, 3).map((tag) => (
                          <View key={`${recipe.id}-${tag}`} style={styles.recipeTagPill}>
                            <Text style={styles.recipeTagText}>#{localizeContent(tag, language)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.recipeMeta}>
                      <Text style={styles.metaText}>⏱ {recipe.timeMinutes} {text('分钟', 'min')}</Text>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={styles.metaText}>{localizeContent(recipe.difficulty, language)}</Text>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={styles.metaText}>{text(`${recipe.servings}人份`, `${recipe.servings} servings`)}</Text>
                    </View>
                    {match.missing.length > 0 ? (
                      <Text style={styles.missing}>
                        {text('缺少：', 'Missing: ')}
                        {match.missing.map((item) => localizeContent(item, language)).join(text('、', ', '))}
                      </Text>
                    ) : (
                      <Text style={styles.ready}>✓ {text('现在就能做', 'Ready to make')}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {visibleRecipes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🥣</Text>
              <Text style={styles.emptyTitle}>{text('没有找到相符的菜谱', 'No matching recipes')}</Text>
              <Text style={styles.emptyText}>{text('换一个关键词或分类试试。', 'Try another keyword or category.')}</Text>
            </View>
          ) : null}
        </View>
      </AppScreen>

      <Modal
        visible={isHistoryOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsHistoryOpen(false)}>
        <View style={styles.historyPage}>
          <View style={[styles.historyHeader, { paddingTop: Math.max(insets.top, 12) }]}> 
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('关闭烹饪历史', 'Close cooking history')}
              onPress={() => setIsHistoryOpen(false)}
              style={styles.historyCloseButton}>
              <Text style={styles.historyCloseText}>×</Text>
            </Pressable>
            <View style={styles.historyHeaderCopy}>
              <Text style={styles.historyHeaderTitle}>{text('烹饪历史', 'Cooking history')}</Text>
              <Text style={styles.historyHeaderSubtitle}>
                {text(`${cookingHistory.length} 次完成记录`, `${cookingHistory.length} completed`)}
              </Text>
            </View>
            <View style={styles.historyHeaderPlaceholder} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.historyContent,
              { paddingBottom: Math.max(insets.bottom, 18) + 30 },
            ]}>
            {historyMessage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('关闭重置提示', 'Dismiss reset message')}
                onPress={() => setHistoryMessage(null)}
                style={styles.historySuccessBanner}>
                <Text style={styles.historySuccessIcon}>✓</Text>
                <Text style={styles.historySuccessText}>{historyMessage}</Text>
                <Text style={styles.historySuccessClose}>×</Text>
              </Pressable>
            ) : null}

            <View style={styles.historyIntroCard}>
              <View style={styles.historyIntroIcon}>
                <Text style={styles.historyIntroEmoji}>👩‍🍳</Text>
              </View>
              <View style={styles.historyIntroCopy}>
                <Text style={styles.historyIntroTitle}>
                  {text('做过的菜都在这里', 'Everything you have cooked')}
                </Text>
                <Text style={styles.historyIntroText}>
                  {text(
                    '误点完成时可以重置，系统会按原库存批次补回食材，并修正健康记录。',
                    'Reset an accidental completion to restore the original stock batches and meal log.'
                  )}
                </Text>
              </View>
            </View>

            {cookingHistory.length > 0 ? (
              <View style={styles.cookingHistoryList}>
                {cookingHistory.map((record) => {
                  const meal = mealOptions.find((option) => option.key === record.mealType);
                  return (
                    <View key={record.id} style={styles.cookingHistoryCard}>
                      <View style={styles.cookingHistoryTopRow}>
                        <View style={styles.cookingHistoryEmojiWrap}>
                          <Text style={styles.cookingHistoryEmoji}>{record.recipeEmoji}</Text>
                        </View>
                        <View style={styles.cookingHistoryMainCopy}>
                          <Text style={styles.cookingHistoryName}>
                            {localizeContent(record.recipeName, language)}
                          </Text>
                          <Text style={styles.cookingHistoryDate}>
                            {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-CA', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(record.completedAt))}
                          </Text>
                        </View>
                        <View style={styles.cookingHistoryMealPill}>
                          <Text style={styles.cookingHistoryMealText}>
                            {meal?.emoji} {meal ? text(meal.zh, meal.en) : ''}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cookingHistoryMetaRow}>
                        <Text style={styles.cookingHistoryMeta}>
                          {text(`${record.servings} 人份`, `${record.servings} servings`)}
                        </Text>
                        <View style={styles.cookingHistoryMetaDot} />
                        <Text style={styles.cookingHistoryMeta}>
                          {text(`${record.usages.length} 个库存批次`, `${record.usages.length} stock batches`)}
                        </Text>
                      </View>

                      <View style={styles.restoredIngredientList}>
                        {record.usages.map((usage) => (
                          <View key={`${record.id}-${usage.itemId}`} style={styles.restoredIngredientRow}>
                            <Text style={styles.restoredIngredientName}>
                              {localizeContent(usage.itemName, language)}
                            </Text>
                            <Text style={styles.restoredIngredientAmount}>
                              −{formatAmount(usage.amount, usage.unit, language)}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={text(
                          `重置${localizeContent(record.recipeName, language)}并补回食材`,
                          `Reset ${localizeContent(record.recipeName, language)} and restore ingredients`
                        )}
                        onPress={() => setUndoCandidate(record)}
                        style={({ pressed }) => [styles.resetCookingButton, pressed && styles.cardPressed]}>
                        <Text style={styles.resetCookingIcon}>↺</Text>
                        <Text style={styles.resetCookingText}>
                          {text('重置并补回食材', 'Reset & restore ingredients')}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.historyEmptyState}>
                <Text style={styles.historyEmptyEmoji}>🍽️</Text>
                <Text style={styles.historyEmptyTitle}>{text('还没有完成记录', 'No cooking history yet')}</Text>
                <Text style={styles.historyEmptyText}>
                  {text('完成一道菜后，会自动出现在这里。', 'Completed recipes will appear here automatically.')}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        transparent
        visible={undoCandidate !== null}
        animationType="fade"
        onRequestClose={() => setUndoCandidate(null)}>
        <View style={styles.undoBackdrop}>
          <View style={styles.undoDialog}>
            <View style={styles.undoDialogIcon}>
              <Text style={styles.undoDialogIconText}>↺</Text>
            </View>
            <Text style={styles.undoDialogTitle}>{text('确认重置这次记录？', 'Reset this completion?')}</Text>
            <Text style={styles.undoDialogText}>
              {text(
                `“${undoCandidate ? localizeContent(undoCandidate.recipeName, language) : ''}”消耗的食材会补回原库存，相关饮食记录也会同步修正。`,
                `Ingredients used for “${undoCandidate ? localizeContent(undoCandidate.recipeName, language) : ''}” will return to stock and its meal log will be corrected.`
              )}
            </Text>
            <View style={styles.undoDialogActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setUndoCandidate(null)}
                style={styles.undoCancelButton}>
                <Text style={styles.undoCancelText}>{text('保留记录', 'Keep it')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('确认重置并补回食材', 'Confirm reset and restore ingredients')}
                onPress={confirmUndoCooking}
                style={styles.undoConfirmButton}>
                <Text style={styles.undoConfirmText}>{text('确认重置', 'Reset')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedRecipe !== null}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={closeRecipe}>
        {selectedRecipe ? (
          <Animated.View style={[styles.detailPage, detailRevealStyle]}>
            <View style={[styles.detailHeader, { paddingTop: Math.max(insets.top, 12) }]}> 
              <Pressable accessibilityRole="button" onPress={closeRecipe} style={styles.headerButton}>
                <Text style={styles.headerButtonText}>×</Text>
              </Pressable>
              <Text style={styles.detailHeaderTitle}>
                {isCooking ? text('烹饪模式', 'Cooking mode') : text('菜谱详情', 'Recipe details')}
              </Text>
              {selectedRecipe.id.startsWith('custom-recipe-') && !isCooking ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text('删除自定义菜谱', 'Delete custom recipe')}
                  onPress={() => {
                    const deletedName = selectedRecipe.name;
                    deleteRecipe(selectedRecipe.id);
                    closeRecipe();
                    setCompletionMessage(
                      text(`已删除“${deletedName}”。`, `Deleted “${deletedName}”.`)
                    );
                  }}
                  style={styles.deleteRecipeButton}>
                  <Text style={styles.deleteRecipeButtonText}>{text('删除', 'Delete')}</Text>
                </Pressable>
              ) : (
                <View style={styles.headerButtonPlaceholder} />
              )}
            </View>

            <ScrollView
              contentContainerStyle={[styles.detailContent, { paddingBottom: Math.max(insets.bottom, 20) + 118 }]}
              showsVerticalScrollIndicator={false}>
              <Animated.View style={[styles.recipePageSheet, recipePageStyle]}>
              <View style={styles.detailHero}>
                <View style={styles.detailEmojiWrap}>
                  <Text style={styles.detailEmoji}>{selectedRecipe.emoji}</Text>
                </View>
                <View style={styles.detailHeroCopy}>
                  <Text style={styles.detailTitle}>{localizeContent(selectedRecipe.name, language)}</Text>
                  <Text style={styles.detailDescription}>
                    {localizeContent(selectedRecipe.description, language)}
                  </Text>
                  <View style={styles.detailMetaRow}>
                    <Text style={styles.detailMeta}>⏱ {selectedRecipe.timeMinutes}{text('分钟', ' min')}</Text>
                    <Text style={styles.detailMeta}>◎ {localizeContent(selectedRecipe.difficulty, language)}</Text>
                  </View>
                  {(selectedRecipe.tags ?? []).length > 0 ? (
                    <View style={styles.detailTagRow}>
                      {(selectedRecipe.tags ?? []).map((tag) => (
                        <View key={`${selectedRecipe.id}-detail-${tag}`} style={styles.detailTagPill}>
                          <Text style={styles.detailTagText}>#{localizeContent(tag, language)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>

              {!isCooking ? (
                <>
                  <View style={styles.controlCard}>
                    <View>
                      <Text style={styles.controlLabel}>{text('制作份数', 'Servings')}</Text>
                      <Text style={styles.controlHint}>{text('用料会自动换算', 'Ingredients update automatically')}</Text>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={text('减少份数', 'Decrease servings')}
                        disabled={servings <= 1}
                        onPress={() => setServings((value) => Math.max(1, value - 1))}
                        style={[styles.stepperButton, servings <= 1 && styles.disabled]}>
                        <Text style={styles.stepperButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.servingsValue}>{servings}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={text('增加份数', 'Increase servings')}
                        disabled={servings >= 8}
                        onPress={() => setServings((value) => Math.min(8, value + 1))}
                        style={[styles.stepperButton, servings >= 8 && styles.disabled]}>
                        <Text style={styles.stepperButtonText}>＋</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <View style={styles.detailSectionHeader}>
                      <Text style={styles.detailSectionTitle}>{text('所需食材', 'Ingredients')}</Text>
                      <View style={[styles.detailMatchPill, selectedMatch?.percentage === 100 && styles.detailMatchPillReady]}>
                        <Text style={[styles.detailMatchText, selectedMatch?.percentage === 100 && styles.detailMatchTextReady]}>
                          {selectedMatch?.percentage}% {text('库存匹配', 'match')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.ingredientList}>
                      {selectedRecipe.ingredients.map((ingredient) => {
                        const amount = ingredient.amount * servingMultiplier;
                        const availableBase = availableIngredientAmount(inventory, ingredient);
                        const neededBase = amountInBaseUnit(amount, ingredient.unit).amount;
                        const available = amountFromBaseUnit(availableBase, ingredient.unit);
                        const enough = availableBase >= neededBase;
                        return (
                          <View key={ingredient.name} style={styles.ingredientRow}>
                            <View style={[styles.checkCircle, enough && styles.checkCircleReady]}>
                              <Text style={[styles.checkMark, enough && styles.checkMarkReady]}>{enough ? '✓' : '!'}</Text>
                            </View>
                            <View style={styles.ingredientCopy}>
                              <Text style={styles.ingredientName}>{localizeContent(ingredient.name, language)}</Text>
                              <Text style={styles.stockText}>
                                {enough
                                  ? text(`库存 ${formatAmount(available, ingredient.unit, language)}`, `In stock: ${formatAmount(available, ingredient.unit, language)}`)
                                  : text('库存不足', 'Not enough in stock')}
                              </Text>
                            </View>
                            <Text style={styles.ingredientAmount}>{formatAmount(amount, ingredient.unit, language)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <View style={styles.detailSectionHeader}>
                      <Text style={styles.detailSectionTitle}>{text('制作步骤', 'Cooking steps')}</Text>
                      <Text style={styles.stepsCountText}>
                        {text(`${selectedRecipe.steps.length} 步`, `${selectedRecipe.steps.length} steps`)}
                      </Text>
                    </View>
                    <View style={styles.stepsPreviewList}>
                      {(language === 'zh' ? selectedRecipe.steps : selectedRecipe.stepsEn).map(
                        (step, index) => {
                          const duration = selectedRecipe.stepTimers?.[index] ?? 0;
                          return (
                            <View key={`${selectedRecipe.id}-step-${index}`} style={styles.stepPreviewRow}>
                              <View style={styles.stepNumberCircle}>
                                <Text style={styles.stepNumberText}>{index + 1}</Text>
                              </View>
                              <Text style={styles.stepPreviewText}>{step}</Text>
                              {duration > 0 ? (
                                <View style={styles.stepTimerPill}>
                                  <Text style={styles.stepTimerPillText}>⏱ {formatStepDuration(duration, language)}</Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        }
                      )}
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.cookingCard}>
                  <View style={styles.cookingProgressRow}>
                    {selectedRecipe.steps.map((_, index) => (
                      <View
                        key={index}
                        style={[styles.cookingProgressDot, index <= stepIndex && styles.cookingProgressDotActive]}
                      />
                    ))}
                  </View>
                  {timerStepIndex !== null &&
                  timerStepIndex !== stepIndex &&
                  timerDeadline !== null ? (
                    <View style={styles.backgroundTimerBanner}>
                      <View style={styles.backgroundTimerCopy}>
                        <Text style={styles.backgroundTimerLabel}>
                          {text(`第 ${timerStepIndex + 1} 步仍在计时`, `Step ${timerStepIndex + 1} timer is running`)}
                        </Text>
                        <Text style={styles.backgroundTimerValue}>{formatCountdown(timerRemaining)}</Text>
                      </View>
                      <Pressable accessibilityRole="button" onPress={stopTimer} style={styles.stopTimerButtonSmall}>
                        <Text style={styles.stopTimerButtonSmallText}>{text('停止', 'Stop')}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Text style={styles.stepEyebrow}>
                    {text(`第 ${stepIndex + 1} 步，共 ${selectedRecipe.steps.length} 步`, `Step ${stepIndex + 1} of ${selectedRecipe.steps.length}`)}
                  </Text>
                  <Text style={styles.stepText}>
                    {(language === 'zh' ? selectedRecipe.steps : selectedRecipe.stepsEn)[stepIndex]}
                  </Text>
                  {currentStepDuration > 0 ? (
                    <View style={styles.stepTimerControl}>
                      {timerStepIndex === stepIndex && timerDeadline !== null ? (
                        <>
                          <View>
                            <Text style={styles.stepTimerControlLabel}>{text('倒计时进行中', 'Timer running')}</Text>
                            <Text style={styles.stepTimerValue}>{formatCountdown(timerRemaining)}</Text>
                          </View>
                          <Pressable accessibilityRole="button" onPress={stopTimer} style={styles.stopTimerButton}>
                            <Text style={styles.stopTimerButtonText}>{text('停止', 'Stop')}</Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <View style={styles.stepTimerReadyCopy}>
                            <Text style={styles.stepTimerReadyIcon}>
                              {completedTimerSteps.includes(stepIndex) ? '✓' : '⏱'}
                            </Text>
                            <View style={styles.stepTimerReadyTextWrap}>
                              <Text style={styles.stepTimerControlLabel}>
                                {completedTimerSteps.includes(stepIndex)
                                  ? text('本步骤计时完成', 'Timer completed')
                                  : text('本步骤需要计时', 'This step has a timer')}
                              </Text>
                              <Text style={styles.stepTimerDurationText}>
                                {formatStepDuration(currentStepDuration, language)}
                              </Text>
                            </View>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={text('开始倒计时', 'Start countdown')}
                            onPress={() => startStepTimer(stepIndex)}
                            style={styles.startTimerButton}>
                            <Text style={styles.startTimerButtonText}>
                              {completedTimerSteps.includes(stepIndex)
                                ? text('重新计时', 'Restart')
                                : text('开始倒计时', 'Start countdown')}
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  ) : null}
                  <View style={styles.timerHint}>
                    <Text style={styles.timerHintIcon}>👩‍🍳</Text>
                    <Text style={styles.timerHintText}>{text(selectedRecipe.tip, selectedRecipe.tipEn)}</Text>
                  </View>
                </View>
              )}

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>{text('记录到哪一餐', 'Log this as')}</Text>
                <View style={styles.mealOptions}>
                  {mealOptions.map((option) => (
                    <Pressable
                      key={option.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: mealType === option.key }}
                      onPress={() => setMealType(option.key)}
                      style={[styles.mealOption, mealType === option.key && styles.mealOptionSelected]}>
                      <Text style={styles.mealOptionEmoji}>{option.emoji}</Text>
                      <Text style={[styles.mealOptionText, mealType === option.key && styles.mealOptionTextSelected]}>
                        {text(option.zh, option.en)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              </Animated.View>
            </ScrollView>

            <View style={[styles.bottomActionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}> 
              {isCooking ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={stepIndex === 0 || isPageTurning}
                    onPress={() => turnToStep(Math.max(0, stepIndex - 1))}
                    style={[styles.secondaryAction, (stepIndex === 0 || isPageTurning) && styles.disabled]}>
                    <Text style={styles.secondaryActionText}>{text('上一步', 'Back')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPageTurning}
                    onPress={() => {
                      if (stepIndex < selectedRecipe.steps.length - 1) {
                        turnToStep(stepIndex + 1);
                      } else {
                        finishCooking();
                      }
                    }}
                    style={[styles.primaryAction, isPageTurning && styles.disabled]}>
                    <Text style={styles.primaryActionText}>
                      {stepIndex < selectedRecipe.steps.length - 1
                        ? text('下一步', 'Next step')
                        : text('完成并扣减库存', 'Finish & update stock')}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text('开始烹饪', 'Start cooking')}
                  disabled={selectedMatch?.percentage !== 100 || isPageTurning}
                  onPress={turnIntoCooking}
                  style={[styles.primaryAction, selectedMatch?.percentage !== 100 && styles.primaryActionDisabled, isPageTurning && styles.disabled]}>
                  <Text style={styles.primaryActionText}>
                    {selectedMatch?.percentage === 100
                      ? text('开始烹饪', 'Start cooking')
                      : text(`还缺 ${selectedMatch?.missing.length ?? 0} 种食材`, `${selectedMatch?.missing.length ?? 0} ingredients missing`)}
                  </Text>
                </Pressable>
              )}
            </View>
          </Animated.View>
        ) : null}
      </Modal>

      <Modal
        visible={isRecipeFormOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsRecipeFormOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formPage}>
          <View style={[styles.formHeader, { paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsRecipeFormOpen(false)}
              style={styles.formHeaderSide}>
              <Text style={styles.formCancelText}>{text('取消', 'Cancel')}</Text>
            </Pressable>
            <Text style={styles.formHeaderTitle}>
              {draftMajorLibrary === 'baking' ? text('新建烘焙谱', 'New baking recipe') : text('新建菜谱', 'New recipe')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !validDraftRecipe }}
              disabled={!validDraftRecipe}
              onPress={saveRecipe}
              style={styles.formHeaderSide}>
              <Text style={[styles.formSaveText, !validDraftRecipe && styles.formSaveTextDisabled]}>
                {text('保存', 'Save')}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.formContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 36 },
            ]}>
            <View style={styles.formIntro}>
              <Text style={styles.formIntroEmoji}>{draftEmoji}</Text>
              <View style={styles.formIntroCopy}>
                <Text style={styles.formIntroTitle}>
                  {draftMajorLibrary === 'baking' ? text('收藏你的烘焙配方', 'Save your favorite bake') : text('记录你的拿手菜', 'Save your signature dish')}
                </Text>
                <Text style={styles.formIntroText}>
                  {text(
                    '食材名称会自动和库存匹配，数量会随制作份数换算。',
                    'Ingredient names match your inventory and amounts scale with servings.'
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>{text('基本信息', 'Basics')}</Text>
              <Text style={styles.fieldLabel}>
                {draftMajorLibrary === 'baking' ? text('烘焙谱名称 *', 'Baking recipe name *') : text('菜谱名称 *', 'Recipe name *')}
              </Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder={text('例如：妈妈的番茄牛腩', "Example: Mom's tomato beef stew")}
                placeholderTextColor={Colors.light.textSecondary}
                style={styles.formInput}
                maxLength={50}
              />

              <Text style={styles.fieldLabel}>{text('选择 Emoji', 'Choose an emoji')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiPicker}>
                {recipeEmojis.map((emoji) => (
                  <Pressable
                    key={emoji}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: draftEmoji === emoji }}
                    onPress={() => setDraftEmoji(emoji)}
                    style={[styles.emojiOption, draftEmoji === emoji && styles.emojiOptionSelected]}>
                    <Text style={styles.emojiOptionText}>{emoji}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>{text('简介', 'Description')}</Text>
              <TextInput
                value={draftDescription}
                onChangeText={setDraftDescription}
                placeholder={text('写一点味道、来源或适合的场景', 'Describe the flavor, origin, or occasion')}
                placeholderTextColor={Colors.light.textSecondary}
                style={[styles.formInput, styles.multilineInput]}
                multiline
                maxLength={160}
              />

              <Text style={styles.fieldLabel}>{text('保存到大库', 'Save to library')}</Text>
              <View style={styles.majorLibraryChoices}>
                {([
                  { key: 'recipes' as const, zh: '菜谱库', en: 'Recipes', emoji: '🍳', color: Colors.light.primary },
                  { key: 'baking' as const, zh: '烘焙库', en: 'Baking', emoji: '🧁', color: '#B96F45' },
                ]).map((item) => {
                  const selected = draftMajorLibrary === item.key;
                  return <Pressable
                    key={item.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => changeDraftMajorLibrary(item.key)}
                    style={[styles.majorLibraryChoice, selected && { backgroundColor: item.color, borderColor: item.color }]}>
                    <Text style={styles.majorLibraryChoiceEmoji}>{item.emoji}</Text>
                    <Text style={[styles.majorLibraryChoiceText, selected && styles.majorLibraryChoiceTextSelected]}>
                      {text(item.zh, item.en)}
                    </Text>
                    <Text style={[styles.majorLibraryChoiceCheck, selected && styles.majorLibraryChoiceCheckSelected]}>
                      {selected ? '✓' : '○'}
                    </Text>
                  </Pressable>;
                })}
              </View>

              {draftMajorLibrary === 'recipes' ? <>
                <Text style={styles.fieldLabel}>{text('菜谱分类', 'Recipe category')}</Text>
                <View style={styles.choiceWrap}>
                  {recipeCategories.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: draftCategory === item.key }}
                    onPress={() => setDraftCategory(item.key)}
                    style={[
                      styles.choiceChip,
                      draftCategory === item.key && { backgroundColor: item.color, borderColor: item.color },
                    ]}>
                    <Text style={[styles.choiceChipText, draftCategory === item.key && styles.categoryChoiceTextSelected]}>
                      {item.emoji} {text(item.zh, item.en)}
                    </Text>
                  </Pressable>
                  ))}
                </View>
              </> : (
                <View style={styles.bakingFormHint}>
                  <Text style={styles.bakingFormHintEmoji}>🧁</Text>
                  <Text style={styles.bakingFormHintText}>
                    {text('这份配方会单独收藏到烘焙库。', 'This recipe will be kept in your separate baking library.')}
                  </Text>
                </View>
              )}

              <View style={styles.formTagHeadingRow}>
                <View>
                  <Text style={styles.fieldLabel}>{text('标签', 'Tags')}</Text>
                  <Text style={styles.formTagHint}>{text('最多选择 6 个', 'Choose up to 6')}</Text>
                </View>
                <Text style={styles.formTagCount}>{draftTags.length}/6</Text>
              </View>
              <View style={styles.choiceWrap}>
                {Array.from(new Set([
                  ...(draftMajorLibrary === 'baking' ? bakingRecipeTags : commonRecipeTags),
                  ...draftTags,
                ])).map((tag) => {
                  const selected = draftTags.includes(tag);
                  const disabled = !selected && draftTags.length >= 6;
                  return (
                    <Pressable
                      key={tag}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled}
                      onPress={() => toggleDraftTag(tag)}
                      style={[
                        styles.formTagChip,
                        selected && styles.formTagChipSelected,
                        disabled && styles.disabled,
                      ]}>
                      <Text style={[styles.formTagChipText, selected && styles.formTagChipTextSelected]}>
                        #{localizeContent(tag, language)} {selected ? '✓' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.customTagRow}>
                <TextInput
                  value={draftCustomTag}
                  onChangeText={setDraftCustomTag}
                  onSubmitEditing={addDraftCustomTag}
                  placeholder={text('输入自定义标签', 'Enter a custom tag')}
                  placeholderTextColor={Colors.light.textSecondary}
                  style={[styles.formInput, styles.customTagInput]}
                  returnKeyType="done"
                  maxLength={13}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text('添加自定义标签', 'Add custom tag')}
                  disabled={!draftCustomTag.trim() || draftTags.length >= 6}
                  onPress={addDraftCustomTag}
                  style={[
                    styles.customTagButton,
                    (!draftCustomTag.trim() || draftTags.length >= 6) && styles.disabled,
                  ]}>
                  <Text style={styles.customTagButtonText}>{text('添加', 'Add')}</Text>
                </Pressable>
              </View>

              <View style={styles.compactFieldsRow}>
                <View style={styles.compactField}>
                  <Text style={styles.fieldLabel}>{text('份数 *', 'Servings *')}</Text>
                  <TextInput
                    value={draftServings}
                    onChangeText={setDraftServings}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    placeholder="2"
                    placeholderTextColor={Colors.light.textSecondary}
                    style={styles.formInput}
                  />
                </View>
                <View style={styles.compactField}>
                  <Text style={styles.fieldLabel}>{text('用时/分钟 *', 'Minutes *')}</Text>
                  <TextInput
                    value={draftTime}
                    onChangeText={setDraftTime}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    placeholder="20"
                    placeholderTextColor={Colors.light.textSecondary}
                    style={styles.formInput}
                  />
                </View>
                <View style={styles.compactField}>
                  <Text style={styles.fieldLabel}>{text('碳水/份', 'Carbs/serving')}</Text>
                  <TextInput
                    value={draftCarbs}
                    onChangeText={setDraftCarbs}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="0"
                    placeholderTextColor={Colors.light.textSecondary}
                    style={styles.formInput}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>{text('难度', 'Difficulty')}</Text>
              <View style={styles.choiceWrap}>
                {(['简单', '适中'] as const).map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: draftDifficulty === item }}
                    onPress={() => setDraftDifficulty(item)}
                    style={[styles.choiceChip, draftDifficulty === item && styles.choiceChipSelected]}>
                    <Text style={[styles.choiceChipText, draftDifficulty === item && styles.choiceChipTextSelected]}>
                      {localizeContent(item, language)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formSection}>
              <View style={styles.formSectionHeadingRow}>
                <View>
                  <Text style={styles.formSectionTitle}>{text('所需食材 *', 'Ingredients *')}</Text>
                  <Text style={styles.formSectionHint}>
                    {text('按当前菜谱份数填写', 'Enter amounts for the recipe servings above')}
                  </Text>
                </View>
                <Text style={styles.ingredientCount}>
                  {text(`${draftIngredients.length} 种`, `${draftIngredients.length} items`)}
                </Text>
              </View>

              {draftIngredients.map((ingredient, index) => (
                <View key={ingredient.id} style={styles.draftIngredientCard}>
                  <View style={styles.draftIngredientHeader}>
                    <Text style={styles.draftIngredientTitle}>
                      {text(`食材 ${index + 1}`, `Ingredient ${index + 1}`)}
                    </Text>
                    {draftIngredients.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={text('移除此食材', 'Remove ingredient')}
                        onPress={() =>
                          setDraftIngredients((current) =>
                            current.filter((item) => item.id !== ingredient.id)
                          )
                        }>
                        <Text style={styles.removeIngredientText}>{text('移除', 'Remove')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <TextInput
                    value={ingredient.name}
                    onChangeText={(value) =>
                      setDraftIngredients((current) =>
                        current.map((item) =>
                          item.id === ingredient.id ? { ...item, name: value } : item
                        )
                      )
                    }
                    placeholder={text('食材名称，例如：番茄', 'Ingredient name, e.g. tomato')}
                    placeholderTextColor={Colors.light.textSecondary}
                    style={styles.formInput}
                    maxLength={40}
                  />
                  <View style={styles.ingredientAmountRow}>
                    <TextInput
                      value={ingredient.amount}
                      onChangeText={(value) =>
                        setDraftIngredients((current) =>
                          current.map((item) =>
                            item.id === ingredient.id ? { ...item, amount: value } : item
                          )
                        )
                      }
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder={text('数量', 'Amount')}
                      placeholderTextColor={Colors.light.textSecondary}
                      style={[styles.formInput, styles.amountInput]}
                    />
                    <TextInput
                      value={ingredient.unit}
                      onChangeText={(value) =>
                        setDraftIngredients((current) =>
                          current.map((item) =>
                            item.id === ingredient.id ? { ...item, unit: value } : item
                          )
                        )
                      }
                      placeholder={text('单位', 'Unit')}
                      placeholderTextColor={Colors.light.textSecondary}
                      style={[styles.formInput, styles.unitInput]}
                      maxLength={12}
                    />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitPicker}>
                    {ingredientUnits.map((unit) => (
                      <Pressable
                        key={unit}
                        onPress={() =>
                          setDraftIngredients((current) =>
                            current.map((item) =>
                              item.id === ingredient.id ? { ...item, unit } : item
                            )
                          )
                        }
                        style={[styles.unitChip, ingredient.unit === unit && styles.unitChipSelected]}>
                        <Text style={[styles.unitChipText, ingredient.unit === unit && styles.unitChipTextSelected]}>
                          {formatAmount(1, unit, language).replace(/^1\s*/, '') || unit}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ))}

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setDraftIngredients((current) => [
                    ...current,
                    emptyIngredient(current.length),
                  ])
                }
                style={styles.addIngredientButton}>
                <Text style={styles.addIngredientButtonText}>＋ {text('添加一种食材', 'Add ingredient')}</Text>
              </Pressable>
            </View>

            <View style={styles.formSection}>
              <View style={styles.formSectionHeadingRow}>
                <View>
                  <Text style={styles.formSectionTitle}>{text('制作步骤 *', 'Cooking steps *')}</Text>
                  <Text style={styles.formSectionHint}>
                    {text('每一步都可以设置可选倒计时', 'Each step can have an optional countdown')}
                  </Text>
                </View>
                <Text style={styles.ingredientCount}>
                  {text(`${draftSteps.length} 步`, `${draftSteps.length} steps`)}
                </Text>
              </View>

              {draftSteps.map((step, index) => (
                <View key={step.id} style={styles.draftStepCard}>
                  <View style={styles.draftIngredientHeader}>
                    <View style={styles.draftStepTitleRow}>
                      <View style={styles.draftStepNumber}>
                        <Text style={styles.draftStepNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.draftIngredientTitle}>
                        {text(`第 ${index + 1} 步`, `Step ${index + 1}`)}
                      </Text>
                    </View>
                    {draftSteps.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={text('移除此步骤', 'Remove step')}
                        onPress={() =>
                          setDraftSteps((current) =>
                            current.filter((item) => item.id !== step.id)
                          )
                        }>
                        <Text style={styles.removeIngredientText}>{text('移除', 'Remove')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <TextInput
                    value={step.instruction}
                    onChangeText={(value) =>
                      setDraftSteps((current) =>
                        current.map((item) =>
                          item.id === step.id ? { ...item, instruction: value } : item
                        )
                      )
                    }
                    placeholder={text('描述这一步要做什么', 'Describe what to do in this step')}
                    placeholderTextColor={Colors.light.textSecondary}
                    style={[styles.formInput, styles.stepInstructionInput]}
                    multiline
                    textAlignVertical="top"
                    maxLength={240}
                  />
                  <View style={styles.stepTimerInputRow}>
                    <View style={styles.stepTimerInputIcon}>
                      <Text style={styles.stepTimerInputIconText}>⏱</Text>
                    </View>
                    <View style={styles.stepTimerInputCopy}>
                      <Text style={styles.stepTimerInputLabel}>{text('倒计时（分钟）', 'Countdown (minutes)')}</Text>
                      <Text style={styles.stepTimerInputHint}>{text('不需要计时可留空', 'Leave blank if no timer is needed')}</Text>
                    </View>
                    <TextInput
                      value={step.timerMinutes}
                      onChangeText={(value) =>
                        setDraftSteps((current) =>
                          current.map((item) =>
                            item.id === step.id ? { ...item, timerMinutes: value } : item
                          )
                        )
                      }
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="—"
                      placeholderTextColor={Colors.light.textSecondary}
                      style={styles.stepTimerInput}
                      maxLength={6}
                    />
                  </View>
                </View>
              ))}

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setDraftSteps((current) => [...current, emptyStep(current.length)])
                }
                style={styles.addIngredientButton}>
                <Text style={styles.addIngredientButtonText}>＋ {text('添加一个步骤', 'Add step')}</Text>
              </Pressable>
            </View>

            {!validDraftRecipe ? (
              <Text style={styles.validationHint}>
                {text('请填写菜名、食材及至少一个完整步骤；计时时长需大于 0。', 'Add a name, ingredients, and at least one complete step. Timer durations must be greater than 0.')}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!validDraftRecipe}
              onPress={saveRecipe}
              style={[styles.saveRecipeButton, !validDraftRecipe && styles.primaryActionDisabled]}>
              <Text style={styles.saveRecipeButtonText}>{text('保存并查看菜谱', 'Save and view recipe')}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {recipeCelebration ? (
        <RecipeShelfCelebration
          emoji={recipeCelebration.emoji}
          recipeName={localizeContent(recipeCelebration.name, language)}
          language={language}
          onComplete={() => {
            const createdRecipe = recipeCelebration;
            setRecipeCelebration(null);
            openRecipe(createdRecipe);
          }}
        />
      ) : null}

      {recipeCompletion ? (
        <RecipeCompletionCelebration
          emoji={recipeCompletion.emoji}
          recipeName={localizeContent(recipeCompletion.name, language)}
          language={language}
          onComplete={() => {
            setRecipeCompletion(null);
            finishClosingRecipe();
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  majorLibrarySwitch: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 43, paddingRight: 4 },
  majorLibrarySwitchPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  majorLibraryTitle: { color: Colors.light.text, fontSize: 32, lineHeight: 39, fontWeight: '800', letterSpacing: -0.7 },
  majorLibraryTitleBaking: { color: '#8F502E' },
  majorLibraryChevron: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#B7DCC5' },
  majorLibraryChevronBaking: { backgroundColor: '#FFF0E5', borderColor: '#E9C3A7' },
  majorLibraryChevronText: { color: Colors.light.text, fontSize: 15, fontWeight: '900' },
  historyIconButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, shadowColor: '#173D2F', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 3 },
  historyIcon: { color: Colors.light.primary, fontSize: 29, lineHeight: 31, fontWeight: '700' },
  historyCountBadge: { position: 'absolute', right: -2, top: -3, minWidth: 19, height: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 10, backgroundColor: Colors.light.danger, borderWidth: 2, borderColor: Colors.light.background },
  historyCountText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  historyPage: { flex: 1, backgroundColor: Colors.light.background },
  historyHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.background },
  historyCloseButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  historyCloseText: { color: Colors.light.text, fontSize: 27, lineHeight: 29, fontWeight: '500' },
  historyHeaderCopy: { alignItems: 'center', gap: 2 },
  historyHeaderTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  historyHeaderSubtitle: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '700' },
  historyHeaderPlaceholder: { width: 42, height: 42 },
  historyContent: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 16, padding: 18 },
  historySuccessBanner: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#B7DCC5' },
  historySuccessIcon: { width: 28, height: 28, overflow: 'hidden', textAlign: 'center', lineHeight: 28, borderRadius: 14, color: '#FFFFFF', backgroundColor: Colors.light.primary, fontWeight: '900' },
  historySuccessText: { flex: 1, color: Colors.light.primary, fontSize: 11.5, lineHeight: 17, fontWeight: '800' },
  historySuccessClose: { color: Colors.light.primary, fontSize: 20, fontWeight: '500' },
  historyIntroCard: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 17, borderRadius: 23, backgroundColor: Colors.light.primary },
  historyIntroIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#FFFFFF24' },
  historyIntroEmoji: { fontSize: 34 },
  historyIntroCopy: { flex: 1, gap: 5 },
  historyIntroTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  historyIntroText: { color: '#DDEDE3', fontSize: 10.5, lineHeight: 16, fontWeight: '600' },
  cookingHistoryList: { gap: 12 },
  cookingHistoryCard: { gap: 13, padding: 16, borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  cookingHistoryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cookingHistoryEmojiWrap: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: Colors.light.primarySoft },
  cookingHistoryEmoji: { fontSize: 32 },
  cookingHistoryMainCopy: { flex: 1, gap: 4 },
  cookingHistoryName: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  cookingHistoryDate: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '600' },
  cookingHistoryMealPill: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, backgroundColor: Colors.light.backgroundElement },
  cookingHistoryMealText: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '800' },
  cookingHistoryMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cookingHistoryMeta: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '700' },
  cookingHistoryMetaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.light.border },
  restoredIngredientList: { overflow: 'hidden', borderRadius: 15, backgroundColor: Colors.light.background },
  restoredIngredientRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  restoredIngredientName: { color: Colors.light.text, fontSize: 11, fontWeight: '800' },
  restoredIngredientAmount: { color: Colors.light.danger, fontSize: 11, fontWeight: '900' },
  resetCookingButton: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: Colors.light.warningSoft, borderWidth: 1, borderColor: '#E8CF91' },
  resetCookingIcon: { color: Colors.light.warning, fontSize: 20, fontWeight: '800' },
  resetCookingText: { color: Colors.light.warning, fontSize: 11.5, fontWeight: '900' },
  historyEmptyState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  historyEmptyEmoji: { fontSize: 48 },
  historyEmptyTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  historyEmptyText: { color: Colors.light.textSecondary, fontSize: 11.5, lineHeight: 18, textAlign: 'center' },
  undoBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#17251FC2' },
  undoDialog: { width: '100%', maxWidth: 390, alignItems: 'center', gap: 13, padding: 22, borderRadius: 27, backgroundColor: Colors.light.surface, shadowColor: '#102C23', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.28, shadowRadius: 24, elevation: 12 },
  undoDialogIcon: { width: 57, height: 57, alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: Colors.light.warningSoft },
  undoDialogIconText: { color: Colors.light.warning, fontSize: 32, fontWeight: '800' },
  undoDialogTitle: { color: Colors.light.text, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  undoDialogText: { color: Colors.light.textSecondary, fontSize: 11.5, lineHeight: 18, textAlign: 'center' },
  undoDialogActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 3 },
  undoCancelButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.backgroundElement },
  undoCancelText: { color: Colors.light.text, fontSize: 12, fontWeight: '900' },
  undoConfirmButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.warning },
  undoConfirmText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  successBanner: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#B7DCC5' },
  successIcon: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', textAlign: 'center', lineHeight: 28, color: '#FFFFFF', backgroundColor: Colors.light.primary, fontWeight: '900' },
  successText: { flex: 1, color: Colors.light.primary, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  successClose: { color: Colors.light.primary, fontSize: 20, fontWeight: '500' },
  addRecipeCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 21, backgroundColor: Colors.light.primary, shadowColor: '#173D2F', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.15, shadowRadius: 14, elevation: 3 },
  addRecipeCardBaking: { backgroundColor: '#B96F45', shadowColor: '#6F3B20' },
  addRecipeIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFFFFF26' },
  addRecipeIconText: { color: '#FFFFFF', fontSize: 29, lineHeight: 31, fontWeight: '500' },
  addRecipeCopy: { flex: 1, gap: 4 },
  addRecipeTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  addRecipeSubtitle: { color: '#DBEBE1', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  addRecipeChevron: { color: '#FFFFFF', fontSize: 27, lineHeight: 29 },
  searchBox: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderRadius: 17, paddingHorizontal: 16, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  searchIcon: { color: Colors.light.textSecondary, fontSize: 25, marginRight: 9 },
  searchInput: { flex: 1, color: Colors.light.text, fontSize: 15, paddingVertical: 13 },
  recipeLibrarySection: { gap: 10 },
  recipeLibraryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recipeLibraryHeading: { color: Colors.light.text, fontSize: 17, fontWeight: '900' },
  recipeLibraryDetail: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '700' },
  recipeLibraries: { gap: 9, paddingRight: 8 },
  recipeLibraryCard: { minWidth: 124, minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 19, borderWidth: 1, borderColor: '#FFFFFF75' },
  recipeLibraryCardSelected: { shadowColor: '#173D2F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 3 },
  recipeLibraryEmoji: { fontSize: 25 },
  recipeLibraryCopy: { gap: 2 },
  recipeLibraryLabel: { fontSize: 12, fontWeight: '900' },
  recipeLibraryCount: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '700' },
  recipeLibraryCountSelected: { color: '#FFFFFFC7' },
  bakingLibraryBanner: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 21, backgroundColor: '#FFF4EA', borderWidth: 1, borderColor: '#EACAB2' },
  bakingLibraryIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFFFFF' },
  bakingLibraryEmoji: { fontSize: 29 },
  bakingLibraryCopy: { flex: 1, gap: 4 },
  bakingLibraryHeading: { color: '#8F502E', fontSize: 13.5, fontWeight: '900' },
  bakingLibraryDetail: { color: '#9A735C', fontSize: 9.5, lineHeight: 14, fontWeight: '700' },
  tagFilterSection: { gap: 8 },
  tagFilterLabel: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '800' },
  tagFilters: { gap: 7, paddingRight: 8 },
  tagFilter: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.light.backgroundElement, borderWidth: 1, borderColor: 'transparent' },
  tagFilterSelected: { backgroundColor: Colors.light.primarySoft, borderColor: Colors.light.primary },
  tagFilterText: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '800' },
  tagFilterTextSelected: { color: Colors.light.primary },
  filters: { gap: 8, paddingRight: Spacing.three },
  filter: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: Colors.light.backgroundElement },
  filterSelected: { backgroundColor: Colors.light.primary },
  filterText: { color: Colors.light.textSecondary, fontSize: 13, fontWeight: '700' },
  filterTextSelected: { color: '#FFFFFF' },
  section: { gap: Spacing.three },
  recipeList: { gap: 12 },
  recipeCard: { flexDirection: 'row', overflow: 'hidden', minHeight: 178, borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  recipeVisual: { width: 106, alignItems: 'center', justifyContent: 'center', gap: 17, backgroundColor: Colors.light.primarySoft },
  recipeEmoji: { fontSize: 43 },
  matchBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: Colors.light.warningSoft },
  matchBadgeComplete: { backgroundColor: Colors.light.surface },
  matchText: { color: Colors.light.warning, fontSize: 10, fontWeight: '800' },
  matchTextComplete: { color: Colors.light.primary },
  recipeBody: { flex: 1, padding: 16, gap: 7, justifyContent: 'center' },
  recipeTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recipeName: { color: Colors.light.text, fontSize: 18, fontWeight: '800' },
  chevron: { color: Colors.light.textSecondary, fontSize: 25, lineHeight: 25 },
  recipeDescription: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 18 },
  recipeTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  recipeTagPill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.light.primarySoft },
  recipeTagText: { color: Colors.light.primary, fontSize: 8.5, fontWeight: '800' },
  recipeMeta: { flexDirection: 'row', alignItems: 'center' },
  metaText: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '600' },
  metaDot: { color: Colors.light.border, marginHorizontal: 5 },
  ready: { color: Colors.light.primary, fontSize: 12, fontWeight: '800', marginTop: 3 },
  missing: { color: Colors.light.danger, fontSize: 12, fontWeight: '700', marginTop: 3 },
  emptyState: { alignItems: 'center', paddingVertical: 45, gap: 7 },
  emptyEmoji: { fontSize: 42 },
  emptyTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '800' },
  emptyText: { color: Colors.light.textSecondary, fontSize: 13 },
  detailPage: { flex: 1, overflow: 'hidden', backgroundColor: Colors.light.background },
  detailHeader: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, backgroundColor: Colors.light.background },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  headerButtonText: { color: Colors.light.text, fontSize: 27, lineHeight: 29, fontWeight: '500' },
  headerButtonPlaceholder: { width: 42, height: 42 },
  deleteRecipeButton: { minWidth: 54, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.dangerSoft },
  deleteRecipeButtonText: { color: Colors.light.danger, fontSize: 11, fontWeight: '900' },
  detailHeaderTitle: { color: Colors.light.text, fontSize: 15, fontWeight: '900' },
  detailContent: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 18, paddingHorizontal: 18 },
  recipePageSheet: { gap: 18 },
  detailHero: { flexDirection: 'row', alignItems: 'center', gap: 17, padding: 18, borderRadius: 25, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  detailEmojiWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 28, backgroundColor: Colors.light.primarySoft },
  detailEmoji: { fontSize: 48 },
  detailHeroCopy: { flex: 1, gap: 7 },
  detailTitle: { color: Colors.light.text, fontSize: 25, fontWeight: '900' },
  detailDescription: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 18 },
  detailMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailMeta: { color: Colors.light.primary, fontSize: 11, fontWeight: '800' },
  detailTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  detailTagPill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.light.primarySoft },
  detailTagText: { color: Colors.light.primary, fontSize: 8.5, fontWeight: '800' },
  controlCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 16, borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  controlLabel: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  controlHint: { color: Colors.light.textSecondary, fontSize: 10.5, marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.backgroundElement },
  stepperButtonText: { color: Colors.light.primary, fontSize: 20, fontWeight: '900' },
  servingsValue: { width: 26, color: Colors.light.text, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.3 },
  detailSection: { gap: 12 },
  detailSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailSectionTitle: { color: Colors.light.text, fontSize: 17, fontWeight: '900' },
  detailMatchPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.light.warningSoft },
  detailMatchPillReady: { backgroundColor: Colors.light.primarySoft },
  detailMatchText: { color: Colors.light.warning, fontSize: 10, fontWeight: '900' },
  detailMatchTextReady: { color: Colors.light.primary },
  ingredientList: { overflow: 'hidden', borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  ingredientRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  checkCircle: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.dangerSoft },
  checkCircleReady: { backgroundColor: Colors.light.primarySoft },
  checkMark: { color: Colors.light.danger, fontSize: 12, fontWeight: '900' },
  checkMarkReady: { color: Colors.light.primary },
  ingredientCopy: { flex: 1, gap: 3 },
  ingredientName: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  stockText: { color: Colors.light.textSecondary, fontSize: 10 },
  ingredientAmount: { color: Colors.light.text, fontSize: 12, fontWeight: '800' },
  stepsCountText: { color: Colors.light.textSecondary, fontSize: 10.5, fontWeight: '800' },
  stepsPreviewList: { overflow: 'hidden', borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  stepPreviewRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  stepNumberCircle: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.primarySoft },
  stepNumberText: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  stepPreviewText: { flex: 1, color: Colors.light.text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  stepTimerPill: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, backgroundColor: Colors.light.warningSoft },
  stepTimerPillText: { color: Colors.light.warning, fontSize: 9.5, fontWeight: '900' },
  cookingCard: { minHeight: 330, justifyContent: 'center', gap: 20, padding: 24, borderRadius: 28, backgroundColor: Colors.light.primary },
  cookingProgressRow: { flexDirection: 'row', gap: 7 },
  cookingProgressDot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#FFFFFF33' },
  cookingProgressDotActive: { backgroundColor: '#FFFFFF' },
  stepEyebrow: { color: '#CDE5D6', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  stepText: { color: '#FFFFFF', fontSize: 25, lineHeight: 37, fontWeight: '900' },
  backgroundTimerBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, borderRadius: 15, backgroundColor: '#143B2DB8', borderWidth: 1, borderColor: '#FFFFFF29' },
  backgroundTimerCopy: { flex: 1, gap: 2 },
  backgroundTimerLabel: { color: '#CDE5D6', fontSize: 9.5, fontWeight: '800' },
  backgroundTimerValue: { color: '#FFFFFF', fontSize: 21, fontVariant: ['tabular-nums'], fontWeight: '900' },
  stopTimerButtonSmall: { minWidth: 52, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#FFFFFF1F' },
  stopTimerButtonSmallText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  stepTimerControl: { minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#FFFFFFF2' },
  stepTimerReadyCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepTimerReadyIcon: { width: 34, height: 34, textAlign: 'center', lineHeight: 34, overflow: 'hidden', borderRadius: 17, color: Colors.light.primary, backgroundColor: Colors.light.primarySoft, fontSize: 17, fontWeight: '900' },
  stepTimerReadyTextWrap: { flex: 1, gap: 3 },
  stepTimerControlLabel: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '900' },
  stepTimerDurationText: { color: Colors.light.text, fontSize: 15, fontWeight: '900' },
  stepTimerValue: { color: Colors.light.primary, fontSize: 30, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 2 },
  startTimerButton: { minWidth: 94, minHeight: 43, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 14, backgroundColor: Colors.light.primary },
  startTimerButtonText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '900' },
  stopTimerButton: { minWidth: 68, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.dangerSoft },
  stopTimerButtonText: { color: Colors.light.danger, fontSize: 11, fontWeight: '900' },
  timerHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: 16, backgroundColor: '#FFFFFF17' },
  timerHintIcon: { fontSize: 18 },
  timerHintText: { flex: 1, color: '#E3F0E7', fontSize: 11, lineHeight: 17, fontWeight: '600' },
  mealOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealOption: { minWidth: 92, flex: 1, minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  mealOptionSelected: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primarySoft },
  mealOptionEmoji: { fontSize: 16 },
  mealOptionText: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '800' },
  mealOptionTextSelected: { color: Colors.light.primary },
  bottomActionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 88, flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.light.border, backgroundColor: Platform.OS === 'web' ? '#FAF9F6F5' : Colors.light.background },
  secondaryAction: { minWidth: 104, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Colors.light.backgroundElement },
  secondaryActionText: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  primaryAction: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Colors.light.primary },
  primaryActionDisabled: { backgroundColor: '#A9AAA5' },
  primaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  formPage: { flex: 1, backgroundColor: Colors.light.background },
  formHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.background },
  formHeaderSide: { minWidth: 64, minHeight: 42, justifyContent: 'center' },
  formHeaderTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '900' },
  formCancelText: { color: Colors.light.textSecondary, fontSize: 14, fontWeight: '700' },
  formSaveText: { color: Colors.light.primary, fontSize: 14, fontWeight: '900', textAlign: 'right' },
  formSaveTextDisabled: { color: '#A7AAA5' },
  formContent: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 18, padding: 18 },
  formIntro: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 17, borderRadius: 23, backgroundColor: Colors.light.primary },
  formIntroEmoji: { width: 58, fontSize: 43, textAlign: 'center' },
  formIntroCopy: { flex: 1, gap: 5 },
  formIntroTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  formIntroText: { color: '#DDEDE3', fontSize: 11, lineHeight: 17, fontWeight: '600' },
  formSection: { gap: 11, padding: 17, borderRadius: 23, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  formSectionTitle: { color: Colors.light.text, fontSize: 17, fontWeight: '900' },
  formSectionHint: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  formSectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  ingredientCount: { color: Colors.light.primary, fontSize: 11, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.light.primarySoft },
  fieldLabel: { color: Colors.light.text, fontSize: 11, fontWeight: '800', marginTop: 3 },
  formInput: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 15, color: Colors.light.text, fontSize: 14, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  multilineInput: { minHeight: 82, textAlignVertical: 'top' },
  emojiPicker: { gap: 8, paddingRight: 8 },
  emojiOption: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.backgroundElement, borderWidth: 1, borderColor: 'transparent' },
  emojiOptionSelected: { backgroundColor: Colors.light.primarySoft, borderColor: Colors.light.primary },
  emojiOptionText: { fontSize: 25 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 13, backgroundColor: Colors.light.backgroundElement, borderWidth: 1, borderColor: 'transparent' },
  choiceChipSelected: { backgroundColor: Colors.light.primarySoft, borderColor: Colors.light.primary },
  choiceChipText: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '800' },
  choiceChipTextSelected: { color: Colors.light.primary },
  categoryChoiceTextSelected: { color: '#FFFFFF' },
  majorLibraryChoices: { flexDirection: 'row', gap: 9 },
  majorLibraryChoice: { flex: 1, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 17, backgroundColor: Colors.light.backgroundElement, borderWidth: 1, borderColor: Colors.light.border },
  majorLibraryChoiceEmoji: { fontSize: 23 },
  majorLibraryChoiceText: { flex: 1, color: Colors.light.textSecondary, fontSize: 11.5, fontWeight: '900' },
  majorLibraryChoiceTextSelected: { color: '#FFFFFF' },
  majorLibraryChoiceCheck: { color: Colors.light.textSecondary, fontSize: 14, fontWeight: '900' },
  majorLibraryChoiceCheckSelected: { color: '#FFFFFF' },
  bakingFormHint: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 15, backgroundColor: '#FFF4EA', borderWidth: 1, borderColor: '#EACAB2' },
  bakingFormHintEmoji: { fontSize: 23 },
  bakingFormHintText: { flex: 1, color: '#8F502E', fontSize: 10.5, lineHeight: 16, fontWeight: '800' },
  formTagHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  formTagHint: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 3 },
  formTagCount: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  formTagChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#FFF8ED', borderWidth: 1, borderColor: '#F0DCC0' },
  formTagChipSelected: { backgroundColor: '#FFF0D9', borderColor: '#D6874A' },
  formTagChipText: { color: '#8A6C49', fontSize: 10.5, fontWeight: '800' },
  formTagChipTextSelected: { color: '#A65E27' },
  customTagRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  customTagInput: { flex: 1 },
  customTagButton: { minWidth: 68, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 15, backgroundColor: '#D6874A' },
  customTagButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  compactFieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  compactField: { flex: 1, minWidth: 92, gap: 7 },
  draftIngredientCard: { gap: 10, padding: 13, borderRadius: 18, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  draftIngredientHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  draftIngredientTitle: { color: Colors.light.text, fontSize: 12, fontWeight: '900' },
  removeIngredientText: { color: Colors.light.danger, fontSize: 11, fontWeight: '800' },
  ingredientAmountRow: { flexDirection: 'row', gap: 9 },
  amountInput: { flex: 1 },
  unitInput: { width: 105 },
  unitPicker: { gap: 7, paddingRight: 7 },
  unitChip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 11, backgroundColor: Colors.light.backgroundElement },
  unitChipSelected: { backgroundColor: Colors.light.primary },
  unitChipText: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '800' },
  unitChipTextSelected: { color: '#FFFFFF' },
  addIngredientButton: { minHeight: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#B7DCC5', borderStyle: 'dashed' },
  addIngredientButtonText: { color: Colors.light.primary, fontSize: 12, fontWeight: '900' },
  draftStepCard: { gap: 10, padding: 13, borderRadius: 18, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  draftStepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftStepNumber: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.primarySoft },
  draftStepNumberText: { color: Colors.light.primary, fontSize: 10, fontWeight: '900' },
  stepInstructionInput: { minHeight: 86, lineHeight: 20 },
  stepTimerInputRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 14, backgroundColor: Colors.light.surface },
  stepTimerInputIcon: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.light.warningSoft },
  stepTimerInputIconText: { fontSize: 17 },
  stepTimerInputCopy: { flex: 1, gap: 3 },
  stepTimerInputLabel: { color: Colors.light.text, fontSize: 10.5, fontWeight: '900' },
  stepTimerInputHint: { color: Colors.light.textSecondary, fontSize: 9 },
  stepTimerInput: { width: 68, height: 40, paddingHorizontal: 9, borderRadius: 12, color: Colors.light.text, textAlign: 'center', fontSize: 14, fontWeight: '900', backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  validationHint: { color: Colors.light.danger, fontSize: 11, lineHeight: 17, textAlign: 'center', fontWeight: '700', paddingHorizontal: 15 },
  saveRecipeButton: { minHeight: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: Colors.light.primary },
  saveRecipeButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
