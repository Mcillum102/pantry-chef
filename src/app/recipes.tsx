import { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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
import { useCookingSession } from '@/context/cooking-session-context';
import { localDateKey, type MealType, useHealth } from '@/context/health-context';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { useReminders } from '@/context/reminder-context';
import { formatAmount, localizeContent } from '@/data/content-translations';
import type { ImportedRecipe } from '@/data/ai-import';
import { type CookingHistoryRecord, type Recipe } from '@/data/kitchen-data';
import { analyzeRecipeImage, analyzeRecipeLink } from '@/services/ai-import';
import { organizeRecipesWithAI } from '@/services/recipe-ai';
import { scheduleCookingTimerNotification } from '@/services/app-notifications';
import {
  amountFromBaseUnit,
  amountInBaseUnit,
  availableIngredientAmount,
  canonicalIngredientId,
} from '@/data/inventory-utils';

const recipeLibraries = [
  { key: '全部', zh: '全部菜谱', en: 'All recipes', emoji: '📚', color: '#3D7F68' },
  { key: '快手菜', zh: '快手菜', en: 'Quick', emoji: '⚡', color: '#D6874A' },
  { key: '一锅料理', zh: '一锅料理', en: 'One pot', emoji: '🍲', color: '#B95D7D' },
  { key: '下饭菜', zh: '下饭菜', en: 'With rice', emoji: '🍚', color: '#BA6A45' },
  { key: '面食', zh: '面食', en: 'Noodles', emoji: '🍜', color: '#735C9B' },
  { key: '其他', zh: '其他', en: 'Other', emoji: '🥣', color: '#5C7A68' },
];
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
const mealTimePresets: Record<MealType, string[]> = {
  breakfast: ['07:30', '08:00', '09:00'],
  lunch: ['12:00', '12:30', '13:00'],
  dinner: ['18:00', '19:00', '20:00'],
  snack: ['10:30', '15:30', '21:00'],
};

function currentMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function isValidMealTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
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
    shoppingList,
    addShoppingItem,
    addRecipe,
    deleteRecipe,
    updateRecipeCategories,
    getRecipeMatch,
    cookRecipe,
    undoCookedRecipe,
  } = useKitchen();
  const { mealRecords, setMealRecords } = useHealth();
  const {
    session: cookingSession,
    resumeRequestId,
    startCookingSession,
    updateCookingSession,
    minimizeCookingSession,
    clearCookingSession,
  } = useCookingSession();
  const { language, text } = useLanguage();
  const { preferences: reminderPreferences } = useReminders();
  const insets = useSafeAreaInsets();
  const [majorLibrary, setMajorLibrary] = useState<MajorRecipeLibrary>('recipes');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部');
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [isAiOrganizing, setIsAiOrganizing] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(2);
  const [mealType, setMealType] = useState<MealType>(currentMealType());
  const [mealTime, setMealTime] = useState(currentTime());
  const [isCompletionLogOpen, setIsCompletionLogOpen] = useState(false);
  const [isCloseCookingConfirmOpen, setIsCloseCookingConfirmOpen] = useState(false);
  const [isCooking, setIsCooking] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false);
  const [isRecipeAddMenuOpen, setIsRecipeAddMenuOpen] = useState(false);
  const recipeAddMenuProgress = useSharedValue(0);
  const [recipeImportMode, setRecipeImportMode] = useState<'image' | 'link' | null>(null);
  const [recipeImportLink, setRecipeImportLink] = useState('');
  const [recipeImportImageUri, setRecipeImportImageUri] = useState<string | null>(null);
  const [recipeImportImageData, setRecipeImportImageData] = useState<string | null>(null);
  const [recipeImportError, setRecipeImportError] = useState<string | null>(null);
  const [isRecipeImportAnalyzing, setIsRecipeImportAnalyzing] = useState(false);
  const [recipeCelebration, setRecipeCelebration] = useState<Recipe | null>(null);
  const [recipeCompletion, setRecipeCompletion] = useState<Recipe | null>(null);
  const pendingRecipeCompletionRef = useRef<Recipe | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [undoCandidate, setUndoCandidate] = useState<CookingHistoryRecord | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftEmoji, setDraftEmoji] = useState('🍳');
  const [draftDescription, setDraftDescription] = useState('');
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
  const handledResumeRequestRef = useRef(0);
  const requestCloseRecipeRef = useRef<() => void>(() => undefined);
  const recipeEdgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 72 || gestureState.vx > 0.55) {
          requestCloseRecipeRef.current();
        }
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const detailRevealStyle = useAnimatedStyle(() => ({
    opacity: interpolate(detailReveal.value, [0, 0.35, 1], [0, 0.82, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(detailReveal.value, [0, 1], [46, 0], Extrapolation.CLAMP) },
      { scale: interpolate(detailReveal.value, [0, 1], [0.985, 1], Extrapolation.CLAMP) },
    ],
  }));

  const recipeAddButtonIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(recipeAddMenuProgress.value, [0, 1], [0, 45], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  const recipeAddMenuStyle = useAnimatedStyle(() => ({
    opacity: interpolate(recipeAddMenuProgress.value, [0, 0.2, 1], [0, 0.72, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(recipeAddMenuProgress.value, [0, 1], [-12, 0], Extrapolation.CLAMP) },
      { scale: interpolate(recipeAddMenuProgress.value, [0, 1], [0.82, 1], Extrapolation.CLAMP) },
      {
        rotate: `${interpolate(recipeAddMenuProgress.value, [0, 1], [-7, 0], Extrapolation.CLAMP)}deg`,
      },
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
        setCompletedTimerSteps((current) => {
          const completed = current.includes(activeStep) ? current : [...current, activeStep];
          updateCookingSession({
            timerDeadline: null,
            timerStepIndex: null,
            completedTimerSteps: completed,
          });
          return completed;
        });
      }
    }, 250);
    return () => clearInterval(interval);
  }, [timerDeadline, timerStepIndex, updateCookingSession]);

  useEffect(() => {
    if (
      resumeRequestId === 0 ||
      handledResumeRequestRef.current === resumeRequestId ||
      !cookingSession
    ) return;
    const recipe = recipes.find((item) => item.id === cookingSession.recipeId);
    if (!recipe) return;
    handledResumeRequestRef.current = resumeRequestId;

    const timerExpired =
      cookingSession.timerDeadline !== null && cookingSession.timerDeadline <= Date.now();
    const completedTimerSteps = timerExpired && cookingSession.timerStepIndex !== null
      ? Array.from(new Set([
          ...cookingSession.completedTimerSteps,
          cookingSession.timerStepIndex,
        ]))
      : cookingSession.completedTimerSteps;

    detailReveal.set(0);
    pageTurn.set(1);
    pageDirection.set(1);
    setSelectedRecipe(recipe);
    setServings(cookingSession.servings);
    setMealType(cookingSession.mealType);
    setMealTime(cookingSession.mealTime);
    setIsCooking(true);
    setIsCompletionLogOpen(cookingSession.stage === 'meal');
    setIsCloseCookingConfirmOpen(false);
    setStepIndex(cookingSession.stepIndex);
    setTimerDeadline(timerExpired ? null : cookingSession.timerDeadline);
    setTimerStepIndex(timerExpired ? null : cookingSession.timerStepIndex);
    setTimerRemaining(
      timerExpired || cookingSession.timerDeadline === null
        ? 0
        : Math.max(0, Math.ceil((cookingSession.timerDeadline - Date.now()) / 1000))
    );
    setCompletedTimerSteps(completedTimerSteps);
    setIsPageTurning(false);
    if (timerExpired) {
      updateCookingSession({
        timerDeadline: null,
        timerStepIndex: null,
        completedTimerSteps,
      });
    }
    detailReveal.set(
      withTiming(1, {
        duration: 360,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      })
    );
  }, [
    cookingSession,
    detailReveal,
    pageDirection,
    pageTurn,
    recipes,
    resumeRequestId,
    updateCookingSession,
  ]);

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
          ...recipe.ingredients.flatMap((ingredient) => [
            ingredient.name,
            localizeContent(ingredient.name, language),
          ]),
        ]
          .join(' ')
          .toLocaleLowerCase();
        return (
          searchableText.includes(normalizedSearch) &&
          (majorLibrary === 'baking' || category === '全部' || recipe.category === category)
        );
      }),
    [category, language, libraryRecipes, majorLibrary, search]
  );

  const recentlyCookedRecipes = useMemo(() => {
    const byId = new Map(libraryRecipes.map((recipe) => [recipe.id, recipe]));
    const seen = new Set<string>();
    return cookingHistory.flatMap((record) => {
      if (seen.has(record.recipeId)) return [];
      const recipe = byId.get(record.recipeId);
      if (!recipe) return [];
      seen.add(record.recipeId);
      return [recipe];
    });
  }, [cookingHistory, libraryRecipes]);

  const showingRecent =
    majorLibrary === 'recipes' && category === '全部' && !search.trim() && !showAllRecipes;
  const displayedRecipes = showingRecent ? recentlyCookedRecipes : visibleRecipes;
  const sectionTitle = majorLibrary === 'baking'
    ? text('我的烘焙谱', 'My baking recipes')
    : showingRecent
      ? text('最近烧过', 'Recently cooked')
      : category === '全部' && !search.trim()
        ? text('全部菜谱', 'All recipes')
        : text('筛选结果', 'Results');

  const recipeOrganizationInput = useMemo(
    () => recipes.map(({ id, name, description, ingredients, steps, timeMinutes }) => ({
      id,
      name,
      description,
      ingredients,
      steps,
      timeMinutes,
    })),
    [recipes]
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
    setMealTime(currentTime());
    setIsCompletionLogOpen(false);
    setIsCloseCookingConfirmOpen(false);
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
    setIsCompletionLogOpen(false);
    setIsCloseCookingConfirmOpen(false);
    setIsCooking(false);
    setStepIndex(0);
    setTimerDeadline(null);
    setTimerRemaining(0);
    setTimerStepIndex(null);
    setCompletedTimerSteps([]);
    setIsPageTurning(false);
    pageTurn.set(1);
    if (Platform.OS !== 'ios') requestAnimationFrame(handleRecipeDetailDismiss);
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

  function handleRecipeDetailDismiss() {
    const completedRecipe = pendingRecipeCompletionRef.current;
    if (!completedRecipe) return;
    pendingRecipeCompletionRef.current = null;
    setRecipeCompletion(completedRecipe);
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
    updateCookingSession({ stepIndex: nextStep });
    revealTurnedPage(incomingDirection);
  }

  function commitCookingPage(incomingDirection: number) {
    setStepIndex(0);
    setIsCooking(true);
    if (selectedRecipe) {
      startCookingSession({
        recipeId: selectedRecipe.id,
        recipeName: selectedRecipe.name,
        recipeNameEn: localizeContent(selectedRecipe.name, 'en'),
        recipeEmoji: selectedRecipe.emoji,
        servings,
        stepIndex: 0,
        totalSteps: selectedRecipe.steps.length,
        stage: 'cooking',
        mealType,
        mealTime,
        timerDeadline: null,
        timerStepIndex: null,
        completedTimerSteps: [],
        isMinimized: false,
      });
    }
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
    setShowAllRecipes(next === 'baking');
  }

  function openRecipeForm() {
    setDraftEmoji(majorLibrary === 'baking' ? '🧁' : '🍳');
    setIsRecipeFormOpen(true);
  }

  function openRecipeAddMenu() {
    setIsRecipeAddMenuOpen(true);
    recipeAddMenuProgress.set(0);
    recipeAddMenuProgress.set(
      withTiming(1, {
        duration: 280,
        easing: Easing.out(Easing.back(1.55)),
      })
    );
  }

  function closeRecipeAddMenu() {
    recipeAddMenuProgress.set(
      withTiming(0, {
        duration: 150,
        easing: Easing.in(Easing.quad),
      })
    );
    setTimeout(() => setIsRecipeAddMenuOpen(false), 150);
  }

  function openBasicRecipeForm() {
    recipeAddMenuProgress.set(0);
    setIsRecipeAddMenuOpen(false);
    openRecipeForm();
  }

  async function chooseRecipeImage() {
    recipeAddMenuProgress.set(0);
    setIsRecipeAddMenuOpen(false);
    setRecipeImportError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.65,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setRecipeImportError(text('无法读取这张图片，请换一张重试。', 'Could not read this image. Try another one.'));
      setRecipeImportMode('image');
      return;
    }
    setRecipeImportImageUri(asset.uri);
    setRecipeImportImageData(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
    setRecipeImportMode('image');
  }

  function openRecipeLinkImport() {
    recipeAddMenuProgress.set(0);
    setIsRecipeAddMenuOpen(false);
    setRecipeImportLink('');
    setRecipeImportError(null);
    setRecipeImportMode('link');
  }

  function applyImportedRecipe(recipe: ImportedRecipe) {
    setDraftName(recipe.name);
    setDraftEmoji(recipe.emoji || (recipe.category === '烘焙谱' ? '🧁' : '🍳'));
    setDraftDescription(recipe.description);
    setDraftTime(String(Math.max(1, Math.round(recipe.timeMinutes))));
    setDraftServings(String(Math.max(1, Math.round(recipe.servings))));
    setDraftCarbs(String(Math.max(0, Math.round(recipe.carbsPerServing))));
    setDraftDifficulty(recipe.difficulty);
    setDraftIngredients(recipe.ingredients.map((ingredient, index) => ({
      id: `imported-ingredient-${Date.now()}-${index}`,
      name: ingredient.name,
      amount: String(ingredient.amount),
      unit: ingredient.unit,
    })));
    setDraftSteps(recipe.steps.map((step, index) => ({
      id: `imported-step-${Date.now()}-${index}`,
      instruction: step.instruction,
      timerMinutes: step.timerMinutes > 0 ? String(step.timerMinutes) : '',
    })));
  }

  async function analyzeRecipeImport() {
    if (!recipeImportMode || isRecipeImportAnalyzing) return;
    if (recipeImportMode === 'link') {
      try {
        const url = new URL(recipeImportLink.trim());
        if (url.protocol !== 'https:') throw new Error();
      } catch {
        setRecipeImportError(text('请输入完整的 https 菜谱链接。', 'Enter a complete HTTPS recipe URL.'));
        return;
      }
    }
    if (recipeImportMode === 'image' && !recipeImportImageData) return;

    setIsRecipeImportAnalyzing(true);
    setRecipeImportError(null);
    try {
      const analysis = recipeImportMode === 'image'
        ? await analyzeRecipeImage(recipeImportImageData!)
        : await analyzeRecipeLink(recipeImportLink.trim());
      applyImportedRecipe(analysis.result);
      setRecipeImportMode(null);
      setRecipeImportImageUri(null);
      setRecipeImportImageData(null);
      setIsRecipeFormOpen(true);
      setAiMessage(text(
        'AI 已完成初步分析，请检查食材用量和步骤后再保存。',
        'AI finished the first pass. Review ingredients and steps before saving.'
      ));
    } catch {
      setRecipeImportError(text(
        '暂时无法完成云端分析。请确认 OpenAI 项目有可用额度后重试。',
        'Cloud analysis is unavailable. Check that the OpenAI project has available credits and try again.'
      ));
    } finally {
      setIsRecipeImportAnalyzing(false);
    }
  }

  function resetRecipeForm() {
    setDraftName('');
    setDraftEmoji('🍳');
    setDraftDescription('');
    setDraftTime('20');
    setDraftServings('2');
    setDraftCarbs('0');
    setDraftDifficulty('简单');
    setDraftIngredients([emptyIngredient()]);
    setDraftSteps([emptyStep()]);
  }

  async function saveRecipe() {
    if (!validDraftRecipe) return;
    setIsAiOrganizing(true);
    const recipeDraft = {
      id: `draft-recipe-${Date.now()}`,
      name: draftName.trim(),
      description:
        draftDescription.trim() || text('我的自定义菜谱。', 'My custom recipe.'),
      timeMinutes: Number(draftTime),
      ingredients: draftIngredients.map((ingredient) => ({
        name: ingredient.name.trim(),
        amount: Number(ingredient.amount),
        unit: ingredient.unit.trim(),
      })),
      steps: draftSteps.map((step) => step.instruction.trim()),
    };
    const organized = await organizeRecipesWithAI([recipeDraft]);
    const categoryResult = organized.classifications[0]?.category ?? '其他';
    const createdRecipe = addRecipe({
      ...recipeDraft,
      emoji: draftEmoji,
      difficulty: draftDifficulty,
      category: categoryResult,
      servings: Number(draftServings),
      carbsPerServing: Number(draftCarbs),
      stepsEn: draftSteps.map((step) => step.instruction.trim()),
      stepTimers: draftSteps.map((step) =>
        step.timerMinutes.trim().length > 0
          ? Math.max(1, Math.round(Number(step.timerMinutes) * 60))
          : 0
      ),
      tip: '烹饪前先确认所有食材和用量。',
      tipEn: 'Check every ingredient and amount before cooking.',
    });
    const createdMajorLibrary: MajorRecipeLibrary = categoryResult === '烘焙谱' ? 'baking' : 'recipes';
    setIsRecipeFormOpen(false);
    setMajorLibrary(createdMajorLibrary);
    setCategory('全部');
    setShowAllRecipes(true);
    setIsAiOrganizing(false);
    resetRecipeForm();
    setCompletionMessage(
      text(
        `AI 已将“${createdRecipe.name}”放入「${categoryResult}」${organized.source === 'local' ? '（本地整理）' : ''}。`,
        `AI placed “${createdRecipe.name}” in ${categoryResult}${organized.source === 'local' ? ' using on-device fallback' : ''}.`
      )
    );
    setRecipeCelebration(createdRecipe);
  }

  async function organizeExistingRecipes() {
    if (isAiOrganizing || recipeOrganizationInput.length === 0) return;
    setIsAiOrganizing(true);
    setAiMessage(null);
    const organized = await organizeRecipesWithAI(recipeOrganizationInput);
    updateRecipeCategories(organized.classifications);
    setCategory('全部');
    setShowAllRecipes(true);
    setAiMessage(text(
      organized.source === 'openai'
        ? `AI 已重新整理 ${organized.classifications.length} 道菜谱。`
        : `网络 AI 暂不可用，已用本地智能规则整理 ${organized.classifications.length} 道菜谱。`,
      organized.source === 'openai'
        ? `AI reorganized ${organized.classifications.length} recipes.`
        : `Cloud AI was unavailable, so local smart rules organized ${organized.classifications.length} recipes.`
    ));
    setIsAiOrganizing(false);
  }

  function startStepTimer(index: number) {
    const duration = selectedRecipe?.stepTimers?.[index] ?? 0;
    if (!selectedRecipe || duration <= 0) return;
    const deadline = Date.now() + duration * 1000;
    setCompletedTimerSteps((current) => current.filter((item) => item !== index));
    setTimerStepIndex(index);
    setTimerRemaining(duration);
    setTimerDeadline(deadline);
    updateCookingSession({
      timerDeadline: deadline,
      timerStepIndex: index,
      completedTimerSteps: completedTimerSteps.filter((item) => item !== index),
    });
    if (reminderPreferences.masterEnabled && reminderPreferences.cookingEnabled) {
      void scheduleCookingTimerNotification({
        deadline,
        recipeName: selectedRecipe.name,
        recipeNameEn: localizeContent(selectedRecipe.name, 'en'),
        recipeEmoji: selectedRecipe.emoji,
        stepNumber: index + 1,
        stepText: localizeContent(selectedRecipe.steps[index], language),
        language,
      });
    }
  }

  function stopTimer() {
    setTimerDeadline(null);
    setTimerStepIndex(null);
    setTimerRemaining(0);
    updateCookingSession({ timerDeadline: null, timerStepIndex: null });
  }

  function commitCompletionLogPage(open: boolean, incomingDirection: number) {
    setIsCompletionLogOpen(open);
    updateCookingSession({
      stage: open ? 'meal' : 'cooking',
      mealType,
      mealTime,
    });
    revealTurnedPage(incomingDirection);
  }

  function turnCompletionLogPage(open: boolean) {
    if (isPageTurning || isCompletionLogOpen === open) return;
    if (open) {
      setMealType(currentMealType());
      setMealTime(currentTime());
    }
    setIsPageTurning(true);
    pageDirection.set(open ? -1 : 1);
    pageTurn.set(
      withTiming(
        0,
        {
          duration: 230,
          easing: Easing.in(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) runOnJS(commitCompletionLogPage)(open, open ? 1 : -1);
        }
      )
    );
  }

  function requestCloseRecipe() {
    if (isCooking || isCompletionLogOpen) {
      setIsCloseCookingConfirmOpen(true);
      return;
    }
    closeRecipe();
  }

  function minimizeActiveCooking() {
    if (!selectedRecipe || (!isCooking && !isCompletionLogOpen)) return;
    minimizeCookingSession({
      recipeId: selectedRecipe.id,
      recipeName: selectedRecipe.name,
      recipeNameEn: localizeContent(selectedRecipe.name, 'en'),
      recipeEmoji: selectedRecipe.emoji,
      servings,
      stepIndex,
      totalSteps: selectedRecipe.steps.length,
      stage: isCompletionLogOpen ? 'meal' : 'cooking',
      mealType,
      mealTime,
      timerDeadline,
      timerStepIndex,
      completedTimerSteps,
    });
    setIsCloseCookingConfirmOpen(false);
    closeRecipe();
  }

  function endCookingAndClose() {
    clearCookingSession();
    setIsCloseCookingConfirmOpen(false);
    closeRecipe();
  }

  requestCloseRecipeRef.current = requestCloseRecipe;

  function openCompletionLog() {
    turnCompletionLogPage(true);
  }

  function finishCooking() {
    if (!selectedRecipe || selectedMatch?.percentage !== 100 || !isValidMealTime(mealTime)) return;
    const recipe = selectedRecipe;
    const multiplier = servings / recipe.servings;
    const today = localDateKey();
    const localizedName = localizeContent(recipe.name, language);
    const historyId = `cooking-history-${Date.now()}`;
    const mealFoods = recipe.name;
    const mealFoodsEn = localizeContent(recipe.name, 'en');
    const selectedMeal = mealOptions.find((option) => option.key === mealType) ?? mealOptions[2];
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
                time: mealTime,
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
          time: mealTime,
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
        `已完成“${localizedName}”，并记录到 ${mealTime} 的${selectedMeal.zh}。`,
        `Finished “${localizedName}” and logged it as ${selectedMeal.en.toLowerCase()} at ${mealTime}.`
      )
    );
    setIsCompletionLogOpen(false);
    clearCookingSession();
    pendingRecipeCompletionRef.current = recipe;
    closeRecipe();
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
          <View style={styles.recipeHeaderActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('添加菜谱', 'Add recipe')}
              onPress={openRecipeAddMenu}
              style={({ pressed }) => [styles.addRecipeHeaderButton, pressed && styles.cardPressed]}>
              <Animated.Text style={[styles.addRecipeHeaderIcon, recipeAddButtonIconStyle]}>＋</Animated.Text>
            </Pressable>
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
          </View>
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

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={majorLibrary === 'baking'
              ? text('搜索烘焙谱或原料', 'Search baking recipes or ingredients')
              : text('搜索菜名或食材', 'Search recipes or ingredients')}
            placeholderTextColor={Colors.light.textSecondary}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>

        {majorLibrary === 'recipes' ? <View style={styles.recipeLibrarySection}>
          <View style={styles.recipeLibraryHeader}>
            <View>
              <Text style={styles.recipeLibraryHeading}>{text('AI 智能分库', 'AI collections')}</Text>
              <Text style={styles.recipeLibraryDetail}>
                {text('按菜名、食材与做法自动归档', 'Organized by recipe, ingredients, and method')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('使用 AI 重新整理全部菜谱', 'Reorganize every recipe with AI')}
              disabled={isAiOrganizing}
              onPress={organizeExistingRecipes}
              style={[styles.aiOrganizeButton, isAiOrganizing && styles.disabled]}>
              <Text style={styles.aiOrganizeButtonText}>
                {isAiOrganizing ? text('整理中…', 'Organizing…') : text('✦ 重新整理', '✦ Reorganize')}
              </Text>
            </Pressable>
          </View>
          {aiMessage ? (
            <Pressable onPress={() => setAiMessage(null)} style={styles.aiResultBanner}>
              <Text style={styles.aiResultIcon}>✦</Text>
              <Text style={styles.aiResultText}>{aiMessage}</Text>
              <Text style={styles.aiResultClose}>×</Text>
            </Pressable>
          ) : null}
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
                  onPress={() => {
                    setCategory(library.key);
                    setShowAllRecipes(true);
                  }}
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

        <View style={styles.section}>
          <SectionHeader
            title={sectionTitle}
            detail={text(`${displayedRecipes.length} 道菜`, `${displayedRecipes.length} recipes`)}
          />
          {majorLibrary === 'recipes' && category === '全部' && !search.trim() ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAllRecipes((current) => !current)}
              style={styles.recipeViewToggle}>
              <Text style={styles.recipeViewToggleText}>
                {showingRecent
                  ? text(`查看全部 ${visibleRecipes.length} 道菜谱`, `View all ${visibleRecipes.length} recipes`)
                  : text('返回最近烧过', 'Back to recently cooked')}
              </Text>
              <Text style={styles.recipeViewToggleArrow}>{showingRecent ? '›' : '↺'}</Text>
            </Pressable>
          ) : null}
          <View style={styles.recipeList}>
            {displayedRecipes.map((recipe) => {
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

          {displayedRecipes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🥣</Text>
              <Text style={styles.emptyTitle}>
                {showingRecent
                  ? text('还没有最近烧过的菜', 'Nothing cooked recently')
                  : text('没有找到相符的菜谱', 'No matching recipes')}
              </Text>
              <Text style={styles.emptyText}>
                {showingRecent
                  ? text('完成一道菜后，它会自动出现在这里。', 'Finish a recipe and it will appear here automatically.')
                  : text('换一个关键词或分类试试。', 'Try another keyword or category.')}
              </Text>
            </View>
          ) : null}
        </View>
      </AppScreen>

      <Modal
        visible={isRecipeAddMenuOpen}
        transparent
        animationType="none"
        onRequestClose={closeRecipeAddMenu}>
        <View style={[styles.recipeAddBackdrop, { paddingTop: Math.max(insets.top, 12) + 64 }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeRecipeAddMenu} />
          <Animated.View style={[styles.recipeAddSheet, recipeAddMenuStyle]}>
            <Text style={styles.recipeAddTitle}>{text('添加菜谱', 'Add recipe')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('基础添加菜谱', 'Add recipe manually')}
              onPress={openBasicRecipeForm}
              style={styles.recipeAddOption}>
              <View style={styles.recipeAddOptionIcon}><Text style={styles.recipeAddOptionIconText}>＋</Text></View>
              <View style={styles.recipeAddOptionCopy}>
                <Text style={styles.recipeAddOptionTitle}>{text('基础添加', 'Basic add')}</Text>
                <Text style={styles.recipeAddOptionText}>{text('使用现在的表单逐项填写', 'Use the current recipe form')}</Text>
              </View>
              <Text style={styles.recipeAddOptionChevron}>›</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('识图分析菜谱', 'Analyze recipe image')}
              onPress={chooseRecipeImage}
              style={[styles.recipeAddOption, styles.recipeAddOptionAi]}>
              <View style={[styles.recipeAddOptionIcon, styles.recipeAddOptionIconAi]}><Text style={styles.recipeAddOptionAiText}>▧</Text></View>
              <View style={styles.recipeAddOptionCopy}>
                <Text style={styles.recipeAddOptionTitle}>{text('识图分析', 'Analyze image')}</Text>
                <Text style={styles.recipeAddOptionText}>{text('选择截图或菜谱照片，AI 自动提取', 'Pick a screenshot or recipe photo')}</Text>
              </View>
              <Text style={styles.recipeAddOptionChevron}>›</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('链接分析菜谱', 'Analyze recipe link')}
              onPress={openRecipeLinkImport}
              style={[styles.recipeAddOption, styles.recipeAddOptionAi]}>
              <View style={[styles.recipeAddOptionIcon, styles.recipeAddOptionIconAi]}><Text style={styles.recipeAddOptionAiText}>↗</Text></View>
              <View style={styles.recipeAddOptionCopy}>
                <Text style={styles.recipeAddOptionTitle}>{text('链接分析', 'Analyze link')}</Text>
                <Text style={styles.recipeAddOptionText}>{text('粘贴网页菜谱链接，AI 自动整理', 'Paste a recipe URL for AI extraction')}</Text>
              </View>
              <Text style={styles.recipeAddOptionChevron}>›</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={recipeImportMode !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRecipeImportMode(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.formPage}>
          <View style={[styles.formHeader, { paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable accessibilityRole="button" onPress={() => setRecipeImportMode(null)} style={styles.formHeaderSide}>
              <Text style={styles.formCancelText}>{text('取消', 'Cancel')}</Text>
            </Pressable>
            <Text style={styles.formHeaderTitle}>
              {recipeImportMode === 'image' ? text('识图分析', 'Analyze image') : text('链接分析', 'Analyze link')}
            </Text>
            <View style={styles.formHeaderSide} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.recipeImportContent}>
            <View style={styles.recipeImportIntro}>
              <Text style={styles.recipeImportIntroIcon}>✦</Text>
              <View style={styles.recipeImportIntroCopy}>
                <Text style={styles.recipeImportIntroTitle}>
                  {recipeImportMode === 'image'
                    ? text('从图片提取完整菜谱', 'Extract a recipe from an image')
                    : text('从网页链接整理菜谱', 'Organize a recipe from the web')}
                </Text>
                <Text style={styles.recipeImportIntroText}>
                  {text('AI 会生成可编辑草稿，保存前请检查食材用量和步骤。', 'AI creates an editable draft. Review amounts and steps before saving.')}
                </Text>
              </View>
            </View>

            {recipeImportMode === 'image' ? (
              recipeImportImageUri ? (
                <View style={styles.recipeImagePreviewCard}>
                  <Image source={{ uri: recipeImportImageUri }} resizeMode="contain" style={styles.recipeImagePreview} />
                  <Pressable accessibilityRole="button" onPress={chooseRecipeImage} style={styles.changeRecipeImageButton}>
                    <Text style={styles.changeRecipeImageText}>{text('重新选择图片', 'Choose another image')}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={chooseRecipeImage} style={styles.emptyRecipeImageButton}>
                  <Text style={styles.emptyRecipeImageIcon}>▧</Text>
                  <Text style={styles.emptyRecipeImageTitle}>{text('选择菜谱图片', 'Choose a recipe image')}</Text>
                </Pressable>
              )
            ) : (
              <View style={styles.recipeLinkField}>
                <Text style={styles.fieldLabel}>{text('菜谱链接', 'Recipe URL')}</Text>
                <TextInput
                  accessibilityLabel={text('输入菜谱链接', 'Recipe URL')}
                  value={recipeImportLink}
                  onChangeText={setRecipeImportLink}
                  placeholder="https://…"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.formInput}
                />
              </View>
            )}

            <View style={styles.recipeImportPrivacy}>
              <Text style={styles.recipeImportPrivacyIcon}>ⓘ</Text>
              <Text style={styles.recipeImportPrivacyText}>
                {recipeImportMode === 'image'
                  ? text('所选图片会发送给 OpenAI 进行分析。', 'The selected image is sent to OpenAI for analysis.')
                  : text('链接会发送给 OpenAI，并使用网页搜索读取公开内容。', 'The URL is sent to OpenAI and web search reads its public content.')}
              </Text>
            </View>

            {recipeImportError ? (
              <View style={styles.recipeImportError}>
                <Text style={styles.recipeImportErrorIcon}>!</Text>
                <Text style={styles.recipeImportErrorText}>{recipeImportError}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text('开始分析菜谱', 'Analyze recipe')}
              disabled={isRecipeImportAnalyzing || (recipeImportMode === 'image' ? !recipeImportImageData : !recipeImportLink.trim())}
              onPress={analyzeRecipeImport}
              style={[
                styles.recipeImportAnalyzeButton,
                (isRecipeImportAnalyzing || (recipeImportMode === 'image' ? !recipeImportImageData : !recipeImportLink.trim())) && styles.primaryActionDisabled,
              ]}>
              <Text style={styles.recipeImportAnalyzeText}>
                {isRecipeImportAnalyzing ? text('AI 正在分析…', 'AI is analyzing…') : text('✦ 一键分析并生成草稿', '✦ Analyze and create draft')}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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
          {undoCandidate ? (
            <View style={[StyleSheet.absoluteFillObject, styles.undoBackdrop]}>
              <View style={styles.undoDialog}>
                <View style={styles.undoDialogIcon}>
                  <Text style={styles.undoDialogIconText}>↺</Text>
                </View>
                <Text style={styles.undoDialogTitle}>{text('确认重置这次记录？', 'Reset this completion?')}</Text>
                <Text style={styles.undoDialogText}>
                  {text(
                    `“${localizeContent(undoCandidate.recipeName, language)}”消耗的食材会补回原库存，相关饮食记录也会同步修正。`,
                    `Ingredients used for “${localizeContent(undoCandidate.recipeName, language)}” will return to stock and its meal log will be corrected.`
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
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={selectedRecipe !== null}
        animationType="none"
        presentationStyle="fullScreen"
        onDismiss={handleRecipeDetailDismiss}
        onRequestClose={requestCloseRecipe}>
        {selectedRecipe ? (
          <Animated.View style={[styles.detailPage, detailRevealStyle]}>
            <View
              testID="recipe-edge-swipe-zone"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.recipeEdgeSwipeZone}
              {...recipeEdgePanResponder.panHandlers}
            />
            <View style={[styles.detailHeader, { paddingTop: Math.max(insets.top, 12) }]}> 
              <Pressable accessibilityRole="button" onPress={requestCloseRecipe} style={styles.headerButton}>
                <Text style={styles.headerButtonText}>×</Text>
              </Pressable>
              <Text style={styles.detailHeaderTitle}>
                {isCompletionLogOpen
                  ? text('记录用餐', 'Log meal')
                  : isCooking
                    ? text('烹饪模式', 'Cooking mode')
                    : text('菜谱详情', 'Recipe details')}
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
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
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
                        const missingAmount = amountFromBaseUnit(
                          Math.max(0, neededBase - availableBase),
                          ingredient.unit
                        );
                        const isOnShoppingList = shoppingList.some(
                          (entry) => !entry.checked && entry.ingredientId === canonicalIngredientId(ingredient.name)
                        );
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
                            <View style={styles.ingredientAmountColumn}>
                              <Text style={styles.ingredientAmount}>{formatAmount(amount, ingredient.unit, language)}</Text>
                              {!enough ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={text(`将${ingredient.name}加入购物清单`, `Add ${localizeContent(ingredient.name, 'en')} to shopping list`)}
                                  disabled={isOnShoppingList}
                                  onPress={() => addShoppingItem({
                                    name: ingredient.name,
                                    nameEn: localizeContent(ingredient.name, 'en'),
                                    emoji: '🛒',
                                    quantity: missingAmount,
                                    unit: ingredient.unit,
                                    sourceRecipeId: selectedRecipe.id,
                                    sourceRecipeName: selectedRecipe.name,
                                  })}
                                  style={[styles.addIngredientToList, isOnShoppingList && styles.addIngredientToListAdded]}>
                                  <Text style={[styles.addIngredientToListText, isOnShoppingList && styles.addIngredientToListTextAdded]}>
                                    {isOnShoppingList ? text('已在清单', 'On list') : text('＋ 清单', '+ List')}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
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
              ) : isCompletionLogOpen ? (
                <View testID="completion-log-page" style={styles.completionLogPage}>
                  <View style={styles.completionLogHero}>
                    <View style={styles.completionLogEmojiWrap}>
                      <Text style={styles.completionLogEmoji}>🍽️</Text>
                    </View>
                    <View style={styles.completionLogHeroCopy}>
                      <Text style={styles.completionLogTitle}>
                        {text('完成啦，记录到哪一餐？', 'All done. Log this meal')}
                      </Text>
                      <Text style={styles.completionLogSubtitle}>
                        {text(
                          '选择实际用餐的餐次和时间，下一步会扣减库存并更新健康报告。',
                          'Choose the meal and actual eating time. The next step updates stock and your health report.'
                        )}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.completionLogSection}>
                    <Text style={styles.completionLogSectionTitle}>{text('记录到', 'Meal')}</Text>
                    <View style={styles.mealOptions}>
                      {mealOptions.map((option) => (
                        <Pressable
                          key={option.key}
                          accessibilityRole="radio"
                          accessibilityLabel={text(option.zh, option.en)}
                          accessibilityState={{ checked: mealType === option.key }}
                          onPress={() => setMealType(option.key)}
                          style={[
                            styles.mealOption,
                            mealType === option.key && styles.mealOptionSelected,
                          ]}>
                          <Text style={styles.mealOptionEmoji}>{option.emoji}</Text>
                          <Text
                            style={[
                              styles.mealOptionText,
                              mealType === option.key && styles.mealOptionTextSelected,
                            ]}>
                            {text(option.zh, option.en)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.completionLogSection}>
                    <View style={styles.completionTimeHeader}>
                      <Text style={styles.completionLogSectionTitle}>{text('吃饭时间', 'Eating time')}</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setMealTime(currentTime())}
                        style={styles.nowTimeButton}>
                        <Text style={styles.nowTimeButtonText}>{text('设为现在', 'Use now')}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.mealTimePresets}>
                      {mealTimePresets[mealType].map((time) => (
                        <Pressable
                          key={`${mealType}-${time}`}
                          accessibilityRole="radio"
                          accessibilityLabel={text(`用餐时间 ${time}`, `Eating time ${time}`)}
                          accessibilityState={{ checked: mealTime === time }}
                          onPress={() => setMealTime(time)}
                          style={[
                            styles.mealTimePreset,
                            mealTime === time && styles.mealTimePresetSelected,
                          ]}>
                          <Text
                            style={[
                              styles.mealTimePresetText,
                              mealTime === time && styles.mealTimePresetTextSelected,
                            ]}>
                            {time}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View
                      style={[
                        styles.mealTimeInputWrap,
                        !isValidMealTime(mealTime) && styles.mealTimeInputWrapError,
                      ]}>
                      <Text style={styles.mealTimeInputIcon}>🕐</Text>
                      <TextInput
                        accessibilityLabel={text('自定义吃饭时间', 'Custom eating time')}
                        value={mealTime}
                        onChangeText={setMealTime}
                        placeholder="HH:MM"
                        placeholderTextColor={Colors.light.textSecondary}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        selectTextOnFocus
                        style={styles.mealTimeInput}
                      />
                    </View>
                    {!isValidMealTime(mealTime) ? (
                      <Text style={styles.mealTimeError}>
                        {text('请输入 00:00–23:59 的时间。', 'Enter a time from 00:00 to 23:59.')}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.completionInlineHint}>
                    <Text style={styles.completionInlineHintIcon}>✓</Text>
                    <Text style={styles.completionInlineHintText}>
                      {text(
                        '确认后才会正式完成菜谱；返回上一步不会扣减任何库存。',
                        'The recipe is completed only after confirmation. Going back will not change stock.'
                      )}
                    </Text>
                  </View>
                </View>
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={text(
                      timerDeadline !== null ? '最小化烹饪并保留倒计时' : '最小化烹饪并保留进度',
                      timerDeadline !== null ? 'Minimize cooking and keep the timer' : 'Minimize cooking and keep progress'
                    )}
                    onPress={minimizeActiveCooking}
                    style={styles.minimizeCookingButton}>
                    <Text style={styles.minimizeCookingButtonIcon}>↘</Text>
                    <View style={styles.minimizeCookingButtonCopy}>
                      <Text style={styles.minimizeCookingButtonTitle}>
                        {text('先去看看别的页面', 'Browse another screen')}
                      </Text>
                      <Text style={styles.minimizeCookingButtonText}>
                        {timerDeadline !== null
                          ? text('倒计时会缩成悬浮窗，点击即可继续烹饪。', 'The timer becomes a floating window. Tap it to resume.')
                          : text('当前步骤会保留在悬浮窗，点击即可继续烹饪。', 'Your current step stays in a floating window. Tap it to resume.')}
                      </Text>
                    </View>
                  </Pressable>
                  <View style={styles.timerHint}>
                    <Text style={styles.timerHintIcon}>👩‍🍳</Text>
                    <Text style={styles.timerHintText}>{text(selectedRecipe.tip, selectedRecipe.tipEn)}</Text>
                  </View>
                </View>
              )}

              </Animated.View>
            </ScrollView>

            <View style={[styles.bottomActionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}> 
              {isCompletionLogOpen ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPageTurning}
                    onPress={() => turnCompletionLogPage(false)}
                    style={[styles.secondaryAction, isPageTurning && styles.disabled]}>
                    <Text style={styles.secondaryActionText}>{text('返回上一步', 'Back')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={text('确认完成并更新库存', 'Confirm completion and update stock')}
                    disabled={!isValidMealTime(mealTime) || isPageTurning}
                    onPress={finishCooking}
                    style={[
                      styles.primaryAction,
                      (!isValidMealTime(mealTime) || isPageTurning) && styles.disabled,
                    ]}>
                    <Text style={styles.primaryActionText}>{text('确认完成', 'Confirm')}</Text>
                  </Pressable>
                </>
              ) : isCooking ? (
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
                        openCompletionLog();
                      }
                    }}
                    style={[styles.primaryAction, isPageTurning && styles.disabled]}>
                    <Text style={styles.primaryActionText}>
                      {stepIndex < selectedRecipe.steps.length - 1
                        ? text('下一步', 'Next step')
                        : text('完成烹饪', 'Finish cooking')}
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

            {isCloseCookingConfirmOpen ? (
              <View style={[StyleSheet.absoluteFillObject, styles.cookingCloseBackdrop]}>
                <View accessibilityViewIsModal style={styles.cookingCloseDialog}>
                  <View style={styles.cookingCloseIcon}>
                    <Text style={styles.cookingCloseIconText}>👩‍🍳</Text>
                  </View>
                  <Text style={styles.cookingCloseTitle}>
                    {text('确定要离开烹饪模式吗？', 'Leave cooking mode?')}
                  </Text>
                  <Text style={styles.cookingCloseText}>
                    {timerDeadline !== null
                      ? text(
                          '倒计时仍在进行。你可以暂时离开，让它缩成漂浮窗；也可以结束本次烹饪。',
                          'The timer is still running. Minimize it into a floating window, or end this cooking session.'
                        )
                      : text(
                          '当前步骤还没有完成。你可以暂时离开并保留进度，也可以结束本次烹饪。',
                          'This recipe is still in progress. Minimize it to keep your progress, or end this cooking session.'
                        )}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setIsCloseCookingConfirmOpen(false)}
                    style={styles.keepCookingButton}>
                    <Text style={styles.keepCookingButtonText}>{text('继续烹饪', 'Keep cooking')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={minimizeActiveCooking}
                    style={styles.minimizeConfirmButton}>
                    <Text style={styles.minimizeConfirmButtonText}>
                      {timerDeadline !== null
                        ? text('暂时离开，保留倒计时', 'Minimize and keep timer')
                        : text('暂时离开，保留进度', 'Minimize and keep progress')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={endCookingAndClose}
                    style={styles.endCookingButton}>
                    <Text style={styles.endCookingButtonText}>{text('结束并退出', 'End and leave')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

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
              {text('新建菜谱', 'New recipe')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !validDraftRecipe || isAiOrganizing }}
              disabled={!validDraftRecipe || isAiOrganizing}
              onPress={saveRecipe}
              style={styles.formHeaderSide}>
              <Text style={[styles.formSaveText, (!validDraftRecipe || isAiOrganizing) && styles.formSaveTextDisabled]}>
                {isAiOrganizing ? text('AI 整理中…', 'AI organizing…') : text('保存', 'Save')}
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
                  {text('记录你的拿手菜', 'Save your signature dish')}
                </Text>
                <Text style={styles.formIntroText}>
                  {text(
                    '填写菜名、食材和步骤后，AI 会自动识别分类并放进合适的菜谱库。',
                    'After you enter the recipe, AI will choose the right collection automatically.'
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>{text('基本信息', 'Basics')}</Text>
              <Text style={styles.fieldLabel}>
                {text('菜谱名称 *', 'Recipe name *')}
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

              <View style={styles.aiFormHint}>
                <Text style={styles.aiFormHintIcon}>✦</Text>
                <View style={styles.aiFormHintCopy}>
                  <Text style={styles.aiFormHintTitle}>{text('AI 自动分库', 'AI auto-organization')}</Text>
                  <Text style={styles.aiFormHintText}>
                    {text('无需选择分类或标签；保存时会自动放入快手菜、一锅料理、下饭菜、面食、其他或烘焙谱。', 'No manual category or tags needed. AI will choose the best collection when you save.')}
                  </Text>
                </View>
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
              disabled={!validDraftRecipe || isAiOrganizing}
              onPress={saveRecipe}
              style={[styles.saveRecipeButton, (!validDraftRecipe || isAiOrganizing) && styles.primaryActionDisabled]}>
              <Text style={styles.saveRecipeButtonText}>
                {isAiOrganizing ? text('AI 正在分库…', 'AI is organizing…') : text('保存并由 AI 自动分库', 'Save with AI organization')}
              </Text>
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
  undoBackdrop: { zIndex: 50, elevation: 20, flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#17251FC2' },
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
  aiOrganizeButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#B7DCC5' },
  aiOrganizeButtonText: { color: Colors.light.primary, fontSize: 10.5, fontWeight: '900' },
  aiResultBanner: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, backgroundColor: '#F0EBFF', borderWidth: 1, borderColor: '#D7CBF2' },
  aiResultIcon: { color: '#735C9B', fontSize: 17, fontWeight: '900' },
  aiResultText: { flex: 1, color: '#654D8B', fontSize: 10.5, lineHeight: 16, fontWeight: '800' },
  aiResultClose: { color: '#735C9B', fontSize: 18 },
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
  recipeViewToggle: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  recipeViewToggleText: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  recipeViewToggleArrow: { color: Colors.light.primary, fontSize: 20, fontWeight: '700' },
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
  recipeEdgeSwipeZone: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 32, zIndex: 50 },
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
  ingredientAmountColumn: { alignItems: 'flex-end', gap: 6 },
  ingredientAmount: { color: Colors.light.text, fontSize: 12, fontWeight: '800' },
  addIngredientToList: { minHeight: 27, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderRadius: 9, backgroundColor: Colors.light.primarySoft },
  addIngredientToListAdded: { backgroundColor: Colors.light.backgroundElement },
  addIngredientToListText: { color: Colors.light.primary, fontSize: 8.5, fontWeight: '900' },
  addIngredientToListTextAdded: { color: Colors.light.textSecondary },
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
  minimizeCookingButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 17, backgroundColor: '#FFFFFFF2' },
  minimizeCookingButtonIcon: { width: 34, height: 34, overflow: 'hidden', textAlign: 'center', lineHeight: 34, borderRadius: 17, color: '#FFFFFF', backgroundColor: Colors.light.primary, fontSize: 16, fontWeight: '900' },
  minimizeCookingButtonCopy: { flex: 1, gap: 3 },
  minimizeCookingButtonTitle: { color: Colors.light.text, fontSize: 11.5, fontWeight: '900' },
  minimizeCookingButtonText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 14 },
  mealOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealOption: { minWidth: 92, flex: 1, minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  mealOptionSelected: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primarySoft },
  mealOptionEmoji: { fontSize: 16 },
  mealOptionText: { color: Colors.light.textSecondary, fontSize: 11, fontWeight: '800' },
  mealOptionTextSelected: { color: Colors.light.primary },
  completionLogPage: {
    gap: 20,
    padding: 18,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  completionLogHero: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  completionLogEmojiWrap: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: Colors.light.primarySoft,
  },
  completionLogEmoji: { fontSize: 28 },
  completionLogHeroCopy: { flex: 1, gap: 4 },
  completionLogTitle: { color: Colors.light.text, fontSize: 19, fontWeight: '900' },
  completionLogSubtitle: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  completionLogSection: { gap: 10 },
  completionLogSectionTitle: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  completionTimeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nowTimeButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: Colors.light.primarySoft,
  },
  nowTimeButtonText: { color: Colors.light.primary, fontSize: 10, fontWeight: '900' },
  mealTimePresets: { flexDirection: 'row', gap: 8 },
  mealTimePreset: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  mealTimePresetSelected: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primarySoft },
  mealTimePresetText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  mealTimePresetTextSelected: { color: Colors.light.primary },
  mealTimeInputWrap: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  mealTimeInputWrapError: { borderColor: Colors.light.danger, backgroundColor: Colors.light.dangerSoft },
  mealTimeInputIcon: { fontSize: 16 },
  mealTimeInput: { flex: 1, paddingVertical: 10, color: Colors.light.text, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  mealTimeError: { color: Colors.light.danger, fontSize: 10.5, fontWeight: '700' },
  completionInlineHint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, backgroundColor: Colors.light.primarySoft },
  completionInlineHintIcon: { width: 28, height: 28, overflow: 'hidden', textAlign: 'center', lineHeight: 28, borderRadius: 14, color: '#FFFFFF', backgroundColor: Colors.light.primary, fontSize: 13, fontWeight: '900' },
  completionInlineHintText: { flex: 1, color: Colors.light.primary, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
  cookingCloseBackdrop: { zIndex: 100, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#102A2073' },
  cookingCloseDialog: { width: '100%', maxWidth: 390, alignItems: 'center', gap: 12, padding: 22, borderRadius: 27, backgroundColor: Colors.light.surface, shadowColor: '#102A20', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.24, shadowRadius: 28, elevation: 20 },
  cookingCloseIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: Colors.light.primarySoft },
  cookingCloseIconText: { fontSize: 34 },
  cookingCloseTitle: { color: Colors.light.text, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  cookingCloseText: { color: Colors.light.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center', marginBottom: 2 },
  keepCookingButton: { width: '100%', minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primary },
  keepCookingButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  minimizeConfirmButton: { width: '100%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primarySoft },
  minimizeConfirmButtonText: { color: Colors.light.primary, fontSize: 12.5, fontWeight: '900' },
  endCookingButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  endCookingButtonText: { color: Colors.light.danger, fontSize: 11.5, fontWeight: '800' },
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
  aiFormHint: { minHeight: 72, flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 13, borderRadius: 17, backgroundColor: '#F0EBFF', borderWidth: 1, borderColor: '#D7CBF2' },
  aiFormHintIcon: { width: 30, height: 30, overflow: 'hidden', textAlign: 'center', lineHeight: 30, borderRadius: 15, color: '#FFFFFF', backgroundColor: '#735C9B', fontSize: 15, fontWeight: '900' },
  aiFormHintCopy: { flex: 1, gap: 4 },
  aiFormHintTitle: { color: '#59417F', fontSize: 12, fontWeight: '900' },
  aiFormHintText: { color: '#745F93', fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
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
  recipeHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addRecipeHeaderButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: Colors.light.primary, shadowColor: '#173D2F', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 3 },
  addRecipeHeaderIcon: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '600' },
  recipeAddBackdrop: { flex: 1, alignItems: 'flex-end', paddingHorizontal: 14, backgroundColor: '#16221C38' },
  recipeAddSheet: { width: 302, gap: 8, padding: 11, borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#173D2F', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  recipeAddHandle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: Colors.light.border, marginBottom: 3 },
  recipeAddTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900', paddingHorizontal: 5, paddingTop: 2, paddingBottom: 1 },
  recipeAddSubtitle: { color: Colors.light.textSecondary, fontSize: 11.5, marginBottom: 3 },
  recipeAddOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 16, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  recipeAddOptionAi: { backgroundColor: '#F5F1FF', borderColor: '#D7CBF2' },
  recipeAddOptionIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.primarySoft },
  recipeAddOptionIconAi: { backgroundColor: '#735C9B' },
  recipeAddOptionIconText: { color: Colors.light.primary, fontSize: 24, fontWeight: '700' },
  recipeAddOptionAiText: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  recipeAddOptionCopy: { flex: 1, gap: 3 },
  recipeAddOptionTitle: { color: Colors.light.text, fontSize: 13.5, fontWeight: '900' },
  recipeAddOptionText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 15 },
  recipeAddOptionChevron: { color: Colors.light.textSecondary, fontSize: 24 },
  recipeImportContent: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 15, padding: 18, paddingBottom: 44 },
  recipeImportIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 21, backgroundColor: '#735C9B' },
  recipeImportIntroIcon: { width: 42, height: 42, overflow: 'hidden', textAlign: 'center', lineHeight: 42, borderRadius: 15, color: '#735C9B', backgroundColor: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  recipeImportIntroCopy: { flex: 1, gap: 4 },
  recipeImportIntroTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  recipeImportIntroText: { color: '#EEE8FA', fontSize: 10.5, lineHeight: 16 },
  recipeImagePreviewCard: { overflow: 'hidden', gap: 10, padding: 10, borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  recipeImagePreview: { width: '100%', height: 290, borderRadius: 15, backgroundColor: Colors.light.backgroundElement },
  changeRecipeImageButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  changeRecipeImageText: { color: Colors.light.primary, fontSize: 11.5, fontWeight: '900' },
  emptyRecipeImageButton: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 21, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: '#D7CBF2', borderStyle: 'dashed' },
  emptyRecipeImageIcon: { color: '#735C9B', fontSize: 38, fontWeight: '800' },
  emptyRecipeImageTitle: { color: '#654D8B', fontSize: 13, fontWeight: '900' },
  recipeLinkField: { gap: 8 },
  recipeImportPrivacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  recipeImportPrivacyIcon: { color: Colors.light.textSecondary, fontSize: 13, fontWeight: '900' },
  recipeImportPrivacyText: { flex: 1, color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15 },
  recipeImportError: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 15, backgroundColor: Colors.light.dangerSoft },
  recipeImportErrorIcon: { width: 25, height: 25, overflow: 'hidden', textAlign: 'center', lineHeight: 25, borderRadius: 13, color: '#FFFFFF', backgroundColor: Colors.light.danger, fontWeight: '900' },
  recipeImportErrorText: { flex: 1, color: Colors.light.danger, fontSize: 10.5, lineHeight: 16, fontWeight: '800' },
  recipeImportAnalyzeButton: { minHeight: 57, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#735C9B' },
  recipeImportAnalyzeText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
});
