let counter = 0;

/**
 * Supabase Realtime 的频道名必须每次都不一样。
 * 同名时 client.channel() 会直接返回旧频道；如果旧频道正在关闭，新的订阅不会生效，
 * 等旧频道关完连同新订阅一起被移除，实时同步就悄悄断了（两台手机互相看不到更新）。
 */
export function uniqueChannelName(base: string) {
  counter += 1;
  return `${base}:${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}
