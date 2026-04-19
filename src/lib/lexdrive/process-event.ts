// AAR-108: Shared LexDrive-Event Processor für Webhook + manuelle Trigger.
// AAR-540 (C3): Erweitert um 10 neue Events (Endpoint-Register), user_id-
// Propagation bei manuellen Triggern (aus AAR-557 C8), Cross-Portal-
// Mitteilungen (vs_eskalation_kontakt_ergebnis) und Rollen-gefilterte
// Auszahlungs-Mitteilungen.
import { createAdminClient } from '@/lib/supabase/admin'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { createMitteilung, createMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'

export const VALID_LEXDRIVE_EVENTS = [
  // Legacy-Events (Original AAR-108)
  'vollmacht_bestaetigt', 'akte_eingegangen_bestaetigt',
  'mandatsnummer_vergeben',
  'as_versendet', 'mahnung_versendet',
  'vs_kuerzt', 'ruege_1_gesendet', 'ruege_1_anerkannt',
  'ruege_2_gesendet', 'ruege_2_anerkannt', 'ruege_abgelehnt',
  'vs_reguliert_voll', 'vs_fristverlaengerung',
  'vs_nachbesichtigung', 'vs_ablehnung',
  'klage_eingereicht', 'regulierung_angekuendigt',
  'zahlung_eingegangen',
  'technische_stellungnahme_benoetigt',
  'vs_nachbesichtigung_angefordert', 'vs_nachbesichtigung_ergebnis',
  'fall_geschlossen',
  // AAR-540 (C3) Erweiterung 19.04.2026 — 10 neue Events
  'vs_quotiert',
  'vs_quote_akzeptiert',
  'kb_filmcheck_bestanden',
  'vs_eskalation_kontakt_ergebnis',
  'auszahlung_split_eingegangen',
  'kunde_nachbesichtigung_termine_eingereicht',
  'sv_stellungnahme_eingereicht',
  'sv_konfrontation_bestaetigt',
  'sv_konfrontation_abgelehnt',
  'sv_konfrontation_anfrage_versendet',
  'manual_status_override',
] as const

export type LexDriveEvent = typeof VALID_LEXDRIVE_EVENTS[number]

export interface LexDriveEventPayload {
  datum?: string
  betrag?: number
  grund?: string
  kuerzungs_betrag?: number
  anerkannt_betrag?: number
  frist_bis?: string
  zahlungsweg?: string
  beschreibung?: string
  // AAR-540: vs_kuerzt Erweiterung
  vs_kuerzungs_typ?: 'technisch' | 'argumentativ' | 'gemischt'
  // AAR-540: vs_quotiert / vs_quote_akzeptiert
  vs_quote_prozent?: number
  vs_quote_grund?: string
  geforderte_summe?: number
  akzeptiert_am?: string
  notizen?: string
  // AAR-540: kb_filmcheck_bestanden
  filmcheck_am?: string
  filmcheck_von?: string
  qc_checkpoints_bestanden?: number
  qc_checkpoints_gesamt?: number
  filmcheck_notizen?: string
  // AAR-540: vs_eskalation_kontakt_ergebnis
  eskalation_stufe?: 'tag14' | 'tag21' | 'tag28'
  ergebnis?: string
  ergebnis_am?: string
  ergebnis_von_user_id?: string
  naechste_aktion?: 'warten' | 'erneut_kontaktieren' | 'eskalieren'
  // AAR-540: auszahlung_split_eingegangen
  auszahlung_kunde_betrag?: number
  auszahlung_kunde_eingegangen_am?: string
  auszahlung_gutachter_eingegangen_am?: string
  vs_referenznummer?: string
  // AAR-540: kunde_nachbesichtigung_termine_eingereicht
  termin_vorschlaege?: Array<{ datum: string; uhrzeit: string }>
  sv_konfrontation_gewuenscht?: boolean
  eingereicht_am?: string
  // AAR-540: sv_stellungnahme_eingereicht
  upload_url?: string
  notiz_sv?: string
  // AAR-540: sv_konfrontation_bestaetigt / abgelehnt
  bestaetigt_am?: string
  abgelehnt_am?: string
  // AAR-540: manual_status_override (siehe AAR-560)
  neuer_status?: string
  override_grund?: string
  // AAR-540: Nachbesichtigung Legacy-Felder
  nachbesichtigung_termin?: string
  konfrontation?: boolean
  // AAR-540: ruege_counter (für unified ruege_versendet)
  ruege_counter?: number
  // AAR-540: mandatsnummer Payload
  mandats_nr?: string
  mandatsnummer?: string
  [k: string]: unknown
}

export interface ProcessEventInput {
  fallId: string
  fallNr: string
  eventType: LexDriveEvent
  payload: LexDriveEventPayload
  externalEventId: string | null
  source: 'webhook' | 'manual'
  triggeredByProfileId?: string
}

export interface ProcessEventResult {
  success: boolean
  skipped?: boolean
  error?: string
  eventRecordId?: string
}

const EVENT_COMM_MAP: Partial<Record<LexDriveEvent, string>> = {
  as_versendet: 'as_gesendet',
  vs_reguliert_voll: 'regulierung_angekuendigt',
  regulierung_angekuendigt: 'regulierung_angekuendigt',
  zahlung_eingegangen: 'zahlung_eingegangen',
  vs_kuerzt: 'kuerzung_eingetragen',
  // AAR-540: neue Events
  vs_quotiert: 'vs_quotiert',
  kb_filmcheck_bestanden: 'filmcheck_bestanden',
}

const EVENT_STATUS_MAP: Partial<Record<LexDriveEvent, string>> = {
  as_versendet: 'anschlussschreiben',
  vs_reguliert_voll: 'regulierung-laeuft',
  regulierung_angekuendigt: 'regulierung-laeuft',
  zahlung_eingegangen: 'zahlung-eingegangen',
  vs_ablehnung: 'vs-abgelehnt',
  vs_kuerzt: 'vs-kuerzt',
  vs_nachbesichtigung: 'nachbesichtigung-laeuft',
  vs_nachbesichtigung_angefordert: 'nachbesichtigung-laeuft',
  klage_eingereicht: 'klage',
  fall_geschlossen: 'abgeschlossen',
  // AAR-540
  vs_quotiert: 'vs-kuerzt', // Quote = Sonderfall Kürzung
  vs_quote_akzeptiert: 'regulierung-laeuft',
  auszahlung_split_eingegangen: 'zahlung-eingegangen',
}

function computeFieldUpdates(eventType: LexDriveEvent, payload: LexDriveEventPayload): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  const now = new Date().toISOString()

  if (eventType === 'as_versendet') {
    updates.anschlussschreiben_am = payload.datum ?? now
  }
  if (eventType === 'vs_kuerzt') {
    updates.vs_reaktion_typ = 'gekuerzt'
    updates.vs_reaktion_am = payload.datum ?? now
    if (payload.kuerzungs_betrag) updates.kuerzungs_betrag = Number(payload.kuerzungs_betrag)
    if (payload.anerkannt_betrag) updates.regulierung_betrag = Number(payload.anerkannt_betrag)
    if (payload.grund) updates.vs_kuerzung_grund = payload.grund
    // AAR-540: vs_kuerzungs_typ als Pflichtfeld
    if (payload.vs_kuerzungs_typ) updates.vs_kuerzungs_typ = payload.vs_kuerzungs_typ
  }
  if (eventType === 'vs_reguliert_voll') {
    updates.vs_reaktion_typ = 'voll_reguliert'
    updates.vs_reaktion_am = payload.datum ?? now
    if (payload.betrag) updates.regulierung_betrag = Number(payload.betrag)
  }
  if (eventType === 'vs_ablehnung') {
    updates.vs_reaktion_typ = 'abgelehnt'
    updates.vs_reaktion_am = payload.datum ?? now
    if (payload.grund) updates.vs_ablehnungsgrund = payload.grund
  }
  if (eventType === 'vs_fristverlaengerung') {
    updates.vs_reaktion_typ = 'mehr_zeit'
    updates.vs_reaktion_am = now
    if (payload.frist_bis) updates.vs_frist_bis = payload.frist_bis
  }
  if (eventType === 'vs_nachbesichtigung' || eventType === 'vs_nachbesichtigung_angefordert') {
    updates.vs_reaktion_typ = 'nachbesichtigung'
    updates.nachbesichtigung_status = 'angefordert'
    updates.nachbesichtigung_angefordert_am = payload.datum ?? now
    if (payload.nachbesichtigung_termin) {
      updates.nachbesichtigung_termin_datum = payload.nachbesichtigung_termin
    }
    if (typeof payload.konfrontation === 'boolean') {
      updates.nachbesichtigung_konfrontation = payload.konfrontation
    }
  }
  if (eventType === 'vs_nachbesichtigung_ergebnis') {
    updates.nachbesichtigung_status = 'ergebnis-eingegangen'
    if (payload.beschreibung) updates.nachbesichtigung_ergebnis = payload.beschreibung
    if (payload.grund) updates.nachbesichtigung_ergebnis = payload.grund
    if (payload.betrag) updates.regulierung_betrag = Number(payload.betrag)
  }
  if (eventType === 'zahlung_eingegangen') {
    updates.zahlung_eingegangen_am = payload.datum ?? now
    if (payload.betrag) updates.zahlung_betrag = Number(payload.betrag)
    if (payload.zahlungsweg) updates.zahlungsweg = payload.zahlungsweg
  }
  if (eventType === 'ruege_1_gesendet' || eventType === 'ruege_2_gesendet') {
    updates.ruege_gesendet_am = payload.datum ?? now
    updates.ruege_counter = eventType === 'ruege_1_gesendet' ? 1 : 2
  }
  if (eventType === 'technische_stellungnahme_benoetigt') {
    updates.technische_stellungnahme_status = 'beauftragt'
    updates.technische_stellungnahme_beauftragt_am = now
  }
  if (eventType === 'mandatsnummer_vergeben') {
    if (typeof payload.mandats_nr === 'string') {
      updates.mandatsnummer = payload.mandats_nr
      updates.as_salesforce_id = payload.mandats_nr
    } else if (typeof payload.mandatsnummer === 'string') {
      updates.mandatsnummer = payload.mandatsnummer
      updates.as_salesforce_id = payload.mandatsnummer
    }
  }
  if (eventType === 'fall_geschlossen') {
    updates.abgeschlossen_am = payload.datum ?? now
    if (typeof payload.grund === 'string') {
      updates.geschlossen_grund = payload.grund
    }
  }

  // AAR-540: Neue Events ----------------------------------------------------
  if (eventType === 'vs_quotiert') {
    updates.vs_reaktion_typ = 'quotiert'
    updates.vs_reaktion_am = payload.datum ?? now
    if (typeof payload.vs_quote_prozent === 'number') {
      updates.vs_quote_prozent = payload.vs_quote_prozent
    }
    if (typeof payload.vs_quote_grund === 'string') {
      updates.vs_quote_grund = payload.vs_quote_grund
    }
  }
  if (eventType === 'vs_quote_akzeptiert') {
    updates.vs_quote_akzeptiert_am = payload.akzeptiert_am ?? now
  }
  if (eventType === 'kb_filmcheck_bestanden') {
    updates.filmcheck_ok = true
    updates.filmcheck_am = payload.filmcheck_am ?? now
    updates.kanzlei_uebergeben_am = now
  }
  if (eventType === 'vs_eskalation_kontakt_ergebnis') {
    const stufe = payload.eskalation_stufe
    if (stufe === 'tag14' || stufe === 'tag21' || stufe === 'tag28') {
      const tagKey = stufe === 'tag14' ? '14' : stufe === 'tag21' ? '21' : '28'
      if (payload.ergebnis) {
        updates[`eskalation_tag_${tagKey}_ergebnis`] = payload.ergebnis
      }
      updates[`eskalation_tag_${tagKey}_ergebnis_am`] = payload.ergebnis_am ?? now
      if (payload.ergebnis_von_user_id) {
        updates[`eskalation_tag_${tagKey}_ergebnis_von`] = payload.ergebnis_von_user_id
      }
    }
  }
  if (eventType === 'auszahlung_split_eingegangen') {
    if (typeof payload.auszahlung_kunde_betrag === 'number') {
      updates.auszahlung_kunde_betrag = payload.auszahlung_kunde_betrag
    }
    if (payload.auszahlung_kunde_eingegangen_am) {
      updates.auszahlung_kunde_eingegangen_am = payload.auszahlung_kunde_eingegangen_am
    }
    if (payload.auszahlung_gutachter_eingegangen_am) {
      updates.auszahlung_gutachter_eingegangen_am = payload.auszahlung_gutachter_eingegangen_am
    }
    if (payload.zahlungsweg) updates.zahlungsweg = payload.zahlungsweg
  }
  if (eventType === 'kunde_nachbesichtigung_termine_eingereicht') {
    if (payload.termin_vorschlaege) {
      updates.nachbesichtigung_kunde_termin_vorschlaege = payload.termin_vorschlaege as unknown as Record<string, unknown>
    }
    updates.nachbesichtigung_kunde_termin_eingereicht_am = payload.eingereicht_am ?? now
    // AAR-558: Kunden-Wunsch-Feld ist nachbesichtigung_sv_konfrontation_gewuenscht
    // (aus C8-Migration). nachbesichtigung_konfrontation ist das SV-bestätigte
    // Ergebnis-Feld und wird im C12-Flow separat gesetzt.
    if (typeof payload.sv_konfrontation_gewuenscht === 'boolean') {
      updates.nachbesichtigung_sv_konfrontation_gewuenscht = payload.sv_konfrontation_gewuenscht
    }
  }
  if (eventType === 'sv_stellungnahme_eingereicht') {
    updates.technische_stellungnahme_status = 'hochgeladen'
    updates.technische_stellungnahme_hochgeladen_am = payload.eingereicht_am ?? now
  }
  if (eventType === 'sv_konfrontation_bestaetigt') {
    updates.nachbesichtigung_sv_termin_vereinbart_am = payload.bestaetigt_am ?? now
  }
  // sv_konfrontation_abgelehnt: keine DB-Felder, nur Mitteilung (unten)
  // sv_konfrontation_anfrage_versendet: C12 — Versand-Logik liegt dort
  // manual_status_override: kein Auto-Side-Effect, nur Audit-Eintrag

  return updates
}

