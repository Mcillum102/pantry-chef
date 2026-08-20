import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

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
      },
    })
  : null;

export async function sendMagicLink(email: string) {
  if (!supabase) throw new Error('cloud-not-configured');
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
}

export async function pushHouseholdSnapshot(householdId: string, payload: unknown) {
  if (!supabase) throw new Error('cloud-not-configured');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('cloud-not-signed-in');
  const { error } = await supabase.from('household_snapshots').upsert({
    household_id: householdId,
    owner_id: userData.user.id,
    payload,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function createHouseholdInvite(householdId: string, email: string) {
  if (!supabase) throw new Error('cloud-not-configured');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('cloud-not-signed-in');
  const { error } = await supabase.from('household_invites').insert({
    household_id: householdId,
    inviter_id: userData.user.id,
    email: email.trim().toLocaleLowerCase(),
    status: 'pending',
  });
  if (error) throw error;
}
