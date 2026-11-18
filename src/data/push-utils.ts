// 推送相关的纯函数（不依赖浏览器 API，方便测试）

/**
 * unsupported        这个浏览器 / 系统不支持推送
 * needs-home-screen  iPhone 上必须先「添加到主屏幕」，再从主屏幕打开
 * denied             用户拒绝过通知，只能去系统设置里打开
 * prompt             可以点按钮申请权限
 * granted            已允许通知
 */
export type PushSupport = 'unsupported' | 'needs-home-screen' | 'denied' | 'prompt' | 'granted';

export function isIosUserAgent(userAgent: string, maxTouchPoints = 0) {
  // iPadOS 13+ 的 Safari 自称 Macintosh，用触控点数区分
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function pushSupport(input: {
  isIos: boolean;
  isStandalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: 'default' | 'denied' | 'granted' | null;
}): PushSupport {
  // iPhone 的 Safari 标签页里没有 PushManager，只有主屏幕 App 里才有
  if (input.isIos && !input.isStandalone) return 'needs-home-screen';
  if (!input.hasServiceWorker || !input.hasPushManager || input.permission === null) return 'unsupported';
  if (input.permission === 'denied') return 'denied';
  if (input.permission === 'granted') return 'granted';
  return 'prompt';
}

export function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** PushSubscription.toJSON() → 数据库的一行 */
export function subscriptionRow(
  json: { endpoint?: string; keys?: Record<string, string> },
  extra: { householdId: string; member: 'a' | 'b'; timezone: string; userAgent: string }
) {
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return {
    household_id: extra.householdId,
    member: extra.member,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    timezone: extra.timezone || 'America/Vancouver',
    user_agent: extra.userAgent.slice(0, 300),
  };
}