/**
 * AAR-540: Cross-Portal-Mitteilungen für vs_eskalation_kontakt_ergebnis.
 * Benachrichtigt Kunde + KB + SV + Admin über das Eskalations-Ergebnis.
 */
async function sendEskalationsMitteilungen(
  fallId: string,
  payload: LexDriveEventPayload,
): Promise<void> {
  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('id, fall_nummer, kunde_id, kundenbetreuer_id, sv_id')
    .eq('id', fallId)
    .single()
  if (!fall) return

  const stufe = payload.eskalation_stufe ?? 'tag14'
  const titel = `VS-Eskalation ${stufe} — Ergebnis eingetragen`
  const inhalt = payload.ergebnis ?? 'Kein Ergebnistext hinterlegt.'

  const empfaenger: Array<{ id: string; rolle: 'kundenbetreuer' | 'sachverstaendiger' | 'kunde' }> = []
  if (fall.kunde_id) empfaenger.push({ id: fall.kunde_id, rolle: 'kunde' })
  if (fall.kundenbetreuer_id) empfaenger.push({ id: fall.kundenbetreuer_id, rolle: 'kundenbetreuer' })
  if (fall.sv_id) empfaenger.push({ id: fall.sv_id, rolle: 'sachverstaendiger' })

  await createMitteilungMulti(empfaenger, {
    kategorie: 'update',
    titel,
    inhalt,
    kontext_typ: 'fall',
    kontext_id: fallId,
    prioritaet: 'normal',
  })

  // Admin-Broadcast (alle Admin-Profile)
  const { data: admins } = await db.from('profiles').select('id').eq('rolle', 'admin')
  if (admins && admins.length > 0) {
    await createMitteilungMulti(
      admins.map((a) => ({ id: a.id, rolle: 'admin' as const })),
      {
        kategorie: 'update',
        titel,
        inhalt,
        kontext_typ: 'fall',
        kontext_id: fallId,
        prioritaet: 'normal',
      },
    )
  }
}

