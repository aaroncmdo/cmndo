// AAR-108: Shared LexDrive-Event Processor fuer Webhook + manuelle Trigger.
import { createAdminClient } from '@/lib/supabase/admin'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { sendFallCommunication } from '@/lib/communications/send-fall'

export const VALID_LEXDRIVE_EVENTS = [
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
}

const EVENT_STATUS_MAP: Partial<Record<LexDriveEvent, string>> = {
  as_versendet: 'anschlussschreiben',
  vs_reguliert_voll: 'regulierung-laeuft',
  regulierung_angekuendigt: 'regulierung-laeuft',
  zahlung_eingegangen: 'zahlung-eingegangen',
  vs_ablehnung: 'vs-abgelehnt',
  // AAR-165 W5 Audit-Fix Phase 2: ohne diese Mappings bleiben die ProzessTab-
  // Sections (Kürzung, Rüge, Stellungnahme, Nachbesichtigung, Klage) unsicht-
  // bar weil visibleSections an den Status gebunden ist (phase-config.ts).
  // Wenn der Webhook fall_status nicht ändert, sieht der KB die neuen Daten
  // nirgendwo.
  vs_kuerzt: 'vs-kuerzt',
  vs_nachbesichtigung: 'nachbesichtigung-laeuft',
  vs_nachbesichtigung_angefordert: 'nachbesichtigung-laeuft',
  klage_eingereicht: 'klage',
  fall_geschlossen: 'abgeschlossen',
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
    // AAR-165 / W5: vs_kuerzung_grund-Feld (AAR-161 W1) konsumieren
    if (payload.grund) updates.vs_kuerzung_grund = payload.grund
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
    // AAR-165 / W5: optionale Termin-Felder aus dem Payload mitnehmen
    if (payload.nachbesichtigung_termin) {
      updates.nachbesichtigung_termin_datum = payload.nachbesichtigung_termin
    }
    if (typeof payload.konfrontation === 'boolean') {
      updates.nachbesichtigung_konfrontation = payload.konfrontation
    }
  }
  // AAR-165 / W5: Ergebnis-Event schreibt das W1-Feld nachbesichtigung_ergebnis
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
  // AAR-165 / W5 Audit-Fix: mandatsnummer_vergeben (Subphasen-Matrix 5.2)
  // schreibt Salesforce-Mandatsnummer aus Payload nach faelle.mandatsnummer
  // bzw. as_salesforce_id (beide Spalten existieren).
  if (eventType === 'mandatsnummer_vergeben') {
    if (typeof payload.mandats_nr === 'string') {
      updates.mandatsnummer = payload.mandats_nr
      updates.as_salesforce_id = payload.mandats_nr
    } else if (typeof payload.mandatsnummer === 'string') {
      updates.mandatsnummer = payload.mandatsnummer
      updates.as_salesforce_id = payload.mandatsnummer
    }
  }
  // AAR-165 / W5 Audit-Fix: fall_geschlossen (Subphasen-Matrix Phase 9.1)
  // setzt geschlossen_grund (W1-Feld) + abgeschlossen_am.
  if (eventType === 'fall_geschlossen') {
    updates.abgeschlossen_am = payload.datum ?? now
    if (typeof payload.grund === 'string') {
      updates.geschlossen_grund = payload.grund
    }
  }

  return updates
}

/**
 * Verarbeitet ein LexDrive-Event idempotent. Wird sowohl von /api/webhooks/lexdrive
 * (source=webhook) als auch von der manuellen Admin-UI (source=manual) aufgerufen.
 */
export async function processLexDriveEvent(input: ProcessEventInput): Promise<ProcessEventResult> {
  const db = createAdminClient()

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
  const { data: eventRecord } = await db.from('webhook_events').insert({
    event_id: eventId,
    event_type: input.eventType,
    fall_id: input.fallId,
    fall_nr: input.fallNr,
    source: input.source === 'manual' ? 'manual' : 'lexdrive',
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

    // Feld-Updates
    const updates = computeFieldUpdates(input.eventType, input.payload)
    if (Object.keys(updates).length > 0) {
      await db.from('faelle').update(updates).eq('id', input.fallId)
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
        ? `Manuell ausgeloest: ${input.eventType}`
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
