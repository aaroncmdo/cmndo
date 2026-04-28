import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
import { getSvLifecyclePhase, isFallPhase } from '@/lib/auftrag/phase'
// SV-Briefing — wandert aus der Sidebar nach oben unter den gelben Banner.
import BriefingCard from '@/components/fall/BriefingCard'
// CMM-23: Pflichtdokumente-Liste mit Download-Links — ersetzt den
// gelben "Noch einzuholen"-Banner als Single-Source der Pflicht-Doku-Sicht.
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
// AAR-327: Katalog-Slots die der SV anfordern darf + bestehende Anforderungen
import { getAlleSlots } from '@/lib/dokumente/katalog'
// AAR-651: Zentrale Fall-Loader-Lib
import { getFallForSv } from '@/lib/fall/queries'

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

  // Fetch case and verify sv_id match
  // AAR-651: Zentrale Lib — sv_id-Filter als Defense-in-Depth über RLS hinaus
  const fall = await getFallForSv(supabase, id, (sv as { id: string }).id)
  if (!fall) notFound()

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

  // AAR-724: Alle ungesehenen Termine dieses Falls auf „gesehen" setzen
  // sobald der SV die Fallakte öffnet. Best-effort, Fehler nicht blockend.
  try {
    await supabase
      .from('gutachter_termine')
      .update({ gesehen_am: new Date().toISOString() })
      .eq('fall_id', id)
      .eq('sv_id', (sv as { id: string }).id)
      .is('gesehen_am', null)
  } catch (err) {
    console.error('[AAR-724] auto-mark-seen gutachter_termine failed:', err)
  }

  // Fetch all related data in parallel
  const [
    { data: lead },
    { data: dokumente },
    { data: pflichtdokumente },
    { data: parteien },
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
      .contains('sichtbar_fuer', ['sachverstaendiger'])
      .order('hochgeladen_am'),
    supabase
      .from('pflichtdokumente')
      // AAR-327: zusätzlich angefordert_* + begruendung + frist für
      // AnforderungenListe (SV sieht seine eigenen Anforderungen).
      .select('id, dokument_typ, status, pflicht, quelle, dokument_url, hochgeladen_am, created_at, angefordert_von_rolle, angefordert_von_user_id, angefordert_am, begruendung, frist')
      .eq('fall_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at'),
    supabase
      .from('parteien')
      .select('id, rolle, name, versicherung_name, versicherung_nr, telefon, email')
      .eq('fall_id', id),
    supabase
      .from('timeline')
      .select('id, typ, titel, beschreibung, erstellt_von, metadata, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('gutachter_abrechnungen')
      .select('leadpreis, preistyp, abgerechnet_am, schadenhoehe')
      .eq('fall_id', id)
      .eq('sv_id', sv.id)
      .maybeSingle(),
    supabase
      .from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .eq('kanal', 'chat_kunde_sv')
      .order('created_at', { ascending: true }),
    // AAR-559 (C10): SV-View mit Column-Filter (C8/AAR-557) — liefert nur
    // SV-relevante Felder: SV-Honorar, Konfrontations-Wunsch + Kunden-Slots.
    // Niemals auszahlung_kunde_betrag oder regulierung_betrag sichtbar.
    supabase
      .from('faelle_sv_view')
      .select(
        'auszahlung_gutachter_betrag, auszahlung_gutachter_eingegangen_am, nachbesichtigung_sv_konfrontation_gewuenscht, nachbesichtigung_sv_termin_vereinbart_am, nachbesichtigung_kunde_termin_vorschlaege',
      )
      .eq('id', id)
      .maybeSingle(),
  ])

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

  // Attach leadpreis to fall object for display
  const fallWithAbrechnung = {
    ...fall,
    _leadpreis: abrechnung?.leadpreis ? Number(abrechnung.leadpreis) : null,
    _preistyp: abrechnung?.preistyp ?? null,
  }

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
    const { data: fp } = await supabase
      .from('forderungspositionen')
      .select('id, typ, bezeichnung, betrag_gefordert, betrag_reguliert, betrag_gekuerzt')
      .eq('fall_id', id)
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

  // KFZ-129: Chat-Teilnehmer laden
  const { getChatTeilnehmer } = await import('@/lib/chatGruppe')
  const chatTeilnehmer = await getChatTeilnehmer(id)

  // AAR-291: Tasks für SV initial laden (Hook refresht via Realtime)
  const { data: tasksInitial } = await supabase
    .from('tasks')
    .select(
      'id, fall_id, task_typ, titel, beschreibung, status, prioritaet, faellig_am, empfaenger_rolle, created_at, erledigt_am',
    )
    .eq('fall_id', id)
    .in('empfaenger_rolle', ['gutachter', 'sachverstaendiger'])
    .in('status', ['offen', 'in-bearbeitung'])
    .order('prioritaet', { ascending: false })
    .order('faellig_am', { ascending: true, nullsFirst: false })

  // KFZ-134: Aktiven gutachter_termine Eintrag laden (admin-client bereits oben)
  // CMM-23: zusätzlich kunde_losgefahren_am, kunde_angekommen_am und
  // durchgefuehrt_am für die Phasen-Bestimmung.
  const { data: aktiverTermin } = await admin
    .from('gutachter_termine')
    .select('id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, kunde_losgefahren_am, kunde_angekommen_am, durchgefuehrt_am')
    .eq('fall_id', id)
    .eq('sv_id', sv.id)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt', 'durchgefuehrt'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // AAR-327: Katalog-Slots für Dokument-Anforderung (rolle=sachverstaendiger).
  // Cachelayer: getAlleSlots dedupliziert intern (TTL 5 min), daher ist der
  // zweite Call praktisch kostenlos.
  const katalogAlleSlots = await getAlleSlots(supabase)
  const anforderbareSlots = katalogAlleSlots
    .filter((s) => s.anforderbar_von.includes('sachverstaendiger'))
    .map((s) => ({
      slot_id: s.slot_id,
      label: s.label,
      beschreibung: s.beschreibung,
      kategorie: s.kategorie as string,
    }))
  const katalogLabels = new Map(katalogAlleSlots.map((s) => [s.slot_id, s.label]))

  type PflichtRow = {
    id: string
    dokument_typ: string
    status: string
    frist: string | null
    begruendung: string | null
    angefordert_am: string | null
    angefordert_von_user_id: string | null
  }
  const anforderungenVonMir = ((pflichtdokumente ?? []) as unknown as PflichtRow[])
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

  // AAR-399: SV-uploadbare Katalog-Slots + bestehende pflichtdokumente-Status
  // zu einer SlotRow-Liste mergen für die DokumenteUebersichtCard (DnD-Upload).
  type PflichtRowFull = {
    id: string
    dokument_typ: string
    status: string | null
    pflicht: boolean | null
    dokument_url: string | null
    hochgeladen_am: string | null
  }
  const pflichtFull = (pflichtdokumente ?? []) as unknown as PflichtRowFull[]
  type SvSlotStatus =
    | 'ausstehend'
    | 'hochgeladen'
    | 'geprueft'
    | 'abgelehnt'
    | 'nachgereicht_angefordert'
    | 'optional'
  const svSlots = katalogAlleSlots
    .filter((s) => s.uploadbar_von.includes('sachverstaendiger'))
    .map((s) => {
      const match = pflichtFull.find((r) => r.dokument_typ === s.slot_id)
      const rawStatus = match?.status ?? 'ausstehend'
      const status: SvSlotStatus = (
        ['ausstehend', 'hochgeladen', 'geprueft', 'abgelehnt', 'nachgereicht_angefordert', 'optional'].includes(
          rawStatus,
        )
          ? rawStatus
          : 'ausstehend'
      ) as SvSlotStatus
      return {
        id: match?.id ?? null,
        slotId: s.slot_id,
        label: s.label,
        beschreibung: s.beschreibung,
        istPflicht: match?.pflicht ?? false,
        status,
        currentFile: match?.dokument_url
          ? { name: s.label, url: match.dokument_url, size: null }
          : null,
      }
    })

  // AAR-553: fall_dokumente → Legacy-Shape für FallDetailClient-Konsumenten
  const dokumenteLegacy = (dokumente ?? []).map(d => ({
    id: d.id as string,
    typ: (d.dokument_typ as string | null) ?? null,
    datei_url: d.storage_path
      ? supabase.storage.from('fall-dokumente').getPublicUrl(d.storage_path as string).data.publicUrl
      : null,
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
  }))

  // AAR-559 (C10): SV-View-Felder für SvHonorarCard + KonfrontationsTerminCard.
  // terminVorschlaege kommt als JSONB — auf {datum, uhrzeit}-Array normalisieren.
  const svHonorarBetrag = svView?.auszahlung_gutachter_betrag != null
    ? Number(svView.auszahlung_gutachter_betrag as number)
    : null
  const svHonorarEingegangenAm = (svView?.auszahlung_gutachter_eingegangen_am as string | null) ?? null
  const konfrontationGewuenscht = !!svView?.nachbesichtigung_sv_konfrontation_gewuenscht
  const konfrontationTerminVereinbartAm =
    (svView?.nachbesichtigung_sv_termin_vereinbart_am as string | null) ?? null
  const terminVorschlaegeRaw = svView?.nachbesichtigung_kunde_termin_vorschlaege
  const terminVorschlaege = Array.isArray(terminVorschlaegeRaw)
    ? (terminVorschlaegeRaw as Array<{ datum: string; uhrzeit: string }>).filter(
        (s) => s && typeof s.datum === 'string' && typeof s.uhrzeit === 'string',
      )
    : null

  // CMM-23: SV-Lifecycle-Phase aus Auftrag + Fall-State ableiten.
  const svPhase = getSvLifecyclePhase({
    terminStart: (aktiverTermin?.start_zeit as string | null) ?? null,
    terminStatus: (aktiverTermin?.status as string | null) ?? null,
    svUnterwegsSeit: (aktiverTermin?.kunde_losgefahren_am as string | null) ?? null,
    svAngekommenAm: (aktiverTermin?.kunde_angekommen_am as string | null) ?? null,
    terminDurchgefuehrtAm: (aktiverTermin?.durchgefuehrt_am as string | null) ?? null,
    gutachtenEingegangenAm: (fall.gutachten_eingegangen_am as string | null) ?? null,
    gutachtenFinalFreigegeben: (fall.gutachten_final_freigegeben as boolean | null) ?? null,
    lexdriveCaseId: (fall.lexdrive_case_id as string | null) ?? null,
    technischeStellungnahmeStatus: (fall.technische_stellungnahme_status as string | null) ?? null,
    nachbesichtigungStatus: (fall.nachbesichtigung_status as string | null) ?? null,
    svHonorarEingegangenAm,
    fallStatus: (fall.status as string | null) ?? null,
  })

  // CMM-23: Pflichtdokumente-Liste laden — 1:1 das was der Kunde im
  // Onboarding sieht, mit Download-Links für hochgeladene Files.
  const pflichtSlots = await getPflichtdokumenteForFall(supabase, id, 'sv')

  // CMM-23: Top-Server-Blocks. Aaron-Reihenfolge: Header → gelber Banner
  // (Kunde-Anforderungen) → SV-Briefing → MeinFallStatusCard (wenn Fall-
  // Phase). Stepper wandert in die linke Sidebar.
  // Mitteilungen für SV: NUR Stellungnahme + Nachbesichtigung sind
  // tagesgeschäft-relevant — die rendern wir hier oben mit (wenn
  // angefordert), alles andere ist KB/Admin-only.
  const stellungnahmeAktiv = (fall.technische_stellungnahme_status as string | null) === 'angefordert'
  const nachbesichtigungAktiv =
    (fall.nachbesichtigung_status as string | null) === 'angefordert' ||
    (fall.nachbesichtigung_status as string | null) === 'termin-eingereicht'

  const topServerBlocks = (
    <>
      {/* CMM-33: PflichtdokumenteSection wandert nach unten rechts in die
         „zentrale Dokumente-Sektion" (siehe FallDetailClient) — oben bleibt
         nur Briefing + Phase-/Mitteilungs-Banner. */}
      <BriefingCard
        fallId={id}
        briefing={(fall.sv_briefing_text as string | null) ?? null}
        generatedAt={(fall.sv_briefing_generated_at as string | null) ?? null}
        model={(fall.sv_briefing_model as string | null) ?? null}
        version={(fall.sv_briefing_version as number | null) ?? null}
        canRegenerate={false}
      />
      {stellungnahmeAktiv && (
        <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-900">Stellungnahme angefordert</p>
          <p className="text-xs text-orange-800 mt-1">
            Der Kundenbetreuer bittet um eine technische Stellungnahme zu diesem Fall.
            Bitte über den Chat mit dem Betreuer abstimmen.
          </p>
        </div>
      )}
      {nachbesichtigungAktiv && (
        <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-4">
          <p className="text-sm font-semibold text-violet-900">Nachbesichtigung mit dem Kunden</p>
          <p className="text-xs text-violet-800 mt-1">
            Eine erneute Besichtigung ist angefordert. Termin wird mit dem Kunden gemeinsam geplant.
          </p>
        </div>
      )}
      {isFallPhase(svPhase) && (
        <MeinFallStatusCard
          phase={svPhase}
          geforderterBetrag={(fall.gutachten_betrag as number | null) ?? null}
          gutachtenUrl={(fall.gutachten_url as string | null) ?? null}
          gutachtenFreigegebenAm={(fall.gutachten_freigabe_am as string | null) ?? (fall.gutachten_eingegangen_am as string | null) ?? null}
          lexdriveCaseId={(fall.lexdrive_case_id as string | null) ?? null}
          svHonorarBetrag={svHonorarBetrag}
          svHonorarEingegangenAm={svHonorarEingegangenAm}
        />
      )}
    </>
  )

  return (
    <FallDetailClient
      topServerBlocks={topServerBlocks}
      pflichtSlots={pflichtSlots}
      svPhase={svPhase}
      fall={fallWithAbrechnung}
      lead={lead}
      dokumente={dokumenteLegacy}
      pflichtdokumente={(pflichtdokumente ?? []) as unknown as Parameters<typeof FallDetailClient>[0]['pflichtdokumente']}
      anforderbareSlots={anforderbareSlots}
      anforderungenVonMir={anforderungenVonMir}
      svSlots={svSlots}
      parteien={parteien ?? []}
      timeline={(timeline ?? []) as unknown as Parameters<typeof FallDetailClient>[0]['timeline']}
      nachrichten={nachrichten ?? []}
      kundenbetreuer={kundenbetreuer}
      chatTeilnehmer={chatTeilnehmer}
      aktiverTermin={aktiverTermin}
      fallDokumente={fallDokumente}
      kuerzungen={kuerzungen}
      abrechnungAusgezahltAm={(abrechnung as { abgerechnet_am?: string | null } | null)?.abgerechnet_am ?? null}
      tasks={(tasksInitial ?? []) as Parameters<typeof FallDetailClient>[0]['tasks']}
      abrechnung={
        abrechnung
          ? {
              honorar: (fall as { gutachten_betrag?: number | null }).gutachten_betrag
                ? Number((fall as { gutachten_betrag?: number | null }).gutachten_betrag)
                : null,
              leadpreis: abrechnung.leadpreis ? Number(abrechnung.leadpreis) : null,
              preistyp: abrechnung.preistyp ?? null,
              abgerechnetAm: (abrechnung as { abgerechnet_am?: string | null }).abgerechnet_am ?? null,
            }
          : null
      }
      svHonorarBetrag={svHonorarBetrag}
      svHonorarEingegangenAm={svHonorarEingegangenAm}
      konfrontationGewuenscht={konfrontationGewuenscht}
      konfrontationTerminVereinbartAm={konfrontationTerminVereinbartAm}
      konfrontationTerminVorschlaege={terminVorschlaege}
    />
  )
}
