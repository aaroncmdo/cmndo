import { createClient } from '@/lib/supabase/server'
import IncentivesClient from './IncentivesClient'

export default async function IncentivesPage() {
  const supabase = await createClient()

  const [{ data: incentives }, { data: auszahlungen }, { data: profiles }] = await Promise.all([
    supabase.from('incentives').select('*').order('created_at', { ascending: false }),
    supabase.from('incentive_auszahlungen').select('*, profiles:mitarbeiter_id(vorname, nachname, email)').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, vorname, nachname, email, rolle, kategorie').in('rolle', ['admin', 'kundenbetreuer', 'leadbearbeiter']).eq('aktiv', true),
  ])

  return <IncentivesClient incentives={incentives ?? []} auszahlungen={auszahlungen ?? []} profiles={profiles ?? []} />
}
