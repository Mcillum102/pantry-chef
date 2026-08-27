import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { createCloudSyncApi } from '@/services/cloud-sync-core';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isCloudConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isCloudConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        storage: typeof window === 'undefined' ? undefined : window.localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;

const cloudApi = createCloudSyncApi(supabase);

export const {
  acceptHouseholdInvite,
  createCloudHousehold,
  createHouseholdInvite,
  deleteCloudAccount,
  ensureCloudHousehold,
  exchangeCloudAuthCode,
  getCloudSession,
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
  transferHouseholdOwnership,
  removeHouseholdMember,
  updateAccountPassword,
  verifyEmailOtp,
} = cloudApi;

export type {
  CloudHousehold,
  CloudInvite,
  CloudMember,
  CloudSnapshotPushResult,
  CloudSnapshotRow,
  SocialAuthProvider,
} from '@/services/cloud-sync-core';
