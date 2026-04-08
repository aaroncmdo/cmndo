import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * KFZ-143: Aircall Webhook Endpoint.
 * Empfängt call.created, call.answered, call.ended, call.hungup,
 * call.transcription_completed, realtime_transcription.utterances_received
 */
export async function POST(request: Request) {
  const body = await request.text()

  // Signatur prüfen (falls Token gesetzt)
  const sig = request.headers.get('x-aircall-signature') ?? ''
  if (process.env.AIRCALL_WEBHOOK_TOKEN && sig) {
    const { verifyWebhookSignature } = await import('@/lib/aircall/client')
    if (!verifyWebhookSignature(body, sig)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
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
          von_nummer: String(callData.raw_digits ?? callData.number?.digits ?? ''),
          zu_nummer: String(callData.to ?? ''),
          gestartet_am: callData.started_at ? new Date(Number(callData.started_at) * 1000).toISOString() : new Date().toISOString(),
        }, { onConflict: 'aircall_call_id' })
        break
      }

      case 'call.ringing':
      case 'call.answered': {
        await db.from('calls').update({
          status: eventType === 'call.ringing' ? 'klingelt' : 'aktiv',
          beantwortet_am: eventType === 'call.answered' ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        }).eq('aircall_call_id', aircallId)
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

        // Post-Call AI Analyse triggern (fire & forget)
        const { data: call } = await db.from('calls').select('id').eq('aircall_call_id', aircallId).single()
        if (call) {
          import('@/lib/copilot/post-call').then(m => m.analyzeCallPostHoc(call.id)).catch(err => console.error('[KFZ-143] Post-Call Analyse:', err))
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
          await db.from('call_transcription_utterances').insert(
            utterances.map(u => ({
              call_id: call.id,
              aircall_call_id: aircallId,
              speaker: u.speaker ?? null,
              text: u.text ?? '',
              start_time: u.start_time ?? null,
              end_time: u.end_time ?? null,
            }))
          )
        }
        break
      }
    }
  } catch (err) {
    console.error(`[KFZ-143] Webhook ${eventType} Fehler:`, err)
  }

  // Aircall erwartet schnelle Antwort
  return NextResponse.json({ ok: true })
}
