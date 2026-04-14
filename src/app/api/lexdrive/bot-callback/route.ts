// AAR-69 (Sub-Task 2): Bot-Callback Endpoint fuer LexDrive
// LexDrive-Bot ruft hier nach automatisierter Aktion zurueck (z.B. Mahnung versendet,
// Termin gebucht, Dokument generiert).
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Payload = {
  fall_nummer?: string
  fall_id?: string
  bot_action: string  // z.B. 'mahnung_generiert', 'termin_gebucht', 'dokument_erstellt'
  result: 'success' | 'error'
  details?: Record<string, unknown>
  attachments?: Array<{ name: string; url?: string }>
  timestamp?: string
}

export async function POST(req: NextRequest) {
  const secret = process.env.LEXDRIVE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Endpoint not configured' }, { status: 500 })

  const rawBody = await req.text()
  if (!verifyAuth(req, rawBody, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Payload
  try { body = JSON.parse(rawBody) as Payload } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.bot_action || !body.result) {
    return NextResponse.json({ error: 'Missing bot_action or result' }, { status: 400 })
  }

  const db = createAdminClient()

  // Fall-Resolution
  let fallId = body.fall_id ?? null
  if (!fallId && body.fall_nummer) {
    const { data: fall } = await db.from('faelle').select('id').eq('fall_nummer', body.fall_nummer).maybeSingle()
    fallId = fall?.id ?? null
  }

  // Audit-Eintrag in webhook_events
  await db.from('webhook_events').insert({
    source: 'lexdrive_bot',
    event_type: body.bot_action,
    fall_id: fallId,
    fall_nr: body.fall_nummer ?? null,
    payload: body as unknown as Record<string, unknown>,
    status: body.result === 'success' ? 'processed' : 'error',
    error_message: body.result === 'error' ? JSON.stringify(body.details ?? {}) : null,
    processed_at: new Date().toISOString(),
  })

  if (!fallId) {
    return NextResponse.json({ ok: true, warning: 'Fall nicht gefunden, nur geloggt' })
  }

  // Timeline-Eintrag
  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `LexDrive-Bot: ${body.bot_action} (${body.result})`,
    beschreibung: body.details ? JSON.stringify(body.details) : null,
  })

  // Anhaenge in fall_dokumente persistieren
  for (const att of body.attachments ?? []) {
    if (att.url) {
      await db.from('fall_dokumente').insert({
        fall_id: fallId,
        typ: 'lexdrive_bot_output',
        kategorie: 'lexdrive',
        datei_url: att.url,
        datei_name: att.name,
        quelle: 'lexdrive_bot',
      })
    }
  }

  // Bei Fehler: Eskalations-Task
  if (body.result === 'error') {
    await db.from('tasks').insert({
      fall_id: fallId,
      typ: 'lexdrive_bot_error',
      titel: `Bot-Fehler: ${body.bot_action} - Fall ${body.fall_nummer ?? fallId.slice(0, 8)}`,
      beschreibung: body.details ? JSON.stringify(body.details) : 'Bot-Aktion fehlgeschlagen.',
      prioritaet: 'dringend',
      auto_erstellt: true,
    })
  }

  return NextResponse.json({ ok: true, fall_id: fallId, bot_action: body.bot_action })
}

function verifyAuth(req: NextRequest, rawBody: string, secret: string): boolean {
  const sig = req.headers.get('x-lexdrive-signature')
  if (sig) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const provided = sig.startsWith('sha256=') ? sig.slice(7) : sig
    try {
      return expected.length === provided.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    } catch { return false }
  }
  const auth = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  return auth === secret
}
