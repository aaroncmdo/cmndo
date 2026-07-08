import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFailedOperation, markOperationResolved } from '@/lib/reliability/dead-letter'

export const dynamic = 'force-dynamic'

/**
 * KFZ-143: Aircall Webhook Endpoint.
 * Empfängt call.created, call.answered, call.ended, call.hungup,
 * call.transcription_completed, realtime_transcription.utterances_received
 */
export async function POST(request: Request) {
  const body = await request.text()

  // Signatur IMMER pruefen (fail-closed): verifyWebhookSignature liefert false bei
  // fehlendem AIRCALL_WEBHOOK_TOKEN ODER fehlender/falscher Signatur. Der fruehere
  // Guard `if (TOKEN && sig)` war umgehbar — ohne x-aircall-signature-Header wurde
  // die Pruefung komplett uebersprungen (auch bei GESETZTEM Secret).
  const sig = request.headers.get('x-aircall-signature') ?? ''
  const { verifyWebhookSignature } = await import('@/lib/aircall/client')
  if (!verifyWebhookSignature(body, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { event: string; data: Record<string, unknown>; resource?: string }
  try { event = JSON.parse(body) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const db = createAdminClient()
  const eventType = event.event ?? event.resource
  const callData = (event.data?.call ?? event.data) as Record<string, unknown>
  const aircallId = String(callData?.id ?? '')

  if (!aircallId) return NextResponse.json({ ok: true })

  try {
    switch (eventType) {
      case 'call.created': {
        await db.from('calls').upsert({
          aircall_call_id: aircallId,
          richtung: callData.direction === 'outbound' ? 'outbound' : 'inbound',
          status: 'initiiert',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          von_nummer: String(callData.raw_digits ?? (callData.number as any)?.digits ?? ''),
          zu_nummer: String(callData.to ?? ''),
          gestartet_am: callData.started_at ? new Date(Number(callData.started_at) * 1000).toISOString() : new Date().toISOString(),
        }, { onConflict: 'aircall_call_id' })
        break
      }

      case 'call.ringing':
      case 'call.answered': {
        const { data: existingCall } = await db.from('calls').select('id, bridge').eq('aircall_call_id', aircallId).single()

        if (eventType === 'call.answered' && existingCall?.bridge?.leg_a_status === 'klingelt') {
          // KFZ-144: Bridge Leg A hat abgenommen → zu Leg B transferieren
          await db.from('calls').update({
            status: 'aktiv',
            beantwortet_am: new Date().toISOString(),
            bridge: { ...existingCall.bridge, leg_a_status: 'angenommen', leg_b_status: 'klingelt' },
            updated_at: new Date().toISOString(),
          }).eq('id', existingCall.id)

          // Transfer zu Leg B
          try {
            const { aircallTransferCall } = await import('@/lib/aircall/client')
            await aircallTransferCall({ callId: aircallId, toNumber: existingCall.bridge.leg_b_nummer, type: 'external' })
          } catch (err) { console.error('[KFZ-144] Bridge Transfer fehlgeschlagen:', err) }
        } else {
          await db.from('calls').update({
            status: eventType === 'call.ringing' ? 'klingelt' : 'aktiv',
            beantwortet_am: eventType === 'call.answered' ? new Date().toISOString() : undefined,
            updated_at: new Date().toISOString(),
          }).eq('aircall_call_id', aircallId)
        }
        break
      }

      case 'call.external_transferred': {
        // KFZ-144: Leg B wurde verbunden
        const { data: bridgeCall } = await db.from('calls').select('id, bridge').eq('aircall_call_id', aircallId).single()
        if (bridgeCall?.bridge) {
          await db.from('calls').update({
            status: 'aktiv',
            bridge: { ...bridgeCall.bridge, leg_b_status: 'angenommen', verbunden_um: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          }).eq('id', bridgeCall.id)
        }
        break
      }

      case 'call.unsuccessful_transfer': {
        // KFZ-144: Transfer zu Leg B fehlgeschlagen
        const { data: failCall } = await db.from('calls').select('id, bridge').eq('aircall_call_id', aircallId).single()
        if (failCall?.bridge) {
          await db.from('calls').update({
            status: 'beendet',
            beendet_am: new Date().toISOString(),
            bridge: { ...failCall.bridge, leg_b_status: 'timeout', getrennt_um: new Date().toISOString(), getrennt_grund: 'leg_b_aufgelegt' },
            updated_at: new Date().toISOString(),
          }).eq('id', failCall.id)
          // Relay-Seat freigeben
          if (failCall.bridge.relay_seat_id) {
            const { freeRelaySeat } = await import('@/lib/aircall/client')
            await freeRelaySeat(failCall.bridge.relay_seat_id)
          }
        }
        break
      }

      case 'call.ended':
      case 'call.hungup': {
        const duration = Number(callData.duration ?? 0)
        const recording = callData.recording ? String(callData.recording) : null

        await db.from('calls').update({
          status: 'beendet',
          beendet_am: new Date().toISOString(),
          dauer_sekunden: duration,
          recording_url: recording,
          updated_at: new Date().toISOString(),
        }).eq('aircall_call_id', aircallId)

        // KFZ-144: Relay-Seat freigeben bei Bridge-Call
        const { data: endedCall } = await db.from('calls').select('id, bridge').eq('aircall_call_id', aircallId).single()
        if (endedCall?.bridge?.relay_seat_id) {
          const { freeRelaySeat } = await import('@/lib/aircall/client')
          await freeRelaySeat(endedCall.bridge.relay_seat_id)
          // Bridge-Metadaten aktualisieren
          await db.from('calls').update({
            bridge: { ...endedCall.bridge, getrennt_um: new Date().toISOString(), getrennt_grund: 'normal' },
          }).eq('id', endedCall.id)
        }

        // Post-Call AI Analyse triggern (fire & forget)
        const callForAnalysis = endedCall ?? (await db.from('calls').select('id').eq('aircall_call_id', aircallId).single()).data
        if (callForAnalysis) {
          import('@/lib/copilot/post-call').then(m => m.analyzeCallPostHoc(callForAnalysis.id)).catch(err => console.error('[KFZ-143] Post-Call Analyse:', err))
        }
        break
      }

      case 'call.missed': {
        await db.from('calls').update({ status: 'verpasst', updated_at: new Date().toISOString() }).eq('aircall_call_id', aircallId)
        break
      }

      case 'call.transcription_completed': {
        const transcript = callData.transcription as Record<string, unknown> | undefined
        if (transcript) {
          await db.from('calls').update({
            transkript: transcript,
            transkript_text: typeof transcript.text === 'string' ? transcript.text : JSON.stringify(transcript),
            updated_at: new Date().toISOString(),
          }).eq('aircall_call_id', aircallId)
        }
        break
      }

      case 'realtime_transcription.utterances_received': {
        const utterances = (callData.utterances ?? []) as Array<{ speaker?: string; text?: string; start_time?: number; end_time?: number }>
        const { data: call } = await db.from('calls').select('id').eq('aircall_call_id', aircallId).single()
        if (call && utterances.length > 0) {
          // Idempotenz: Aircall kann dasselbe utterances-Event erneut zustellen
          // (at-least-once / Retry nach 500) -> ohne Dedup entstehen doppelte
          // Transkript-Zeilen. Kein DB-Unique-Constraint vorhanden -> App-Dedup gegen
          // die bestehenden Utterances dieses Calls per (start_time|speaker|text).
          const { data: vorhanden } = await db.from('call_transcription_utterances')
            .select('start_time, speaker, text')
            .eq('call_id', call.id)
          const gesehen = new Set(
            (vorhanden ?? []).map((v) => `${v.start_time ?? ''}|${v.speaker ?? ''}|${v.text ?? ''}`),
          )
          const neu = utterances.filter(
            (u) => !gesehen.has(`${u.start_time ?? ''}|${u.speaker ?? ''}|${u.text ?? ''}`),
          )
          if (neu.length > 0) {
            await db.from('call_transcription_utterances').insert(
              neu.map(u => ({
                call_id: call.id,
                aircall_call_id: aircallId,
                speaker: u.speaker ?? null,
                text: u.text ?? '',
                start_time: u.start_time ?? null,
                end_time: u.end_time ?? null,
              }))
            )
          }
        }
        break
      }
    }
  } catch (err) {
    console.error(`[KFZ-143] Webhook ${eventType} Fehler:`, err)
    // Reliability-Sweep: ins Dead-Letter + 500 -> Aircall retryt (alle DB-Ops sind idempotent:
    // upsert/update auf aircall_call_id). Bei dauerhaftem Fehler eskaliert der recovery-monitor.
    // Vorher: 200 trotz Fehler -> kein Retry -> stiller Call-Tracking-Datenverlust.
    await recordFailedOperation({
      operationType: 'aircall_webhook',
      dedupKey: `aircall_webhook:${aircallId}:${eventType}`,
      entityType: 'call',
      entityId: aircallId,
      payload: { event_type: eventType },
      error: String(err),
    })
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }

  // Erfolg: einen etwaigen frueheren Dead-Letter-Eintrag dieses (Call, Event) aufloesen.
  await markOperationResolved(`aircall_webhook:${aircallId}:${eventType}`)
  // Aircall erwartet schnelle Antwort
  return NextResponse.json({ ok: true })
}
