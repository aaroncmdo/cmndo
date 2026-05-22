// matelso Inbound-Webhook — Call-Events + Auto-Lead fuer die kfzgutachter Ads-LP.
// Ersetzt Aircall als Call-Tracker fuer die LP-Nummer; aircall_calls bleibt unberuehrt.
// Spec: docs/superpowers/specs/2026-05-22-matelso-call-tracking-webhook-design.md
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { createNotification } from '@/lib/notifications'
import { matchInboundToFall } from '@/lib/inbound/match-fall'
import { MatelsoEventSchema } from '@/lib/schemas/matelso-event'
import {
  normalizeMatelsoStatus,
  buildDedupKey,
  pickNotificationLink,
  buildCallNotificationText,
} from '@/lib/matelso/process-call'

export const dynamic = 'force-dynamic'

function secretValid(provided: string | null, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // 1. Auth — ?secret= gegen MATELSO_WEBHOOK_SECRET (timing-safe).
  const secret = process.env.MATELSO_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  if (!secretValid(req.nextUrl.searchParams.get('secret'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse + Validate.
  const body = await req.text()
  let rawJson: unknown
  try {
    rawJson = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = MatelsoEventSchema.safeParse(rawJson)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: 'Invalid matelso payload', detail: `${first?.path.join('.')}: ${first?.message}` },
      { status: 400 },
    )
  }
  const event = parsed.data

  const admin = createAdminClient()
  const fromNumber = (event.anrufer_nummer ?? '').trim()
  const toNumber = (event.angerufene_nummer ?? '').trim()
  const status = normalizeMatelsoStatus(event.anruf_status)
  const duration = event.dauer_sekunden != null ? Number(event.dauer_sekunden) : null
  const quelle = event.quelle ?? null
  const parsedTime = event.zeitpunkt ? new Date(event.zeitpunkt) : null
  const startedAtIso =
    parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime.toISOString() : new Date().toISOString()
  const externalCallId = buildDedupKey({ callId: event.call_id, from: fromNumber, zeitpunkt: event.zeitpunkt })

  // 3. Idempotenz — bekannter Call? -> nur aktualisieren, kein 2. Lead/Notification.
  const { data: existing } = await admin
    .from('matelso_calls')
    .select('id, lead_id, fall_id')
    .eq('external_call_id', externalCallId)
    .maybeSingle()

  if (existing) {
    await admin
      .from('matelso_calls')
      .update({
        status,
        status_raw: event.anruf_status ?? null,
        duration,
        quelle,
        raw_payload: event as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('external_call_id', externalCallId)
    return NextResponse.json({ ok: true, deduped: true, lead_id: existing.lead_id, fall_id: existing.fall_id })
  }

  // 4. Match auf bestehenden Lead/Fall.
  let leadId: string | null = null
  let fallId: string | null = null
  let isNewLead = false

  if (fromNumber) {
    const match = await matchInboundToFall(admin, fromNumber)
    leadId = match.leadId
    fallId = match.fallId

    // 5. Auto-Lead nur wenn weder Lead noch Fall gematcht (wie Aircall).
    if (!leadId && !fallId) {
      const nowBerlin = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
      const created = await createLead(
        admin,
        { source_channel: 'matelso-call', status: 'neu', telefon: fromNumber, vorname: 'Unbekannt', nachname: 'Anrufer' },
        {
          qualifizierungs_phase: 'neu',
          notiz: `Auto-erstellt durch matelso-Anruf am ${nowBerlin} · Quelle: ${quelle ?? 'unbekannt'} · Status: ${status} · Dauer: ${duration ?? 0}s`,
        },
      )
      leadId = created.ok ? created.leadId : null
      isNewLead = created.ok
    }
  }

  // 6. Notification an Dispatch+Admin bei JEDEM Anruf (fire-and-forget).
  try {
    const { data: staff } = await admin.from('profiles').select('id').in('rolle', ['dispatch', 'admin'])
    const { titel, beschreibung } = buildCallNotificationText({ fromNumber, quelle, status, duration })
    const link = pickNotificationLink(leadId, fallId)
    for (const s of staff ?? []) {
      createNotification(s.id, 'eingehender-anruf', titel, beschreibung, link).catch(() => {})
    }
  } catch {
    // non-critical — darf den Status nicht brechen
  }

  // 7. Call-Record speichern.
  const { error: insertError } = await admin.from('matelso_calls').insert({
    external_call_id: externalCallId,
    direction: 'inbound',
    status,
    status_raw: event.anruf_status ?? null,
    from_number: fromNumber || null,
    to_number: toNumber || null,
    duration,
    quelle,
    started_at: startedAtIso,
    lead_id: leadId,
    fall_id: fallId,
    raw_payload: event as unknown as Record<string, unknown>,
  })
  if (insertError) {
    return NextResponse.json({ error: 'DB insert failed', detail: insertError.message }, { status: 500 })
  }

  // 8. OK.
  return NextResponse.json({ ok: true, lead_id: leadId, fall_id: fallId, is_new_lead: isNewLead })
}
