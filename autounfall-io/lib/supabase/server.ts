import { createClient } from '@supabase/supabase-js'

// Service-Role-Client — repliziert 1:1 aus claimondo-v2 src/lib/supabase/server.ts
// (WP-6-Direktive 2026-05-23). au.io ist ein SEPARATES Next-Projekt, teilt aber
// dasselbe Supabase-Backend (paizkjajbuxxksdoycev). Der Service-Role-Key bypasst
// RLS — Pflicht, weil `anfragen` KEINE authenticated-INSERT-Policy hat.
//
// NUR server-seitig verwenden (Server Action). SUPABASE_SERVICE_ROLE_KEY ist eine
// server-only ENV (NICHT NEXT_PUBLIC_*) → landet nie im Client-Bundle. Live-ENV
// kommt aus /etc/autounfall/.env.local (WP-8).
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