/**
 * AAR-540: Rollen-gefilterte Mitteilungen für auszahlung_split_eingegangen.
 * - Kunde: nur bei Kunden-Betrag-Eingang
 * - SV: nur bei gutachter_eingegangen_am-Eingang
 * - KB: immer
 */
async function sendAuszahlungMitteilungen(
  fallId: string,
  payload: LexDriveEventPayload,
): Promise<void> {
  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('id, kunde_id, kundenbetreuer_id, sv_id')
    .eq('id', fallId)
    .single()
  if (!fall) return

  const kundeHat = payload.auszahlung_kunde_eingegangen_am != null
  const svHat = payload.auszahlung_gutachter_eingegangen_am != null

  if (fall.kundenbetreuer_id) {
    const teile: string[] = []
    if (kundeHat) teile.push(`Kunde: ${payload.auszahlung_kunde_betrag ?? '—'} EUR`)
    if (svHat) teile.push(`SV: Gutachter-Honorar eingegangen`)
    await createMitteilung({
      empfaenger_id: fall.kundenbetreuer_id,
      empfaenger_rolle: 'kundenbetreuer',
      kategorie: 'update',
      titel: 'Auszahlung-Split eingegangen',
      inhalt: teile.join(' · ') || 'Auszahlungs-Eingang gebucht.',
      kontext_typ: 'fall',
      kontext_id: fallId,
      prioritaet: 'normal',
    })
  }
  if (kundeHat && fall.kunde_id) {
    await createMitteilung({
      empfaenger_id: fall.kunde_id,
      empfaenger_rolle: 'kunde',
      kategorie: 'update',
      titel: 'Auszahlung eingegangen',
      inhalt: `Ihr Betrag von ${payload.auszahlung_kunde_betrag ?? '—'} EUR ist eingegangen.`,
      kontext_typ: 'fall',
      kontext_id: fallId,
      prioritaet: 'hoch',
    })
  }
  if (svHat && fall.sv_id) {
    await createMitteilung({
      empfaenger_id: fall.sv_id,
      empfaenger_rolle: 'sachverstaendiger',
      kategorie: 'update',
      titel: 'Gutachter-Honorar eingegangen',
      inhalt: 'Ihr Gutachter-Honorar für diesen Fall wurde ausgezahlt.',
      kontext_typ: 'fall',
      kontext_id: fallId,
      prioritaet: 'normal',
    })
  }
}

