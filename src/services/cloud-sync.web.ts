import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { createCloudSyncApi } from '@/services/cloud-sync-core';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// 两台手机共用的厨房账号，app 启动时自动登录，不需要手动输入
const kitchenEmail = process.env.EXPO_PUBLIC_KITCHEN_EMAIL;
const kitchenPassword = process.env.EXPO_PUBLIC_KITCHEN_PASSWORD;

export const isCloudConfigured = Boolean(supabaseUrl && supabaseKey && kitchenEmail && kitchenPassword);

export const supabase = isCloudConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        storage: typeof window === 'undefined' ? undefined : window.localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

const cloudApi = createCloudSyncApi(supabase);

export const {
  ensureCloudHousehold,
  getCloudSession,
  loadCloudHousehold,
  pullHouseholdSnapshot,
  pushHouseholdSnapshot,
  signInWithPassword,
  subscribeToCloudAuth,
  subscribeToHouseholdSnapshot,
} = cloudApi;

export function signInToSharedKitchen() {
  return signInWithPassword(kitchenEmail ?? '', kitchenPassword ?? '');
}

export type {
  CloudHousehold,
  CloudMember,
  CloudSnapshotPushResult,
  CloudSnapshotRow,
} from '@/services/cloud-sync-core';
