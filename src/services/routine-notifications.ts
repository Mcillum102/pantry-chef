import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { AppLanguage } from '@/context/language-context';
import { expoWeekday, hydrationReminderTimes, parseReminderTime, type ReminderPreferences } from '@/data/reminder-utils';
import { requestAppNotificationPermission } from '@/services/app-notifications';

const routineKinds = new Set(['meal-reminder', 'hydration-reminder', 'shopping-reminder']);

async function prepareChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('daily-reminders', {
    name: '日常提醒',
    description: '三餐、饮水和购物清单提醒',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function cancelRoutineNotifications() {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter((request) => routineKinds.has(String(request.content.data?.kind ?? '')))
    .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

async function scheduleDaily(input: {
  id: string;
  kind: string;
  hour: number;
  minute: number;
  title: string;
  body: string;
  url: string;
}) {
  await Notifications.scheduleNotificationAsync({
    identifier: input.id,
    content: {
      title: input.title,
      body: input.body,
      data: { kind: input.kind, url: input.url },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: input.hour,
      minute: input.minute,
      channelId: Platform.OS === 'android' ? 'daily-reminders' : undefined,
    },
  });
}

async function scheduleWeekly(input: {
  id: string;
  kind: string;
  weekday: number;
  hour: number;
  minute: number;
  title: string;
  body: string;
  url: string;
}) {
  await Notifications.scheduleNotificationAsync({
    identifier: input.id,
    content: {
      title: input.title,
      body: input.body,
      data: { kind: input.kind, url: input.url },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: input.weekday,
      hour: input.hour,
      minute: input.minute,
      channelId: Platform.OS === 'android' ? 'daily-reminders' : undefined,
    },
  });
}

export async function refreshRoutineNotifications(
  preferences: ReminderPreferences,
  uncheckedShoppingCount: number,
  language: AppLanguage,
  requestPermission = false
) {
  if (Platform.OS === 'web') return false;
  await cancelRoutineNotifications();
  if (!preferences.masterEnabled) return true;
  if (requestPermission && !(await requestAppNotificationPermission())) return false;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;
  await prepareChannel();

  if (preferences.mealsEnabled) {
    const mealLabels = {
      breakfast: language === 'zh' ? '早餐' : 'breakfast',
      lunch: language === 'zh' ? '午餐' : 'lunch',
      dinner: language === 'zh' ? '晚餐' : 'dinner',
    };
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      if (!preferences.mealEnabled[meal]) continue;
      const time = parseReminderTime(preferences.mealTimes[meal]);
      if (!time) continue;
      await scheduleDaily({
        id: `meal-reminder-${meal}`,
        kind: 'meal-reminder',
        ...time,
        title: language === 'zh' ? `🍽️ 该记录${mealLabels[meal]}了` : `🍽️ Time to log ${mealLabels[meal]}`,
        body: language === 'zh' ? '记录吃了什么，下一餐推荐会更准确。' : 'Log what you ate to improve the next recommendation.',
        url: '/recommend',
      });
    }
  }

  if (preferences.hydrationEnabled) {
    for (const [index, time] of hydrationReminderTimes(
      preferences.hydrationStart,
      preferences.hydrationEnd,
      preferences.hydrationIntervalMinutes
    ).entries()) {
      await scheduleDaily({
        id: `hydration-reminder-${index}`,
        kind: 'hydration-reminder',
        ...time,
        title: language === 'zh' ? '💧 喝点水吧' : '💧 Time for some water',
        body: language === 'zh' ? '补充饮水后，顺手记录今天的饮水量。' : 'Hydrate and add it to today’s water log.',
        url: '/recommend',
      });
    }
  }

  const shoppingTime = parseReminderTime(preferences.shoppingTime);
  if (preferences.shoppingEnabled && uncheckedShoppingCount > 0 && shoppingTime) {
    for (const weekday of preferences.shoppingWeekdays) {
      await scheduleWeekly({
        id: `shopping-reminder-${weekday}`,
        kind: 'shopping-reminder',
        weekday: expoWeekday(weekday),
        ...shoppingTime,
        title: language === 'zh' ? `🛒 购物清单还有 ${uncheckedShoppingCount} 项` : `🛒 ${uncheckedShoppingCount} shopping items left`,
        body: language === 'zh' ? '出门前看看还需要买什么。' : 'Check your list before heading out.',
        url: '/inventory',
      });
    }
  }
  return true;
}
