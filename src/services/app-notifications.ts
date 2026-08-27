import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { AppLanguage } from '@/context/language-context';

type NotificationKind = 'expiry' | 'cooking-timer';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function cancelScheduledByKind(kind: NotificationKind) {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === kind)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier))
  );
}

export function cancelExpiryNotifications() {
  return cancelScheduledByKind('expiry');
}

export function cancelCookingTimerNotification() {
  return cancelScheduledByKind('cooking-timer');
}

async function prepareCookingChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('cooking-timers', {
    name: '烹饪倒计时',
    description: '菜谱步骤倒计时完成提醒',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 150, 250],
  });
}

export async function requestAppNotificationPermission() {
  if (Platform.OS === 'web') return false;
  await prepareCookingChannel();
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted'
    ? current
    : await Notifications.requestPermissionsAsync();
  return permission.status === 'granted';
}

export async function scheduleTestNotification(language: AppLanguage) {
  if (!(await requestAppNotificationPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: `reminder-test-${Date.now()}`,
    content: {
      title: language === 'zh' ? '🔔 鲜食记提醒测试' : '🔔 Fresh Pantry reminder test',
      body: language === 'zh' ? '提醒设置成功，之后会按照你选择的规则通知。' : 'Your reminders are ready and will follow your custom schedule.',
      data: { kind: 'reminder-test', url: '/profile' },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      repeats: false,
    },
  });
  return true;
}

export async function scheduleCookingTimerNotification(input: {
  deadline: number;
  recipeName: string;
  recipeNameEn: string;
  recipeEmoji: string;
  stepNumber: number;
  stepText: string;
  language: AppLanguage;
}) {
  if (!(await requestAppNotificationPermission())) return false;
  await cancelCookingTimerNotification();
  if (input.deadline <= Date.now()) return false;

  await Notifications.scheduleNotificationAsync({
    identifier: 'cooking-step-timer',
    content: {
      title: input.language === 'zh'
        ? `${input.recipeEmoji} 第 ${input.stepNumber} 步时间到`
        : `${input.recipeEmoji} Step ${input.stepNumber} is ready`,
      body: input.language === 'zh'
        ? `${input.recipeName}：${input.stepText}`
        : `${input.recipeNameEn}: ${input.stepText}`,
      sound: 'default',
      data: {
        kind: 'cooking-timer',
        url: '/recipes',
        recipeName: input.recipeName,
        stepNumber: input.stepNumber,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(input.deadline),
      channelId: Platform.OS === 'android' ? 'cooking-timers' : undefined,
    },
  });
  return true;
}
