export type KitchenAccessState = 'choose-member' | 'enter-passcode' | 'loading' | 'error' | 'ready';

export function getKitchenAccessState(input: {
  hasMember: boolean;
  configured: boolean;
  /** 已配置云端、登录态已读取完，但这台手机还没有登录（需要输入厨房口令） */
  needsPasscode: boolean;
  hasHousehold: boolean;
  status: string;
  hasError: boolean;
}): KitchenAccessState {
  if (!input.hasMember) return 'choose-member';
  // 没配置 Supabase：纯本地模式，直接进入
  if (!input.configured || input.hasHousehold) return 'ready';
  if (input.needsPasscode) return 'enter-passcode';
  if (input.status === 'error' || input.hasError) return 'error';
  return 'loading';
}

/** Supabase 返回“邮箱或密码错误”时为 true；断网、服务器错误等返回 false，口令不用重输 */
export function isWrongPasscodeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  if (candidate.code === 'invalid_credentials') return true;
  return candidate.status === 400
    && typeof candidate.message === 'string'
    && /invalid login credentials/i.test(candidate.message);
}
