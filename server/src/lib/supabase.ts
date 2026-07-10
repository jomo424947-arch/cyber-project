import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client.
 *
 * This bypasses RLS and must ONLY be used server-side.
 * Every request is still authenticated by verifying the caller's JWT in
 * middleware/auth.ts — the service role key is used for the DB writes.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  // We warn rather than crash so the server can boot in dev for route inspection.
  console.warn(
    '[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — DB calls will fail.'
  );
}

export const supabase: SupabaseClient = createClient(url ?? '', serviceKey ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
