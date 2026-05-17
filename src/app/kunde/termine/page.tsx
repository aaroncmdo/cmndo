// AAR-639: Kunden-Termin-Übersicht. Zeigt alle gutachter_termine zu den
// Fällen dieses Kunden als Liste oder Kalender-View (Client-Toggle).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

  // Fälle des Kunden
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, claims:claim_id(claim_nummer)')
    .eq('kunde_id', user.id)

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
