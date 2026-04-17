// AAR-408: Aufträge als Eingangskorb. Card-Layout mit aktivem Termin-Snippet
// + Primär-Aktion pro Auftrag (Termin vorschlagen / Gegenvorschlag entscheiden
// / Termin öffnen). Ersetzt die frühere Tabellen-Ansicht.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import Link from 'next/link'
import AuftragCard from './AuftragCard'
import { FALL_STATUS_LABELS, getUrsacheLabel } from '@/lib/statusLabels'

// AAR-410: Lokale Kurzform-Labels (weicht bewusst von FALL_STATUS_LABELS ab —
// Aufträge-Karte will die knappere Variante „Neu"/„Termin" statt „Gutachter
// zugewiesen"/„Termin vereinbart"). Default-Fallback auf FALL_STATUS_LABELS.
const AUFTRAEGE_STATUS_KURZ: Record<string, string> = {
  'sv-zugewiesen': 'Neu',
  'sv-termin': 'Termin',
  'gutachten-eingegangen': 'Gutachten',
  filmcheck: 'Filmcheck',
  'kanzlei-uebergeben': 'Kanzlei',
  anschlussschreiben: 'Anspruchsschreiben',
  regulierung: 'Regulierung',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

export default async function AuftraegePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  const sv = await getGutachterForUser<{ id: string }>(supabase, user!.id, 'id')

  if (!sv) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
          <p className="text-gray-500">Kein Sachverständigen-Profil gefunden.</p>
        </div>
      </div>
    )
  }

  let query = supabase
    .from('faelle')
    .select(
      'id, fall_nummer, status, schadens_ursache, schadens_datum, schadens_ort, sv_termin, gutachten_eingegangen_am, created_at, lead_id',
    )
    .eq('sv_id', sv.id)
    .order('created_at', { ascending: false })

  if (filter === 'neu') {
    query = query.in('status', ['sv-zugewiesen', 'sv-termin'])
  } else if (filter === 'offen') {
    query = query
      .is('gutachten_eingegangen_am', null)
      .not('status', 'in', '("abgeschlossen","storniert")')
  }

  const { data: faelle } = await query
  const fallList = faelle ?? []

  const leadIds = fallList.map((f) => f.lead_id).filter(Boolean) as string[]
  const fallIds = fallList.map((f) => f.id)

  const admin = createAdminClient()

  const [leadsRes, termineRes] = await Promise.all([
    leadIds.length
      ? supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
      : Promise.resolve({ data: [] as { id: string; vorname: string | null; nachname: string | null }[] }),
    fallIds.length
      ? admin
          .from('gutachter_termine')
          .select(
            'id, fall_id, status, start_zeit, vorgeschlagenes_datum, gegenvorschlag_von, created_at',
          )
          .in('fall_id', fallIds)
          .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
          .order('created_at', { ascending: false })
      : Promise.resolve({
          data: [] as {
            id: string
            fall_id: string
            status: string
            start_zeit: string | null
            vorgeschlagenes_datum: string | null
            gegenvorschlag_von: string | null
            created_at: string
          }[],
        }),
  ])

  const leadMap = Object.fromEntries(
    (leadsRes.data ?? []).map((l) => [l.id, l]),
  )

  type TerminRow = {
    id: string
    fall_id: string
    status: string
    start_zeit: string | null
    vorgeschlagenes_datum: string | null
    gegenvorschlag_von: string | null
    created_at: string
  }

  // Pro fall_id den jüngsten offenen Termin nehmen.
  const terminMap: Record<string, TerminRow> = {}
  for (const t of (termineRes.data ?? []) as TerminRow[]) {
    if (!terminMap[t.fall_id]) terminMap[t.fall_id] = t
  }

  const activeFilter = filter ?? 'alle'

  return (
    <div className="h-full flex flex-col">
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Meine Aufträge</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {fallList.length} {fallList.length === 1 ? 'Auftrag' : 'Aufträge'}
          </p>
        </div>

        {/* Filter-Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {(
            [
              ['alle', 'Alle'],
              ['neu', 'Neue'],
              ['offen', 'Bericht offen'],
            ] as [string, string][]
          ).map(([key, label]) => (
            <Link
              key={key}
              href={
                key === 'alle'
                  ? '/gutachter/auftraege'
                  : `/gutachter/auftraege?filter=${key}`
              }
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === key
                  ? 'bg-[#0D1B3E] text-white'
                  : 'bg-white text-gray-500 hover:text-gray-800 border border-gray-200'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {fallList.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <p className="text-gray-500">Keine Aufträge gefunden.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {fallList.map((fall) => {
              const kunde = fall.lead_id ? leadMap[fall.lead_id] : null
              const termin = terminMap[fall.id]
              return (
                <AuftragCard
                  key={fall.id}
                  fall={{
                    id: fall.id,
                    fall_nummer: fall.fall_nummer,
                    status: fall.status,
                    schadens_ursache: fall.schadens_ursache,
                    schadens_ort: fall.schadens_ort,
                    schadens_datum: fall.schadens_datum,
                  }}
                  kunde={
                    kunde
                      ? { vorname: kunde.vorname, nachname: kunde.nachname }
                      : null
                  }
                  aktiverTermin={
                    termin
                      ? {
                          id: termin.id,
                          status: termin.status,
                          start_zeit: termin.start_zeit,
                          vorgeschlagenes_datum: termin.vorgeschlagenes_datum,
                          gegenvorschlag_von:
                            (termin.gegenvorschlag_von as
                              | 'sv'
                              | 'kunde'
                              | null) ?? null,
                        }
                      : null
                  }
                  ursacheLabel={getUrsacheLabel(fall.schadens_ursache)}
                  statusLabel={
                    AUFTRAEGE_STATUS_KURZ[fall.status] ??
                    FALL_STATUS_LABELS[fall.status] ??
                    fall.status
                  }
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
