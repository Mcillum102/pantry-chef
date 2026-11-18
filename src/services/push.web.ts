// 网页 / iPhone 主屏幕 App 的推送订阅。服务端见 supabase/functions/push。
import { base64UrlToBytes, isIosUserAgent, pushSupport, subscriptionRow, type PushSupport } from '@/data/push-utils';
import { supabase } from '@/services/cloud-sync';

export type { PushSupport };
export type PushMember = 'a' | 'b';

const SERVICE_WORKER_URL = '/sw.js';
const PUBLIC_KEY_CACHE = 'fresh-pantry:push-public-key';

function browser() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

export function getPushSupport(): PushSupport {
  if (!browser()) return 'unsupported';
  const nav = navigator as Navigator & { standalone?: boolean };
  const NotificationApi = (globalThis as { Notification?: typeof Notification }).Notification;
  return pushSupport({
    isIos: isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints),
    isStandalone: nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    permission: NotificationApi ? NotificationApi.permission : null,
  });
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
  return navigator.serviceWorker.ready;
}

/** 这台设备当前的推送订阅（没开过就是 null） */
export async function currentSubscription() {
  if (getPushSupport() !== 'granted') return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing ? existing.pushManager.getSubscription() : null;
}

async function publicKey() {
  try {
    const cached = window.localStorage.getItem(PUBLIC_KEY_CACHE);
    if (cached) return cached;
  } catch {
    // 无痕模式等情况下 localStorage 不可用
  }
  if (!supabase) throw new Error('cloud-not-configured');
  const { data, error } = await supabase.functions.invoke<{ publicKey?: string }>('push', { body: { type: 'public-key' } });
  if (error || !data?.publicKey) throw error ?? new Error('push-key-unavailable');
  try {
    window.localStorage.setItem(PUBLIC_KEY_CACHE, data.publicKey);
  } catch {
    // 不缓存也能用
  }
  return data.publicKey;
}

async function saveSubscription(subscription: PushSubscription, householdId: string, member: PushMember) {
  if (!supabase) throw new Error('cloud-not-configured');
  const row = subscriptionRow(subscription.toJSON(), {
    householdId,
    member,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
  });
  if (!row) throw new Error('push-subscription-invalid');
  const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
  if (error) throw error;
}

/**
 * 开启通知。必须在用户点按钮时直接调用（iPhone 只允许由点击触发权限申请）。
 * 返回最终状态：granted 表示已开启并登记到云端。
 */
export async function enablePush(householdId: string, member: PushMember): Promise<PushSupport> {
  const support = getPushSupport();
  if (support === 'unsupported' || support === 'needs-home-screen' || support === 'denied') return support;
  // 第一件事就申请权限，前面不能有别的 await，否则 iPhone 会认为不是用户点击触发的
  const permission = support === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'prompt';

  const reg = await registration();
  const key = await publicKey();
  let subscription = await reg.pushManager.getSubscription();
  // 服务器换过密钥时旧订阅不能用，重新订阅
  const currentKey = subscription?.options.applicationServerKey;
  if (subscription && currentKey) {
    const expected = base64UrlToBytes(key);
    const actual = new Uint8Array(currentKey);
    if (actual.length !== expected.length || actual.some((byte, i) => byte !== expected[i])) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
  await saveSubscription(subscription, householdId, member);
  return 'granted';
}

/** 关闭这台设备的通知 */
export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}

/** App 打开时调用：把这台设备的订阅、当前是谁、时区同步到云端（推送地址偶尔会变） */
/** 前台时每隔多久报一次「在用」，以及服务器认为「在用」能持续多久（离开 App 后最多这么久收不到推送） */
export const ACTIVE_HEARTBEAT_MS = 30_000;
const ACTIVE_WINDOW_MS = 45_000;

/** 告诉服务器这台设备正在用 App（不用推送）/ 已经离开（恢复推送）。失败无所谓，最多晚一会儿 */
export async function setDeviceActive(active: boolean) {
  if (!supabase) return;
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  const activeUntil = active ? new Date(Date.now() + ACTIVE_WINDOW_MS).toISOString() : null;
  await supabase.from('push_subscriptions').update({ active_until: activeUntil }).eq('endpoint', subscription.endpoint);
}

export async function syncPushSubscription(householdId: string, member: PushMember) {
  const subscription = await currentSubscription();
  if (subscription) await saveSubscription(subscription, householdId, member);
  return Boolean(subscription);
}

export async function sendTestPush(member: PushMember) {
  if (!supabase) throw new Error('cloud-not-configured');
  const { data, error } = await supabase.functions.invoke<{ sent?: number; total?: number }>('push', { body: { type: 'test', member } });
  if (error) throw error;
  return { sent: data?.sent ?? 0, total: data?.total ?? 0 };
}
