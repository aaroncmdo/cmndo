// AAR-97: Aircall Inbound Webhook - Call-Events + Auto-Lead bei neuer Nummer
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

type AircallCallData = {
  id: number | string
  direction?: string
  started_at?: number
  answered_at?: number
  ended_at?: number
  duration?: number
  raw_digits?: string
  from?: string
  to?: string
  user?: { id?: number | string; email?: string }
  recording?: string
  voicemail?: string
  comments?: Array<{ content: string }>
  tags?: string[]
}

type AircallEvent = {
  event: string
  data: AircallCallData
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-aircall-signature') ?? ''
  const secret = process.env.AIRCALL_WEBHOOK_TOKEN

  // HMAC-Check (falls Secret konfiguriert)
  if (secret) {
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } catch {
      return NextResponse.json({ error: 'Signature mismatch' }, { status: 401 })
    }
  }

  let event: AircallEvent
  try { event = JSON.parse(body) as AircallEvent } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = event.event ?? ''
  const callData = event.data
  if (!callData?.id) return NextResponse.json({ error: 'Missing call data' }, { status: 400 })

  const admin = createAdminClient()
  const aircallId = String(callData.id)
  const direction = callData.direction === 'inbound' ? 'inbound' : 'outbound'
  const fromNumber = callData.raw_digits ?? callData.from ?? ''
  const toNumber = callData.to ?? ''

  let status: 'answered' | 'missed' | 'voicemail' | 'failed' = 'failed'
  if (eventType === 'call.answered') status = 'answered'
  else if (eventType === 'call.ended' && (callData.duration ?? 0) > 0) status = 'answered'
  else if (eventType === 'call.ended' && !callData.answered_at) status = 'missed'
  else if (eventType === 'call.voicemail_left') status = 'voicemail'

  // Lead-Match / Auto-Lead bei Inbound
  let leadId: string | null = null
  let isNewLead = false

  if (direction === 'inbound' && fromNumber) {
    const normalized = fromNumber.replace(/[^0-9]/g, '')
    const suffix = normalized.slice(-9)

    const { data: existingLead } = await admin
      .from('leads')
      .select('id')
      .ilike('telefon', `%${suffix}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingLead) {
      leadId = existingLead.id
    } else if (eventType === 'call.created') {
      // Nur bei call.created neuen Lead anlegen - verhindert Duplikate bei ended/answered
      const { data: newLead } = await admin
        .from('leads')
        .insert({
          vorname: 'Unbekannt',
          nachname: 'Anrufer',
          telefon: fromNumber,
          source_channel: 'aircall-inbound',
          status: 'neu',
          qualifizierungs_phase: 'neu',
          notiz: `Auto-erstellt durch eingehenden Anruf am ${new Date().toLocaleString('de-DE')}`,
        })
        .select('id')
        .single()
      leadId = newLead?.id ?? null
      isNewLead = true

      // Notification an alle Dispatcher
      if (leadId) {
        const { data: dispatcher } = await admin
          .from('profiles')
          .select('id')
          .in('rolle', ['dispatch', 'admin'])
        for (const d of dispatcher ?? []) {
          createNotification(
            d.id,
            'eingehender-anruf',
            `Eingehender Anruf von ${fromNumber}`,
            isNewLead ? 'Neuer Lead automatisch angelegt' : 'Bekannter Lead',
            `/dispatch/leads/${leadId}`,
          ).catch(() => {})
        }
      }
    }
  }

  // Upsert Call-Record
  await admin.from('aircall_calls').upsert({
    aircall_id: aircallId,
    direction,
    status,
    started_at: callData.started_at ? new Date(callData.started_at * 1000).toISOString() : new Date().toISOString(),
    answered_at: callData.answered_at ? new Date(callData.answered_at * 1000).toISOString() : null,
    ended_at: callData.ended_at ? new Date(callData.ended_at * 1000).toISOString() : null,
    duration: callData.duration ?? null,
    from_number: fromNumber,
    to_number: toNumber,
    aircall_user_id: callData.user?.id ? String(callData.user.id) : null,
    aircall_user_email: callData.user?.email ?? null,
    lead_id: leadId,
    recording_url: callData.recording ?? null,
    voicemail_url: callData.voicemail ?? null,
    comments: (callData.comments ?? []).map(c => c.content).join('\n') || null,
    tags: callData.tags ?? null,
    raw_event: event as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'aircall_id' })

  return NextResponse.json({ ok: true, lead_id: leadId, is_new_lead: isNewLead })
}
