import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client with service-role key.
 * Required for admin operations like creating auth users.
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ist nicht konfiguriert. Bitte in .env.local setzen.')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
