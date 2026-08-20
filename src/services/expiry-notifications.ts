import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { AppLanguage } from '@/context/language-context';
import type { InventoryItem } from '@/data/kitchen-data';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

async function prepareAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('expiry-reminders', {
    name: '到期提醒',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

async function scheduleInventoryNotifications(
  inventory: InventoryItem[],
  leadDays: number,
  language: AppLanguage
) {
  await prepareAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  const candidates = inventory
    .filter((item) => item.quantity > 0 && item.expiryDate)
    .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))
    .slice(0, 40);

  for (const item of candidates) {
    const triggerDate = new Date(`${item.expiryDate}T09:00:00`);
    triggerDate.setDate(triggerDate.getDate() - leadDays);
    if (triggerDate.getTime() <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `expiry-${item.id}`,
      content: {
        title: language === 'zh' ? `${item.emoji} ${item.name}快到期了` : `${item.emoji} ${item.name} expires soon`,
        body:
          language === 'zh'
            ? `${leadDays}天后到期，库存还有 ${item.quantity}${item.unit}。`
            : `Expires in ${leadDays} days. ${item.quantity} ${item.unit} remaining.`,
        data: { url: '/', itemId: item.id, kind: 'expiry' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: Platform.OS === 'android' ? 'expiry-reminders' : undefined,
      },
    });
  }
}

export async function enableExpiryNotifications(
  inventory: InventoryItem[],
  leadDays: number,
  language: AppLanguage
) {
  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return false;
  await scheduleInventoryNotifications(inventory, leadDays, language);
  return true;
}

export async function refreshExpiryNotifications(
  inventory: InventoryItem[],
  leadDays: number,
  language: AppLanguage
) {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;
  await scheduleInventoryNotifications(inventory, leadDays, language);
  return true;
}

export async function disableExpiryNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
