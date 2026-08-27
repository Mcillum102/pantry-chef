import type { AppLanguage } from '@/context/language-context';
import type { InventoryItem } from '@/data/kitchen-data';

export async function enableExpiryNotifications(
  _inventory: InventoryItem[],
  _leadDays: number,
  _reminderTime: string,
  _language: AppLanguage
) {
  return false;
}

export async function refreshExpiryNotifications(
  _inventory: InventoryItem[],
  _leadDays: number,
  _reminderTime: string,
  _language: AppLanguage
) {
  return false;
}

export async function disableExpiryNotifications() {}
