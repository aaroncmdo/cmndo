// AAR-97: Aircall Inbound Webhook - Call-Events + Auto-Lead bei neuer Nummer
// AAR-1480: Body-Validation jetzt via AircallEventSchema (Zod, src/lib/schemas/aircall-event.ts)
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/aircall/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { createCase } from '@/lib/intake/create-case'
import { createNotification } from '@/lib/notifications'
import { AircallEventSchema } from '@/lib/schemas/aircall-event'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-aircall-signature') ?? ''

  // HMAC IMMER pruefen (fail-closed): verifyWebhookSignature liefert false bei
  // fehlendem AIRCALL_WEBHOOK_TOKEN ODER fehlender/falscher Signatur. Der fruehere
  // `if (secret)`-Guard uebersprang die Pruefung komplett, wenn das Secret unset war.
  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // AAR-1480: Parse + Zod-Validation in einem Schritt (vorher: untyped cast).
  let rawJson: unknown
  try { rawJson = JSON.parse(body) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = AircallEventSchema.safeParse(rawJson)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: 'Invalid Aircall payload', detail: `${first?.path.join('.')}: ${first?.message}` },
      { status: 400 },
    )
  }
  const event = parsed.data
  const eventType = event.event
  const callData = event.data

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

  // Lead-Match / Auto-Lead bei Inbound (AAR-103: Multi-Fall-aware)
  let leadId: string | null = null
  let fallId: string | null = null
  // CMM-49: aircall_calls ist claim-gekeyt; interim faelle.claim_id-Lookup (P4-TODO: claimId aus matchInboundToFall threaden).
  let claimId: string | null = null
  let isNewLead = false

  if (direction === 'inbound' && fromNumber) {
    const { matchInboundToFall } = await import('@/lib/inbound/match-fall')
    const match = await matchInboundToFall(admin, fromNumber)
    leadId = match.leadId
    fallId = match.fallId
    if (fallId) {
      claimId = await resolveClaimId(admin, fallId)
    }

    if (!leadId && !fallId && eventType === 'call.created') {
      // Nur bei call.created neuen Lead anlegen - verhindert Duplikate bei ended/answered.
      // C2b (Fundament D-4b): via createCase statt createLead -> der Anrufer-Lead bekommt jetzt
      // GARANTIERT einen FlowLink (DECISIONS 2026-08-04 §7#1). Vorher entstand er ohne Kunde-
      // Kanal: der Dispatcher hatte nichts zum Verschicken, der Anrufer keinen Selbstbedien-Weg.
      // mode='lead-first' (ein Anruf ist noch kein Fall — Konversion spaeter via /flow).
      // KEIN generischer dedup-Key: der ist ohne Kennzeichen unbrauchbar (dedupKeyIsUsable),
      // und der praezisere Telefon-Dedup laeuft bereits oben ueber matchInboundToFall.
      const created = await createCase(admin, {
        mode: 'lead-first',
        base: {
          source_channel: 'aircall-inbound',
          status: 'neu',
          // AAR-956 17.07. (Befund 4, PR #4473/E5): KEINE Platzhalter-Strings mehr —
          // vorname=NULL ist die Wahrheit ("Name unbekannt"). Kundensichtbare Flaechen
          // (FlowLink-Gruss #4469 heading_ohne_name) und Staff-UIs (Render-Fallback
          // `|| 'Unbekannt'`) behandeln NULL korrekt; 'Hallo Unbekannt!' entfaellt.
          telefon: fromNumber,
        },
        extra: {
          qualifizierungs_phase: 'neu',
          notiz: `Auto-erstellt durch eingehenden Anruf am ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
        },
      })
      leadId = created.ok ? created.leadId : null
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
    claim_id: claimId,
    recording_url: callData.recording ?? null,
    voicemail_url: callData.voicemail ?? null,
    comments: (callData.comments ?? []).map(c => c.content).join('\n') || null,
    tags: callData.tags ?? null,
    raw_event: event as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'aircall_id' })

  return NextResponse.json({ ok: true, lead_id: leadId, fall_id: fallId, is_new_lead: isNewLead })
}
