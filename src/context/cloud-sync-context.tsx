import type { Session } from '@supabase/supabase-js';
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

import { type HealthSnapshot, useHealth } from '@/context/health-context';
import { type KitchenSnapshot, useKitchen } from '@/context/kitchen-context';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { isWrongPasscodeError } from '@/data/app-access-utils';
import { classifyRemoteSnapshot } from '@/data/cloud-sync-utils';
import { recordDiagnostic } from '@/services/diagnostics';
import {
  ensureCloudHousehold,
  getCloudSession,
  isCloudConfigured,
  loadCloudHousehold,
  pullHouseholdSnapshot,
  pushHouseholdSnapshot,
  signInToSharedKitchen,
  subscribeToCloudAuth,
  subscribeToHouseholdSnapshot,
  type CloudHousehold,
  type CloudSnapshotRow,
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
  /** 已配置云端，但这台手机还没登录共享账号，需要输入厨房口令 */
  needsPasscode: boolean;
  /** 用厨房口令登录共享账号；口令错误时抛出 'wrong-passcode' */
  unlockKitchen: (passcode: string) => Promise<void>;
  syncNow: () => Promise<void>;
  refreshHousehold: () => Promise<void>;
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
  const [enabled, setEnabled] = usePersistentState('setting-cloud-sync', true);
  const [pendingSnapshot, setPendingSnapshot] = usePersistentState<AppCloudSnapshot | null>(
    'cloud-pending-snapshot-v1',
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

  const unlockKitchen = useCallback(async (passcode: string) => {
    if (!isCloudConfigured) return;
    setLastError(null);
    try {
      const nextSession = await signInToSharedKitchen(passcode);
      initializedKeyRef.current = '';
      setSession(nextSession);
    } catch (error) {
      void recordDiagnostic('cloud-sign-in', error);
      if (isWrongPasscodeError(error)) throw new Error('wrong-passcode');
      throw error;
    }
  }, []);

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

    const initializationKey = `${session.user.id}:${enabled}`;
    if (initializedKeyRef.current === initializationKey) return;
    initializedKeyRef.current = initializationKey;
    let active = true;

    async function initializeCloud() {
      setStatus(enabled ? 'syncing' : 'paused');
      setLastError(null);
      try {
        // 白名单成员登录后自动加入共享厨房（第一个人会创建它）
        const nextHousehold = await ensureCloudHousehold();
        if (!active) return;
        if (!nextHousehold) throw new Error('household-not-ready');
        setHousehold(nextHousehold);

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
        const message = error instanceof Error ? error.message : String(error);
        initializedKeyRef.current = '';
        setLastError(message);
        void recordDiagnostic('cloud-initialize', error);
        setStatus(pendingSnapshot ? 'pending' : 'error');
      }
    }

    void initializeCloud();
    return () => {
      active = false;
    };
  }, [
    applyRemoteSnapshot,
    authLoaded,
    enabled,
    makeLocalSnapshot,
    pendingSnapshot,
    retryNonce,
    session,
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
    const next = await loadCloudHousehold(household?.id);
    if (next) setHousehold(next);
  }, [household?.id, session]);

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
    needsPasscode: isCloudConfigured && authLoaded && !session,
    unlockKitchen,
    syncNow,
    refreshHousehold,
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
      setStatus(session ? (enabled ? 'syncing' : 'paused') : 'loading');
      setRetryNonce((current) => current + 1);
    },
  }), [
    applyRemoteSnapshot,
    authLoaded,
    conflict,
    enabled,
    household,
    lastError,
    lastSyncedAt,
    pendingSnapshot,
    refreshHousehold,
    session,
    setEnabled,
    setLastSyncedAt,
    setPendingSnapshot,
    status,
    syncNow,
    unlockKitchen,
  ]);

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

export function useCloudSync() {
  const context = useContext(CloudSyncContext);
  if (!context) throw new Error('useCloudSync must be used inside CloudSyncProvider');
  return context;
}
