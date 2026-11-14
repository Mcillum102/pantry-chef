export type KitchenAccessState = 'choose-member' | 'loading' | 'error' | 'ready';

export function getKitchenAccessState(input: {
  hasMember: boolean;
  configured: boolean;
  hasHousehold: boolean;
  status: string;
  hasError: boolean;
}): KitchenAccessState {
  if (!input.hasMember) return 'choose-member';
  // 没配置 Supabase：纯本地模式，直接进入
  if (!input.configured || input.hasHousehold) return 'ready';
  if (input.status === 'error' || input.hasError) return 'error';
  return 'loading';
}
