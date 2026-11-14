// Server-only: used by Expo API Routes under src/app/ai. Do not import from client code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { parseBearerToken } from '@/data/ai-auth-utils';

let client: SupabaseClient | null = null;

function getClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Returns a 401/503 Response when the caller is not a signed-in Supabase user, otherwise null. */
export async function rejectUnauthenticated(request: Request): Promise<Response | null> {
  const supabase = getClient();
  if (!supabase) return Response.json({ error: 'Auth is not configured' }, { status: 503 });

  const token = parseBearerToken(request.headers.get('authorization'));
  if (!token) return Response.json({ error: 'Sign-in required' }, { status: 401 });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: 'Sign-in required' }, { status: 401 });
  return null;
}
