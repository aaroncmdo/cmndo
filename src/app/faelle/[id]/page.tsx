// AAR-162 / W2: Fallakte Server-Page.
// Lädt alle Fall-Daten und delegiert an FallakteShell.
// AAR-172: Der 210-KB-Monolith FallakteClient.old.tsx wurde gelöscht, nachdem
// die neue Shell-Architektur alle W2-W5-Tickets abdeckt.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import FallakteShell from './FallakteShell'
// CMM-33: Zentrale Pflichtdokumente-Section für Admin/KB im DokumenteTab.
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import type { FallakteRolle } from '@/lib/fall/field-permissions'
// AAR-327: Katalog-driven Slot-Liste für „Dokument anfordern"-Modal
import { getAlleSlots } from '@/lib/dokumente/katalog'
// AAR-433 (Child 4 AAR-429): KB Phase-State-Audit oberhalb der Tabs
import KbPhaseAuditCard from '@/components/kb/KbPhaseAuditCard'
import VollstaendigkeitsCheckCard from '@/components/kb/VollstaendigkeitsCheckCard'
import { getAlleAuftraege } from '@/lib/auftrag/queries'
// AAR-446: FAQ-Bot-Analyse-Card (liest letzte fall_summaries-Row des Kunden)
import FaqBotAnalyseCard from '@/components/admin/FaqBotAnalyseCard'
import {
  getKbPhaseAudit,
  type KbTask,
  type KbSlaRecord,
} from '@/lib/kb/phase-audit'
import { getStepperState } from '@/lib/fall/stepper-state'
// AAR-538 (C1): Subphase-Resolver — Server-seitig berechnet, an Shell übergeben
import { resolveSubphase, type GutachterTerminRow, type WebhookEventRow, type FallRow, type LeadRow } from '@/lib/fall/subphase-resolver'
// AAR-544 (C7): unified Event-Stream aus 7 Quellen für Timeline-Tab
import { getFallEventStream } from '@/lib/fall/event-stream'
// AAR-541 (C4): Chat-Teilnehmer für den Kommunikations-Tab
import { getChatTeilnehmer } from '@/lib/chatGruppe'
// AAR-542 (C5): Pflicht-Matrix — Katalog-Regel-Auswertung serverseitig
import { evaluatePflichtdocs } from '@/lib/dokumente/pflicht-evaluator'
import { listAdHocAnforderungen } from '@/lib/dokumente/ad-hoc-anforderung'
// AAR-761 Phase 3: OCR-Belege zum Review (Admin/KB)
import { listBelegeZumReview } from '@/lib/beleg-review/actions'
// AAR-651: Zentrale Fall-Loader-Lib (Single Source of Truth pro Rolle)
import { getFallById } from '@/lib/fall/queries'
// AAR-843: Timeline-Queries für den Verlaufs-Tab
import { getClaimTimeline } from '@/lib/claims/timeline-queries'
import { projectNextEvents } from '@/lib/claims/timeline-projection'
// AAR-842: Kanzlei-Block — aktives Paket + Partnerkanzlei-Settings + QR-Codes
// AAR-844: isKanzleiPaketPending für KB-Dropdown-Quick-Action
import { getActiveKanzleiPaket, getPartnerKanzleiSettings, isKanzleiPaketPending } from '@/lib/kanzlei/queries'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { KanzleiAnsprechpartnerBlock } from '@/components/shared/claims'

