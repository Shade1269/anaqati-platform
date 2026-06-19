import { createClient } from '@supabase/supabase-js';

const FALLBACK_URL = 'https://axzqbqzdvtlbgbwzeiry.supabase.co';
const FALLBACK_KEY = 'sb_publishable_9HzBp1FRow_JM8a5Hs81Ag_OZ48Y3Xi';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY;

// IMPORTANT: all DB objects live in the `exhibitions` schema.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'exhibitions' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
