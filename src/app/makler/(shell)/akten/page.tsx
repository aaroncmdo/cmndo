// AAR-486 (M4): Makler-Akten-Liste — Server-Entry. Filter-Param aus URL,
// lädt Akten-Rows + Counts parallel.

import {
  getCurrentMakler,
  getMaklerFaelleList,
  getMaklerFaelleCounts,
  type AktenFilter,
} from '@/lib/makler/queries'
import { MaklerAktenList } from '@/components/makler/MaklerAktenList'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{ filter?: string }>
}

function parseFilter(raw: string | undefined): AktenFilter {
  if (raw === 'abgeschlossen' || raw === 'storniert') return raw
  return 'aktiv'
}

export default async function MaklerAktenPage({ searchParams }: Props) {
  const { filter: rawFilter } = await searchParams
  const filter = parseFilter(rawFilter)

  const makler = await getCurrentMakler()
  if (!makler) return null

  const [akten, counts] = await Promise.all([
    getMaklerFaelleList(makler.id, filter),
    getMaklerFaelleCounts(makler.id),
  ])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#0D1B3E]">Akten</h1>
        <p className="text-sm text-[#4573A2] mt-1">
          Ihre aktiven, abgeschlossenen und stornierten Fälle
        </p>
      </header>

      <MaklerAktenList akten={akten} counts={counts} currentFilter={filter} />
    </div>
  )
}