export default async function FallaktePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // AAR-651: Zentrale Lib statt Direkt-Query — Single Source für Admin/KB/Kanzlei
  const fall = await getFallById(supabase, id)
  if (!fall) notFound()

  // AAR-840: claim_id + claims.status für Endzustand-Dropdown im Header.
  // claim_id ist seit AAR-816 NOT NULL auf faelle. Status laden wir separat
  // damit der Endzustand-Dropdown den aktuellen Stand zeigt.
  const claimId = (fall as Record<string, unknown>).claim_id as string | null
  let claimStatus: string | null = null
  let claimPhase: string | null = null
  let claimKanzleiWunsch: string | null = null
  if (claimId) {
    const { data: claimRow } = await supabase
      .from('claims')
      .select('status, phase, kanzlei_wunsch')
      .eq('id', claimId)
      .maybeSingle()
    claimStatus        = (claimRow?.status         as string | null) ?? null
    claimPhase         = (claimRow?.phase          as string | null) ?? null
    claimKanzleiWunsch = (claimRow?.kanzlei_wunsch as string | null) ?? null
  }
  // userRolle für Timeline-Rolle und viele andere Stellen (Auth + RLS),
  // wird unten erneut für FallakteRolle-Cast verwendet.

  // Rolle des eingeloggten Users für field-permissions
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const userRolle = ((profile?.rolle as FallakteRolle | null) ?? 'kunde') as FallakteRolle

  // AAR-843: Timeline + Future-Projection laden (nach userRolle-Auflösung,
  // weil RLS via security_invoker auf der View die Auth braucht).
  const viewerRoleForTimeline =
    userRolle === 'kundenbetreuer'    ? 'kb'    :
    userRolle === 'admin'             ? 'admin' :
    userRolle === 'sachverstaendiger' ? 'sv'    : 'kunde'
  const timelineEvents = claimId
    ? await getClaimTimeline(claimId, viewerRoleForTimeline)
    : []
  const futureEvents = projectNextEvents({ phase: claimPhase })

  // AAR-844: Pre-Check für KB-Dropdown — zeigt "Paket jetzt versenden" wenn
  // Wunsch + Phase passen aber kein Paket existiert.
  const kanzleiPaketPending = claimId ? await isKanzleiPaketPending(claimId) : false

  // AAR-842: Kanzlei-Block-Daten — nur laden wenn ein versendetes Paket existiert.
  // Bei Partnerkanzlei zusätzlich Settings + QR-SVGs für WhatsApp + Termin.
  // variant='prominent' wenn phase=9_abgelehnt (Master-Doc 9.3).
  const kanzleiPaket = claimId ? await getActiveKanzleiPaket(claimId) : null
  let kanzleiBlockData: {
    kanzleiName: string
    kontaktperson: string | null
    telefon: string | null
    email: string | null
    whatsappUrl: string | null
    terminUrl: string | null
    whatsappQrSvg: string | null
    terminQrSvg: string | null
    variant: 'normal' | 'prominent'
  } | null = null
  if (kanzleiPaket) {
    let whatsappUrl: string | null = null
    let terminUrl: string | null = null
    let whatsappQrSvg: string | null = null
    let terminQrSvg: string | null = null
    if (kanzleiPaket.empfaenger_typ === 'partnerkanzlei') {
      const settings = await getPartnerKanzleiSettings()
      if (settings) {
        whatsappUrl = settings.whatsappUrl || null
        terminUrl   = settings.terminUrl   || null
        ;[whatsappQrSvg, terminQrSvg] = await Promise.all([
          whatsappUrl ? generateQrCodeSvg(whatsappUrl) : Promise.resolve(''),
          terminUrl   ? generateQrCodeSvg(terminUrl)   : Promise.resolve(''),
        ])
      }
    }
    kanzleiBlockData = {
      kanzleiName:   kanzleiPaket.empfaenger_kanzlei_name,
      kontaktperson: kanzleiPaket.empfaenger_kanzlei_kontaktperson,
      telefon:       kanzleiPaket.empfaenger_kanzlei_telefon,
      email:         kanzleiPaket.empfaenger_kanzlei_email,
      whatsappUrl,
      terminUrl,
      whatsappQrSvg: whatsappQrSvg || null,
      terminQrSvg:   terminQrSvg   || null,
      variant:       claimPhase === '9_abgelehnt' ? 'prominent' : 'normal',
    }
  }

  // Die schweren Abhängigkeits-Queries (Timeline, Dokumente, Parteien, etc.)
  // werden weiterhin hier geladen und als Props an die Tabs durchgereicht.
  // Der Shell + die Übersicht brauchen nur fall + lead + sv + kundenbetreuer.
  const [
    { data: dokumente },
    events,
    { data: pflichtdokumente },
    { data: qcCheckliste },
    { data: fallDokumenteRaw },
    leadResult,
    svResult,
    kundenbetreuerResult,
    // AAR-538 (C1): für Subphase-Resolver
    { data: gutachterTermineRaw },
    { data: webhookEventsRaw },
  ] = await Promise.all([
    // AAR-553: fall_dokumente ersetzt dokumente. Downstream (dokumenteTabProps,
    // systemDokumente) erwartet Legacy-Shape — Transform erfolgt unten.
    supabase
      .from('fall_dokumente')
      .select('id, dokument_typ, storage_path, original_filename, groesse_bytes, hochgeladen_am, kategorie, hochgeladen_von_user_id, uploaded_by_sv, uploaded_by_kunde, quelle, sichtbar_fuer')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .order('hochgeladen_am'),
    // AAR-544 (C7): unified Event-Stream ersetzt die rohe timeline-Query
    // AAR-650: defensiv — Event-Stream-Fehler soll nicht die komplette Fallakte
    // blockieren. Timeline-Tab zeigt dann ein leeres Array.
    getFallEventStream(supabase, id).catch((err) => {
      console.error('[AAR-650] getFallEventStream fehlgeschlagen:', err)
      return []
    }),
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
          .select('id, vorname, nachname, email, telefon, fin, hat_vorschaeden, zb1_status')
          .eq('id', fall.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    fall.sv_id
      ? supabase
          .from('sachverstaendige')
          .select('id, paket, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, telefon, email)')
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
    // AAR-538 (C1): Termine für 3.1/3.2/3.3 — aktiver Termin wird im Resolver ausgewählt
    supabase
      .from('gutachter_termine')
      .select('id, typ, sv_unterwegs_seit, sv_angekommen_am, durchgefuehrt_am, status')
      .eq('fall_id', id),
    // AAR-538 (C1): webhook_events für kb_filmcheck_bestanden (Erweiterung 4)
    supabase
      .from('webhook_events')
      .select('event_type, fall_id, processed_at, source')
      .eq('fall_id', id)
      .in('event_type', ['kb_filmcheck_bestanden']),
  ])

  // AAR-541 (C4): Chat-Teilnehmer parallel zu den restlichen Queries hätten
  // gut gepasst, liegen aber auf einer anderen Client-Instanz (Admin) — daher
  // separat und erst nach Auth-Check.
  // AAR-650: defensiv — ein Fehler beim Auflösen der Teilnehmer soll nicht
  // die ganze Fallakte blockieren (Kommunikations-Tab würde leer bleiben).
  const teilnehmer = await getChatTeilnehmer(id).catch((err) => {
    console.error('[AAR-650] getChatTeilnehmer fehlgeschlagen:', err)
    return []
  })

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
  //
  // AAR-618: `getAlleSlots(supabase)` wird einmal am Anfang aufgerufen und
  // für alle Downstream-Consumers (anforderbareSlots / katalogLabels /
  // katalogAlleSlots) wiederverwendet. Vorher 3× sequenziell → 1× reuse.
  // `getAlleSlots` hat zwar Cache (5min TTL), spart aber trotzdem 2 await-
  // Roundtrips im selben Request.
  const katalogAlleSlots = await getAlleSlots(supabase)

  const rolleForAnforderung: 'admin' | 'kundenbetreuer' | 'sachverstaendiger' | null =
    userRolle === 'admin' || userRolle === 'kundenbetreuer' || userRolle === 'sachverstaendiger'
      ? userRolle
      : null
  const anforderbareSlots = rolleForAnforderung
    ? katalogAlleSlots
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
  for (const s of katalogAlleSlots) katalogLabels.set(s.slot_id, s.label)

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

  // AAR-762 Phase 3: Ad-hoc-Anforderungen für Admin/KB laden.
  const adHocAnforderungen =
    userRolle === 'admin' || userRolle === 'kundenbetreuer'
      ? await listAdHocAnforderungen(id)
      : []

  // AAR-761 Phase 3: OCR-Belege zum Review (Admin/KB).
  const belegeZumReview =
    userRolle === 'admin' || userRolle === 'kundenbetreuer'
      ? await listBelegeZumReview(id)
      : []

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
  // AAR-618: katalogAlleSlots wird oben (vor anforderbareSlots) einmal geladen.
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

  // AAR-542 (C5): Pflicht-Matrix evaluieren — vor return, nach allen Queries.
  // Nutzt den bereits geladenen Katalog (katalogAlleSlots) + die bestehenden
  // pflichtdokumente-Rows + fall/lead. Alle 30 Slots × Regel = <10ms JS-Work.
  const pflichtMatrix = evaluatePflichtdocs({
    katalog: katalogAlleSlots,
    fall: fall as unknown as Record<string, unknown>,
    lead: (leadResult.data ?? null) as Record<string, unknown> | null,
    pflichtdokumente: (pflichtdokumente ?? []) as Array<{
      id: string
      dokument_typ: string
      status: string | null
      pflicht: boolean | null
    }>,
  })

  // CMM-32e: Vollständigkeits-Check-Card-Daten für KB/Admin
  let qcCardProps: React.ComponentProps<typeof VollstaendigkeitsCheckCard> | null = null
  if (userRolle === 'admin' || userRolle === 'kundenbetreuer') {
    const adminCli = createAdminClient()
    const auftraegeFall = await getAlleAuftraege(supabase, id)
    const erstgutachten = auftraegeFall.find((a) => a.typ === 'erstgutachten')
    if (erstgutachten) {
      const { data: dokRows } = await adminCli
        .from('fall_dokumente')
        .select('id, dokument_typ, original_filename, storage_path')
        .eq('fall_id', id)
        .in('dokument_typ', ['gutachten', 'gutachten_anlage'])
        .is('geloescht_am', null)
        .order('hochgeladen_am', { ascending: true })
      const docList = ((dokRows ?? []) as Array<{
        id: string
        dokument_typ: string
        original_filename: string | null
        storage_path: string
      }>).map((d) => ({
        id: d.id,
        filename: d.original_filename ?? 'Datei',
        url: adminCli.storage.from('fall-dokumente').getPublicUrl(d.storage_path).data.publicUrl,
        istHaupt: d.dokument_typ === 'gutachten',
      }))
      const haupt = docList.find((d) => d.istHaupt) ?? null
      const anlagen = docList.filter((d) => !d.istHaupt)
      const slotLabels = new Map(katalogAlleSlots.map((s) => [s.slot_id, s.label]))
      const pflichtItemsList = (pflichtdokumente ?? []).map((p) => ({
        slot_id: p.dokument_typ as string,
        label: slotLabels.get(p.dokument_typ as string) ?? (p.dokument_typ as string),
        vorhanden: p.status === 'hochgeladen' || p.status === 'geprueft',
        pflicht: !!p.pflicht,
      }))
      qcCardProps = {
        auftragId: erstgutachten.id,
        hatGutachten: !!erstgutachten.gutachten_url,
        bereitsFreigegeben: erstgutachten.gutachten_final_freigegeben,
        hauptgutachten: haupt,
        anlagen,
        pflichtItems: pflichtItemsList,
      }
    }
  }

  // AAR-538 (C1): Subphase + next_hint berechnen (pure function)
  const subphase = resolveSubphase({
    fall: fall as unknown as FallRow,
    lead: (leadResult.data ?? null) as LeadRow | null,
    gutachter_termine: (gutachterTermineRaw ?? []) as unknown as GutachterTerminRow[],
    webhook_events: (webhookEventsRaw ?? []) as unknown as WebhookEventRow[],
  })

  return (
    <>
      {kbAktion && <KbPhaseAuditCard aktion={kbAktion} />}
      {zeigeAnalyseCard && <FaqBotAnalyseCard fallId={id} />}
      {/* CMM-32e: Vollständigkeits-Check für KB / Admin sobald Gutachten hochgeladen */}
      {(userRolle === 'admin' || userRolle === 'kundenbetreuer') && qcCardProps && (
        <div className="mb-4">
          <VollstaendigkeitsCheckCard {...qcCardProps} />
        </div>
      )}
      {/* AAR-842: Kanzlei-Block — prominent bei Phase 9_abgelehnt, sonst normal.
          Render-Logik im Parent (Aaron-Pattern): Component bleibt dumm. */}
      {kanzleiBlockData && (
        <div className={kanzleiBlockData.variant === 'prominent' ? 'mb-4' : 'mb-4 max-w-md'}>
          <KanzleiAnsprechpartnerBlock {...kanzleiBlockData} />
        </div>
      )}
      {otherKundeFaelle.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-amber-900">
            Dieser Kunde hat {otherKundeFaelle.length} weitere{otherKundeFaelle.length > 1 ? '' : 'n'} aktiven Fall:
          </span>
          <div className="flex gap-2 flex-wrap">
            {otherKundeFaelle.map((f) => (
              <a
                key={f.id}
                href={`/faelle/${f.id}`}
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
        fall={fall as Parameters<typeof FallakteShell>[0]['fall']}
        lead={leadResult.data}
        userRolle={userRolle}
        kundenbetreuer={kundenbetreuerResult.data}
        sv={sv}
        events={events}
        subphase={subphase}
        currentUserId={user.id}
        teilnehmer={teilnehmer}
        claimId={claimId}
        claimStatus={claimStatus}
        claimKanzleiWunsch={claimKanzleiWunsch}
        kanzleiPaketPending={kanzleiPaketPending}
        timelineEvents={timelineEvents}
        futureEvents={futureEvents}
        dokumenteTabProps={{
          fallId: id,
          // CMM-33: Smart-Filter Slots als Übersichts-Section oben im Tab.
          // Rolle bestimmt Permission (Admin/KB upload, SV/Kanzlei read-only).
          pflichtSlots: await getPflichtdokumenteForFall(supabase, id, viewerRoleForTimeline),
          viewerRolle: viewerRoleForTimeline,
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
          // AAR-762 Phase 3: Ad-hoc-Anforderungen (Admin/KB-only)
          adHocAnforderungen,
          // AAR-761 Phase 3: OCR-Belege zum Review (Admin/KB-only)
          belegeZumReview,
          // AAR-326: KB-Zuordnungs-UI
          unzugeordneteUploads,
          zuPruefendeUploads,
          uploadbareSlots,
          sortierbareItems,
          // AAR-356: System-Dokumente (SA, Vollmacht, Gutachten, Kanzlei-Paket,
          // CarDentity-Vorschaden) in eigener Sektion im Dokumente-Tab
          systemDokumente,
          // AAR-542 (C5): Pflicht-Matrix + Admin-Flag fürs Debug-Modal
          pflichtMatrix,
          isAdmin: userRolle === 'admin' || userRolle === 'kundenbetreuer',
        }}
      />
    </>
  )
}
