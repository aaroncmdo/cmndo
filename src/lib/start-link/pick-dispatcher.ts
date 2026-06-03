import 'server-only'

// AAR-956 Phase A · Task 2 — Round-Robin-Dispatcher-Picker.
//
// Wählt den Dispatcher (profiles.rolle='dispatch'), dem ein konversion-first
// erzeugter Self-Service-Lead zugewiesen wird (`leads.zugewiesen_an`), damit der
// Lead einen Owner hat, den der Dispatcher verfolgen kann (AAR-956 §6=Auto).
//
// Befund 2026-06-02: Es gibt KEINE bestehende Round-Robin-Logik in der DB —
// `convert_anfrage_zu_lead` legt den Lead mit `zugewiesen_an=NULL` an. Daher hier
// ein eigener, „least-loaded"-Picker.
//
// Test-Account-Falle: rolle='dispatch' umfasst auch test-dispatch@ / smoke-dispatch@.
// Eine reine „wenigste offene Leads"-Strategie würde IMMER einen idle Test-Account
// (0 Leads) ziehen. Darum filtern wir Test-/Smoke-Accounts raus — in Prod bleibt
// aktuell genau ein echter Dispatcher (dispatch@claimondo.de) übrig; der Picker
// skaliert aber sauber, sobald echte Dispatcher dazukommen.
//
// Fallback: kein echter Dispatcher gefunden → null → Lead bleibt `zugewiesen_an=NULL`
// und erscheint trotzdem in der Dispatch-Queue (/dispatch/leads filtert nicht danach).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// Nicht-terminale lead_status — diese „belasten" einen Dispatcher (offene Arbeit).
// Terminal (zählen nicht): umgewandelt, umgewandelt-sv, disqualifiziert, kalt.
const OFFENE_LEAD_STATUS: Database['public']['Enums']['lead_status'][] = [
  'neu',
  'rueckruf',
  'quali-offen',
  'flow-gesendet',
]

// Test-/Smoke-Accounts, die nie echte Leads bekommen dürfen.
const IST_TEST_ACCOUNT = /test|smoke|@claimondo\.test/i

export async function pickRoundRobinDispatcher(
  admin: SupabaseClient<Database>,
): Promise<string | null> {
  const { data: dispatcher, error } = await admin
    .from('profiles')
    .select('id, email, created_at')
    .eq('rolle', 'dispatch')
  if (error || !dispatcher || dispatcher.length === 0) return null

  const echte = dispatcher.filter((d) => !IST_TEST_ACCOUNT.test(d.email ?? ''))
  if (echte.length === 0) return null
  if (echte.length === 1) return echte[0].id

  // Least-loaded: offene (nicht-terminale) zugewiesene Leads je Dispatcher zählen,
  // wenigste gewinnt; Tie → ältester Account (deterministisch).
  const mitLast = await Promise.all(
    echte.map(async (d) => {
      const { count } = await admin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('zugewiesen_an', d.id)
        .in('status', OFFENE_LEAD_STATUS)
      return { id: d.id, createdAt: d.created_at ?? '', offen: count ?? 0 }
    }),
  )
  mitLast.sort((a, b) => a.offen - b.offen || a.createdAt.localeCompare(b.createdAt))
  return mitLast[0].id
}
