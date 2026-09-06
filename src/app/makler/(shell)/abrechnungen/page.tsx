// AAR-490 (M8): Abrechnungen-Seite für Makler. Zeigt Provisions-Historie,
// Monats-Summary und CSV-Export. Consent-Gate läuft in den Fall-Links auf
// der Akte-Detail-Seite — hier gibt es nur Read-Only-Auswertungen aus
// partner_provisionen (partner_typ='makler', eigenes partner_id via RLS gefiltert).
// Anordnung Aaron 07.07.: die "Ihre Pipeline"-Karte lebt jetzt hier (unter den
// 4 Summary-Karten) statt auf dem Dashboard.

import { redirect } from 'next/navigation'
import {
  getCurrentMakler,
  getMaklerAbrechnungsData,
  getMaklerOffeneLeadsCount,
} from '@/lib/makler/queries'
import { getMaklerPipeline } from '@/lib/makler/pipeline'
import { createClient } from '@/lib/supabase/server'
import { MaklerAbrechnungen } from '@/components/makler/MaklerAbrechnungen'
import { getEigeneGutschriften } from '@/lib/finance/eigene-gutschriften-actions'

type Props = { searchParams: Promise<{ month?: string }> }

export const dynamic = 'force-dynamic'

export default async function AbrechnungenPage({ searchParams }: Props) {
  const { month } = await searchParams
  const makler = await getCurrentMakler()
  if (!makler) redirect('/login')

  const supabase = await createClient()
  const [data, gutschriften, pipeline, offeneLeads] = await Promise.all([
    getMaklerAbrechnungsData(makler.id, month),
    getEigeneGutschriften(),
    getMaklerPipeline(supabase, makler.id),
    getMaklerOffeneLeadsCount(makler.id),
  ])
  return (
    <MaklerAbrechnungen
      data={data}
      gutschriften={gutschriften}
      pipeline={pipeline}
      offeneLeads={offeneLeads}
    />
  )
}
