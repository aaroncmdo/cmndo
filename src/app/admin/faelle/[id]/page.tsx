// AAR-162 / W2: Fallakte Server-Page.
// Lädt alle Fall-Daten und delegiert an FallakteShell.
// AAR-172: Der 210-KB-Monolith FallakteClient.old.tsx wurde gelöscht, nachdem
// die neue Shell-Architektur alle W2-W5-Tickets abdeckt.

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import FallakteShell from './FallakteShell'
import type { FallakteRolle } from '@/lib/fall/field-permissions'
// AAR-327: Katalog-driven Slot-Liste für „Dokument anfordern"-Modal
import { getAlleSlots } from '@/lib/dokumente/katalog'

export default async function FallaktePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: fall } = await supabase.from('faelle').select('*').eq('id', id).single()
  if (!fall) notFound()

  // Rolle des eingeloggten Users für field-permissions
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const userRolle = ((profile?.rolle as FallakteRolle | null) ?? 'kunde') as FallakteRolle

  // Die schweren Abhängigkeits-Queries (Timeline, Dokumente, Parteien, etc.)
  // werden weiterhin hier geladen und als Props an die Tabs durchgereicht.
  // Der Shell + die Übersicht brauchen nur fall + lead + sv + kundenbetreuer.
  const [
    { data: dokumente },
    { data: timeline },
    { data: pflichtdokumente },
    { data: qcCheckliste },
    leadResult,
    svResult,
    kundenbetreuerResult,
  ] = await Promise.all([
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, datei_groesse, created_at, kategorie, hochgeladen_von, hochgeladen_von_rolle, quelle, sichtbar_fuer')
      .eq('fall_id', id)
      .order('created_at'),
    supabase
      .from('timeline')
      .select('id, typ, titel, beschreibung, erstellt_von, metadata, lead_id, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('pflichtdokumente')
      // AAR-327: zusätzlich angefordert_* + begruendung + frist für
      // AnforderungenListe (Filter auf angefordert_von_user_id = current
      // User erfolgt client-side, damit bestehende Renderer gleich bleiben).
      .select('id, dokument_typ, status, pflicht, quelle, dokument_url, hochgeladen_am, created_at, angefordert_von_rolle, angefordert_von_user_id, angefordert_am, begruendung, frist')
      .eq('fall_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at'),
    // AAR-170: QC-Checkliste für Dokumente-Tab-Integration
    supabase
      .from('qc_checkliste')
      .select('*')
      .eq('fall_id', id)
      .maybeSingle(),
    fall.lead_id
      ? supabase
          .from('leads')
          // AAR-311: vorschaden_* + cardentity_abfrage_am für Typ-B-Button
          .select('id, vorname, nachname, email, telefon, fin, vorschaden_typ_b_bericht, vorschaden_vorhanden, vorschaden_anzahl, vorschaden_letzter_datum, cardentity_abfrage_am')
          .eq('id', fall.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    fall.sv_id
      ? supabase
          .from('sachverstaendige')
          .select('id, paket, profiles(vorname, nachname, telefon, email)')
          .eq('id', fall.sv_id)
          .single()
      : Promise.resolve({ data: null }),
    fall.kundenbetreuer_id
      ? supabase
          .from('profiles')
          .select('id, vorname, nachname, email, telefon')
          .eq('id', fall.kundenbetreuer_id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  // SV-Profil normalisieren (Supabase liefert nested FK als Array oder Objekt)
  let sv: Parameters<typeof FallakteShell>[0]['sv'] = null
  if (svResult.data) {
    const raw = svResult.data as Record<string, unknown>
    const profileRaw = raw.profiles
    const profileNormalized = (Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw ?? null) as Parameters<typeof FallakteShell>[0]['sv'] extends infer T
      ? T extends { profile: infer P } ? P : null
      : null
    sv = { id: raw.id as string, paket: raw.paket as string, profile: profileNormalized }
  }

  // AAR-327: Katalog-Slots die die aktuelle Rolle anfordern darf, plus die
  // Anforderungen die DIESER User bereits gestellt hat. Die Liste wird
  // client-side im DokumenteTab gerendert; Rolle-Check passiert zusätzlich
  // serverseitig in dokumentAnfordern().
  // FallakteRolle kennt 'admin' | 'kundenbetreuer' | 'sachverstaendiger' |
  // 'kunde' | 'dispatch'. Nur die ersten drei dürfen anfordern; Kanzlei hat
  // kein Fallakten-Portal (Memory: LexDrive-Architektur) — die Rolle wird
  // trotzdem vom Server akzeptiert für einen späteren Kanzlei-Bereich.
  const rolleForAnforderung: 'admin' | 'kundenbetreuer' | 'sachverstaendiger' | null =
    userRolle === 'admin' || userRolle === 'kundenbetreuer' || userRolle === 'sachverstaendiger'
      ? userRolle
      : null
  const anforderbareSlots = rolleForAnforderung
    ? (await getAlleSlots(supabase))
        .filter((s) => s.anforderbar_von.includes(rolleForAnforderung))
        .map((s) => ({
          slot_id: s.slot_id,
          label: s.label,
          beschreibung: s.beschreibung,
          kategorie: s.kategorie as string,
        }))
    : []

  // Katalog-Labels für die Anforderungs-Liste (slot_id → label Mapping)
  const katalogLabels = new Map<string, string>()
  for (const s of await getAlleSlots(supabase)) katalogLabels.set(s.slot_id, s.label)

  // Rohdaten aus pflichtdokumente filtern: nur eigene Anforderungen
  type PflichtRow = {
    id: string
    dokument_typ: string
    status: string
    frist: string | null
    begruendung: string | null
    angefordert_am: string | null
    angefordert_von_user_id: string | null
  }
  const pflichtRows = (pflichtdokumente ?? []) as unknown as PflichtRow[]
  const anforderungenVonMir = pflichtRows
    .filter((r) => r.angefordert_von_user_id === user.id)
    .map((r) => ({
      id: r.id,
      slot_id: r.dokument_typ,
      label: katalogLabels.get(r.dokument_typ) ?? r.dokument_typ,
      status: r.status,
      frist: r.frist,
      begruendung: r.begruendung,
      angefordert_am: r.angefordert_am,
    }))

  const rolleLabelForModal: Record<string, string> = {
    admin: 'Claimondo',
    kundenbetreuer: 'Kundenbetreuer',
    sachverstaendiger: 'Gutachter',
    kanzlei: 'Kanzlei',
  }
  const rolleLabel = rolleLabelForModal[userRolle] ?? 'Claimondo'

  // AAR-103 + W2-Audit-Fix: Banner für andere offene Fälle desselben Kunden.
  // War im alten page.tsx oberhalb des Monolithen — beim Shell-Refactor
  // versehentlich rausgefallen.
  let otherKundeFaelle: Array<{
    id: string
    fall_nummer: string | null
    kennzeichen: string | null
    status: string | null
  }> = []
  if (fall.kunde_id) {
    const { data: others } = await supabase
      .from('faelle')
      .select('id, fall_nummer, kennzeichen, status')
      .eq('kunde_id', fall.kunde_id)
      .neq('id', id)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('created_at', { ascending: false })
    otherKundeFaelle = others ?? []
  }

  return (
    <>
      {otherKundeFaelle.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-amber-900">
            Dieser Kunde hat {otherKundeFaelle.length} weitere{otherKundeFaelle.length > 1 ? '' : 'n'} aktiven Fall:
          </span>
          <div className="flex gap-2 flex-wrap">
            {otherKundeFaelle.map((f) => (
              <a
                key={f.id}
                href={`/admin/faelle/${f.id}`}
                className="text-[#4573A2] hover:underline font-medium text-sm"
              >
                {f.fall_nummer ?? f.id.slice(0, 8)}
                {f.kennzeichen && ` (${f.kennzeichen})`}
              </a>
            ))}
          </div>
        </div>
      )}
      <FallakteShell
        fall={fall}
        lead={leadResult.data}
        userRolle={userRolle}
        kundenbetreuer={kundenbetreuerResult.data}
        sv={sv}
        timeline={timeline ?? []}
        dokumenteTabProps={{
          fallId: id,
          pflichtdokumente: (pflichtdokumente ?? []) as Parameters<typeof FallakteShell>[0]['dokumenteTabProps']['pflichtdokumente'],
          dokumente: (dokumente ?? []) as Parameters<typeof FallakteShell>[0]['dokumenteTabProps']['dokumente'],
          fallAS: {
            anschlussschreiben_url: (fall.anschlussschreiben_url as string | null) ?? null,
            anschlussschreiben_sendedatum: (fall.anschlussschreiben_sendedatum as string | null) ?? null,
            anschlussschreiben_unterschrift: (fall.anschlussschreiben_unterschrift as boolean | null) ?? null,
            anschlussschreiben_ocr_am: (fall.anschlussschreiben_ocr_am as string | null) ?? null,
          },
          // AAR-170: QC-Checkliste direkt im Dokumente-Tab (vorher im Monolithen)
          qcCheckliste: (qcCheckliste ?? null) as Parameters<typeof FallakteShell>[0]['dokumenteTabProps']['qcCheckliste'],
          // AAR-327: Dokument-Anforderungs-UI
          anforderbareSlots,
          anforderungenVonMir,
          rolleLabel,
        }}
      />
    </>
  )
}
