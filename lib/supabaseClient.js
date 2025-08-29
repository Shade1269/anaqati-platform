import { createClient } from '@supabase/supabase-js';

// Use environment variables from .env.local or process env
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Create a single supabase client for the whole app
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
