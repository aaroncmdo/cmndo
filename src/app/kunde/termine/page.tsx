// AAR-639: Kunden-Termin-Übersicht. Zeigt alle gutachter_termine zu den
// Fällen dieses Kunden als Liste oder Kalender-View (Client-Toggle).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getOwnedClaimIds } from '@/lib/claims/owned-claims'
import { getKundeTermine } from '@/lib/claims/kunde-termine'
import KundeTermineClient, { type FallInfo } from './KundeTermineClient'

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
  // flach statt claims-Embed. Reale id-Spalte = claim_id; fall_id separat — SV-Termine sind
  // fall_id-verankert (gutachter_termine.claim_id ist dort meist NULL), Reparaturtermine
  // claim_id-verankert. Beide holen; Filter auf die reale id-Spalte (= claim_id).
  const { data: faelle } = await adminT
    .from('v_claim_full')
    .select('id, fall_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, claim_nummer')
    .in('id', ownedClaimIds)

  const fallIds = (faelle ?? []).map(f => f.fall_id as string)
  const claimIds = (faelle ?? []).map(f => f.id as string)
  // fallMap unter BEIDEN Keys: fall_id (SV-Termine) UND claim_id (Reparaturtermine). claim_id
  // ist 1:1 mit fall (live verifiziert) -> beide Keys zeigen auf dieselbe FallInfo.
  const fallMap: Record<string, FallInfo> = {}
  for (const f of faelle ?? []) {
    const info: FallInfo = {
      id: f.fall_id as string,
      claimId: f.id as string,
      claim_nummer: (f.claim_nummer as string | null) ?? null,
      fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || (f.kennzeichen as string | null) || '—',
    }
    fallMap[f.fall_id as string] = info
    fallMap[f.id as string] = info
  }

  // AAR (Kunde-Detail-Rebuild): geteilter Loader — SV-Begutachtungstermine (gutachter_termine,
  // fall_id) UND Werkstatt-Reparaturtermine (reparatur_termine, claim_id). Behebt den Gap, dass
  // Selbstzahler/Kasko-Kunden ihren Reparaturtermin hier nicht sahen (nur gutachter_termine gelesen).
  // Termine-Hub: ein vereinter Loader (SV + Reparatur, mit terminTyp + Nachbesichtigung-Split)
  // -> eine Timeline mit Typ-Badges. Kein SV/Reparatur-Split mehr auf Page-Ebene.
  const termine =
    fallIds.length > 0 || claimIds.length > 0
      ? await getKundeTermine(adminT, { fallIds, claimIds })
      : []

  return <KundeTermineClient termine={termine} fallMap={fallMap} />
}
