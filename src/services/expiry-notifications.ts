import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { AppLanguage } from '@/context/language-context';
import type { InventoryItem } from '@/data/kitchen-data';
import { parseReminderTime } from '@/data/reminder-utils';
import { cancelExpiryNotifications } from '@/services/app-notifications';

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
  reminderTime: string,
  language: AppLanguage
) {
  await prepareAndroidChannel();
  await cancelExpiryNotifications();
  const now = Date.now();
  const time = parseReminderTime(reminderTime) ?? { hour: 9, minute: 0 };
  const candidates = inventory
    .filter((item) => item.quantity > 0 && item.expiryDate)
    .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))
    .slice(0, 40);

  for (const item of candidates) {
    const triggerDate = new Date(`${item.expiryDate}T00:00:00`);
    triggerDate.setHours(time.hour, time.minute, 0, 0);
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
  reminderTime: string,
  language: AppLanguage
) {
  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return false;
  await scheduleInventoryNotifications(inventory, leadDays, reminderTime, language);
  return true;
}

export async function refreshExpiryNotifications(
  inventory: InventoryItem[],
  leadDays: number,
  reminderTime: string,
  language: AppLanguage
) {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;
  await scheduleInventoryNotifications(inventory, leadDays, reminderTime, language);
  return true;
}

export async function disableExpiryNotifications() {
  await cancelExpiryNotifications();
}
