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
  const { data: faelle } = await adminT
    .from('faelle')
    .select('id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, claims:claim_id(claim_nummer)')
    .in('claim_id', ownedClaimIds)

  const fallIds = (faelle ?? []).map(f => f.id)
  const fallMap: Record<string, FallInfo> = {}
  for (const f of faelle ?? []) {
    const fClaim = Array.isArray(f.claims) ? f.claims[0] : f.claims
    fallMap[f.id] = {
      id: f.id,
      claim_nummer: (fClaim?.claim_nummer as string | null) ?? null,
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
      .order('start_zeit', { ascending: false })
    termine = (data ?? []) as TerminRow[]
  }

  return <KundeTermineClient termine={termine} fallMap={fallMap} />
}
