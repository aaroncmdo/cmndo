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

  // Fälle des Kunden
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell')
    .eq('kunde_id', user.id)

  const fallIds = (faelle ?? []).map(f => f.id)
  const fallMap: Record<string, FallInfo> = {}
  for (const f of faelle ?? []) {
    fallMap[f.id] = {
      id: f.id,
      fall_nummer: f.fall_nummer,
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