/**
 * AAR-540: Einfache KB-Mitteilung für SV-getriebene Events.
 */
async function sendKbMitteilung(
  fallId: string,
  titel: string,
  inhalt: string,
  prioritaet: 'normal' | 'hoch' = 'normal',
): Promise<void> {
  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('kundenbetreuer_id')
    .eq('id', fallId)
    .single()
  if (!fall?.kundenbetreuer_id) return
  await createMitteilung({
    empfaenger_id: fall.kundenbetreuer_id,
    empfaenger_rolle: 'kundenbetreuer',
    kategorie: 'task',
    titel,
    inhalt,
    kontext_typ: 'fall',
    kontext_id: fallId,
    prioritaet,
  })
}

/**
 * AAR-561 (C12): SV bekommt eine Mitteilung, dass der Kunde ihn um
 * Konfrontations-Begleitung bei der Nachbesichtigung gebeten hat.
 * Der SV sieht den Termin + Annehmen/Ablehnen direkt in der SV-Fallakte
 * (KonfrontationsTerminCard aus C10/AAR-559).
 */
async function sendSvKonfrontationsAnfrage(
  fallId: string,
  payload: LexDriveEventPayload,
): Promise<void> {
  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('id, fall_nummer, sv_id')
    .eq('id', fallId)
    .single()
  if (!fall?.sv_id) return

  const terminDatumRaw = (payload as Record<string, unknown>).termin_datum
  const terminLabel =
    typeof terminDatumRaw === 'string' && terminDatumRaw
      ? new Date(terminDatumRaw).toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'offen'

  await createMitteilung({
    empfaenger_id: fall.sv_id as string,
    empfaenger_rolle: 'sachverstaendiger',
    kategorie: 'task',
    titel: 'Konfrontations-Begleitung angefragt',
    inhalt:
      `Der Kunde wünscht deine Begleitung bei der Nachbesichtigung am ${terminLabel}. ` +
      'Kein neuer Auftrag — Begleitung über bestehenden Fall. Bitte in der Fallakte annehmen oder ablehnen.',
    kontext_typ: 'fall',
    kontext_id: fallId,
    prioritaet: 'hoch',
  })
}

