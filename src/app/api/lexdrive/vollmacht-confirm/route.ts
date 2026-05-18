// AAR-69 (Sub-Task 1): Vollmacht-Confirm Endpoint fuer LexDrive
// LexDrive POSTet Bestaetigung der Vollmachts-Pruefung; wir markieren Fall als
// vollmacht_geprueft + ggf. Status-Wechsel.
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Payload = {
  // CMM-44 SP-A3: Der extern gelieferte Aktennummern-Wert ist die kanonische claim_nummer.
  claim_nummer?: string
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
  // CMM-44 SP-A3: Die alte Akten-Spalte auf faelle ist abgeschafft — Lookup laeuft
  // jetzt ueber claims.claim_nummer (SSoT). claims hat keine fall_id-Spalte, daher
  // Rueckverknuepfung ueber faelle.claim_id.
  let fallId = body.fall_id ?? null
  let claimId: string | null = null
  if (!fallId && body.claim_nummer) {
    const { data: claim } = await db.from('claims').select('id').eq('claim_nummer', body.claim_nummer).maybeSingle()
    if (claim?.id) {
      claimId = claim.id
      const { data: fall } = await db.from('faelle').select('id').eq('claim_id', claim.id).maybeSingle()
      fallId = fall?.id ?? null
    }
  }
  if (!fallId) return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })

  // CMM-44 SP-B PR2b: claim_id ermitteln wenn noch nicht bekannt — die
  // vollmacht_geprueft_*-Spalten leben auf claims (SSoT).
  if (!claimId) {
    const { data: fallRow } = await db.from('faelle').select('claim_id').eq('id', fallId).maybeSingle()
    claimId = (fallRow?.claim_id as string | null) ?? null
  }
  if (!claimId) return NextResponse.json({ error: 'Fall hat keinen verknüpften Claim' }, { status: 404 })

  const now = body.geprueft_am ?? new Date().toISOString()

  // CMM-44 SP-B PR2b: vollmacht_geprueft_*/pruefung_* leben auf claims (SSoT) —
  // Write komplett nach claims verschoben (kein faelle-Write mehr).
  await db.from('claims').update({
    vollmacht_geprueft_am: now,
    vollmacht_geprueft_von: body.geprueft_von ?? 'lexdrive',
    vollmacht_pruefung_status: body.status,
    vollmacht_pruefung_begruendung: body.begruendung ?? null,
  }).eq('id', claimId)

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
      titel: `Vollmacht ${body.status} - Fall ${body.claim_nummer ?? fallId.slice(0, 8)}`,
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
