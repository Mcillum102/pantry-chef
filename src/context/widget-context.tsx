import { createContext, type PropsWithChildren, useContext, useEffect, useMemo } from 'react';

import { useCookingSession } from '@/context/cooking-session-context';
import { localDateKey, useHealth } from '@/context/health-context';
import { useKitchen } from '@/context/kitchen-context';
import { beverageLibrary, estimateRetainedWater } from '@/data/hydration-data';
import { usePersistentState } from '@/hooks/use-persistent-state';

export type WidgetKind = 'expiry' | 'hydration' | 'timer';

export type WidgetSnapshot = {
  updatedAt: string;
  expiry: {
    total: number;
    items: { name: string; emoji: string; daysLeft: number }[];
  };
  hydration: {
    retainedMl: number;
    goalMl: number;
  };
  timer: {
    active: boolean;
    recipeName: string;
    recipeEmoji: string;
    stepIndex: number;
    totalSteps: number;
    deadline: number | null;
  };
};

type WidgetContextValue = {
  enabledWidgets: WidgetKind[];
  setWidgetEnabled: (kind: WidgetKind, enabled: boolean) => void;
  snapshot: WidgetSnapshot;
  nativeWidgetsReady: boolean;
};

const WidgetContext = createContext<WidgetContextValue | null>(null);

export function WidgetProvider({ children }: PropsWithChildren) {
  const { inventory } = useKitchen();
  const { drinkRecords, dailyFluidGoal } = useHealth();
  const { session } = useCookingSession();
  const [enabledWidgets, setEnabledWidgets] = usePersistentState<WidgetKind[]>(
    'widget-preferences-v1',
    ['expiry', 'hydration', 'timer']
  );
  const [persistedSnapshot, setPersistedSnapshot] = usePersistentState<WidgetSnapshot | null>(
    'widget-snapshot-v1',
    null
  );

  const snapshot = useMemo<WidgetSnapshot>(() => {
    const expiring = inventory
      .filter((item) => item.quantity > 0 && item.expiryDate && item.daysLeft <= 3)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    const today = localDateKey();
    const retainedMl = drinkRecords
      .filter((record) => record.date === today)
      .reduce((total, record) => {
        const beverage = beverageLibrary.find((item) => item.key === record.beverageKey);
        return total + estimateRetainedWater(record.volumeMl, beverage?.retentionIndex ?? 1);
      }, 0);

    return {
      updatedAt: new Date().toISOString(),
      expiry: {
        total: expiring.length,
        items: expiring.slice(0, 3).map((item) => ({
          name: item.name,
          emoji: item.emoji,
          daysLeft: item.daysLeft,
        })),
      },
      hydration: { retainedMl, goalMl: dailyFluidGoal },
      timer: {
        active: Boolean(session),
        recipeName: session?.recipeName ?? '',
        recipeEmoji: session?.recipeEmoji ?? '🍳',
        stepIndex: session?.stepIndex ?? 0,
        totalSteps: session?.totalSteps ?? 0,
        deadline: session?.timerDeadline ?? null,
      },
    };
  }, [dailyFluidGoal, drinkRecords, inventory, session]);

  useEffect(() => {
    const comparableSnapshot = { ...snapshot, updatedAt: '' };
    const comparablePersisted = persistedSnapshot ? { ...persistedSnapshot, updatedAt: '' } : null;
    if (JSON.stringify(comparableSnapshot) !== JSON.stringify(comparablePersisted)) {
      setPersistedSnapshot(snapshot);
    }
  }, [persistedSnapshot, setPersistedSnapshot, snapshot]);

  const value = useMemo<WidgetContextValue>(() => ({
    enabledWidgets,
    setWidgetEnabled: (kind, enabled) => {
      setEnabledWidgets((current) => enabled
        ? Array.from(new Set([...current, kind]))
        : current.filter((item) => item !== kind)
      );
    },
    snapshot,
    nativeWidgetsReady: false,
  }), [enabledWidgets, setEnabledWidgets, snapshot]);

  return <WidgetContext.Provider value={value}>{children}</WidgetContext.Provider>;
}

export function useWidgets() {
  const context = useContext(WidgetContext);
  if (!context) throw new Error('useWidgets must be used inside WidgetProvider');
  return context;
}
