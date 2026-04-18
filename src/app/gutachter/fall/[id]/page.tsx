import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect, notFound } from 'next/navigation'
import FallDetailClient from './FallDetailClient'
// AAR-327: Katalog-Slots die der SV anfordern darf + bestehende Anforderungen
import { getAlleSlots } from '@/lib/dokumente/katalog'

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
  const { data: fall } = await supabase
    .from('faelle')
    .select('*')
    .eq('id', id)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) notFound()

  // Fetch all related data in parallel
  const [
    { data: lead },
    { data: dokumente },
    { data: pflichtdokumente },
    { data: parteien },
    { data: timeline },
    { data: abrechnung },
    { data: nachrichten },
  ] = await Promise.all([
    fall.lead_id
      ? supabase
          .from('leads')
          // AAR-311: vorschaden_* + cardentity_abfrage_am für Typ-B-Button in StammdatenCard
          // AAR-545 Cluster D: eigene_versicherung + eigene_policennr für "Eigene
          // Versicherung"-Block (früher faelle.versicherung_name / _schaden_nr).
          .select('vorname, nachname, email, telefon, fin, vorschaden_typ_b_bericht, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, cardentity_abfrage_am, eigene_versicherung, eigene_policennr')
          .eq('id', fall.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, datei_groesse, kategorie, quelle, sichtbar_fuer, hochgeladen_von_rolle, created_at')
      .eq('fall_id', id)
      .contains('sichtbar_fuer', ['sachverstaendiger'])
      .order('created_at'),
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

  // KFZ-134: Aktiven gutachter_termine Eintrag laden
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data: aktiverTermin } = await admin
    .from('gutachter_termine')
    .select('id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund')
    .eq('fall_id', id)
    .eq('sv_id', sv.id)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
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

  return (
    <FallDetailClient
      fall={fallWithAbrechnung}
      lead={lead}
      dokumente={dokumente ?? []}
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
    />
  )
}
