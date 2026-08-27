import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';

import type { MealType } from '@/context/health-context';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { cancelCookingTimerNotification } from '@/services/app-notifications';

export type CookingSession = {
  recipeId: string;
  recipeName: string;
  recipeNameEn: string;
  recipeEmoji: string;
  servings: number;
  stepIndex: number;
  totalSteps: number;
  stage: 'cooking' | 'meal';
  mealType: MealType;
  mealTime: string;
  timerDeadline: number | null;
  timerStepIndex: number | null;
  completedTimerSteps: number[];
  isMinimized: boolean;
};

type CookingSessionContextValue = {
  session: CookingSession | null;
  isHydrated: boolean;
  resumeRequestId: number;
  startCookingSession: (session: CookingSession) => void;
  updateCookingSession: (update: Partial<CookingSession>) => void;
  minimizeCookingSession: (update?: Partial<CookingSession>) => void;
  requestCookingResume: () => void;
  clearCookingSession: () => void;
};

const CookingSessionContext = createContext<CookingSessionContextValue | null>(null);

export function CookingSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession, isHydrated] = usePersistentState<CookingSession | null>(
    'cooking-session-v1',
    null
  );
  const [resumeRequestId, setResumeRequestId] = useState(0);

  const value = useMemo<CookingSessionContextValue>(
    () => ({
      session,
      isHydrated,
      resumeRequestId,
      startCookingSession: setSession,
      updateCookingSession: (update) => {
        if (update.timerDeadline === null) void cancelCookingTimerNotification();
        setSession((current) => (current ? { ...current, ...update } : current));
      },
      minimizeCookingSession: (update = {}) => {
        setSession((current) =>
          current ? { ...current, ...update, isMinimized: true } : current
        );
      },
      requestCookingResume: () => {
        setSession((current) => (current ? { ...current, isMinimized: false } : current));
        setResumeRequestId((current) => current + 1);
      },
      clearCookingSession: () => {
        void cancelCookingTimerNotification();
        setSession(null);
      },
    }),
    [isHydrated, resumeRequestId, session, setSession]
  );

  return <CookingSessionContext.Provider value={value}>{children}</CookingSessionContext.Provider>;
}

export function useCookingSession() {
  const context = useContext(CookingSessionContext);
  if (!context) throw new Error('useCookingSession must be used inside CookingSessionProvider');
  return context;
}
