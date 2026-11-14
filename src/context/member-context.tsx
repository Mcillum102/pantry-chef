import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';

import { findKitchenMember, KITCHEN_MEMBERS, type KitchenMember } from '@/constants/members';
import { usePersistentState } from '@/hooks/use-persistent-state';

type MemberContextValue = {
  members: readonly KitchenMember[];
  /** 当前这台手机是谁在用；还没选时为 null */
  member: KitchenMember | null;
  isHydrated: boolean;
  setMemberId: (id: KitchenMember['id']) => void;
};

const MemberContext = createContext<MemberContextValue | null>(null);

export function MemberProvider({ children }: PropsWithChildren) {
  const [memberId, setMemberId, isHydrated] = usePersistentState<KitchenMember['id'] | null>(
    'current-member-v1',
    null
  );

  const value = useMemo<MemberContextValue>(() => ({
    members: KITCHEN_MEMBERS,
    member: findKitchenMember(memberId),
    isHydrated,
    setMemberId,
  }), [isHydrated, memberId, setMemberId]);

  return <MemberContext.Provider value={value}>{children}</MemberContext.Provider>;
}

export function useMember() {
  const context = useContext(MemberContext);
  if (!context) throw new Error('useMember must be used inside MemberProvider');
  return context;
}
