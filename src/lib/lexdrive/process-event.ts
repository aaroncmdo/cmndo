// AAR-108: Shared LexDrive-Event Processor für Webhook + manuelle Trigger.
// AAR-540 (C3): Erweitert um 10 neue Events (Endpoint-Register), user_id-
// Propagation bei manuellen Triggern (aus AAR-557 C8), Cross-Portal-
// Mitteilungen (vs_eskalation_kontakt_ergebnis) und Rollen-gefilterte
// Auszahlungs-Mitteilungen.
import { createAdminClient } from '@/lib/supabase/admin'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { createMitteilung, createMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'
import { peelAuftraegeColumns, splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'
import { upsertCurrentClaimPayment, type ClaimPaymentRerouteFields } from '@/lib/faelle/claim-payments'
import { peelKanzleiFaelleColumns, upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'

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
  // AAR-559 (C10): SV bekommt Auftrag für Technische Stellungnahme
  technische_stellungnahme_benoetigt: 'stellungnahme_beauftragt',
  // AAR-561 (C12): SV bekommt Konfrontations-Termin-Anfrage
  sv_konfrontation_anfrage_versendet: 'sv_konfrontation_anfrage',
  // AAR-561 (C12): Kunde wird über SV-Zusage informiert
  sv_konfrontation_bestaetigt: 'sv_konfrontation_bestaetigt_kunde',
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

// CMM-44 SP-H PR2: schreibt die gepeelten Auftrag-Lifecycle-Spalten
// (technische_stellungnahme_*/filmcheck_*/storno*) auf den aktuellen Auftrag des
// Claims (ORDER BY reihenfolge DESC LIMIT 1). Existiert kein Auftrag oder kein
// claim_id (Legacy-Fall) → warn + skip, kein Throw (Event-Processing bleibt
// atomar). Spiegelt das SP-D-gutachter_termine-Pattern.
async function writeAuftraegeColumns(
  db: ReturnType<typeof createAdminClient>,
  claimId: string | null,
  auftraegeUpdate: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(auftraegeUpdate).length === 0) return
  if (!claimId) {
    console.warn(
      `[CMM-44 SP-H] kein claim_id — ${Object.keys(auftraegeUpdate).join(',')} skip`,
    )
    return
  }
  const { data: aktAuftrag } = await db
    .from('auftraege')
    .select('id')
    .eq('claim_id', claimId)
    .order('reihenfolge', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!aktAuftrag?.id) {
    console.warn(
      `[CMM-44 SP-H] kein Auftrag fuer claim ${claimId} — ${Object.keys(auftraegeUpdate).join(',')} skip`,
    )
    return
  }
  const { error } = await db.from('auftraege').update(auftraegeUpdate).eq('id', aktAuftrag.id)
  if (error) console.error('[CMM-44 SP-H] process-event Auftrag-Update fehlgeschlagen:', error.message)
}

// CMM-44 SP-A2 (Cluster 3): die Schluessel `regulierung_betrag` und
// `vs_ablehnungsgrund` in diesem Objekt sind die alten faelle/UI-Namen. Der
// Apply-Block (processLexDriveEvent) zieht sie nach dem splitOrKeepFaelleUpdate
// heraus und schreibt sie mit dem claims-Namen (regulierungs_betrag /
// vs_ablehnungs_grund) auf claims. Hier bewusst die alten Namen, damit die
// Extraktion ein eindeutiges Mapping hat.
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
  // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
  const { data: fall } = await db
    .from('faelle')
    .select('id, kunde_id, sv_id, claims:claim_id(kundenbetreuer_id)')
    .eq('id', fallId)
    .single()
  if (!fall) return
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

  const stufe = payload.eskalation_stufe ?? 'tag14'
  const titel = `VS-Eskalation ${stufe} — Ergebnis eingetragen`
  const inhalt = payload.ergebnis ?? 'Kein Ergebnistext hinterlegt.'

  const empfaenger: Array<{ id: string; rolle: 'kundenbetreuer' | 'sachverstaendiger' | 'kunde' }> = []
  if (fall.kunde_id) empfaenger.push({ id: fall.kunde_id, rolle: 'kunde' })
  if (fallClaim?.kundenbetreuer_id) empfaenger.push({ id: fallClaim.kundenbetreuer_id, rolle: 'kundenbetreuer' })
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
  // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
  const { data: fall } = await db
    .from('faelle')
    .select('id, kunde_id, sv_id, claims:claim_id(kundenbetreuer_id)')
    .eq('id', fallId)
    .single()
  if (!fall) return
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

  const kundeHat = payload.auszahlung_kunde_eingegangen_am != null
  const svHat = payload.auszahlung_gutachter_eingegangen_am != null

  if (fallClaim?.kundenbetreuer_id) {
    const teile: string[] = []
    if (kundeHat) teile.push(`Kunde: ${payload.auszahlung_kunde_betrag ?? '—'} EUR`)
    if (svHat) teile.push(`SV: Gutachter-Honorar eingegangen`)
    await createMitteilung({
      empfaenger_id: fallClaim.kundenbetreuer_id,
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
  // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
  const { data: fall } = await db
    .from('faelle')
    .select('claims:claim_id(kundenbetreuer_id)')
    .eq('id', fallId)
    .single()
  const fallClaim = fall ? (Array.isArray(fall.claims) ? fall.claims[0] : fall.claims) : null
  if (!fallClaim?.kundenbetreuer_id) return
  await createMitteilung({
    empfaenger_id: fallClaim.kundenbetreuer_id,
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
    .select('id, sv_id')
    .eq('id', fallId)
    .single()
  if (!fall?.sv_id) return

  const terminDatumRaw = (payload as Record<string, unknown>).termin_datum
  const terminLabel =
    typeof terminDatumRaw === 'string' && terminDatumRaw
      ? new Date(terminDatumRaw).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
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
  // CMM-44 SP-D PR2a: nachbesichtigung_sv_termin_vereinbart_am aus gutachter_termine (SSoT).
  const { data: fall } = await db
    .from('faelle')
    .select('kunde_id, claim_id')
    .eq('id', fallId)
    .single()
  if (!fall?.kunde_id) return

  let aktTerminProcEvent: { nachbesichtigung_sv_termin_vereinbart_am: string | null } | null = null
  if ((fall as { claim_id?: string | null }).claim_id) {
    const { data: at } = await db
      .from('gutachter_termine')
      .select('nachbesichtigung_sv_termin_vereinbart_am')
      .eq('claim_id', (fall as { claim_id: string }).claim_id)
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminProcEvent = at
  }

  const datumIso = (aktTerminProcEvent?.nachbesichtigung_sv_termin_vereinbart_am as string | null) ??
    (payload.bestaetigt_am as string | undefined) ??
    new Date().toISOString()
  const datumLabel = new Date(datumIso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
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
      .select('claims:claim_id(claim_nummer)')
      .eq('id', fallId)
      .single()
    const grundFromPayload = typeof payload.vs_kuerzung_grund === 'string'
      ? payload.vs_kuerzung_grund
      : payload.grund ?? 'Technische VS-Kürzung'
    await processLexDriveEvent({
      fallId,
      fallNr: (Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims)?.claim_nummer ?? fallId.slice(0, 8),
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

    // CMM-48 PR-C: Duplikat-Spalten (abgeschlossen_am, kanzlei_uebergeben_am)
    // gehen auf claims — claims ist Single Source of Truth. claim_id einmal
    // laden; der Sync-Trigger spiegelt die Spalten auf faelle zurueck (bis
    // CMM-49). Legacy-Faelle ohne claim_id behalten die faelle-Writes.
    const { data: fallClaimRow } = await db
      .from('faelle')
      .select('claim_id')
      .eq('id', input.fallId)
      .maybeSingle()
    const claimIdForUpdates = (fallClaimRow?.claim_id as string | null) ?? null

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
      // CMM-44 SP-H PR2: storniert_am/storno_grund auf auftraege gewandert —
      // ZUERST peelen, dann splitten. Auftrag-Write erfolgt nach faelle/claims.
      const { rest: ovRest, auftraegeUpdate: ovAuftraege } = peelAuftraegeColumns(overrideUpdate)
      const { faelleUpdate: ovFaelle, claimsUpdate: ovClaims } = splitOrKeepFaelleUpdate(
        ovRest,
        claimIdForUpdates,
      )
      if (Object.keys(ovFaelle).length > 0) {
        await db.from('faelle').update(ovFaelle).eq('id', input.fallId)
      }
      if (claimIdForUpdates && Object.keys(ovClaims).length > 0) {
        await db.from('claims').update(ovClaims).eq('id', claimIdForUpdates)
      }
      await writeAuftraegeColumns(db, claimIdForUpdates, ovAuftraege)
    }

    // Feld-Updates
    const updates = computeFieldUpdates(input.eventType, input.payload)
    if (Object.keys(updates).length > 0) {
      // CMM-44 SP-I2 PR2: anschlussschreiben_am + mandatsnummer + as_salesforce_id
      // leben auf kanzlei_faelle (1:1). ZUERST peelen (vor SP-H-Peel).
      // Write via upsertKanzleiFall nach den faelle/claims/auftraege-Writes (s.u.).
      const { rest: fuSpi2Rest, kfUpdate: fuKfUpdate } = peelKanzleiFaelleColumns(updates)

      // CMM-44 SP-H PR2: technische_stellungnahme_*/filmcheck_* sind auf auftraege
      // gewandert — ZUERST peelen, damit sie nicht in die rename/split-Logik
      // unten gelangen; Auftrag-Write erfolgt nach den faelle/claims-Writes.
      const { rest: fuRest, auftraegeUpdate: fuAuftraege } = peelAuftraegeColumns(fuSpi2Rest)
      const { faelleUpdate: fuFaelle, claimsUpdate: fuClaims } = splitOrKeepFaelleUpdate(
        fuRest,
        claimIdForUpdates,
      )
      // CMM-44 SP-A2 (Cluster 3): regulierung_betrag + vs_ablehnungsgrund sind
      // Semantik-Duplikate mit abweichendem claims-Namen. splitOrKeepFaelle-
      // Update kennt nur gleichnamige Spalten → sie landen faelschlich im
      // faelle-Teil. Hier herausziehen und mit dem neuen claims-Namen ins
      // claims-Update umhaengen (bei claim_id), sonst verwerfen (faelle-Spalte
      // wird in PR2 gedroppt — claim-lose Faelle sind Alt-Datenbestand).
      if ('regulierung_betrag' in fuFaelle) {
        if (claimIdForUpdates) fuClaims.regulierungs_betrag = fuFaelle.regulierung_betrag
        delete fuFaelle.regulierung_betrag
      }
      if ('vs_ablehnungsgrund' in fuFaelle) {
        if (claimIdForUpdates) fuClaims.vs_ablehnungs_grund = fuFaelle.vs_ablehnungsgrund
        delete fuFaelle.vs_ablehnungsgrund
      }

      // CMM-44 SP-D PR2b: nachbesichtigung_* + re_termin_eskalation_an_kb_am
      // sind SP-D-Spalten, die jetzt auf gutachter_termine leben (SSoT).
      // Aus dem faelle-Update herausziehen und auf den aktuellen Termin schreiben.
      const SPD_COLS_TO_GT = [
        'nachbesichtigung_sv_termin_vereinbart_am',
        'nachbesichtigung_sv_konfrontation_gewuenscht',
        'nachbesichtigung_kunde_termin_vorschlaege',
        'nachbesichtigung_kunde_termin_eingereicht_am',
      ]
      const gtUpdate: Record<string, unknown> = {}
      for (const col of SPD_COLS_TO_GT) {
        if (col in fuFaelle) {
          gtUpdate[col] = fuFaelle[col]
          delete fuFaelle[col]
        }
      }
      if (Object.keys(gtUpdate).length > 0 && claimIdForUpdates) {
        const { data: aktT } = await db.from('gutachter_termine').select('id')
          .eq('claim_id', claimIdForUpdates)
          .order('start_zeit', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (aktT?.id) {
          const { error: gtErr } = await db.from('gutachter_termine').update(gtUpdate).eq('id', aktT.id)
          if (gtErr) console.error('[CMM-44 SP-D] process-event GT-Update fehlgeschlagen:', gtErr.message)
        } else {
          console.warn(`[CMM-44 SP-D] kein Termin fuer claim ${claimIdForUpdates} — nachbesichtigung_* skip`)
        }
      }

      // CMM-44 SP-J Bucket A: zahlung_eingegangen_am/zahlung_betrag liegen auf
      // claim_payments (Rename). Aus fuFaelle ziehen und auf die aktuelle
      // claim_payments-Row schreiben (create-or-update, s.u. nach den faelle/
      // claims-Writes). status='erhalten' bei Eingang.
      // zahlungsweg BLEIBT auf faelle (Auszahlungs-ZIEL {kundenkonto,werkstatt_
      // direkt} ≠ claim_payments.zahlungsweg-Methode {ueberweisung,...}; SP-J-
      // Fehl-Mapping korrigiert) -> NICHT peelen, bleibt via splitOrKeepFaelle-
      // Update auf faelle (nicht im Set).
      // Hinweis: beim Event zahlung_eingegangen hat transitionFallStatus (oben via
      // EVENT_STATUS_MAP) ggf. schon eine claim_payments-Row angelegt; dieser
      // Upsert trifft via create-or-update DIESELBE (aktuelle) Row — idempotent.
      const cpFields: ClaimPaymentRerouteFields = {}
      if ('zahlung_eingegangen_am' in fuFaelle) {
        cpFields.zahlungseingang_am = fuFaelle.zahlung_eingegangen_am as string | null
        delete fuFaelle.zahlung_eingegangen_am
      }
      if ('zahlung_betrag' in fuFaelle) {
        cpFields.erhaltener_betrag = fuFaelle.zahlung_betrag as number | null
        delete fuFaelle.zahlung_betrag
      }
      if (cpFields.zahlungseingang_am != null) cpFields.status = 'erhalten'

      if (Object.keys(fuFaelle).length > 0) {
        await db.from('faelle').update(fuFaelle).eq('id', input.fallId)
      }
      if (claimIdForUpdates && Object.keys(fuClaims).length > 0) {
        await db.from('claims').update(fuClaims).eq('id', claimIdForUpdates)
      }
      if (claimIdForUpdates && Object.keys(cpFields).length > 0) {
        const cpRes = await upsertCurrentClaimPayment(
          db,
          claimIdForUpdates,
          cpFields,
          input.triggeredByProfileId ?? null,
        )
        if (!cpRes.ok) console.error('[CMM-44 SP-J] process-event claim_payments fehlgeschlagen:', cpRes.error)
      }
      await writeAuftraegeColumns(db, claimIdForUpdates, fuAuftraege)

      // CMM-44 SP-I2 PR2: kanzlei_faelle-Spalten nach den anderen Writes schreiben.
      if (claimIdForUpdates && Object.keys(fuKfUpdate).length > 0) {
        const kfRes = await upsertKanzleiFall(db, claimIdForUpdates, fuKfUpdate)
        if (!kfRes.ok) console.error('[CMM-44 SP-I2] process-event kanzlei_faelle upsert fehlgeschlagen:', kfRes.error)
      }
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

    // AAR-kanzlei: vollmacht_bestaetigt → Termin auf bestaetigt setzen +
    // final_verbindlich_ab + Reminders generieren. Siehe confirmVollmacht in
    // src/app/flow/[token]/actions.ts — dort liegt die zentrale Logik für
    // beide Pfade (SA-Signatur bei nur_gutachter und Vollmacht bei komplett).
    if (input.eventType === 'vollmacht_bestaetigt') {
      try {
        const { confirmVollmacht } = await import('@/app/flow/[token]/actions')
        await confirmVollmacht(input.fallId)
      } catch (err) {
        console.error('[AAR-kanzlei] confirmVollmacht failed:', err)
      }

      // CMM-32 / LexDrive-Pfad: Wenn der Kunde vorher 'partnerkanzlei' gewählt
      // hat und das Paket noch nicht raus ist → Kanzleipaket auto-versenden.
      // LexDrive schickt die Vollmacht per WA selbst; sobald der Kunde bestätigt
      // kommt dieser Hook zurück. Jetzt schicken wir die Akte automatisch.
      try {
        const { data: fallForClaim } = await db
          .from('faelle')
          .select('claim_id')
          .eq('id', input.fallId)
          .maybeSingle()
        if (fallForClaim?.claim_id) {
          const { data: claimForKanzlei } = await db
            .from('claims')
            .select('kanzlei_wunsch, kanzlei_uebergeben_am')
            .eq('id', fallForClaim.claim_id as string)
            .maybeSingle()
          if (
            claimForKanzlei?.kanzlei_wunsch === 'partnerkanzlei' &&
            !claimForKanzlei.kanzlei_uebergeben_am
          ) {
            const now = new Date().toISOString()
            await db
              .from('claims')
              .update({ kanzlei_uebergeben_am: now })
              .eq('id', fallForClaim.claim_id as string)
            // Fire-and-forget Kanzleipaket-Email an LexDrive (AAR-77 buildAndSendKanzleiEmail)
            import('@/lib/lexdrive/email-sender')
              .then(({ buildAndSendKanzleiEmail }) => buildAndSendKanzleiEmail(input.fallId))
              .catch((err) => console.error('[CMM-32] buildAndSendKanzleiEmail failed:', err))
            // KB informieren
            await sendKbMitteilung(
              input.fallId,
              'Vollmacht bestätigt — Kanzleipaket an LexDrive versendet',
              'Kunde hat LexDrive-Vollmacht bestätigt. Akte wurde automatisch übermittelt.',
              'normal',
            )
          }
        }
      } catch (err) {
        console.error('[CMM-32] LexDrive-Kanzleipaket Auto-Trigger failed:', err)
      }
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
