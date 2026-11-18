// 原生 App（Expo Go / 以后上架）暂时不走 Web Push；推送功能目前只在 iPhone 主屏幕 App（网页版）里提供。
// 以后做原生推送时在这里接入 expo-notifications 的推送令牌。
import type { PushSupport } from '@/data/push-utils';

export type { PushSupport };
export type PushMember = 'a' | 'b';

export function getPushSupport(): PushSupport {
  return 'unsupported';
}

export async function currentSubscription() {
  return null;
}

export async function enablePush(_householdId: string, _member: PushMember): Promise<PushSupport> {
  return 'unsupported';
}

export async function disablePush() {}

export async function syncPushSubscription(_householdId: string, _member: PushMember) {
  return false;
}

export async function sendTestPush(_member: PushMember) {
  return { sent: 0, total: 0 };
}
