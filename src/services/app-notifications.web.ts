import type { AppLanguage } from '@/context/language-context';

export async function cancelExpiryNotifications() {}

export async function cancelCookingTimerNotification() {}

export async function requestAppNotificationPermission() {
  return false;
}

export async function scheduleTestNotification(_language: AppLanguage) {
  return false;
}

export async function scheduleCookingTimerNotification(_input: {
  deadline: number;
  recipeName: string;
  recipeNameEn: string;
  recipeEmoji: string;
  stepNumber: number;
  stepText: string;
  language: AppLanguage;
}) {
  return false;
}
