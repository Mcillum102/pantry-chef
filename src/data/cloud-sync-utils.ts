export type RemoteSnapshotDecision = 'ignore' | 'apply' | 'conflict';

export function classifyRemoteSnapshot(
  currentVersion: number,
  incomingVersion: number,
  hasPendingLocalChanges: boolean
): RemoteSnapshotDecision {
  if (!Number.isFinite(incomingVersion) || incomingVersion <= currentVersion) return 'ignore';
  return hasPendingLocalChanges ? 'conflict' : 'apply';
}

export function isOptimisticWriteConflict(expectedVersion: number, actualVersion: number) {
  return Number.isFinite(expectedVersion)
    && Number.isFinite(actualVersion)
    && expectedVersion !== actualVersion;
}
