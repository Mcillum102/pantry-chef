import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createEmptyHealthSnapshot, type HealthSnapshot, useHealth } from '@/context/health-context';
import { createEmptyKitchenSnapshot, type KitchenSnapshot, useKitchen } from '@/context/kitchen-context';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { classifyRemoteSnapshot } from '@/data/cloud-sync-utils';
import { recordDiagnostic } from '@/services/diagnostics';
import {
  acceptHouseholdInvite,
  createCloudHousehold,
  createHouseholdInvite,
  deleteCloudAccount,
  exchangeCloudAuthCode,
  getCloudSession,
  isCloudConfigured,
  loadCloudHousehold,
  leaveCloudHousehold,
  pullHouseholdSnapshot,
  pushHouseholdSnapshot,
  sendMagicLink,
  sendPasswordReset,
  signInWithPassword,
  signInWithOAuthProvider,
  signOutFromCloud,
  signUpWithPassword,
  subscribeToCloudAuth,
  subscribeToHouseholdSnapshot,
  verifyEmailOtp,
  transferHouseholdOwnership,
  removeHouseholdMember,
  updateAccountPassword,
  type CloudHousehold,
  type CloudInvite,
  type CloudSnapshotRow,
  type SocialAuthProvider,
} from '@/services/cloud-sync';

export type AppCloudSnapshot = {
  schemaVersion: 1;
  updatedAt: string;
  kitchen: KitchenSnapshot;
  health: HealthSnapshot;
};

type CloudConflict = {
  local: AppCloudSnapshot;
  remote: AppCloudSnapshot;
  remoteVersion: number;
};

export type CloudSyncStatus =
  | 'not-configured'
  | 'loading'
  | 'signed-out'
  | 'needs-household'
  | 'paused'
  | 'syncing'
  | 'synced'
  | 'pending'
  | 'conflict'
  | 'error';

type CloudSyncContextValue = {
  configured: boolean;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  status: CloudSyncStatus;
  session: Session | null;
  household: CloudHousehold | null;
  pendingChanges: boolean;
  conflict: CloudConflict | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  sendSignInLink: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<{ needsEmailVerification: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: SocialAuthProvider) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  syncNow: () => Promise<void>;
  refreshHousehold: () => Promise<void>;
  inviteMember: (email: string) => Promise<CloudInvite>;
  acceptInvite: (code: string) => Promise<void>;
  transferOwnership: (memberId: string) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  leaveHousehold: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
  retryInitialization: () => void;
};

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null);

function isAppCloudSnapshot(value: unknown): value is AppCloudSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppCloudSnapshot>;
  return candidate.schemaVersion === 1 && Boolean(candidate.kitchen && candidate.health);
}

