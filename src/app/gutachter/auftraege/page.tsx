// CMM-32f: Aufträge-Liste liest jetzt direkt aus der `auftraege`-Sub-Entity.
// Nur aktive Aufträge bis QC-Freigabe (gutachten_final_freigegeben = false)
// erscheinen hier — alles danach wandert in /gutachter/faelle (Regulierung).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import Link from 'next/link'
import { BriefcaseIcon } from 'lucide-react'
import AuftragCard from './AuftragCard'
import TagesvorbereitungButton from './TagesvorbereitungButton'
import { getUrsacheLabel } from '@/lib/statusLabels'
import EmptyState from '@/components/shared/EmptyState'
import PageHeader from '@/components/shared/PageHeader'

// CMM-32f: Kurzlabels für den auftraege.status-Lifecycle
// (termin → besichtigung → gutachten → abgeschlossen).
const AUFTRAG_STATUS_KURZ: Record<string, string> = {
  termin: 'Termin',
  besichtigung: 'Besichtigung',
  gutachten: 'Gutachten',
  abgeschlossen: 'Abgeschlossen',
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
        <EmptyState title="Kein Sachverständigen-Profil gefunden." />
      </div>
    )
  }

  const admin = createAdminClient()

  // CMM-32f: Aufträge des SV bis Final-Freigabe. Erst danach kippen sie nach
  // /gutachter/faelle (Regulierungs-Phase).
  let auftragQuery = admin
    .from('auftraege')
    .select(
      'id, fall_id, status, gutachten_final_freigegeben, abgeschlossen_am, erstellt_am',
    )
    .eq('sv_id', sv.id)
    .eq('gutachten_final_freigegeben', false)
    .order('erstellt_am', { ascending: false })

  if (filter === 'neu') {
    auftragQuery = auftragQuery.in('status', ['termin'])
  } else if (filter === 'offen') {
    auftragQuery = auftragQuery.in('status', ['termin', 'besichtigung', 'gutachten'])
  }

  const { data: auftraege } = await auftragQuery
  const auftragList = auftraege ?? []
  const fallIds = auftragList.map((a) => a.fall_id as string)

  if (fallIds.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="w-full space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <PageHeader title="Meine Aufträge" description="0 Aufträge" icon={BriefcaseIcon} />
            <TagesvorbereitungButton />
          </div>
          <EmptyState title="Keine Aufträge gefunden." />
        </div>
      </div>
    )
  }

  // Fall + Kunde + offene Doks parallel laden.
  const [faelleRes, katalogRes, offenRes, termineRes] = await Promise.all([
    admin
      .from('faelle')
      .select('id, fall_nummer, status, schadens_ursache, schadens_datum, schadens_ort, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lackfarbe_code, lead_id, sa_unterschrieben')
      .in('id', fallIds),
    admin.from('dokument_katalog').select('slot_id, uploadbar_von'),
    admin
      .from('pflichtdokumente')
      .select('fall_id, dokument_typ')
      .in('fall_id', fallIds)
      .neq('status', 'hochgeladen'),
    admin
      .from('gutachter_termine')
      .select('id, fall_id, status, start_zeit, vorgeschlagenes_datum, gegenvorschlag_von, created_at')
      .in('fall_id', fallIds)
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
      .order('created_at', { ascending: false }),
  ])

  const faelleData = (faelleRes.data ?? []).filter((f) => f.sa_unterschrieben === true)
  const erlaubteFallIds = new Set(faelleData.map((f) => f.id as string))
  const sichtbareAuftraege = auftragList.filter((a) => erlaubteFallIds.has(a.fall_id as string))

  const fallMap = Object.fromEntries(faelleData.map((f) => [f.id, f]))

  const leadIds = faelleData.map((f) => f.lead_id).filter(Boolean) as string[]
  const { data: leads } = leadIds.length
    ? await admin.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] as { id: string; vorname: string | null; nachname: string | null }[] }
  const leadMap = Object.fromEntries((leads ?? []).map((l) => [l.id, l]))

  // Pflicht-Dokumente: nur Kunde-Slots zählen (sonst 20 statt 4-5 wegen SV-Onboarding-Slots).
  const katalog = katalogRes.data ?? []
  const kundeSlots = new Set(
    katalog
      .filter((k) => Array.isArray(k.uploadbar_von) && (k.uploadbar_von as string[]).includes('kunde'))
      .map((k) => k.slot_id as string),
  )
  const katalogSlots = new Set(katalog.map((k) => k.slot_id as string))

  const offeneDokuMap: Record<string, number> = {}
  for (const row of offenRes.data ?? []) {
    const slot = row.dokument_typ as string
    const istKundeSlot = kundeSlots.has(slot) || !katalogSlots.has(slot)
    if (!istKundeSlot) continue
    const id = row.fall_id as string
    offeneDokuMap[id] = (offeneDokuMap[id] ?? 0) + 1
  }

  type TerminRow = {
    id: string
    fall_id: string
    status: string
    start_zeit: string | null
    vorgeschlagenes_datum: string | null
    gegenvorschlag_von: string | null
    created_at: string
  }
  const terminMap: Record<string, TerminRow> = {}
  for (const t of (termineRes.data ?? []) as TerminRow[]) {
    if (!terminMap[t.fall_id]) terminMap[t.fall_id] = t
  }

  const activeFilter = filter ?? 'alle'

  return (
    <div className="h-full flex flex-col">
      <div className="w-full space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PageHeader
            title="Meine Aufträge"
            description={`${sichtbareAuftraege.length} ${sichtbareAuftraege.length === 1 ? 'Auftrag' : 'Aufträge'}`}
            icon={BriefcaseIcon}
          />
          <TagesvorbereitungButton />
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {(
            [
              ['alle', 'Alle'],
              ['neu', 'Neue'],
              ['offen', 'In Bearbeitung'],
            ] as [string, string][]
          ).map(([key, label]) => (
            <Link
              key={key}
              href={key === 'alle' ? '/gutachter/auftraege' : `/gutachter/auftraege?filter=${key}`}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === key
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-white text-claimondo-ondo hover:text-claimondo-navy border border-claimondo-border'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {sichtbareAuftraege.length === 0 ? (
          <EmptyState title="Keine Aufträge gefunden." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {sichtbareAuftraege.map((auftrag) => {
              const fall = fallMap[auftrag.fall_id as string]
              if (!fall) return null
              const kunde = fall.lead_id ? leadMap[fall.lead_id as string] : null
              const termin = terminMap[fall.id as string]
              return (
                <AuftragCard
                  key={auftrag.id}
                  fall={{
                    id: fall.id as string,
                    fall_nummer: fall.fall_nummer as string | null,
                    status: auftrag.status as string,
                    schadens_ursache: fall.schadens_ursache as string | null,
                    schadens_ort: fall.schadens_ort as string | null,
                    schadens_datum: fall.schadens_datum as string | null,
                    kennzeichen: (fall.kennzeichen as string | null) ?? null,
                    fahrzeug_hersteller: (fall.fahrzeug_hersteller as string | null) ?? null,
                    fahrzeug_modell: (fall.fahrzeug_modell as string | null) ?? null,
                    lackfarbe_code: (fall.lackfarbe_code as string | null) ?? null,
                  }}
                  kunde={kunde ? { vorname: kunde.vorname, nachname: kunde.nachname } : null}
                  aktiverTermin={
                    termin
                      ? {
                          id: termin.id,
                          status: termin.status,
                          start_zeit: termin.start_zeit,
                          vorgeschlagenes_datum: termin.vorgeschlagenes_datum,
                          gegenvorschlag_von:
                            (termin.gegenvorschlag_von as 'sv' | 'kunde' | null) ?? null,
                        }
                      : null
                  }
                  ursacheLabel={getUrsacheLabel(fall.schadens_ursache as string | null)}
                  statusLabel={AUFTRAG_STATUS_KURZ[auftrag.status as string] ?? (auftrag.status as string)}
                  offeneDokumente={offeneDokuMap[fall.id as string] ?? 0}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
