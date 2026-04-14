// AAR-69 (Sub-Task 1): Vollmacht-Confirm Endpoint fuer LexDrive
// LexDrive POSTet Bestaetigung der Vollmachts-Pruefung; wir markieren Fall als
// vollmacht_geprueft + ggf. Status-Wechsel.
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Payload = {
  fall_nummer?: string
  fall_id?: string
  geprueft_am?: string
  geprueft_von?: string
  status: 'akzeptiert' | 'abgelehnt' | 'nachfrage'
  begruendung?: string
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
  if (!body.status) return NextResponse.json({ error: 'Missing status' }, { status: 400 })

  const db = createAdminClient()

  // Fall-Resolution
  let fallId = body.fall_id ?? null
  if (!fallId && body.fall_nummer) {
    const { data: fall } = await db.from('faelle').select('id').eq('fall_nummer', body.fall_nummer).maybeSingle()
    fallId = fall?.id ?? null
  }
  if (!fallId) return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })

  const now = body.geprueft_am ?? new Date().toISOString()

  await db.from('faelle').update({
    vollmacht_geprueft_am: now,
    vollmacht_geprueft_von: body.geprueft_von ?? 'lexdrive',
    vollmacht_pruefung_status: body.status,
    vollmacht_pruefung_begruendung: body.begruendung ?? null,
  }).eq('id', fallId)

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `LexDrive Vollmachtspruefung: ${body.status}`,
    beschreibung: body.begruendung ?? null,
  })

  // Bei Ablehnung: Task fuer KB
  if (body.status === 'abgelehnt' || body.status === 'nachfrage') {
    await db.from('tasks').insert({
      fall_id: fallId,
      typ: 'lexdrive_vollmacht',
      titel: `Vollmacht ${body.status} - Fall ${body.fall_nummer ?? fallId.slice(0, 8)}`,
      beschreibung: body.begruendung ?? `LexDrive hat Vollmacht ${body.status}.`,
      prioritaet: 'dringend',
      auto_erstellt: true,
    })
  }

  return NextResponse.json({ ok: true, fall_id: fallId, status: body.status })
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
