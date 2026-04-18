// AAR-490 (M8): Abrechnungen-Seite für Makler. Zeigt Provisions-Historie,
// Monats-Summary und CSV-Export. Consent-Gate läuft in den Fall-Links auf
// der Akte-Detail-Seite — hier gibt es nur Read-Only-Auswertungen aus
// makler_provisionen (eigenes makler_id via RLS gefiltert).

import { redirect } from 'next/navigation'
import {
  getCurrentMakler,
  getMaklerAbrechnungsData,
} from '@/lib/makler/queries'
import { MaklerAbrechnungen } from '@/components/makler/MaklerAbrechnungen'

type Props = { searchParams: Promise<{ month?: string }> }

export const dynamic = 'force-dynamic'

export default async function AbrechnungenPage({ searchParams }: Props) {
  const { month } = await searchParams
  const makler = await getCurrentMakler()
  if (!makler) redirect('/login')

  const data = await getMaklerAbrechnungsData(makler.id, month)
  return <MaklerAbrechnungen data={data} />
}
