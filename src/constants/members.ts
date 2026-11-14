// 这个 app 只给两个人用。改名字或 emoji 直接改这里。
export type KitchenMember = {
  id: 'a' | 'b';
  name: string;
  emoji: string;
};

export const KITCHEN_MEMBERS: readonly KitchenMember[] = [
  { id: 'a', name: process.env.EXPO_PUBLIC_MEMBER_A_NAME || 'Shuhan', emoji: '🧑‍🍳' },
  { id: 'b', name: process.env.EXPO_PUBLIC_MEMBER_B_NAME || '宝贝', emoji: '👩‍🍳' },
];

export function findKitchenMember(id: string | null | undefined) {
  return KITCHEN_MEMBERS.find((member) => member.id === id) ?? null;
}
