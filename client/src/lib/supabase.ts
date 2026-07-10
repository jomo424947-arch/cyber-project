import { createClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * Uses the anon key + Vite env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY),
 * so it is safe to ship to the browser. It powers Supabase Auth (Google OAuth +
 * Phone OTP) and respects Row Level Security.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — auth will fail.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // required for OAuth redirect callback
  },
});
