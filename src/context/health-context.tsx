import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';

import { usePersistentState } from '@/hooks/use-persistent-state';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealRecord = {
  id: string;
  date: string;
  type: MealType;
  time: string;
  foods: string;
  foodsEn?: string;
  note?: string;
  noteEn?: string;
  carbsGrams: number;
  recipeId?: string;
};

export type DrinkRecord = {
  id: string;
  date: string;
  beverageKey: string;
  volumeMl: number;
  time: string;
};

type HealthState = {
  mealRecords: MealRecord[];
  drinkRecords: DrinkRecord[];
  plannedRecipeId: string | null;
  dailyCarbGoal: number;
  dailyFluidGoal: number;
};

type HealthContextValue = HealthState & {
  isHydrated: boolean;
  setMealRecords: React.Dispatch<React.SetStateAction<MealRecord[]>>;
  setDrinkRecords: React.Dispatch<React.SetStateAction<DrinkRecord[]>>;
  setPlannedRecipeId: (recipeId: string | null) => void;
  setDailyGoals: (goals: { carbs?: number; fluid?: number }) => void;
  deleteMealRecord: (id: string) => void;
  deleteDrinkRecord: (id: string) => void;
};

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const today = localDateKey();

const initialHealthState: HealthState = {
  dailyCarbGoal: 250,
  dailyFluidGoal: 2000,
  plannedRecipeId: null,
  mealRecords: [
    {
      id: 'breakfast-today',
      date: today,
      type: 'breakfast',
      time: '08:10',
      foods: '鲜牛奶、鸡蛋、全麦吐司',
      foodsEn: 'Fresh milk, eggs, whole-grain toast',
      note: '饱腹感刚好，上午精神状态不错。',
      noteEn: 'Comfortably full with steady energy through the morning.',
      carbsGrams: 48,
    },
    {
      id: 'lunch-today',
      date: today,
      type: 'lunch',
      time: '12:35',
      foods: '番茄炒蛋、米饭、小白菜',
      foodsEn: 'Tomato & eggs, rice, bok choy',
      note: '有主食、蛋白质和两种蔬菜。',
      noteEn: 'Included a staple, protein, and two vegetables.',
      carbsGrams: 82,
    },
    {
      id: 'snack-today',
      date: today,
      type: 'snack',
      time: '15:40',
      foods: '苹果、每日坚果',
      foodsEn: 'Apple and mixed nuts',
      note: '下午加餐，份量较轻。',
      noteEn: 'A light afternoon snack.',
      carbsGrams: 26,
    },
  ],
  drinkRecords: [
    { id: 'milk-morning', date: today, beverageKey: 'milk', volumeMl: 250, time: '08:10' },
    { id: 'water-morning', date: today, beverageKey: 'water', volumeMl: 350, time: '09:30' },
    { id: 'coffee-morning', date: today, beverageKey: 'coffee', volumeMl: 300, time: '10:35' },
  ],
};

const HealthContext = createContext<HealthContextValue | null>(null);

export function HealthProvider({ children }: PropsWithChildren) {
  const [state, setState, isHydrated] = usePersistentState<HealthState>(
    'health-state-v2',
    initialHealthState
  );

  const value = useMemo<HealthContextValue>(
    () => ({
      ...state,
      isHydrated,
      setMealRecords: (next) => {
        setState((current) => ({
          ...current,
          mealRecords: typeof next === 'function' ? next(current.mealRecords) : next,
        }));
      },
      setDrinkRecords: (next) => {
        setState((current) => ({
          ...current,
          drinkRecords: typeof next === 'function' ? next(current.drinkRecords) : next,
        }));
      },
      setPlannedRecipeId: (recipeId) => {
        setState((current) => ({ ...current, plannedRecipeId: recipeId }));
      },
      setDailyGoals: ({ carbs, fluid }) => {
        setState((current) => ({
          ...current,
          dailyCarbGoal: carbs ?? current.dailyCarbGoal,
          dailyFluidGoal: fluid ?? current.dailyFluidGoal,
        }));
      },
      deleteMealRecord: (id) => {
        setState((current) => ({
          ...current,
          mealRecords: current.mealRecords.filter((record) => record.id !== id),
        }));
      },
      deleteDrinkRecord: (id) => {
        setState((current) => ({
          ...current,
          drinkRecords: current.drinkRecords.filter((record) => record.id !== id),
        }));
      },
    }),
    [isHydrated, setState, state]
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  const context = useContext(HealthContext);
  if (!context) throw new Error('useHealth must be used inside HealthProvider');
  return context;
}
