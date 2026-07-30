import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { resolveGegnerVersicherung } from '@/lib/claims/gegner-versicherung'
import { getAnspruchVorschauFuerFall } from '@/lib/anspruch/get-anspruch-vorschau-fuer-fall'
import { getStorageUrlBulk } from '@/lib/storage/url'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect, notFound } from 'next/navigation'
import FallDetailClient from './FallDetailClient'
// CMM-24: Auftrags-Banner mit den vom Kunden noch nicht eingereichten
// Doku-Anforderungen — der SV soll die Liste vor dem Termin sehen.
// CMM-23/33: AuftragDokumenteBanner ersetzt durch PflichtdokumenteSection (read-only für SV)
// (vollständige Slot-Sicht mit Download-Links).
// CMM-23: post-Auftrag MeinFallStatusCard für die Fall-Phasen.
// Der Stepper rendert in der linken Sidebar (FallDetailClient).
import MeinFallStatusCard from '@/components/gutachter/MeinFallStatusCard'
import { brauchtWerkstattVermittlung, type BedarfRow } from '@/lib/werkstatt/vermittlung-core'
import { reparaturPhaseErreicht } from '@/lib/werkstatt/reparatur-phase-erreicht'
import { findWerkstattVorschlaegeFuer } from '@/lib/werkstatt/matching/lade-vorschlaege'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { WerkstattEmpfehlenCard } from './_components/WerkstattEmpfehlenCard'
import { getSvLifecyclePhase, isFallPhase } from '@/lib/auftrag/phase'
// SV-Briefing — wandert aus der Sidebar nach oben unter den gelben Banner.
import BriefingCard from '@/components/fall/BriefingCard'
import GutachtenUploadBanner from '@/components/gutachter/GutachtenUploadBanner'
import { VorOrtTriggerCard } from './_components/VorOrtTriggerCard'
// AAR-Followup (SV-Lead-Ablehnung): Card sichtbar nur in Status sv-zugewiesen + sv-termin.
import { LeadAblehnenCard } from './_components/LeadAblehnenCard'
import { AnspruchVorschauCard } from './_components/AnspruchVorschauCard'
// CMM-23: Pflichtdokumente-Liste mit Download-Links — ersetzt den
// gelben "Noch einzuholen"-Banner als Single-Source der Pflicht-Doku-Sicht.
import { getClaimDetail } from '@/lib/claims/detail/get-claim-detail'
// AAR-956 Zustandsdoku-Vorzustand (SV-Galerie): Loader + Read-only-Kachel-Galerie.
import { getLetzterScanFuerVehicle } from '@/lib/vehicles/vehicle-scan-view'
import { VehicleScanGalerie } from '@/components/shared/VehicleScanGalerie'
// AAR-327: Katalog-Slots die der SV anfordern darf + bestehende Anforderungen
// AAR-651: Zentrale Fall-Loader-Lib

