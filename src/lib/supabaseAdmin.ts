import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceRole && typeof window === 'undefined') {
  console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY is not defined in server environment variables.');
}

// admin client with service role key for bypassing RLS in backend tasks
export const supabaseAdmin: SupabaseClient = supabaseUrl && supabaseServiceRole
  ? createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseServiceRole || 'placeholder-key',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

