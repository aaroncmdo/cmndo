import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { sendFallCommunication } from '@/lib/communications/send-fall'

export const dynamic = 'force-dynamic'

// KFZ-209: LexDrive Webhook Endpoint
// Shared-Secret Auth, 21 Events, Idempotenz via webhook_events

const VALID_EVENTS = [
  'vollmacht_bestaetigt', 'akte_eingegangen_bestaetigt',
  'as_versendet', 'mahnung_versendet',
  'vs_kuerzt', 'ruege_1_gesendet', 'ruege_1_anerkannt',
  'ruege_2_gesendet', 'ruege_2_anerkannt', 'ruege_abgelehnt',
  'vs_reguliert_voll', 'vs_fristverlaengerung',
  'vs_nachbesichtigung', 'vs_ablehnung',
  'klage_eingereicht', 'regulierung_angekuendigt',
  'zahlung_eingegangen',
  'technische_stellungnahme_benoetigt',
  'vs_nachbesichtigung_angefordert', 'vs_nachbesichtigung_ergebnis',
] as const

type EventType = typeof VALID_EVENTS[number]

const EVENT_COMM_MAP: Partial<Record<EventType, string>> = {
  as_versendet: 'as_gesendet',
  vs_reguliert_voll: 'regulierung_angekuendigt',
  regulierung_angekuendigt: 'regulierung_angekuendigt',
  zahlung_eingegangen: 'zahlung_eingegangen',
  vs_kuerzt: 'kuerzung_eingetragen',
}

const EVENT_STATUS_MAP: Partial<Record<EventType, string>> = {
  as_versendet: 'anschlussschreiben',
  vs_reguliert_voll: 'regulierung-laeuft',
  regulierung_angekuendigt: 'regulierung-laeuft',
  zahlung_eingegangen: 'zahlung-eingegangen',
  vs_ablehnung: 'vs-abgelehnt',
}

export async function POST(req: NextRequest) {
  // Auth: Shared-Secret
  const secret = process.env.LEXDRIVE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })

  const authHeader = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (authHeader !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = body.event_type as string
  const eventId = body.event_id as string
  const fallNr = body.fall_nr as string

  if (!eventType || !eventId || !fallNr) {
    return NextResponse.json({ error: 'Missing fields: event_type, event_id, fall_nr' }, { status: 400 })
  }

  if (!VALID_EVENTS.includes(eventType as EventType)) {
    return NextResponse.json({ error: `Unknown event_type: ${eventType}` }, { status: 400 })
  }

  const db = createAdminClient()

  // Idempotenz-Check
  const { data: existing } = await db
    .from('webhook_events')
    .select('id, status')
    .eq('event_id', eventId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true, message: 'Already processed' })
  }

  // Fall-Lookup
  const { data: fall } = await db
    .from('faelle')
    .select('id, status')
    .eq('fall_nummer', fallNr)
    .maybeSingle()

  // Event loggen (auch wenn Fall nicht gefunden)
  const { data: eventRecord } = await db.from('webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
    fall_id: fall?.id ?? null,
    fall_nr: fallNr,
    payload: body,
    status: fall ? 'pending' : 'skipped',
    ...(!fall && { error_message: `Fall mit Nummer ${fallNr} nicht gefunden` }),
  }).select('id').single()

  if (!fall) {
    return NextResponse.json({ ok: true, skipped: true, message: `Fall ${fallNr} not found` })
  }

  try {
    // Status-Transition (falls definiert)
    const newStatus = EVENT_STATUS_MAP[eventType as EventType]
    if (newStatus) {
      try {
        await transitionFallStatus(fall.id, newStatus, {
          grund: body.grund as string | undefined,
          betrag: body.betrag ? Number(body.betrag) : undefined,
        })
      } catch {
        // Transition nicht erlaubt — kein Abbruch, Event trotzdem verarbeiten
      }
    }

    // Felder-Updates je Event
    const updates: Record<string, unknown> = {}

    if (eventType === 'as_versendet') {
      updates.anschlussschreiben_am = body.datum ?? new Date().toISOString()
    }
    if (eventType === 'vs_kuerzt') {
      updates.vs_reaktion_typ = 'gekuerzt'
      updates.vs_reaktion_am = body.datum ?? new Date().toISOString()
      if (body.kuerzungs_betrag) updates.kuerzungs_betrag = Number(body.kuerzungs_betrag)
      if (body.anerkannt_betrag) updates.regulierung_betrag = Number(body.anerkannt_betrag)
    }
    if (eventType === 'vs_reguliert_voll') {
      updates.vs_reaktion_typ = 'voll_reguliert'
      updates.vs_reaktion_am = body.datum ?? new Date().toISOString()
      if (body.betrag) updates.regulierung_betrag = Number(body.betrag)
    }
    if (eventType === 'vs_ablehnung') {
      updates.vs_reaktion_typ = 'abgelehnt'
      updates.vs_reaktion_am = body.datum ?? new Date().toISOString()
      if (body.grund) updates.vs_ablehnungsgrund = body.grund as string
    }
    if (eventType === 'vs_fristverlaengerung') {
      updates.vs_reaktion_typ = 'mehr_zeit'
      updates.vs_reaktion_am = new Date().toISOString()
      if (body.frist_bis) updates.vs_frist_bis = body.frist_bis as string
    }
    if (eventType === 'vs_nachbesichtigung' || eventType === 'vs_nachbesichtigung_angefordert') {
      updates.vs_reaktion_typ = 'nachbesichtigung'
      updates.nachbesichtigung_status = 'angefordert'
      updates.nachbesichtigung_angefordert_am = body.datum ?? new Date().toISOString()
    }
    if (eventType === 'zahlung_eingegangen') {
      updates.zahlung_eingegangen_am = body.datum ?? new Date().toISOString()
      if (body.betrag) updates.zahlung_betrag = Number(body.betrag)
      if (body.zahlungsweg) updates.zahlungsweg = body.zahlungsweg as string
    }
    if (eventType === 'ruege_1_gesendet' || eventType === 'ruege_2_gesendet') {
      updates.ruege_gesendet_am = body.datum ?? new Date().toISOString()
      updates.ruege_counter = eventType === 'ruege_1_gesendet' ? 1 : 2
    }
    if (eventType === 'technische_stellungnahme_benoetigt') {
      updates.technische_stellungnahme_status = 'beauftragt'
      updates.technische_stellungnahme_beauftragt_am = new Date().toISOString()
    }

    if (Object.keys(updates).length > 0) {
      await db.from('faelle').update(updates).eq('id', fall.id)
    }

    // WA-Template triggern (falls definiert)
    const commTrigger = EVENT_COMM_MAP[eventType as EventType]
    if (commTrigger) {
      sendFallCommunication(fall.id, commTrigger).catch(() => {})
    }

    // Timeline-Entry
    await db.from('timeline').insert({
      fall_id: fall.id,
      typ: 'webhook',
      titel: `LexDrive: ${eventType}`,
      beschreibung: body.beschreibung as string ?? `Webhook-Event ${eventType} verarbeitet.`,
    })

    // Event als verarbeitet markieren
    if (eventRecord?.id) {
      await db.from('webhook_events').update({
        status: 'processed',
        processed_at: new Date().toISOString(),
      }).eq('id', eventRecord.id)
    }

    return NextResponse.json({ ok: true, fall_id: fall.id, event_type: eventType })
  } catch (err) {
    // Fehler loggen
    if (eventRecord?.id) {
      await db.from('webhook_events').update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
        processed_at: new Date().toISOString(),
      }).eq('id', eventRecord.id)
    }

    return NextResponse.json({ error: 'Processing failed', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
