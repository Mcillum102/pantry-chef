import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { Platform } from 'react-native';

import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import {
  defaultReminderPreferences,
  normalizeReminderPreferences,
  type ReminderCategory,
  type ReminderPreferences,
} from '@/data/reminder-utils';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  cancelCookingTimerNotification,
  requestAppNotificationPermission,
  scheduleTestNotification,
} from '@/services/app-notifications';
import {
  disableExpiryNotifications,
  enableExpiryNotifications,
  refreshExpiryNotifications,
} from '@/services/expiry-notifications';
import { refreshRoutineNotifications } from '@/services/routine-notifications';

type ReminderEnableResult = 'enabled' | 'disabled' | 'web-saved' | 'denied';

type ReminderContextValue = {
  preferences: ReminderPreferences;
  setPreferences: Dispatch<SetStateAction<ReminderPreferences>>;
  isHydrated: boolean;
  setCategoryEnabled: (category: ReminderCategory, enabled: boolean) => Promise<ReminderEnableResult>;
  sendTestReminder: () => Promise<ReminderEnableResult>;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);

function withCategory(
  current: ReminderPreferences,
  category: ReminderCategory,
  enabled: boolean
): ReminderPreferences {
  if (category === 'master') return { ...current, masterEnabled: enabled };
  if (category === 'expiry') return { ...current, expiryEnabled: enabled };
  if (category === 'meals') return { ...current, mealsEnabled: enabled };
  if (category === 'hydration') return { ...current, hydrationEnabled: enabled };
  if (category === 'shopping') return { ...current, shoppingEnabled: enabled };
  return { ...current, cookingEnabled: enabled };
}

export function ReminderProvider({ children }: PropsWithChildren) {
  const { inventory, shoppingList } = useKitchen();
  const { language } = useLanguage();
  const [storedPreferences, setStoredPreferences, isHydrated] = usePersistentState<ReminderPreferences>(
    'reminder-preferences-v1',
    defaultReminderPreferences
  );
  const preferences = useMemo(
    () => normalizeReminderPreferences(storedPreferences),
    [storedPreferences]
  );
  const uncheckedShoppingCount = shoppingList.filter((item) => !item.checked).length;
  const setPreferences = useCallback<Dispatch<SetStateAction<ReminderPreferences>>>((next) => {
    setStoredPreferences((current) => {
      const normalized = normalizeReminderPreferences(current);
      return typeof next === 'function' ? next(normalized) : next;
    });
  }, [setStoredPreferences]);

  useEffect(() => {
    if (!isHydrated) return;
    if (JSON.stringify(preferences) !== JSON.stringify(storedPreferences)) {
      setStoredPreferences(preferences);
    }
  }, [isHydrated, preferences, setStoredPreferences, storedPreferences]);

  useEffect(() => {
    if (!isHydrated) return;
    const timer = setTimeout(() => {
      if (!preferences.masterEnabled) {
        void disableExpiryNotifications();
        void refreshRoutineNotifications(preferences, uncheckedShoppingCount, language);
        void cancelCookingTimerNotification();
        return;
      }
      if (preferences.expiryEnabled) {
        void refreshExpiryNotifications(
          inventory,
          preferences.expiryLeadDays,
          preferences.expiryTime,
          language
        );
      } else {
        void disableExpiryNotifications();
      }
      void refreshRoutineNotifications(preferences, uncheckedShoppingCount, language);
    }, 300);
    return () => clearTimeout(timer);
  }, [inventory, isHydrated, language, preferences, uncheckedShoppingCount]);

  const value = useMemo<ReminderContextValue>(() => ({
    preferences,
    setPreferences,
    isHydrated,
    setCategoryEnabled: async (category, enabled) => {
      const next = withCategory(preferences, category, enabled);
      if (!enabled) {
        setPreferences(next);
        if (category === 'expiry' || category === 'master') await disableExpiryNotifications();
        if (category === 'cooking' || category === 'master') await cancelCookingTimerNotification();
        await refreshRoutineNotifications(next, uncheckedShoppingCount, language);
        return 'disabled';
      }

      if (Platform.OS === 'web') {
        setPreferences(next);
        return 'web-saved';
      }

      if (category !== 'master' && !next.masterEnabled) {
        setPreferences(next);
        return 'enabled';
      }

      const granted = category === 'expiry'
        ? await enableExpiryNotifications(
            inventory,
            next.expiryLeadDays,
            next.expiryTime,
            language
          )
        : category === 'cooking' || category === 'master'
          ? await requestAppNotificationPermission()
          : await refreshRoutineNotifications(next, uncheckedShoppingCount, language, true);
      if (!granted) return 'denied';
      setPreferences(next);
      return 'enabled';
    },
    sendTestReminder: async () => {
      if (Platform.OS === 'web') return 'web-saved';
      return await scheduleTestNotification(language) ? 'enabled' : 'denied';
    },
  }), [inventory, isHydrated, language, preferences, setPreferences, uncheckedShoppingCount]);

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
}

export function useReminders() {
  const context = useContext(ReminderContext);
  if (!context) throw new Error('useReminders must be used inside ReminderProvider');
  return context;
}