/**
 * AAR-561 (C12): SV hat den Konfrontations-Termin bestätigt — setzt die
 * zugehörige gutachter_termine-Row von 'reserviert' auf 'bestaetigt'.
 * Wird nicht-fatal behandelt (wenn keine Row existiert, weil der Dispatch-
 * Lite nie gelaufen ist, bleibt die faelle-Spalte trotzdem gepflegt).
 */
async function syncKonfrontationsTerminBestaetigt(
  fallId: string,
  _payload: LexDriveEventPayload,
): Promise<void> {
  const db = createAdminClient()
  await db
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('fall_id', fallId)
    .eq('typ', 'konfrontation')
    .in('status', ['reserviert', 'gegenvorschlag'])
}

/**
 * AAR-561 (C12): Kunde bekommt eine Mitteilung, dass sein SV bei der
 * Nachbesichtigung dabei ist. WA-Template (T-Konfrontation-Bestaetigung-Kunde)
 * folgt separat (Template muss in Twilio-Console angelegt + ENV gesetzt werden).
 */
async function sendKundeKonfrontationBestaetigt(
  fallId: string,
  payload: LexDriveEventPayload,
): Promise<void> {
  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('kunde_id, nachbesichtigung_sv_termin_vereinbart_am')
    .eq('id', fallId)
    .single()
  if (!fall?.kunde_id) return

  const datumIso = (fall.nachbesichtigung_sv_termin_vereinbart_am as string | null) ??
    (payload.bestaetigt_am as string | undefined) ??
    new Date().toISOString()
  const datumLabel = new Date(datumIso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  await createMitteilung({
    empfaenger_id: fall.kunde_id as string,
    empfaenger_rolle: 'kunde',
    kategorie: 'update',
    titel: 'Dein Sachverständiger ist bei der Nachbesichtigung dabei',
    inhalt: `Dein Sachverständiger hat bestätigt, dass er dich bei der Nachbesichtigung am ${datumLabel} begleitet.`,
    kontext_typ: 'fall',
    kontext_id: fallId,
    prioritaet: 'normal',
  })
}

/**
 * AAR-540: vs_kuerzt Pflichtfeld-Validation + conditional Auto-Trigger.
 * - vs_kuerzungs_typ MUSS gesetzt sein
 * - bei 'technisch' oder 'gemischt' → Auto-Trigger technische_stellungnahme_benoetigt
 * - bei 'argumentativ' → Task an Kanzlei (Mitteilung KB) statt Stellungnahme
 */
async function handleVsKuerztSideEffects(
  fallId: string,
  payload: LexDriveEventPayload,
  source: 'webhook' | 'manual',
  triggeredByProfileId?: string,
): Promise<void> {
  const typ = payload.vs_kuerzungs_typ
  if (typ === 'technisch' || typ === 'gemischt') {
    // Auto-Trigger der Stellungnahme — fallNr für webhook_events-Audit nachladen
    const db = createAdminClient()
    const { data: fall } = await db
      .from('faelle')
      .select('fall_nummer')
      .eq('id', fallId)
      .single()
    const grundFromPayload = typeof payload.vs_kuerzung_grund === 'string'
      ? payload.vs_kuerzung_grund
      : payload.grund ?? 'Technische VS-Kürzung'
    await processLexDriveEvent({
      fallId,
      fallNr: fall?.fall_nummer ?? fallId.slice(0, 8),
      eventType: 'technische_stellungnahme_benoetigt',
      payload: { grund: grundFromPayload },
      externalEventId: null,
      source,
      triggeredByProfileId,
    })
  } else if (typ === 'argumentativ') {
    await sendKbMitteilung(
      fallId,
      'Rüge 1 vorbereiten',
      'VS-Kürzung ist argumentativ — Rüge 1 statt Stellungnahme einleiten.',
      'hoch',
    )
  }
}

/**
 * AAR-540: ruege_versendet SLA-Diff je nach counter.
 * Schreibt einen String-sla_typ in sla_tracking ohne formale Type-Erweiterung —
 * das sla_typ-Feld ist eine freie String-Spalte (siehe database.types.ts).
 */
async function startRuegeSla(fallId: string, counter: number): Promise<void> {
  const db = createAdminClient()
  const now = new Date()
  const fristTage = counter >= 2 ? 7 : 14
  const slaTyp = counter >= 2 ? 'vs_antwort_ruege2_7' : 'vs_antwort_ruege1_14'
  const breachAt = new Date(now.getTime() + fristTage * 24 * 60 * 60 * 1000)
  const { error } = await db.from('sla_tracking').insert({
    fall_id: fallId,
    sla_typ: slaTyp,
    started_at: now.toISOString(),
    breach_at: breachAt.toISOString(),
    status: 'pending',
    target_rolle: 'kanzlei',
    phase: 'ruegen',
    n_mahnungen: 0,
  })
  // 23505 = unique_violation → bereits aktiv, idempotent
  if (error && error.code !== '23505') {
    console.error(`[AAR-540] startRuegeSla(${slaTyp}) Fehler:`, error.message)
  }
}

/**
 * Verarbeitet ein LexDrive-Event idempotent. Wird sowohl von /api/webhooks/lexdrive
 * (source=webhook) als auch von der manuellen Admin-UI (source=manual) aufgerufen.
 */
export async function processLexDriveEvent(input: ProcessEventInput): Promise<ProcessEventResult> {
  const db = createAdminClient()

  // AAR-540: Pflichtfeld-Validation vs_kuerzt
  if (input.eventType === 'vs_kuerzt' && !input.payload.vs_kuerzungs_typ) {
    return { success: false, error: 'vs_kuerzungs_typ ist Pflichtfeld (technisch|argumentativ|gemischt)' }
  }

  // Idempotenz-Check (nur bei echtem Webhook mit externer ID)
  if (input.externalEventId) {
    const { data: existing } = await db
      .from('webhook_events')
      .select('id, status')
      .eq('event_id', input.externalEventId)
      .maybeSingle()
    if (existing) return { success: true, skipped: true }
  }

  const eventId = input.externalEventId ?? `manual-${input.fallId}-${input.eventType}-${Date.now()}`
  // AAR-540: source='manual_admin' schreibt user_id (AAR-557 C8-Spalte)
  const source = input.source === 'manual' ? 'manual_admin' : 'lexdrive'
  const { data: eventRecord } = await db.from('webhook_events').insert({
    event_id: eventId,
    event_type: input.eventType,
    fall_id: input.fallId,
    fall_nr: input.fallNr,
    source,
    user_id: input.triggeredByProfileId ?? null,
    payload: {
      ...input.payload,
      _source: input.source,
      _triggered_by: input.triggeredByProfileId ?? null,
    },
    status: 'pending',
  }).select('id').single()

  try {
    // Status-Transition
    const newStatus = EVENT_STATUS_MAP[input.eventType]
    if (newStatus) {
      try {
        await transitionFallStatus(input.fallId, newStatus, {
          grund: input.payload.grund,
          betrag: input.payload.betrag,
        })
      } catch { /* ungueltiger Uebergang ignorieren */ }
    }

    // AAR-540 + AAR-560 (C11): manual_status_override — explizites Status-Setzen,
    // bewusst OHNE State-Machine-Validation. Direkter UPDATE weil der Admin genau
    // dafür den Override-Weg nutzt — unzulässige Transitionen wie
    // abgeschlossen→ersterfassung müssen möglich sein (Legacy-Migration,
    // außergerichtliche Einigung, Test/Staging). Keine Auto-Side-Effects (WA,
    // SLA) — nur Status + abgeschlossen_am/storniert_am Bookkeeping.
    if (input.eventType === 'manual_status_override' && typeof input.payload.neuer_status === 'string') {
      const neuerStatus = input.payload.neuer_status
      const now = new Date().toISOString()
      const overrideUpdate: Record<string, unknown> = {
        status: neuerStatus,
        status_changed_at: now,
        updated_at: now,
      }
      if (neuerStatus === 'abgeschlossen') {
        overrideUpdate.abgeschlossen_am = now
        if (input.payload.override_grund) overrideUpdate.geschlossen_grund = input.payload.override_grund
      }
      if (neuerStatus === 'storniert') {
        overrideUpdate.storniert_am = now
        if (input.payload.override_grund) overrideUpdate.storno_grund = input.payload.override_grund
      }
      await db.from('faelle').update(overrideUpdate).eq('id', input.fallId)
    }

    // Feld-Updates
    const updates = computeFieldUpdates(input.eventType, input.payload)
    if (Object.keys(updates).length > 0) {
      await db.from('faelle').update(updates).eq('id', input.fallId)
    }

    // AAR-540: vs_kuerzt conditional Auto-Trigger
    if (input.eventType === 'vs_kuerzt') {
      await handleVsKuerztSideEffects(input.fallId, input.payload, input.source, input.triggeredByProfileId)
    }

    // AAR-540: ruege_versendet SLA-Diff
    if (input.eventType === 'ruege_1_gesendet') {
      await startRuegeSla(input.fallId, 1)
    } else if (input.eventType === 'ruege_2_gesendet') {
      await startRuegeSla(input.fallId, 2)
    }

    // AAR-540: Cross-Portal-Mitteilungen
    if (input.eventType === 'vs_eskalation_kontakt_ergebnis') {
      await sendEskalationsMitteilungen(input.fallId, input.payload)
    }
    if (input.eventType === 'auszahlung_split_eingegangen') {
      await sendAuszahlungMitteilungen(input.fallId, input.payload)
    }
    if (input.eventType === 'sv_stellungnahme_eingereicht') {
      await sendKbMitteilung(
        input.fallId,
        'Stellungnahme von SV eingegangen',
        'Freigabe erforderlich — bitte prüfen und weiterleiten.',
        'hoch',
      )
    }
    if (input.eventType === 'sv_konfrontation_abgelehnt') {
      await sendKbMitteilung(
        input.fallId,
        'SV hat Konfrontation abgelehnt',
        input.payload.grund ?? input.payload.notiz_sv ?? 'Bitte alternative Schritte evaluieren.',
        'hoch',
      )
    }
    // AAR-561 (C12): SV bekommt Mitteilung mit Termin-Datum + Fallnummer,
    // sobald der KB den Konfrontations-Dispatch-Lite ausgelöst hat.
    if (input.eventType === 'sv_konfrontation_anfrage_versendet') {
      await sendSvKonfrontationsAnfrage(input.fallId, input.payload)
    }
    // AAR-561 (C12): SV-Annahme → gutachter_termine-Row auf 'bestaetigt' + Kunde
    // informieren. Die DB-Feld-Updates für faelle (vereinbart_am) passieren
    // bereits in computeFieldUpdates oben.
    if (input.eventType === 'sv_konfrontation_bestaetigt') {
      await syncKonfrontationsTerminBestaetigt(input.fallId, input.payload)
      await sendKundeKonfrontationBestaetigt(input.fallId, input.payload)
    }
    if (input.eventType === 'kunde_nachbesichtigung_termine_eingereicht') {
      const inhalt = input.payload.sv_konfrontation_gewuenscht
        ? 'Kunde hat Termine vorgeschlagen. Konfrontation gewünscht → C12-Dispatch-Lite auslösen.'
        : 'Kunde hat Termine für die Nachbesichtigung vorgeschlagen.'
      await sendKbMitteilung(input.fallId, 'Kunde hat Termine vorgeschlagen', inhalt)
    }
    if (input.eventType === 'kb_filmcheck_bestanden') {
      await sendKbMitteilung(
        input.fallId,
        'Filmcheck bestanden',
        'Akte wird an Kanzlei übergeben. WhatsApp T8/T9 an Kunden versandt.',
      )
    }
    if (input.eventType === 'vs_quotiert') {
      await sendKbMitteilung(
        input.fallId,
        'VS hat Quotierung angeboten',
        `Quote: ${input.payload.vs_quote_prozent ?? '—'}% · Grund: ${input.payload.vs_quote_grund ?? '—'}. Klärung läuft.`,
        'hoch',
      )
    }
    // Phase 8 Audit-Fix: vs_quote_akzeptiert war vorher "silent event" — setzte
    // DB-Feld + Status 'regulierung-laeuft', aber KB bekam keine Mitteilung.
    if (input.eventType === 'vs_quote_akzeptiert') {
      await sendKbMitteilung(
        input.fallId,
        'VS-Quote akzeptiert',
        `Die Quotierung wurde akzeptiert — Fall geht in Regulierung. ${input.payload.vs_quote_prozent != null ? `Quote: ${input.payload.vs_quote_prozent}%.` : ''}`.trim(),
        'normal',
      )
    }

    // WA-Template
    const commTrigger = EVENT_COMM_MAP[input.eventType]
    if (commTrigger) {
      sendFallCommunication(input.fallId, commTrigger).catch(() => {})
    }

    // Timeline
    await db.from('timeline').insert({
      fall_id: input.fallId,
      typ: input.source === 'manual' ? 'manuell' : 'webhook',
      titel: input.source === 'manual'
        ? `Manuell ausgelöst: ${input.eventType}`
        : `LexDrive: ${input.eventType}`,
      beschreibung: input.payload.beschreibung ?? `Event ${input.eventType} verarbeitet (${input.source}).`,
      erstellt_von: input.triggeredByProfileId ?? null,
    })

    if (eventRecord?.id) {
      await db.from('webhook_events').update({
        status: 'processed',
        processed_at: new Date().toISOString(),
      }).eq('id', eventRecord.id)
    }

    return { success: true, eventRecordId: eventRecord?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (eventRecord?.id) {
      await db.from('webhook_events').update({
        status: 'failed',
        error_message: msg,
        processed_at: new Date().toISOString(),
      }).eq('id', eventRecord.id)
    }
    return { success: false, error: msg }
  }
}
