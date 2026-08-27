import type { AppLanguage } from '@/context/language-context';
import type { ReminderPreferences } from '@/data/reminder-utils';

export async function cancelRoutineNotifications() {}

export async function refreshRoutineNotifications(
  _preferences: ReminderPreferences,
  _uncheckedShoppingCount: number,
  _language: AppLanguage,
  _requestPermission = false
) {
  return false;
}
