import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AnspruchPosition, Schweregrad, Segment, VisionResult } from './types'

const BUCKET = 'fall-dokumente'
const MAX_FOTOS = 8

export async function erstelleSession(): Promise<
  { ok: true; sessionToken: string } | { ok: false; error: string }
> {
  const db = createAdminClient()
  const sessionToken = randomUUID()
  const { error } = await db.from('anspruch_schaetzungen').insert({ session_token: sessionToken })
  if (error) return { ok: false, error: error.message }
  return { ok: true, sessionToken }
}

async function ladeSession(db: ReturnType<typeof createAdminClient>, sessionToken: string) {
  const { data } = await db
    .from('anspruch_schaetzungen')
    .select('id, foto_pfade, lead_id')
    .eq('session_token', sessionToken)
    .maybeSingle()
  return data
}

export async function ladeFotoInSession(
  sessionToken: string,
  file: { bytes: ArrayBuffer; contentType: string; ext: string },
): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }> {
  const db = createAdminClient()
  const row = await ladeSession(db, sessionToken)
  if (!row) return { ok: false, error: 'Session nicht gefunden' }
  const pfade = Array.isArray(row.foto_pfade) ? (row.foto_pfade as string[]) : []
  if (pfade.length >= MAX_FOTOS) return { ok: false, error: `Maximal ${MAX_FOTOS} Fotos` }

  const path = `anspruch/${sessionToken}/${randomUUID()}.${file.ext}`
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, file.bytes, { contentType: file.contentType, upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  const neu = [...pfade, path]
  const { error: dbErr } = await db
    .from('anspruch_schaetzungen')
    .update({ foto_pfade: neu })
    .eq('session_token', sessionToken)
  if (dbErr) return { ok: false, error: dbErr.message }
  return { ok: true, anzahl: neu.length }
}

export async function ladeFotoUrls(sessionToken: string): Promise<string[]> {
  const db = createAdminClient()
  const row = await ladeSession(db, sessionToken)
  const pfade = Array.isArray(row?.foto_pfade) ? (row!.foto_pfade as string[]) : []
  const signed = await Promise.all(
    pfade.map(async (p) => {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(p, 300)
      return data?.signedUrl ?? null
    }),
  )
  return signed.filter((u): u is string => Boolean(u))
}

export async function speichereVisionResult(sessionToken: string, vision: VisionResult): Promise<void> {
  const db = createAdminClient()
  const { error } = await db
    .from('anspruch_schaetzungen')
    .update({
      vision_result: vision,
      erkanntes_segment: vision.segment,
      schweregrad: vision.schweregrad,
    })
    .eq('session_token', sessionToken)
  if (error) console.error('[anspruch/session] speichereVisionResult failed:', error.message)
}

export async function speicherePositionen(
  sessionToken: string,
  segment: Segment,
  schweregrad: Schweregrad,
  fahrbereit: boolean,
  ezJahr: number | null,
  positionen: AnspruchPosition[],
): Promise<void> {
  const db = createAdminClient()
  const { error } = await db
    .from('anspruch_schaetzungen')
    .update({ erkanntes_segment: segment, schweregrad, fahrbereit, ez_jahr: ezJahr, positionen })
    .eq('session_token', sessionToken)
  if (error) console.error('[anspruch/session] speicherePositionen failed:', error.message)
}

export async function promoteSessionAufLead(sessionToken: string, leadId: string): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('anspruch_schaetzungen').update({ lead_id: leadId }).eq('session_token', sessionToken)
  if (error) console.error('[anspruch/session] promoteSessionAufLead failed:', error.message)
}
