import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type CloudMember = {
  userId: string;
  email: string;
  displayName: string;
  joinedAt: string;
};

export type CloudHousehold = {
  id: string;
  name: string;
  members: CloudMember[];
};

export type CloudSnapshotRow = {
  householdId: string;
  payload: unknown;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type CloudSnapshotPushResult = CloudSnapshotRow & {
  applied: boolean;
};

type OverviewPayload = {
  id: string;
  name: string;
  members?: CloudMember[];
};

function parseHousehold(data: unknown): CloudHousehold | null {
  if (!data) return null;
  const payload = data as OverviewPayload;
  return { id: payload.id, name: payload.name, members: payload.members ?? [] };
}

function requireClient(client: SupabaseClient | null) {
  if (!client) throw new Error('cloud-not-configured');
  return client;
}

function parseSnapshot(row: Record<string, unknown>): CloudSnapshotRow {
  return {
    householdId: String(row.household_id ?? ''),
    payload: row.payload ?? {},
    version: Number(row.version ?? 0),
    updatedAt: String(row.updated_at ?? ''),
    updatedBy: row.updated_by ? String(row.updated_by) : null,
  };
}

export function createCloudSyncApi(client: SupabaseClient | null) {
  return {
    async getCloudSession() {
      const { data, error } = await requireClient(client).auth.getSession();
      if (error) throw error;
      return data.session;
    },

    subscribeToCloudAuth(listener: (session: Session | null) => void) {
      if (!client) return () => undefined;
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(session));
      return () => data.subscription.unsubscribe();
    },

    async signInWithPassword(email: string, password: string) {
      const { data, error } = await requireClient(client).auth.signInWithPassword({
        email: email.trim().toLocaleLowerCase(),
        password,
      });
      if (error) throw error;
      return data.session;
    },

    async ensureCloudHousehold(name = '我们的厨房') {
      const { data, error } = await requireClient(client).rpc('ensure_household', {
        p_name: name.trim() || '我们的厨房',
      });
      if (error) throw error;
      return parseHousehold(data);
    },

    async loadCloudHousehold(householdId?: string) {
      const { data, error } = await requireClient(client).rpc('household_overview', {
        p_household_id: householdId ?? null,
      });
      if (error) throw error;
      return parseHousehold(data);
    },

    async pullHouseholdSnapshot(householdId: string) {
      const { data, error } = await requireClient(client)
        .from('household_snapshots')
        .select('household_id,payload,version,updated_at,updated_by')
        .eq('household_id', householdId)
        .single();
      if (error) throw error;
      return parseSnapshot(data as Record<string, unknown>);
    },

    async pushHouseholdSnapshot(
      householdId: string,
      payload: unknown,
      expectedVersion: number
    ) {
      const { data, error } = await requireClient(client).rpc('push_household_snapshot', {
        p_household_id: householdId,
        p_payload: payload,
        p_expected_version: expectedVersion,
      });
      if (error) throw error;
      const result = data as Record<string, unknown>;
      return {
        applied: Boolean(result.applied),
        householdId: String(result.householdId ?? householdId),
        payload: result.payload ?? {},
        version: Number(result.version ?? expectedVersion),
        updatedAt: String(result.updatedAt ?? ''),
        updatedBy: result.updatedBy ? String(result.updatedBy) : null,
      } satisfies CloudSnapshotPushResult;
    },

    subscribeToHouseholdSnapshot(
      householdId: string,
      listener: (snapshot: CloudSnapshotRow) => void
    ) {
      if (!client) return () => undefined;
      const channel = client
        .channel(`household-snapshot:${householdId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'household_snapshots',
            filter: `household_id=eq.${householdId}`,
          },
          (event) => listener(parseSnapshot(event.new))
        )
        .subscribe();

      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
