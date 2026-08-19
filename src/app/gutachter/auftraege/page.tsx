// CMM-32f: Aufträge-Liste liest jetzt direkt aus der `auftraege`-Sub-Entity.
// Nur aktive Aufträge bis QC-Freigabe (gutachten_final_freigegeben = false)
// erscheinen hier — alles danach wandert in /gutachter/faelle (Regulierung).

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import Link from 'next/link'
import AuftragCard from './AuftragCard'
import TagesvorbereitungButton from './TagesvorbereitungButton'
import PartnerWerkstattVermittelnButton from './PartnerWerkstattVermittelnButton'
import { getUrsacheLabel, AUFTRAG_STATUS_LABELS } from '@/lib/statusLabels'
import EmptyState from '@/components/shared/EmptyState'
import { bezugInExpr } from '@/lib/termine/bezug-filter'
import { effektiveFallClaimId } from '@/lib/termine/effektive-bezug-ids'

export default async function AuftraegePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')

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
          <div className="flex items-start justify-end gap-3 flex-wrap">
            <PartnerWerkstattVermittelnButton />
            <TagesvorbereitungButton />
          </div>
          <EmptyState title="Keine Aufträge gefunden." />
        </div>
      </div>
    )
  }

  // Fall + Kunde + offene Doks parallel laden.
  const [faelleRes, katalogRes, offenRes, termineRes] = await Promise.all([
    // CMM-44 SP-A2 (Cluster 1): schadentag + schadenort_ort aus claims (SSoT) via claim_id-Embed.
    // CMM-44 SP-B PR2b: sa_unterschrieben lebt auf claims (SSoT) — ebenfalls im claims-Embed.
    // CMM-44 SP-B PR2c: schadens_ursache lebt auf claims (SSoT) — ins Embed.
    // CMM-49: faelle->v_claim_full (claim-anchored SSoT). Fahrzeug via vehicles,
    // schadentag/schadenort_ort/claim_nummer/sa_unterschrieben/schadens_ursache flach;
    // unten zurueck in die claims-Embed-Form gemappt (Downstream/AuftragCard unveraendert).
    admin
      .from('v_claim_full')
      .select('id:fall_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, lackfarbe_code, lead_id, schadentag, schadenort_ort, claim_nummer, sa_unterschrieben, schadens_ursache')
      .in('fall_id', fallIds),
    admin.from('dokument_katalog').select('slot_id, uploadbar_von'),
    admin
      .from('pflichtdokumente')
      .select('fall_id, dokument_typ')
      .in('fall_id', fallIds)
      .neq('status', 'hochgeladen'),
    admin
      .from('gutachter_termine')
      // bezug_typ/bezug_id mitladen — bezug-native Termine tragen fall_id NULL.
      .select('id, fall_id, bezug_typ, bezug_id, status, start_zeit, vorgeschlagenes_datum, gegenvorschlag_von, created_at')
      .or(bezugInExpr('fall', fallIds))
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
      .order('created_at', { ascending: false }),
  ])

  // CMM-49: flache v_claim_full-Rows zurueck in die faelle+claims-Embed-Form, dann
  // wie gehabt auf sa_unterschrieben filtern (Downstream/AuftragCard-Shape unveraendert).
  const faelleData = (faelleRes.data ?? [])
    .map((row) => {
      const x = row as Record<string, unknown>
      return {
        id: x.id,
        kennzeichen: x.kennzeichen,
        fahrzeug_hersteller: x.fahrzeug_hersteller,
        fahrzeug_modell: x.fahrzeug_modell,
        fahrzeug_baujahr: x.fahrzeug_baujahr,
        lackfarbe_code: x.lackfarbe_code,
        lead_id: x.lead_id,
        claims: {
          schadentag: x.schadentag,
          schadenort_ort: x.schadenort_ort,
          claim_nummer: x.claim_nummer,
          sa_unterschrieben: x.sa_unterschrieben,
          schadens_ursache: x.schadens_ursache,
        },
      }
    })
    .filter((f) => f.claims.sa_unterschrieben === true)
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
    // bezug-nativ: fall_id ist dann NULL, der Fall steckt in bezug_typ/bezug_id.
    fall_id: string | null
    bezug_typ: string | null
    bezug_id: string | null
    status: string
    start_zeit: string | null
    vorgeschlagenes_datum: string | null
    gegenvorschlag_von: string | null
    created_at: string
  }
  const terminMap: Record<string, TerminRow> = {}
  for (const t of (termineRes.data ?? []) as TerminRow[]) {
    // NICHT t.fall_id — sonst landen bezug-native Termine unter dem Key "null"
    // und die Auftrags-Karte zeigt keinen Termin an.
    const fId = effektiveFallClaimId(t)
    if (fId && !terminMap[fId]) terminMap[fId] = t
  }

  const activeFilter = filter ?? 'alle'

  return (
    <div className="h-full flex flex-col">
      <div className="w-full space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PartnerWerkstattVermittelnButton />
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
              className={`px-4 py-2 rounded-ios-xl text-sm font-medium whitespace-nowrap transition-colors ${
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
              const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
              return (
                <AuftragCard
                  key={auftrag.id}
                  fall={{
                    id: fall.id as string,
                    claim_nummer: (fallClaim?.claim_nummer as string | null) ?? null,
                    status: auftrag.status as string,
                    schadens_ursache: (fallClaim?.schadens_ursache as string | null) ?? null,
                    schadens_ort: (fallClaim?.schadenort_ort as string | null) ?? null,
                    schadens_datum: (fallClaim?.schadentag as string | null) ?? null,
                    kennzeichen: (fall.kennzeichen as string | null) ?? null,
                    fahrzeug_hersteller: (fall.fahrzeug_hersteller as string | null) ?? null,
                    fahrzeug_modell: (fall.fahrzeug_modell as string | null) ?? null,
                    fahrzeug_baujahr: (fall.fahrzeug_baujahr as string | number | null) ?? null,
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
                  ursacheLabel={getUrsacheLabel((fallClaim?.schadens_ursache as string | null) ?? null)}
                  statusLabel={AUFTRAG_STATUS_LABELS[auftrag.status as string] ?? (auftrag.status as string)}
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
