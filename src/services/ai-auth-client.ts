import { supabase } from '@/services/cloud-sync';

/** Headers for calls to our own /ai/* API routes, including the signed-in user's access token. */
export async function aiRequestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!supabase) return headers;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
