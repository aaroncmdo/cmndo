import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import 'server-only'

/**
 * Service-Role-Client — umgeht RLS. Ausschliesslich server-side.
 *
 * Der oeffentliche Check schreibt NIE direkt: jede Schreiboperation laeuft
 * ueber eine Server Action mit diesem Client, die den Token server-seitig
 * aufloest (CONTEXT §3.4, Vorbild flow_links).
 *
 * ACHTUNG: Dieser Client ist UNGETYPT — tsc prueft select-Strings hier NICHT.
 * Spaltennamen gegen das Schema verifizieren, nicht raten.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
