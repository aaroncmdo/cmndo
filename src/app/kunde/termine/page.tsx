// AAR-639: Kunden-Termin-Übersicht. Zeigt alle gutachter_termine zu den
// Fällen dieses Kunden als Liste oder Kalender-View (Client-Toggle).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getOwnedClaimIds } from '@/lib/claims/owned-claims'
import KundeTermineClient, { type TerminRow, type FallInfo } from './KundeTermineClient'

export const dynamic = 'force-dynamic'

export default async function KundeTermine() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // AAR-kunde-auto-claim: Defensive Backfill — falls /kunde noch nicht
  // besucht wurde (Direkt-Link auf /kunde/termine), Fälle hier claimen
  // damit der RLS-Filter weiter unten den Termin freigibt.
  if (user.email) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { claimFaelleByEmail } = await import('@/lib/kunde/auto-claim')
    await claimFaelleByEmail(createAdminClient(), user.id, user.email)
  }

  // Fälle des Kunden — CMM-63 SP-C: Ownership über claim_parties (owned claim_ids),
  // Admin-Read statt faelle.kunde_id. fahrzeug_* bleibt faelle-nativ bis CMM-50.
  const adminT = createAdminClient()
  const ownedClaimIds = await getOwnedClaimIds(adminT, user.id, user.email ?? null)
  // CMM-49 (Entity-Sweep): faelle -> v_claim_full (claim-anchored SSoT). fahrzeug_*/
  // kennzeichen flach aus der View (value-identisch live verifiziert, div=0); claim_nummer
  // flach statt claims-Embed. id:fall_id-Alias hält f.id == frühere faelle.id; Filter auf
  // die reale id-Spalte (= claim_id) statt .in('claim_id').
  const { data: faelle } = await adminT
    .from('v_claim_full')
    .select('id:fall_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, claim_nummer')
    .in('id', ownedClaimIds)

  const fallIds = (faelle ?? []).map(f => f.id as string)
  const fallMap: Record<string, FallInfo> = {}
  for (const f of faelle ?? []) {
    fallMap[f.id as string] = {
      id: f.id as string,
      claim_nummer: (f.claim_nummer as string | null) ?? null,
      fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || f.kennzeichen || '—',
    }
  }

  let termine: TerminRow[] = []
  if (fallIds.length > 0) {
    const { data } = await supabase
      .from('gutachter_termine')
      .select('id, start_zeit, status, typ, kanal, fall_id, ablehnen_token')
      .in('fall_id', fallIds)
      .is('cancelled_at', null)
      // Geist-Defense: superseded/abgesagte Status serverseitig ausschliessen (cancelled_at allein
      // ist unzuverlaessig — 23 Live-Zeilen verletzten die Invariante terminal=>cancelled_at).
      // 'abgeschlossen'/'abgelehnt' bleiben fuer Historie/Transparenz im KundeTermineClient.
      .not('status', 'in', '(verschoben,verlegt,storniert,abgesagt)')
      .order('start_zeit', { ascending: false })
    termine = (data ?? []) as TerminRow[]
  }

  return <KundeTermineClient termine={termine} fallMap={fallMap} />
}
