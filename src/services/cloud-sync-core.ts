import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type SocialAuthProvider = 'google' | 'apple';

export type CloudMember = {
  userId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'member';
  joinedAt: string;
};

export type CloudInvite = {
  id: string;
  email: string;
  code: string;
  status: 'pending' | 'accepted' | 'cancelled';
  createdAt: string;
  expiresAt: string;
};

export type CloudHousehold = {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'member';
  members: CloudMember[];
  invites: CloudInvite[];
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
  ownerId: string;
  role: 'owner' | 'member';
  members?: CloudMember[];
  invites?: CloudInvite[];
};

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

    async sendMagicLink(email: string, redirectTo?: string) {
      const { error } = await requireClient(client).auth.signInWithOtp({
        email: email.trim().toLocaleLowerCase(),
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });
      if (error) throw error;
    },

    async verifyEmailOtp(email: string, token: string) {
      const { data, error } = await requireClient(client).auth.verifyOtp({
        email: email.trim().toLocaleLowerCase(),
        token: token.trim(),
        type: 'email',
      });
      if (error) throw error;
      return data.session;
    },

    async signUpWithPassword(
      email: string,
      password: string,
      displayName: string,
      redirectTo?: string
    ) {
      const { data, error } = await requireClient(client).auth.signUp({
        email: email.trim().toLocaleLowerCase(),
        password,
        options: {
          data: { display_name: displayName.trim() },
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });
      if (error) throw error;
      return {
        session: data.session,
        userId: data.user?.id ?? '',
        needsEmailVerification: Boolean(data.user && !data.session),
      };
    },

    async signInWithPassword(email: string, password: string) {
      const { data, error } = await requireClient(client).auth.signInWithPassword({
        email: email.trim().toLocaleLowerCase(),
        password,
      });
      if (error) throw error;
      return data.session;
    },

    async signInWithOAuthProvider(provider: SocialAuthProvider, redirectTo: string) {
      const { data, error } = await requireClient(client).auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
      return data.url;
    },

    async sendPasswordReset(email: string, redirectTo?: string) {
      const { error } = await requireClient(client).auth.resetPasswordForEmail(
        email.trim().toLocaleLowerCase(),
        redirectTo ? { redirectTo } : undefined
      );
      if (error) throw error;
    },

    async updateAccountPassword(password: string) {
      const { error } = await requireClient(client).auth.updateUser({ password });
      if (error) throw error;
    },

    async exchangeCloudAuthCode(code: string) {
      const { data, error } = await requireClient(client).auth.exchangeCodeForSession(code);
      if (error) throw error;
      return data.session;
    },

    async signOutFromCloud() {
      const { error } = await requireClient(client).auth.signOut();
      if (error) throw error;
    },

    async ensureCloudHousehold(name: string) {
      const { data, error } = await requireClient(client).rpc('ensure_household', {
        p_name: name.trim() || '我的厨房',
      });
      if (error) throw error;
      return data as CloudHousehold;
    },

    async createCloudHousehold(name: string) {
      const { data, error } = await requireClient(client).rpc('create_household', {
        p_name: name.trim(),
      });
      if (error) throw error;
      return data as CloudHousehold;
    },

    async loadCloudHousehold(householdId?: string) {
      const { data, error } = await requireClient(client).rpc('household_overview', {
        p_household_id: householdId ?? null,
      });
      if (error) throw error;
      if (!data) return null;
      const payload = data as OverviewPayload;
      return {
        ...payload,
        members: payload.members ?? [],
        invites: payload.invites ?? [],
      } satisfies CloudHousehold;
    },

    async createHouseholdInvite(householdId: string, email: string) {
      const { data, error } = await requireClient(client).rpc('create_household_invite', {
        p_household_id: householdId,
        p_email: email.trim().toLocaleLowerCase(),
      });
      if (error) throw error;
      return data as CloudInvite;
    },

    async acceptHouseholdInvite(code: string) {
      const { data, error } = await requireClient(client).rpc('accept_household_invite', {
        p_code: code.trim().toLocaleLowerCase(),
      });
      if (error) throw error;
      return data as CloudHousehold;
    },

    async transferHouseholdOwnership(householdId: string, newOwnerId: string) {
      const { data, error } = await requireClient(client).rpc('transfer_household_ownership', {
        p_household_id: householdId,
        p_new_owner_id: newOwnerId,
      });
      if (error) throw error;
      return data as CloudHousehold;
    },

    async removeHouseholdMember(householdId: string, memberId: string) {
      const { data, error } = await requireClient(client).rpc('remove_household_member', {
        p_household_id: householdId,
        p_member_id: memberId,
      });
      if (error) throw error;
      return data as CloudHousehold;
    },

    async leaveCloudHousehold(householdId: string) {
      const { error } = await requireClient(client).rpc('leave_household', {
        p_household_id: householdId,
      });
      if (error) throw error;
    },

    async deleteCloudAccount() {
      const current = requireClient(client);
      const { error } = await current.rpc('delete_own_account');
      if (error) throw error;
      await current.auth.signOut({ scope: 'local' });
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