export function CloudSyncProvider({ children }: PropsWithChildren) {
  const kitchen = useKitchen();
  const health = useHealth();
  const linkingUrl = Linking.useLinkingURL();
  const [enabled, setEnabled] = usePersistentState('setting-cloud-sync', false);
  const [pendingSnapshot, setPendingSnapshot] = usePersistentState<AppCloudSnapshot | null>(
    'cloud-pending-snapshot-v1',
    null
  );
  const [activeHouseholdId, setActiveHouseholdId] = usePersistentState<string | null>(
    'cloud-active-household-v1',
    null
  );
  const [lastSyncedAt, setLastSyncedAt] = usePersistentState<string | null>(
    'cloud-last-synced-at-v1',
    null
  );
  const [session, setSession] = useState<Session | null>(null);
  const [authLoaded, setAuthLoaded] = useState(!isCloudConfigured);
  const [household, setHousehold] = useState<CloudHousehold | null>(null);
  const [status, setStatus] = useState<CloudSyncStatus>(
    isCloudConfigured ? 'loading' : 'not-configured'
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<CloudConflict | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const versionRef = useRef(0);
  const initializedKeyRef = useRef('');
  const lastLocalSignatureRef = useRef<string | null>(null);
  const applyingRemoteRef = useRef(false);

  const localData = useMemo(
    () => ({ kitchen: kitchen.snapshot, health: health.snapshot }),
    [health.snapshot, kitchen.snapshot]
  );
  const localSignature = useMemo(() => JSON.stringify(localData), [localData]);
  const localDataRef = useRef(localData);
  localDataRef.current = localData;

  const makeLocalSnapshot = useCallback((): AppCloudSnapshot => ({
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...localDataRef.current,
  }), []);

  const applyRemoteSnapshot = useCallback((snapshot: AppCloudSnapshot) => {
    applyingRemoteRef.current = true;
    kitchen.replaceSnapshot(snapshot.kitchen);
    health.replaceSnapshot(snapshot.health);
    setPendingSnapshot(null);
  }, [health, kitchen, setPendingSnapshot]);

  useEffect(() => {
    if (!isCloudConfigured) return;
    let active = true;

    void getCloudSession()
      .then((currentSession) => {
        if (active) setSession(currentSession);
      })
      .catch((error) => {
        if (active) setLastError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setAuthLoaded(true);
      });

    const unsubscribe = subscribeToCloudAuth((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthLoaded(true);
      initializedKeyRef.current = '';
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!linkingUrl || !isCloudConfigured) return;
    const parsed = Linking.parse(linkingUrl);
    const code = parsed.queryParams?.code;
    if (typeof code !== 'string' || !code) return;
    void exchangeCloudAuthCode(code).catch((error) => {
      setLastError(error instanceof Error ? error.message : String(error));
      setStatus('error');
    });
  }, [linkingUrl]);

  useEffect(() => {
    if (!kitchen.isHydrated || !health.isHydrated) return;

    if (lastLocalSignatureRef.current === null) {
      lastLocalSignatureRef.current = localSignature;
      return;
    }

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      lastLocalSignatureRef.current = localSignature;
      return;
    }

    if (localSignature === lastLocalSignatureRef.current) return;
    lastLocalSignatureRef.current = localSignature;
    setPendingSnapshot(makeLocalSnapshot());
    if (enabled && session && household) setStatus('pending');
  }, [
    enabled,
    health.isHydrated,
    household,
    kitchen.isHydrated,
    localSignature,
    makeLocalSnapshot,
    session,
    setPendingSnapshot,
  ]);

  const handleRemoteRow = useCallback((row: CloudSnapshotRow) => {
    if (!isAppCloudSnapshot(row.payload)) return;
    const decision = classifyRemoteSnapshot(versionRef.current, row.version, Boolean(pendingSnapshot));
    if (decision === 'ignore') return;
    versionRef.current = row.version;

    if (decision === 'conflict' && pendingSnapshot) {
      setConflict({
        local: pendingSnapshot,
        remote: row.payload,
        remoteVersion: row.version,
      });
      setStatus('conflict');
      return;
    }

    applyRemoteSnapshot(row.payload);
    setLastSyncedAt(row.updatedAt || new Date().toISOString());
    setStatus('synced');
  }, [applyRemoteSnapshot, pendingSnapshot, setLastSyncedAt]);

  useEffect(() => {
    if (!authLoaded) return;
    if (!isCloudConfigured) {
      setStatus('not-configured');
      return;
    }
    if (!session) {
      setHousehold(null);
      setStatus('signed-out');
      initializedKeyRef.current = '';
      return;
    }

    const initializationKey = `${session.user.id}:${activeHouseholdId ?? 'default'}:${enabled}`;
    if (initializedKeyRef.current === initializationKey) return;
    initializedKeyRef.current = initializationKey;
    let active = true;

    async function initializeCloud() {
      setStatus(enabled ? 'syncing' : 'paused');
      setLastError(null);
      try {
        let nextHousehold = await loadCloudHousehold(activeHouseholdId ?? undefined);
        if (!nextHousehold && activeHouseholdId) nextHousehold = await loadCloudHousehold();
        if (!active) return;
        if (!nextHousehold) {
          setHousehold(null);
          setActiveHouseholdId(null);
          setStatus('needs-household');
          return;
        }
        setHousehold(nextHousehold);
        setActiveHouseholdId(nextHousehold.id);

        if (!enabled) {
          setStatus('paused');
          return;
        }

        const remote = await pullHouseholdSnapshot(nextHousehold.id);
        if (!active) return;
        versionRef.current = remote.version;

        if (isAppCloudSnapshot(remote.payload)) {
          if (pendingSnapshot) {
            setConflict({
              local: pendingSnapshot,
              remote: remote.payload,
              remoteVersion: remote.version,
            });
            setStatus('conflict');
          } else {
            applyRemoteSnapshot(remote.payload);
            setLastSyncedAt(remote.updatedAt || new Date().toISOString());
            setStatus('synced');
          }
          return;
        }

        const firstSnapshot = pendingSnapshot ?? makeLocalSnapshot();
        const result = await pushHouseholdSnapshot(nextHousehold.id, firstSnapshot, remote.version);
        if (!active) return;
        versionRef.current = result.version;
        if (result.applied) {
          setPendingSnapshot(null);
          setLastSyncedAt(result.updatedAt || new Date().toISOString());
          setStatus('synced');
        } else {
          setStatus('pending');
        }
      } catch (error) {
        if (!active) return;
        initializedKeyRef.current = '';
        setLastError(error instanceof Error ? error.message : String(error));
        void recordDiagnostic('cloud-initialize', error);
        setStatus(pendingSnapshot ? 'pending' : 'error');
      }
    }

    void initializeCloud();
    return () => {
      active = false;
    };
  }, [
    activeHouseholdId,
    applyRemoteSnapshot,
    authLoaded,
    enabled,
    makeLocalSnapshot,
    pendingSnapshot,
    retryNonce,
    session,
    setActiveHouseholdId,
    setLastSyncedAt,
    setPendingSnapshot,
  ]);

  useEffect(() => {
    if (!enabled || !household || !session) return;
    return subscribeToHouseholdSnapshot(household.id, handleRemoteRow);
  }, [enabled, handleRemoteRow, household, session]);

  const syncNow = useCallback(async () => {
    if (!enabled || !session || !household) return;
    const snapshot = pendingSnapshot ?? makeLocalSnapshot();
    setStatus('syncing');
    setLastError(null);
    try {
      const result = await pushHouseholdSnapshot(household.id, snapshot, versionRef.current);
      versionRef.current = result.version;
      if (!result.applied && isAppCloudSnapshot(result.payload)) {
        setConflict({ local: snapshot, remote: result.payload, remoteVersion: result.version });
        setStatus('conflict');
        return;
      }
      setPendingSnapshot(null);
      setLastSyncedAt(result.updatedAt || new Date().toISOString());
      setStatus('synced');
    } catch (error) {
      setPendingSnapshot(snapshot);
      setLastError(error instanceof Error ? error.message : String(error));
      void recordDiagnostic('cloud-sync', error);
      setStatus('pending');
    }
  }, [
    enabled,
    household,
    makeLocalSnapshot,
    pendingSnapshot,
    session,
    setLastSyncedAt,
    setPendingSnapshot,
  ]);

  useEffect(() => {
    if (status !== 'pending' || !pendingSnapshot || !enabled || !session || !household || conflict) return;
    const timer = setTimeout(() => void syncNow(), 1200);
    return () => clearTimeout(timer);
  }, [conflict, enabled, household, pendingSnapshot, session, status, syncNow]);

  const refreshHousehold = useCallback(async () => {
    if (!session) return;
    const next = await loadCloudHousehold(activeHouseholdId ?? undefined);
    setHousehold(next);
  }, [activeHouseholdId, session]);

  const value = useMemo<CloudSyncContextValue>(() => ({
    configured: isCloudConfigured,
    enabled,
    setEnabled: (nextEnabled) => {
      setEnabled(nextEnabled);
      initializedKeyRef.current = '';
      setStatus(nextEnabled ? (session ? 'syncing' : 'signed-out') : 'paused');
    },
    status,
    session,
    household,
    pendingChanges: Boolean(pendingSnapshot),
    conflict,
    lastSyncedAt,
    lastError,
    sendSignInLink: async (email) => {
      setEnabled(true);
      setStatus('loading');
      await sendMagicLink(email, Linking.createURL('account'));
      setStatus('signed-out');
    },
    verifyOtp: async (email, token) => {
      setEnabled(true);
      setStatus('loading');
      const nextSession = await verifyEmailOtp(email, token);
      setSession(nextSession);
      initializedKeyRef.current = '';
    },
    register: async (email, password, displayName) => {
      setEnabled(true);
      setStatus('loading');
      const result = await signUpWithPassword(
        email,
        password,
        displayName,
        Linking.createURL('account')
      );
      setSession(result.session);
      initializedKeyRef.current = '';
      setStatus(result.session ? 'needs-household' : 'signed-out');
      return { needsEmailVerification: result.needsEmailVerification };
    },
    signIn: async (email, password) => {
      setEnabled(true);
      setStatus('loading');
      const nextSession = await signInWithPassword(email, password);
      setSession(nextSession);
      initializedKeyRef.current = '';
    },
    signInWithProvider: async (provider) => {
      setEnabled(true);
      setStatus('loading');
      await signInWithOAuthProvider(provider, Linking.createURL('account'));
    },
    requestPasswordReset: async (email) => {
      await sendPasswordReset(email, Linking.createURL('account'));
    },
    changePassword: async (password) => {
      await updateAccountPassword(password);
    },
    signOut: async () => {
      await signOutFromCloud();
      setSession(null);
      setHousehold(null);
      setActiveHouseholdId(null);
      setStatus('signed-out');
    },
    createHousehold: async (name) => {
      if (!session) throw new Error('cloud-not-signed-in');
      setEnabled(true);
      setStatus('syncing');
      const created = await createCloudHousehold(name);
      const emptySnapshot: AppCloudSnapshot = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        kitchen: createEmptyKitchenSnapshot(),
        health: createEmptyHealthSnapshot(),
      };
      kitchen.replaceSnapshot(emptySnapshot.kitchen);
      health.replaceSnapshot(emptySnapshot.health);
      setPendingSnapshot(emptySnapshot);
      setActiveHouseholdId(created.id);
      setHousehold(created);
      initializedKeyRef.current = '';
    },
    syncNow,
    refreshHousehold,
    inviteMember: async (email) => {
      if (!household) throw new Error('household-not-ready');
      const invite = await createHouseholdInvite(household.id, email);
      await refreshHousehold();
      return invite;
    },
    acceptInvite: async (code) => {
      const joined = await acceptHouseholdInvite(code);
      setActiveHouseholdId(joined.id);
      setHousehold(joined);
      initializedKeyRef.current = '';
      setStatus('syncing');
    },
    transferOwnership: async (memberId) => {
      if (!household) throw new Error('household-not-ready');
      const updated = await transferHouseholdOwnership(household.id, memberId);
      setHousehold(updated);
    },
    removeMember: async (memberId) => {
      if (!household) throw new Error('household-not-ready');
      const updated = await removeHouseholdMember(household.id, memberId);
      setHousehold(updated);
    },
    leaveHousehold: async () => {
      if (!household) throw new Error('household-not-ready');
      await leaveCloudHousehold(household.id);
      setHousehold(null);
      setActiveHouseholdId(null);
      initializedKeyRef.current = '';
      setStatus('needs-household');
    },
    deleteAccount: async () => {
      await deleteCloudAccount();
      setSession(null);
      setHousehold(null);
      setActiveHouseholdId(null);
      setStatus('signed-out');
    },
    resolveConflict: async (choice) => {
      if (!conflict || !household) return;
      if (choice === 'remote') {
        versionRef.current = conflict.remoteVersion;
        applyRemoteSnapshot(conflict.remote);
        setConflict(null);
        setLastSyncedAt(new Date().toISOString());
        setStatus('synced');
        return;
      }

      setStatus('syncing');
      const result = await pushHouseholdSnapshot(
        household.id,
        conflict.local,
        conflict.remoteVersion
      );
      versionRef.current = result.version;
      if (!result.applied) throw new Error('cloud-conflict-changed');
      setPendingSnapshot(null);
      setConflict(null);
      setLastSyncedAt(result.updatedAt || new Date().toISOString());
      setStatus('synced');
    },
    retryInitialization: () => {
      initializedKeyRef.current = '';
      setLastError(null);
      setStatus(session ? (enabled ? 'syncing' : 'paused') : 'signed-out');
      setRetryNonce((current) => current + 1);
    },
  }), [
    applyRemoteSnapshot,
    conflict,
    enabled,
    health,
    household,
    kitchen,
    lastError,
    lastSyncedAt,
    pendingSnapshot,
    refreshHousehold,
    session,
    setActiveHouseholdId,
    setEnabled,
    setLastSyncedAt,
    setPendingSnapshot,
    status,
    syncNow,
  ]);

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

export function useCloudSync() {
  const context = useContext(CloudSyncContext);
  if (!context) throw new Error('useCloudSync must be used inside CloudSyncProvider');
  return context;
}
