// AAR-162 / W2: Fallakte Server-Page.
// Lädt alle Fall-Daten und delegiert an FallakteShell.
// AAR-172: Der 210-KB-Monolith FallakteClient.old.tsx wurde gelöscht, nachdem
// die neue Shell-Architektur alle W2-W5-Tickets abdeckt.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import FallakteShell from './FallakteShell'
import type { FallakteRolle } from '@/lib/fall/field-permissions'
// AAR-327: Katalog-driven Slot-Liste für „Dokument anfordern"-Modal
import { getAlleSlots } from '@/lib/dokumente/katalog'
// AAR-433 (Child 4 AAR-429): KB Phase-State-Audit oberhalb der Tabs
import KbPhaseAuditCard from '@/components/kb/KbPhaseAuditCard'
// AAR-446: FAQ-Bot-Analyse-Card (liest letzte fall_summaries-Row des Kunden)
import FaqBotAnalyseCard from '@/components/admin/FaqBotAnalyseCard'
import {
  getKbPhaseAudit,
  type KbTask,
  type KbSlaRecord,
} from '@/lib/kb/phase-audit'
import { getStepperState } from '@/lib/fall/stepper-state'

export default async function FallaktePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: fall } = await supabase.from('v_faelle_mit_aktuellem_termin').select('*').eq('id', id).single()
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
    { data: fallDokumenteRaw },
    leadResult,
    svResult,
    kundenbetreuerResult,
  ] = await Promise.all([
    // AAR-553: fall_dokumente ersetzt dokumente. Downstream (dokumenteTabProps,
    // systemDokumente) erwartet Legacy-Shape — Transform erfolgt unten.
    supabase
      .from('fall_dokumente')
      .select('id, dokument_typ, storage_path, original_filename, groesse_bytes, hochgeladen_am, kategorie, hochgeladen_von_user_id, uploaded_by_sv, uploaded_by_kunde, quelle, sichtbar_fuer')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .order('hochgeladen_am'),
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
    // AAR-326: fall_dokumente für Unzugeordnet-Box + Zu-Prüfen-Liste
    supabase
      .from('fall_dokumente')
      .select('id, dokument_typ, storage_path, original_filename, beschreibung, hochgeladen_am, mime_type')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .order('hochgeladen_am', { ascending: false }),
    fall.lead_id
      ? supabase
          .from('leads')
          // AAR-311: vorschaden_* + cardentity_abfrage_am für Typ-B-Button
          .select('id, vorname, nachname, email, telefon, fin, vorschaden_typ_b_bericht, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, cardentity_abfrage_am')
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

  // AAR-553: fall_dokumente → Legacy-Shape für DokumenteTab + systemDokumente
  const dokumenteLegacy = (dokumente ?? []).map(d => ({
    id: d.id as string,
    typ: (d.dokument_typ as string | null) ?? null,
    datei_url: d.storage_path
      ? supabase.storage.from('fall-dokumente').getPublicUrl(d.storage_path as string).data.publicUrl
      : null,
    datei_name: (d.original_filename as string | null) ?? null,
    datei_groesse: (d.groesse_bytes as number | null) ?? null,
    created_at: (d.hochgeladen_am as string | null) ?? null,
    kategorie: (d.kategorie as string | null) ?? null,
    hochgeladen_von: (d.hochgeladen_von_user_id as string | null) ?? null,
    hochgeladen_von_rolle: d.uploaded_by_sv
      ? 'sachverstaendiger'
      : d.uploaded_by_kunde
        ? 'kunde'
        : null,
    quelle: (d.quelle as string | null) ?? null,
    sichtbar_fuer: (d.sichtbar_fuer as string[] | null) ?? null,
  }))

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

  // AAR-326: KB-Zuordnungs-UI — Katalog-Slots vorbereiten, fall_dokumente
  // aufteilen (unzugeordnet / zu prüfen) und Pflichtdokumente in sort-Shape
  // umformen. Preview-URLs kommen aus dem Bucket 'fall-dokumente'.
  const katalogAlleSlots = await getAlleSlots(supabase)
  const uploadbareSlots = katalogAlleSlots
    .filter((s) => s.uploadbar_von.includes('kundenbetreuer') || s.uploadbar_von.includes('kunde'))
    .map((s) => ({
      slot_id: s.slot_id,
      label: s.label,
      beschreibung: s.beschreibung,
      kategorie: s.kategorie as string,
    }))
  const slotLabelMap = new Map(katalogAlleSlots.map((s) => [s.slot_id, s.label]))
  const slotKategorieMap = new Map(katalogAlleSlots.map((s) => [s.slot_id, s.kategorie as string]))

  type FallDokumentRow = {
    id: string
    dokument_typ: string
    storage_path: string
    original_filename: string | null
    beschreibung: string | null
    hochgeladen_am: string
  }
  const fallDokumenteRows = (fallDokumenteRaw ?? []) as unknown as FallDokumentRow[]
  const publicUrlFor = (path: string): string | null => {
    const { data } = supabase.storage.from('fall-dokumente').getPublicUrl(path)
    return data?.publicUrl ?? null
  }
  const unzugeordneteUploads = fallDokumenteRows
    .filter((r) => r.dokument_typ === 'kunde-nachreichung' || r.dokument_typ === 'sonstiges')
    .map((r) => ({
      id: r.id,
      original_filename: r.original_filename,
      previewUrl: publicUrlFor(r.storage_path),
      dokument_typ: r.dokument_typ,
      beschreibung: r.beschreibung,
      hochgeladen_am: r.hochgeladen_am,
    }))

  // Zu prüfende Uploads: fall_dokumente mit Slot-Zuordnung, deren passender
  // Pflicht-Eintrag noch auf 'hochgeladen' steht.
  const pflichtHochgeladenSlots = new Set<string>()
  for (const p of (pflichtdokumente ?? []) as Array<{ dokument_typ: string; status: string }>) {
    if (p.status === 'hochgeladen') pflichtHochgeladenSlots.add(p.dokument_typ)
  }
  const zuPruefendeUploads = fallDokumenteRows
    .filter(
      (r) =>
        r.dokument_typ !== 'kunde-nachreichung' &&
        r.dokument_typ !== 'sonstiges' &&
        pflichtHochgeladenSlots.has(r.dokument_typ),
    )
    .map((r) => ({
      id: r.id,
      label: slotLabelMap.get(r.dokument_typ) ?? r.dokument_typ,
      original_filename: r.original_filename,
      previewUrl: publicUrlFor(r.storage_path),
      hochgeladen_am: r.hochgeladen_am,
    }))

  // Drag&Drop-Items: pflichtdokumente in Shape mit kategorie + sort_order.
  type PflichtSortRow = {
    id: string
    dokument_typ: string
    status: string
    sort_order: number | null
  }
  const sortierbareItems = ((pflichtdokumente ?? []) as unknown as PflichtSortRow[]).map((r, idx) => ({
    id: r.id,
    label: slotLabelMap.get(r.dokument_typ) ?? r.dokument_typ,
    kategorie: slotKategorieMap.get(r.dokument_typ) ?? 'sonstiges',
    status: r.status,
    sort_order: r.sort_order ?? idx + 1,
  }))

  // AAR-356: System-Dokumente-Bucket für den Dokumente-Tab. Vier statische
  // System-Quellen (SA/Vollmacht aus FlowLink, CarDentity-Vorschaden aus
  // Typ-B-Abfrage) + zwei dynamische Quellen (Gutachten-PDF, Kanzlei-Paket)
  // aus der `dokumente`-Tabelle (kategorie-basiert). Kein Schreiben — nur
  // Download-Links fürs Admin-Team.
  type DokumentRow = {
    id: string
    typ: string
    datei_url: string
    datei_name: string
    kategorie: string
    created_at: string
  }
  const dokRows = dokumenteLegacy as unknown as DokumentRow[]
  const gutachtenDok =
    dokRows.find((d) => d.kategorie === 'gutachten' || d.typ === 'gutachten') ?? null
  const kanzleiDok =
    dokRows.find((d) => d.kategorie === 'kanzlei' || d.typ === 'kanzlei_paket') ?? null
  const systemDokumente = {
    sa_pdf_url: (fall.sa_pdf_url as string | null) ?? null,
    sa_unterschrift_url: (fall.sa_unterschrift_url as string | null) ?? null,
    vollmacht_pdf: (fall.vollmacht_pdf as string | null) ?? null,
    vorschaden_typ_b_pdf_url: (fall.vorschaden_typ_b_pdf_url as string | null) ?? null,
    gutachten: gutachtenDok
      ? {
          id: gutachtenDok.id,
          datei_url: gutachtenDok.datei_url,
          datei_name: gutachtenDok.datei_name,
          hochgeladen_am:
            (fall.gutachten_hochgeladen_am as string | null) ?? gutachtenDok.created_at,
        }
      : null,
    kanzleiPaket: kanzleiDok
      ? {
          id: kanzleiDok.id,
          datei_url: kanzleiDok.datei_url,
          datei_name: kanzleiDok.datei_name,
          hochgeladen_am: kanzleiDok.created_at,
        }
      : null,
  }

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

  // AAR-433: KB Phase-State-Audit — nur für Admin und KB sichtbar.
  // Lädt parallel Tasks, SLA-Records und Stepper-State, verkettet dann via
  // Pure-Function getKbPhaseAudit.
  let kbAktion: ReturnType<typeof getKbPhaseAudit> | null = null
  if (userRolle === 'admin' || userRolle === 'kundenbetreuer') {
    try {
      const admin = createAdminClient()
      const [tasksRes, slaRes, stepper] = await Promise.all([
        admin
          .from('tasks')
          .select('id, fall_id, titel, status, empfaenger_rolle, faellig_am, prioritaet')
          .eq('fall_id', id)
          .eq('empfaenger_rolle', 'kundenbetreuer')
          .in('status', ['offen', 'in-bearbeitung']),
        admin
          .from('sla_tracking')
          .select('fall_id, target_rolle, blocker_rolle, blocker_grund, status, breach_at, phase, blocker_seit')
          .eq('fall_id', id)
          .in('status', ['pending', 'breached']),
        getStepperState(id),
      ])
      kbAktion = getKbPhaseAudit(
        {
          id: fall.id as string,
          status: (fall.status as string | null) ?? null,
          updated_at: (fall as Record<string, unknown>).updated_at as string | null,
          abgeschlossen_am: fall.abgeschlossen_am as string | null,
          anschlussschreiben_am: fall.anschlussschreiben_am as string | null,
          regulierung_am: fall.regulierung_am as string | null,
        },
        (tasksRes.data ?? []) as KbTask[],
        (slaRes.data ?? []) as KbSlaRecord[],
        stepper,
      )
    } catch (err) {
      // Non-critical: Card darf fehlen wenn Ladefehler auftritt
      console.error('[AAR-433] KB-Audit-Laden fehlgeschlagen:', err)
    }
  }

  // AAR-446: FAQ-Bot-Analyse-Card — nur für Admin/KB sichtbar (Kunden sehen
  // ihre eigene Akte anderswo, SV/Kanzlei brauchen die Analyse nicht).
  const zeigeAnalyseCard = userRolle === 'admin' || userRolle === 'kundenbetreuer'

  return (
    <>
      {kbAktion && <KbPhaseAuditCard aktion={kbAktion} />}
      {zeigeAnalyseCard && <FaqBotAnalyseCard fallId={id} />}
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
          dokumente: dokumenteLegacy as unknown as Parameters<typeof FallakteShell>[0]['dokumenteTabProps']['dokumente'],
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
          // AAR-326: KB-Zuordnungs-UI
          unzugeordneteUploads,
          zuPruefendeUploads,
          uploadbareSlots,
          sortierbareItems,
          // AAR-356: System-Dokumente (SA, Vollmacht, Gutachten, Kanzlei-Paket,
          // CarDentity-Vorschaden) in eigener Sektion im Dokumente-Tab
          systemDokumente,
        }}
      />
    </>
  )
}
