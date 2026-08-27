export type ReminderCategory = 'master' | 'expiry' | 'meals' | 'hydration' | 'shopping' | 'cooking';
export type MealReminderKey = 'breakfast' | 'lunch' | 'dinner';

export type ReminderPreferences = {
  masterEnabled: boolean;
  expiryEnabled: boolean;
  expiryLeadDays: number;
  expiryTime: string;
  mealsEnabled: boolean;
  mealEnabled: Record<MealReminderKey, boolean>;
  mealTimes: Record<MealReminderKey, string>;
  hydrationEnabled: boolean;
  hydrationIntervalMinutes: number;
  hydrationStart: string;
  hydrationEnd: string;
  shoppingEnabled: boolean;
  shoppingTime: string;
  shoppingWeekdays: number[];
  cookingEnabled: boolean;
};

export const defaultReminderPreferences: ReminderPreferences = {
  masterEnabled: true,
  expiryEnabled: true,
  expiryLeadDays: 3,
  expiryTime: '09:00',
  mealsEnabled: false,
  mealEnabled: { breakfast: true, lunch: true, dinner: true },
  mealTimes: { breakfast: '08:00', lunch: '12:00', dinner: '18:30' },
  hydrationEnabled: false,
  hydrationIntervalMinutes: 120,
  hydrationStart: '08:00',
  hydrationEnd: '22:00',
  shoppingEnabled: false,
  shoppingTime: '17:30',
  shoppingWeekdays: [1, 2, 3, 4, 5, 6, 7],
  cookingEnabled: true,
};

type LegacyReminderPreferences = Partial<ReminderPreferences> & {
  hydrationIntervalHours?: number;
};

export function normalizeReminderPreferences(value: LegacyReminderPreferences | null | undefined): ReminderPreferences {
  const legacyInterval = typeof value?.hydrationIntervalHours === 'number'
    ? value.hydrationIntervalHours * 60
    : undefined;
  return {
    ...defaultReminderPreferences,
    ...value,
    mealEnabled: { ...defaultReminderPreferences.mealEnabled, ...(value?.mealEnabled ?? {}) },
    mealTimes: { ...defaultReminderPreferences.mealTimes, ...(value?.mealTimes ?? {}) },
    expiryLeadDays: clampWholeNumber(value?.expiryLeadDays, 0, 30, 3),
    hydrationIntervalMinutes: clampWholeNumber(
      value?.hydrationIntervalMinutes ?? legacyInterval,
      30,
      360,
      120
    ),
    shoppingWeekdays: normalizeWeekdays(value?.shoppingWeekdays),
  };
}

export function clampWholeNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value!)));
}

export function normalizeWeekdays(value: number[] | undefined) {
  const days = [...new Set((value ?? defaultReminderPreferences.shoppingWeekdays)
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))]
    .sort((a, b) => a - b);
  return days.length > 0 ? days : [...defaultReminderPreferences.shoppingWeekdays];
}

export function parseReminderTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function hydrationReminderTimes(start: string, end: string, intervalMinutes: number) {
  const parsedStart = parseReminderTime(start);
  const parsedEnd = parseReminderTime(end);
  if (!parsedStart || !parsedEnd || intervalMinutes < 30) return [];
  const startMinutes = parsedStart.hour * 60 + parsedStart.minute;
  const endMinutes = parsedEnd.hour * 60 + parsedEnd.minute;
  if (endMinutes <= startMinutes) return [];

  const result: { hour: number; minute: number }[] = [];
  for (let minutes = startMinutes + intervalMinutes; minutes <= endMinutes; minutes += intervalMinutes) {
    result.push({ hour: Math.floor(minutes / 60), minute: minutes % 60 });
  }
  return result;
}

export function expoWeekday(isoWeekday: number) {
  return isoWeekday === 7 ? 1 : isoWeekday + 1;
}
