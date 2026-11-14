import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { createCloudSyncApi } from '@/services/cloud-sync-core';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// 两台手机共用的厨房账号。密码（厨房口令）不打包进代码，每台手机第一次打开时输入一次，
// 之后靠 Supabase 保存在本机的登录态，不再需要输入。
const kitchenEmail = process.env.EXPO_PUBLIC_KITCHEN_EMAIL;

export const isCloudConfigured = Boolean(supabaseUrl && supabaseKey && kitchenEmail);

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
  updatePassword: changeKitchenPasscode,
  subscribeToHouseholdSnapshot,
} = cloudApi;

export function signInToSharedKitchen(passcode: string) {
  return signInWithPassword(kitchenEmail ?? '', passcode);
}

export type {
  CloudHousehold,
  CloudMember,
  CloudSnapshotPushResult,
  CloudSnapshotRow,
} from '@/services/cloud-sync-core';