export default async function GutachterFallPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Verify this gutachter has an SV profile
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) notFound()

  // Phase C: EIN rollen-aware getClaimDetail (Facade) statt getFallForSv +
  // getPflichtdokumenteForFall + getAlleAuftraege separat. sv-core === getFallForSv-Output
  // (behavior-preserving); getFallForSv bleibt das sv_id-Defense-in-Depth-Gate (null → notFound).
  const detail = await getClaimDetail(supabase, id, 'sv', { svId: (sv as { id: string }).id })
  if (!detail) notFound()
  const fall = detail.core

  // CMM-25: Auftragslebenszyklus beim SV beginnt erst mit der Sicherungs-
  // abtretungs-Unterschrift. Vorher ist der vom Dispatcher reservierte Slot
  // ein reiner Kalenderblock (Google/CalDAV) — die Fallakte ist gesperrt.
  if (!(fall as { sa_unterschrieben?: boolean | null }).sa_unterschrieben) {
    notFound()
  }

  // AAR-772: SV-Briefing automatisch generieren wenn noch nicht vorhanden.
  // Best-effort, blockiert nicht den Page-Render. Bei nächstem Refresh
  // ist der Text dann da. Cache-Logik (24h) lebt in generateSvBriefing.
  if (!fall.sv_briefing_text) {
    void import('@/lib/ai/briefing').then(({ generateSvBriefing }) =>
      generateSvBriefing(id).catch((err) => {
        console.warn('[AAR-772] SV-Briefing-Auto-Generate fehlgeschlagen:', err)
      }),
    )
  }

  // AAR-771: SV hat keine RLS-Erlaubnis auf `leads` (PII-geschützt). Wir
  // benutzen den Admin-Client für die Stammdaten-Lookups, NACHDEM die
  // SV↔Fall-Beziehung über getFallForSv geprüft ist (Defense-in-Depth).
  // Vorher zeigte die Stammdaten-Card nur "—" weil lead = null war.
  const admin = createAdminClient()

  // AAR-724: Alle ungesehenen Termine dieses Falls auf „gesehen" setzen sobald
  // der SV die Fallakte öffnet. Best-effort, Fehler nicht blockend. RETURNING
  // liefert die gerade-frisch-gesehenen Termine — daraus die kunde-initiierten
  // Verlegungen für den gelben „Termin durch Kunde verschoben"-Banner (gilt bis
  // zum nächsten Reload, da gesehen_am dann gesetzt ist).
  let zuletztGesehenIds: string[] = []
  try {
    const { data: aktualisiert } = await supabase
      .from('gutachter_termine')
      .update({ gesehen_am: new Date().toISOString() })
      .eq('fall_id', id)
      // CMM-49 sv_id-Drop (Termin-Engine-Handoff): gutachter_termine.sv_id -> assignee (Filter)
      .eq('assignee_id', (sv as { id: string }).id)
      .eq('assignee_typ', 'sachverstaendiger')
      .is('gesehen_am', null)
      .select('id, verlegung_initiator_kunde')
    zuletztGesehenIds = ((aktualisiert ?? []) as Array<{ id: string; verlegung_initiator_kunde: boolean | null }>)
      .filter((t) => t.verlegung_initiator_kunde === true)
      .map((t) => t.id)
  } catch (err) {
    console.error('[AAR-724] auto-mark-seen gutachter_termine failed:', err)
  }
  const hatNeueKundeVerlegung = zuletztGesehenIds.length > 0

  // Fetch all related data in parallel
  // Leadpreis-Claim aufloesen: Route-Param id ist die fall_id (Bridge) != claims.id.
  const lpClaimId = await resolveClaimId(admin, id)

  // KI-Vorschaetzung (Anspruch-pruefen-Tool) fuer den SV — read-only. Admin-Client NACH dem
  // getFallForSv-Ownership-Gate (Defense-in-Depth wie AAR-771; anspruch_schaetzungen ist RLS-deny-all).
  const anspruchVorschau = lpClaimId ? await getAnspruchVorschauFuerFall(admin, lpClaimId) : null

  const [
    { data: lead },
    { data: dokumente },
    { data: pflichtdokumente },
    { data: vcfGegnerRow },
    { data: timeline },
    { data: abrechnung },
    { data: nachrichten },
    { data: svView },
  ] = await Promise.all([
    fall.lead_id
      ? admin
          .from('leads')
          // AAR-771: Admin-Client weil SV keine RLS auf leads hat.
          // Fall-Daten-Konsistenz: vorschaden_* + cardentity_abfrage_am leben
          // auf faelle (nicht mehr auf leads).
          // AAR-545 Cluster D: eigene_versicherung + eigene_policennr für
          // „Eigene Versicherung"-Block.
          .select('vorname, nachname, email, telefon, fin, hat_vorschaeden, zb1_status, eigene_versicherung, eigene_policennr')
          .eq('id', fall.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    // AAR-553: fall_dokumente ersetzt dokumente. Legacy-Shape bleibt für
    // FallDetailClient/FallakteVollClient/FallakteDrawer erhalten (typ,
    // datei_url, datei_name, datei_groesse, created_at, hochgeladen_von_rolle).
    supabase
      .from('fall_dokumente')
      .select('id, dokument_typ, storage_path, original_filename, groesse_bytes, kategorie, quelle, sichtbar_fuer, uploaded_by_sv, uploaded_by_kunde, hochgeladen_am')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .is('abgelehnt_am', null)
      .contains('sichtbar_fuer', ['sachverstaendiger'])
      .order('hochgeladen_am'),
    supabase
      .from('pflichtdokumente')
      // AAR-327: angefordert_* + begruendung + frist (Anforderungs-Metadaten).
      .select('id, dokument_typ, status, pflicht, quelle, dokument_url, hochgeladen_am, created_at, angefordert_von_rolle, angefordert_von_user_id, angefordert_am, begruendung, frist')
      .eq('fall_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at'),
    // CMM-49: parteien-Tabelle ist leer — Gegner-Name aus v_claim_full (SSoT).
    // resolveGegnerVersicherung (Versicherungsname/Nr) wird nach dem Promise.all
    // mit dem dann bekannten noShowClaimId/fallId aufgerufen.
    supabase
      .from('v_claim_full')
      .select('gegner_name')
      .eq('fall_id', id)
      .maybeSingle(),
    supabase
      .from('timeline')
      .select('id, typ, titel, beschreibung, erstellt_von, metadata, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: false }),
    // Billing-Konsolidierung 2026-07-01: Leadpreis aus claims-SSoT (lead_preis_netto/-typ,
      // processCaseBilling) via Admin-Client — der SV hat keine RLS auf die claims-Tabelle (liest
      // sonst ueber Definer-Views), daher admin + resolveClaimId (lpClaimId oben), weil der
      // Route-Param id die fall_id (Bridge) ist != claims.id (Prod: 78/94 verschieden).
      lpClaimId
        ? admin
            .from('claims')
            .select('lead_preis_netto, lead_preis_typ, bkat_unfallart')
            .eq('id', lpClaimId)
            .eq('sv_id', sv.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    supabase
      .from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .eq('kanal', 'chat_kunde_sv')
      .order('created_at', { ascending: true }),
    // AAR-559 (C10): SV-View mit Column-Filter (C8/AAR-557) — liefert nur
    // SV-relevante Felder: SV-Honorar, Konfrontations-Wunsch + Kunden-Slots.
    // Niemals auszahlung_kunde_betrag oder regulierung_betrag sichtbar.
    // CMM-44 SP-I2 PR2 Task 5: mandatsnummer via faelle_sv_view (kanzlei_faelle-Join).
    supabase
      .from('faelle_sv_view')
      .select(
        'auszahlung_gutachter_betrag, auszahlung_gutachter_eingegangen_am, nachbesichtigung_sv_konfrontation_gewuenscht, nachbesichtigung_sv_termin_vereinbart_am, nachbesichtigung_kunde_termin_vorschlaege, mandatsnummer',
      )
      .eq('id', id)
      .maybeSingle(),
  ])

  // CMM-49: parteien-Tabelle ist leer — Gegner-Partei synthetisch aus v_claim_full
  // (gegner_name) + resolveGegnerVersicherung (Versicherungsname/Nr) aufbauen.
  // StammdatenDetail.GegnerDetail liest: rolle, name, telefon, email,
  // versicherung_name, versicherung_nr — Shape muss kompatibel bleiben.
  const gegnerVers = await resolveGegnerVersicherung(supabase, { fallId: id })
  const gegnerName = (vcfGegnerRow?.gegner_name as string | null) ?? null
  const parteien: { rolle: string; name: string | null; telefon: null; email: null; versicherung_name: string | null; versicherung_nr: string | null }[] =
    (gegnerName ?? gegnerVers.name)
      ? [{ rolle: 'verursacher', name: gegnerName, versicherung_name: gegnerVers.name, versicherung_nr: gegnerVers.nummer, telefon: null, email: null }]
      : []

  // Fetch kundenbetreuer profile
  let kundenbetreuer: {
    vorname: string | null
    nachname: string | null
    email: string | null
    telefon: string | null
  } | null = null
  if (fall.kundenbetreuer_id) {
    const { data: kbProfile } = await supabase
      .from('profiles')
      .select('vorname, nachname, email, telefon')
      .eq('id', fall.kundenbetreuer_id as string)
      .single()
    kundenbetreuer = kbProfile
  }

  // AAR-405 Phase 5: Kanzlei-Ansprechpartner — sobald der Fall an eine Kanzlei
  // uebergeben ist (kanzlei_faelle-Row existiert). 2-Step statt Embed, weil der
  // Admin-Client ungetypt ist (Embed = stiller PostgREST-400-Vektor). Admin-Client
  // wie kundenbetreuer/lead NACH dem getClaimDetail-sv_id-Gate (Defense-in-Depth).
  let kanzlei: { name: string | null; email: string | null; ansprechpartner: string | null } | null = null
  const { data: kanzleiFall } = await admin
    .from('kanzlei_faelle')
    .select('kanzlei_id')
    .eq('fall_id', id)
    .maybeSingle()
  if (kanzleiFall?.kanzlei_id) {
    const { data: kanzleiRow } = await admin
      .from('kanzleien')
      .select('name, email, ansprechpartner')
      .eq('id', kanzleiFall.kanzlei_id as string)
      .maybeSingle()
    if (kanzleiRow) {
      kanzlei = {
        name: (kanzleiRow.name as string | null) ?? null,
        email: (kanzleiRow.email as string | null) ?? null,
        ansprechpartner: (kanzleiRow.ansprechpartner as string | null) ?? null,
      }
    }
  }

  // Attach leadpreis to fall object for display.
  const fallWithAbrechnung = {
    ...fall,
    _leadpreis: abrechnung?.lead_preis_netto != null ? Number(abrechnung.lead_preis_netto) : null,
    _preistyp: abrechnung?.lead_preis_typ ?? null,
  }

  // AV3-SV: Auffahrunfall-Hinweis fuer den SV (Aaron 09.07.) — reiner Hinweis (Stoßfänger/
  // Hebebühne + Hilfestellungskosten individuell mit der Werkstatt aushandeln), KEINE
  // SV-System-Position. bkat_unfallart aus dem claims-SSoT (admin-Read oben).
  const istAuffahrunfallSv =
    (abrechnung as { bkat_unfallart?: string | null } | null)?.bkat_unfallart === 'auffahrunfall'

  // AAR-403: Kürzungs-Positionen für KanzleiStatusCard (Phase 5+)
  let kuerzungen: {
    id: string
    typ: string | null
    bezeichnung: string | null
    betrag_gefordert: number | null
    betrag_reguliert: number | null
    betrag_gekuerzt: number | null
  }[] = []
  try {
    // CMM-49: forderungspositionen ist claim-gekeyt; interim faelle.claim_id-Lookup
    // (claim_id steckt nicht in v_faelle_mit_aktuellem_termin). admin-Client wie
    // im Storage-Pfad unten; P4-TODO: claimId einmal threaden statt doppelt laden.
    const fpClaimId = await resolveClaimId(admin, id)
    const { data: fp } = await supabase
      .from('forderungspositionen')
      .select('id, typ, bezeichnung, betrag_gefordert, betrag_reguliert, betrag_gekuerzt')
      .eq('claim_id', fpClaimId ?? '00000000-0000-0000-0000-000000000000')
      .order('erstellt_am', { ascending: true })
    kuerzungen = (fp ?? []).map((p) => ({
      id: p.id as string,
      typ: (p.typ as string | null) ?? null,
      bezeichnung: (p.bezeichnung as string | null) ?? null,
      betrag_gefordert: p.betrag_gefordert != null ? Number(p.betrag_gefordert) : null,
      betrag_reguliert: p.betrag_reguliert != null ? Number(p.betrag_reguliert) : null,
      betrag_gekuerzt: p.betrag_gekuerzt != null ? Number(p.betrag_gekuerzt) : null,
    }))
  } catch {
    /* Tabelle kann fehlen — Card fällt dann auf faelle.kuerzungs_betrag zurück. */
  }

  // KFZ-172: fall_dokumente laden
  let fallDokumente: { id: string; dokument_typ: string; ist_pflicht: boolean; ab_phase: string | null; storage_path: string; original_filename: string | null; ocr_status: string | null; hochgeladen_am: string }[] = []
  try {
    const { data: fd } = await supabase
      .from('fall_dokumente')
      .select('id, dokument_typ, ist_pflicht, ab_phase, storage_path, original_filename, ocr_status, ocr_extracted_data, hochgeladen_am')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .order('hochgeladen_am')
    fallDokumente = (fd ?? []) as typeof fallDokumente
  } catch { /* Tabelle kann noch nicht existieren */ }

  // KFZ-134: Aktiven gutachter_termine Eintrag laden (admin-client bereits oben)
  // CMM-23: zusätzlich kunde_losgefahren_am, kunde_angekommen_am und
  // durchgefuehrt_am für die Phasen-Bestimmung.
  // AAR-864: verlegung_pending zum Status-Filter — wenn der SV verlegt hat,
  // ist der NEUE Slot der "aktuelle" Termin den der Header rendert (mit
  // dem read-only „Verlegung beantragt — Bestätigung ausstehend"-Hinweis).
  // verlegt-Slot bleibt draußen — er ist nur Slot-Blocker im Kalender.
  const { data: aktiveTermine } = await admin
    .from('gutachter_termine')
    .select('id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, sv_unterwegs_seit, sv_angekommen_am, durchgefuehrt_am, geschaetzte_fahrtzeit_min, sv_eta_minuten, verlegung_initiator_kunde')
    .eq('fall_id', id)
    // CMM-49 sv_id-Drop (Termin-Engine-Handoff): gutachter_termine.sv_id -> assignee (Filter)
    .eq('assignee_id', sv.id)
    .eq('assignee_typ', 'sachverstaendiger')
    // 'durchgefuehrt' aus dem gutachter_termine-CHECK entfernt (Completion = durchgefuehrt_am);
    // toter Filterwert. Abgeschlossene Termine sind kein "aktiver" Termin (waren nie im Filter).
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt', 'verlegung_pending'])
    .order('created_at', { ascending: false })

  // Priorität wie in v_faelle_mit_aktuellem_termin:
  // bestaetigt > verlegung_pending > gegenvorschlag > reserviert > durchgefuehrt.
  const STATUS_PRIO: Record<string, number> = {
    bestaetigt: 1,
    verlegung_pending: 2,
    gegenvorschlag: 3,
    reserviert: 4,
    durchgefuehrt: 5,
  }
  const aktiverTermin = (aktiveTermine ?? []).slice().sort(
    (a, b) =>
      (STATUS_PRIO[a.status as string] ?? 9) - (STATUS_PRIO[b.status as string] ?? 9),
  )[0] ?? null

  // CMM-32 Walkthrough Polish: roter „Termin verstrichen"-Banner wenn der
  // bestätigte Slot in der Vergangenheit liegt (+ 60 Min Toleranz für SV-
  // Spätankunft) UND keiner der Folgezustände erreicht wurde (durchgeführt /
  // SV vor Ort / SV unterwegs — letzteres bekommt eine eigene Unterwegs-Card).
  // Server-side berechnet, damit kein Client-Clock-Skew die Anzeige triggert.
  const aktiverTerminVerstrichen = (() => {
    const t = aktiverTermin
    if (!t || !t.start_zeit || t.status !== 'bestaetigt') return false
    if (t.durchgefuehrt_am || t.sv_angekommen_am || t.sv_unterwegs_seit) return false
    return new Date(t.start_zeit as string).getTime() + 60 * 60 * 1000 < Date.now()
  })()



  // AAR-553: fall_dokumente → Legacy-Shape für FallDetailClient-Konsumenten
  // RLS-Fix (SV-Doc-URL-Bug): signed-URLs für den locked `fall-dokumente`-Bucket brauchen den
  // Service-Client. Mit dem User-Client (SV) schlägt createSignedUrl per storage.objects-RLS fehl
  // → datei_url=null → weder Download-Link noch Vorschau rendern. `dokumente` ist bereits
  // sichtbar_fuer-gefiltert (Z.146 `.contains(['sachverstaendiger'])`) → admin-Auflösung leakt
  // nichts (identisch zum Kunde-Pfad kunde-claim-view.ts:301 `getStorageUrlBulk(admin, …)`).
  const dokUrlsLegacy = await getStorageUrlBulk(
    admin,
    (dokumente ?? []).map(d => ({ bucket: 'fall-dokumente', path: (d.storage_path as string | null) ?? undefined })),
  )
  const dokumenteLegacy = (dokumente ?? []).map((d, i) => ({
    id: d.id as string,
    typ: (d.dokument_typ as string | null) ?? null,
    datei_url: dokUrlsLegacy[i],
    datei_name: (d.original_filename as string | null) ?? null,
    datei_groesse: (d.groesse_bytes as number | null) ?? null,
    kategorie: (d.kategorie as string | null) ?? null,
    quelle: (d.quelle as string | null) ?? null,
    sichtbar_fuer: (d.sichtbar_fuer as string[] | null) ?? null,
    hochgeladen_von_rolle: d.uploaded_by_sv
      ? 'sachverstaendiger'
      : d.uploaded_by_kunde
        ? 'kunde'
        : null,
    created_at: (d.hochgeladen_am as string | null) ?? null,
    storage_path: (d.storage_path as string | null) ?? null,
  }))

  // AAR-559 (C10): SV-View-Felder für SvHonorarCard + KonfrontationsTerminCard.
  // terminVorschlaege kommt als JSONB — auf {datum, uhrzeit}-Array normalisieren.
  // CMM-44 SP-I2 PR2 Task 5: mandatsnummer aus faelle_sv_view (kanzlei_faelle-Join).
  const svHonorarBetrag = svView?.auszahlung_gutachter_betrag != null
    ? Number(svView.auszahlung_gutachter_betrag as number)
    : null
  const svHonorarEingegangenAm = (svView?.auszahlung_gutachter_eingegangen_am as string | null) ?? null
  const konfrontationGewuenscht = !!svView?.nachbesichtigung_sv_konfrontation_gewuenscht
  const konfrontationTerminVereinbartAm =
    (svView?.nachbesichtigung_sv_termin_vereinbart_am as string | null) ?? null
  const svMandatsnummer = (svView?.mandatsnummer as string | null) ?? null
  const terminVorschlaegeRaw = svView?.nachbesichtigung_kunde_termin_vorschlaege
  const terminVorschlaege = Array.isArray(terminVorschlaegeRaw)
    ? (terminVorschlaegeRaw as Array<{ datum: string; uhrzeit: string }>).filter(
        (s) => s && typeof s.datum === 'string' && typeof s.uhrzeit === 'string',
      )
    : null

  // Phase C: auftraege aus dem getClaimDetail-Bundle (oben) statt separatem
  // getAlleAuftraege(supabase). Einziger Consumer ist die erstgutachten-.find() —
  // auf einem sv-gegateten Fall ist das erstgutachten immer das des betrachtenden SV,
  // daher liefert der Admin-Bundle-Read dasselbe erstgutachten (behavior-preserving)
  // und spart den Doppel-Load (Review I1).
  const auftraegeOfFall = detail.auftraege
  const erstgutachtenAuftrag = auftraegeOfFall.find((a) => a.typ === 'erstgutachten') ?? null

  // CMM-32: claim_id ist nicht in der v_faelle_mit_aktuellem_termin-View
  // enthalten — separat aus faelle laden für den Storage-Pfad.
  // CMM-44 SP-A2 (Cluster 3): no_show_count → claims.kunde_no_show_count (SSoT).
  // Der rose-Banner zaehlt verpasste Kunden-Termine → kunde_no_show_count.
  // CMM-49: claimId via resolveClaimId (== faelle.claim_id, Storage-Pfad); kunde_no_show_count
  // claims-nativ (SSoT). faelle-frei.
  const noShowClaimId = await resolveClaimId(admin, id)
  const claimIdForStorage = noShowClaimId ?? ''
  // No-Show-Counter für den rose-Banner „Termin(e) verpasst".
  const { data: fallClaimRow } = noShowClaimId
    ? await admin.from('claims').select('kunde_no_show_count, vehicle_id').eq('id', noShowClaimId).maybeSingle()
    : { data: null }
  const noShowCount = (fallClaimRow?.kunde_no_show_count as number | null) ?? 0

  // Zustandsdoku-Vorzustand (SV-Galerie): letzter abgeschlossener Fahrzeug-Scan (Fotos +
  // Qualitaets-Ampel + dokumentierte Vorschaeden). admin nach dem sv_id-Gate; vehicle_scans*
  // sind admin-scoped (kein SV-RLS-Pfad). vehicle_id aus dem claims-SSoT (oben mitgelesen).
  const zustandVehicleId = (fallClaimRow?.vehicle_id as string | null) ?? null
  const vehicleScan = zustandVehicleId
    ? await getLetzterScanFuerVehicle(admin, zustandVehicleId)
    : null

  // Reparatur-Werkstatt-Vermittlung (Gutachter im Auftrag): Gate + 5 naechste Partner.
  // Nur wenn Reparatur gewuenscht + noch keine Werkstatt hinterlegt (brauchtWerkstattVermittlung).
  let werkstattVermittlung: {
    fallId: string
    werkstaetten: WerkstattFinderRow[]
    offeneEmpfehlung: { anzahl: number; gesendetAm: string; werkstattNamen: string[] } | null
  } | null = null
  if (noShowClaimId) {
    const { data: rwGate } = await admin
      .from('claims')
      .select('reparaturwunsch, reparatur_werkstatt_id, werkstatt_id, reparatur_vermittlung_status, abrechnungsweg')
      .eq('id', noShowClaimId)
      .maybeSingle()
    if (
      rwGate &&
      brauchtWerkstattVermittlung(rwGate as BedarfRow) &&
      reparaturPhaseErreicht(
        { abrechnungsweg: (rwGate as { abrechnungsweg?: string | null }).abrechnungsweg ?? null },
        { gutachtenAbgeschlossen: !!erstgutachtenAuftrag?.gutachten_final_freigegeben, totalschaden: null },
      )
    ) {
      // Laeuft bereits eine Empfehlung? Dann zeigt die Card statt des Finders den
      // „laeuft"-Zustand + Zurueckziehen (Spec §11) — DB-driven, kein lokaler UI-State.
      const { data: offenerBatch } = await admin
        .from('werkstatt_empfehlung_batches')
        .select('id, created_at')
        .eq('claim_id', noShowClaimId)
        .eq('status', 'offen')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      let offeneEmpfehlung: { anzahl: number; gesendetAm: string; werkstattNamen: string[] } | null = null
      if (offenerBatch) {
        const batch = offenerBatch as { id: string; created_at: string }
        const { data: eRows } = await admin
          .from('werkstatt_empfehlungen')
          .select('werkstatt_id')
          .eq('batch_id', batch.id)
        const ids = ((eRows ?? []) as Array<{ werkstatt_id: string }>).map((e) => e.werkstatt_id)
        const { data: wRows } = ids.length
          ? await admin.from('werkstaetten').select('name').in('id', ids)
          : { data: [] }
        offeneEmpfehlung = {
          anzahl: ids.length,
          gesendetAm: batch.created_at,
          werkstattNamen: ((wRows ?? []) as Array<{ name: string | null }>)
            .map((w) => w.name)
            .filter((n): n is string => !!n),
        }
      }
      // Bei laufender Empfehlung braucht die Card den Finder nicht -> Query sparen.
      let finderWerkstaetten: WerkstattFinderRow[] = []
      if (!offeneEmpfehlung) {
        // P2-T6 (Netzwerk): Owner = der Session-SV, aber nur wenn er zahlender Netzwerkpartner
        // ist (Gate am SV, Epic §1). sv.id = sachverstaendige.id (Abo-Praedikat); user.id =
        // profiles.id des SV (Graph-Knoten). Free-SV -> null -> Partition-No-op.
        const { istZahlenderNetzwerkPartner } = await import('@/lib/netzwerk/entitlement')
        const svOwnerProfilId = (await istZahlenderNetzwerkPartner(admin, (sv as { id: string }).id))
          ? user.id
          : null
        finderWerkstaetten = await findWerkstattVorschlaegeFuer({
          target: 'claim',
          id: noShowClaimId,
          nurEchte: true,
          ownerProfilId: svOwnerProfilId,
        })
      }
      werkstattVermittlung = {
        fallId: id,
        werkstaetten: finderWerkstaetten,
        offeneEmpfehlung,
      }
    }
  }

  // SV-Gutachten-Verifikation: 6 wichtigste OCR-extrahierte Werte aus claims
  // an die GutachtenCard durchreichen, damit der SV nach Upload prüfen kann
  // ob die Pipeline die Geld-Zahlen korrekt erkannt hat.
  let gutachtenWerte: {
    gutachten_datum: string | null
    reparaturkosten_netto: number | null
    reparaturkosten_brutto: number | null
    minderwert: number | null
    wiederbeschaffungswert: number | null
    restwert: number | null
    nutzungsausfall_tage: number | null
    gutachten_sv_honorar_brutto: number | null
    gutachten_nutzungsausfall_tagessatz_eur: number | null
    wiederbeschaffungsdauer_tage: number | null
    totalschaden: boolean | null
    gutachten_ocr_manuell_ueberschrieben: boolean | null
  } | null = null
  if (claimIdForStorage) {
    // Cluster F+G PR-2: Reader auf v_gutachten_werte (Dual-Source-View) statt claims direkt
    const { data: cw } = await supabase
      .from('v_gutachten_werte')
      .select(
        'gutachten_datum, reparaturkosten_netto, reparaturkosten_brutto, minderwert, wiederbeschaffungswert, restwert, nutzungsausfall_tage, gutachten_sv_honorar_brutto, gutachten_nutzungsausfall_tagessatz_eur, wiederbeschaffungsdauer_tage, totalschaden, gutachten_ocr_manuell_ueberschrieben',
      )
      .eq('claim_id', claimIdForStorage)
      .maybeSingle()
    if (cw) {
      gutachtenWerte = {
        gutachten_datum: (cw.gutachten_datum as string | null) ?? null,
        reparaturkosten_netto: cw.reparaturkosten_netto !== null ? Number(cw.reparaturkosten_netto) : null,
        reparaturkosten_brutto: cw.reparaturkosten_brutto !== null ? Number(cw.reparaturkosten_brutto) : null,
        minderwert: cw.minderwert !== null ? Number(cw.minderwert) : null,
        wiederbeschaffungswert: cw.wiederbeschaffungswert !== null ? Number(cw.wiederbeschaffungswert) : null,
        restwert: cw.restwert !== null ? Number(cw.restwert) : null,
        nutzungsausfall_tage: (cw.nutzungsausfall_tage as number | null) ?? null,
        gutachten_sv_honorar_brutto: cw.gutachten_sv_honorar_brutto !== null ? Number(cw.gutachten_sv_honorar_brutto) : null,
        gutachten_nutzungsausfall_tagessatz_eur: cw.gutachten_nutzungsausfall_tagessatz_eur !== null ? Number(cw.gutachten_nutzungsausfall_tagessatz_eur) : null,
        wiederbeschaffungsdauer_tage: cw.wiederbeschaffungsdauer_tage !== null ? Number(cw.wiederbeschaffungsdauer_tage) : null,
        totalschaden: (cw.totalschaden as boolean | null) ?? null,
        gutachten_ocr_manuell_ueberschrieben: (cw.gutachten_ocr_manuell_ueberschrieben as boolean | null) ?? null,
      }
    }
  }

  // CMM-32e: Abgelehnte Docs mit Kommentar für den SV — nur im Reject-Zustand laden.
  // SV sieht welche Dateien konkret beanstandet wurden + warum.
  let abgelehnteDocsInfo: { filename: string; kommentar: string | null }[] = []
  const erstgutachtenRejectCheck = (erstgutachtenAuftrag as { zurueckgewiesen_am?: string | null } | null)?.zurueckgewiesen_am ?? null
  if (erstgutachtenAuftrag && claimIdForStorage && erstgutachtenRejectCheck) {
    const { data: abgelehnteRows } = await admin
      .from('fall_dokumente')
      .select('original_filename, zurueckweisung_kommentar')
      .eq('fall_id', id)
      .like('storage_path', `claims/${claimIdForStorage}/gutachten/${erstgutachtenAuftrag.id}/%`)
      .not('abgelehnt_am', 'is', null)
      .is('geloescht_am', null)
      .order('abgelehnt_am', { ascending: false })
    abgelehnteDocsInfo = (abgelehnteRows ?? []).map((r) => ({
      filename: (r.original_filename as string | null) ?? 'Datei',
      kommentar: (r.zurueckweisung_kommentar as string | null) ?? null,
    }))
  }

  // CMM-32e: Abgebbare Hauptgutachten — neuere fall_dokumente als die aktuell
  // verlinkte gutachten_url. Triggert den „Abgeben"-Button im Banner.
  let abgebbareDokumenteAnzahl = 0
  if (erstgutachtenAuftrag && claimIdForStorage) {
    const cutoff = (erstgutachtenAuftrag as { updated_at?: string | null }).updated_at ?? null
    const { count } = await admin
      .from('fall_dokumente')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', id)
      .in('dokument_typ', ['gutachten', 'gutachten_anlage'])
      .like('storage_path', `claims/${claimIdForStorage}/gutachten/${erstgutachtenAuftrag.id}/%`)
      .is('geloescht_am', null)
      .gt('hochgeladen_am', cutoff ?? '1970-01-01')
    abgebbareDokumenteAnzahl = count ?? 0
  }

  // CMM-23: SV-Lifecycle-Phase aus Auftrag + Fall-State ableiten.
  const svPhase = getSvLifecyclePhase({
    terminStart: (aktiverTermin?.start_zeit as string | null) ?? null,
    terminStatus: (aktiverTermin?.status as string | null) ?? null,
    svUnterwegsSeit: (aktiverTermin?.sv_unterwegs_seit as string | null) ?? null,
    svAngekommenAm: (aktiverTermin?.sv_angekommen_am as string | null) ?? null,
    terminDurchgefuehrtAm: (aktiverTermin?.durchgefuehrt_am as string | null) ?? null,
    gutachtenEingegangenAm: (fall.gutachten_eingegangen_am as string | null) ?? null,
    // CMM-32: Wahrheit ist auftraege.gutachten_final_freigegeben (faelle hat die Spalte nicht).
    gutachtenFinalFreigegeben: erstgutachtenAuftrag?.gutachten_final_freigegeben ?? null,
    lexdriveCaseId: (fall.lexdrive_case_id as string | null) ?? null,
    technischeStellungnahmeStatus: (fall.technische_stellungnahme_status as string | null) ?? null,
    nachbesichtigungStatus: (fall.nachbesichtigung_status as string | null) ?? null,
    svHonorarEingegangenAm,
    fallStatus: (fall.status as string | null) ?? null,
  })

  // Phase C: Pflichtdokumente aus dem getClaimDetail-Bundle (oben) — identische
  // Filter-Logik + gleicher User-Client (getPflichtdokumenteForFall(supabase,…,'sv')).
  const pflichtSlots = detail.pflichtDokumente

  // SV-Vorname für Unterwegs-Banner — kommt aus profiles, nicht aus sachverstaendige
  const { data: svProfile } = await supabase
    .from('profiles')
    .select('vorname')
    .eq('id', user.id)
    .single()
  const svVorname = (svProfile?.vorname as string | null) ?? null

  // Vor-Ort-Card: phase-gated (nur wenn Termin da, noch kein Gutachten, richtiger Status)
  const hatGutachten = !!(fall.gutachten_eingegangen_am as string | null)
  const zeigeVorOrt =
    !!(fall.sv_termin as string | null) &&
    !hatGutachten &&
    ((fall.status as string | null) === 'sv-termin' || (fall.status as string | null) === 'sv-zugewiesen')
  const kundenName = lead
    ? `${(lead.vorname as string | null) ?? ''} ${(lead.nachname as string | null) ?? ''}`.trim()
    : '—'
  // CMM-32 Walkthrough: VorOrtTriggerCard fährt zum besichtigungsort.
  // schadens_*-Felder beschreiben den Unfallort (separat in Stammdaten),
  // lead.adresse die Wohnadresse — drei klar getrennte Bedeutungen.
  const besichtigungsAdresse = (fall.besichtigungsort_adresse as string | null) ?? null

  // Realer KB-Anforderungs-Wert ist 'beauftragt' (prozess.ts / process-event.ts; die
  // Stellungnahme-Seite gated ebenfalls auf 'beauftragt'). 'angefordert' existiert für
  // technische_stellungnahme_status NICHT (das ist nachbesichtigung_status) → vorher feuerte
  // der Banner nie und die #3729-„Stellungnahme einreichen"-CTA war in Prod tot. (Golden-Path-E2E)
  const stellungnahmeAktiv = (fall.technische_stellungnahme_status as string | null) === 'beauftragt'
  const nachbesichtigungAktiv =
    (fall.nachbesichtigung_status as string | null) === 'angefordert' ||
    (fall.nachbesichtigung_status as string | null) === 'termin-eingereicht'

  // CMM-32: Banner sichtbar wenn Termin durchgeführt + (kein Gutachten ODER Reject offen).
  const erstgutachtenReject = (erstgutachtenAuftrag as { zurueckgewiesen_am?: string | null } | null)?.zurueckgewiesen_am ?? null
  const erstgutachtenRejectGrund = (erstgutachtenAuftrag as { zurueckweisung_grund?: string | null } | null)?.zurueckweisung_grund ?? null
  const zeigeGutachtenUpload =
    !!erstgutachtenAuftrag &&
    !!(aktiverTermin?.durchgefuehrt_am as string | null) &&
    !erstgutachtenAuftrag.gutachten_final_freigegeben

  const topServerBlocks = (
    <>
      {/* AV3-SV: Auffahrunfall-Hinweis (Aaron 09.07.) — reiner Hinweis, KEINE SV-System-Position. */}
      {istAuffahrunfallSv && (
        <div className="rounded-2xl border-2 border-warning/30 bg-warning-soft p-4">
          <p className="text-sm font-semibold text-warning-strong">Auffahrunfall</p>
          <p className="text-xs text-warning-strong mt-1">
            Stoßfänger muss ausgebaut werden, Hebebühne benötigt. Hinweis: Hilfestellungskosten
            (Hebebühne) sind individuell mit der Werkstatt auszuhandeln — keine Position im Gutachten.
          </p>
        </div>
      )}
      {/* AAR-Followup (SV-Lead-Ablehnung): Lead-Ablehnen-Card nur in
          sv-zugewiesen + sv-termin sichtbar (Component intern gegated). */}
      <LeadAblehnenCard fallId={id} status={fall.status as string | null} />
      {/* CMM-44 SP-I2 Task 5: Kanzlei-Mandat (mandatsnummer) — read-only fuer den SV. */}
      {svMandatsnummer && (
        <div className="rounded-ios-xl bg-claimondo-bg px-4 py-3">
          <p className="text-xs text-claimondo-ondo">Kanzlei-Mandat</p>
          <p className="text-sm font-semibold text-claimondo-navy">{svMandatsnummer}</p>
        </div>
      )}
      {/* CMM-32 Walkthrough Polish: Termin-Status-Warnbanner (server-side berechnet). */}
      {aktiverTerminVerstrichen && (
        <div className="rounded-2xl border-2 border-danger/30 bg-danger-soft p-4">
          <p className="text-sm font-semibold text-danger-strong">Termin verstrichen</p>
          <p className="text-xs text-danger-strong mt-1">
            Der bestätigte Besichtigungstermin liegt in der Vergangenheit und wurde nicht abgehakt.
            Bitte den Status aktualisieren (durchgeführt / Kunde nicht erschienen) oder einen neuen Termin vereinbaren.
          </p>
        </div>
      )}
      {/* Kunde hat den Termin selbst verlegt — gelb bis zum nächsten Aufruf der
          Fallakte (auto-gesehen-Mechanik, Quelle: gutachter_termine.verlegung_initiator_kunde). */}
      {hatNeueKundeVerlegung && (
        <div className="rounded-2xl border-2 border-warning/30 bg-warning-soft p-4">
          <p className="text-sm font-semibold text-warning-strong">Termin durch Kunde verschoben</p>
          <p className="text-xs text-warning-strong mt-1">
            Der Kunde hat den Termin selbst verlegt. Keine Bestätigung von dir nötig — der neue Slot ist bereits aktiv.
            Diese Markierung verschwindet beim nächsten Aufruf der Fallakte.
          </p>
        </div>
      )}
      {/* No-Show-Hinweis (claims.kunde_no_show_count). */}
      {noShowCount > 0 && (
        <div className="rounded-2xl border-2 border-danger/30 bg-danger-soft p-4">
          <p className="text-sm font-semibold text-danger-strong">
            {noShowCount === 1 ? 'Termin wurde verpasst' : `${noShowCount} Termine wurden verpasst`}
          </p>
          <p className="text-xs text-danger-strong mt-1">
            Der Kunde war beim letzten Termin nicht vor Ort und hat keinen Bescheid gegeben. Plane Puffer für den
            Folgetermin ein und stimme dich ggf. mit dem Kundenbetreuer ab.
          </p>
        </div>
      )}
      {/* CMM-32: Gutachten-Upload-Banner — sichtbar nach Besichtigung, vor QC */}
      {zeigeGutachtenUpload && erstgutachtenAuftrag && (
        <GutachtenUploadBanner
          auftragId={erstgutachtenAuftrag.id}
          claimId={claimIdForStorage}
          hatGutachten={!!erstgutachtenAuftrag.gutachten_url}
          zurueckgewiesenAm={erstgutachtenReject}
          zurueckweisungGrund={erstgutachtenRejectGrund}
          abgebbareDokumenteAnzahl={abgebbareDokumenteAnzahl}
          abgelehnteDocsInfo={abgelehnteDocsInfo}
        />
      )}
      {/* CMM-32 Walkthrough: Briefing + Einzuholen sind jetzt im
          AuftragHeaderPanel verschmolzen. Die „Bin angekommen"-Card wandert
          ans Ende der Seite (Aaron-Spec) — wird via vorOrtCard-Prop unten
          angehängt, nicht hier in topServerBlocks. */}
      {stellungnahmeAktiv && (
        <div className="rounded-2xl border-2 border-warning/30 bg-warning-soft p-4">
          <p className="text-sm font-semibold text-warning-strong">Stellungnahme angefordert</p>
          <p className="text-xs text-warning-strong mt-1">
            Der Kundenbetreuer bittet um eine technische Stellungnahme zu diesem Fall.
            Stimme dich bei Bedarf über den Chat mit dem Betreuer ab und reiche deine
            Stellungnahme anschließend hier ein.
          </p>
          <Link
            href={`/gutachter/fall/${id}/stellungnahme`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-ios-lg bg-claimondo-navy px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Stellungnahme einreichen →
          </Link>
        </div>
      )}
      {nachbesichtigungAktiv && (
        <div className="rounded-2xl border-2 border-claimondo-ondo/50 bg-claimondo-ondo/[0.06] p-4">
          <p className="text-sm font-semibold text-claimondo-navy">Nachbesichtigung mit dem Kunden</p>
          <p className="text-xs text-claimondo-navy mt-1">
            Eine erneute Besichtigung ist angefordert. Termin wird mit dem Kunden gemeinsam geplant.
          </p>
        </div>
      )}
      {isFallPhase(svPhase) && (
        <MeinFallStatusCard
          phase={svPhase}
          geforderterBetrag={(fall.gutachten_betrag as number | null) ?? null}
          gutachtenUrl={erstgutachtenAuftrag?.gutachten_url ?? null}
          gutachtenFreigegebenAm={(fall.gutachten_eingegangen_am as string | null) ?? null}
          lexdriveCaseId={(fall.lexdrive_case_id as string | null) ?? null}
          svHonorarBetrag={svHonorarBetrag}
          svHonorarEingegangenAm={svHonorarEingegangenAm}
          svHonorarVerdient={gutachtenWerte?.gutachten_sv_honorar_brutto ?? null}
        />
      )}
      {werkstattVermittlung && (
        <WerkstattEmpfehlenCard
          fallId={werkstattVermittlung.fallId}
          werkstaetten={werkstattVermittlung.werkstaetten}
          offeneEmpfehlung={werkstattVermittlung.offeneEmpfehlung}
        />
      )}
      {anspruchVorschau && <AnspruchVorschauCard vorschau={anspruchVorschau} />}
      {/* Zustandsdoku-Vorzustand (Read-only): letzter FM-Scan des Fahrzeugs — Fotos +
          Qualitaets-Ampel + Vorschaeden. Null-safe: die Galerie rendert nichts ohne Scan. */}
      <VehicleScanGalerie scan={vehicleScan} />
    </>
  )

  return (
    <FallDetailClient
      topServerBlocks={topServerBlocks}
      vorOrtCard={
        zeigeVorOrt ? (
          <VorOrtTriggerCard
            aktiverTerminId={aktiverTermin?.id ?? null}
            adresse={besichtigungsAdresse}
          />
        ) : null
      }
      pflichtSlots={pflichtSlots}
      svPhase={svPhase}
      gutachtenInQc={!!erstgutachtenAuftrag?.gutachten_url && !erstgutachtenAuftrag?.gutachten_final_freigegeben && !erstgutachtenReject}
      fall={fallWithAbrechnung}
      lead={lead}
      dokumente={dokumenteLegacy}
      pflichtdokumente={(pflichtdokumente ?? []) as unknown as Parameters<typeof FallDetailClient>[0]['pflichtdokumente']}
      parteien={parteien ?? []}
      timeline={(timeline ?? []) as unknown as Parameters<typeof FallDetailClient>[0]['timeline']}
      nachrichten={nachrichten ?? []}
      kundenbetreuer={kundenbetreuer}
      kanzlei={kanzlei}
      currentUserId={user.id}
      aktiverTermin={aktiverTermin as unknown as Parameters<typeof FallDetailClient>[0]['aktiverTermin']}
      fallDokumente={fallDokumente}
      kuerzungen={kuerzungen}
      abrechnungAusgezahltAm={null}
      konfrontationGewuenscht={konfrontationGewuenscht}
      konfrontationTerminVereinbartAm={konfrontationTerminVereinbartAm}
      konfrontationTerminVorschlaege={terminVorschlaege}
      svId={(sv as { id: string }).id}
      svVorname={svVorname}
      gutachtenWerte={gutachtenWerte}
    />
  )
}
