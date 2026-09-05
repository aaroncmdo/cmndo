import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import type { AnspruchPosition, Schuldform, Schweregrad, Segment, TotalschadenInfo, VisionResult } from './types'

// schuld-Spalte existiert in der DB (Migration 20260706085339); die generierten Supabase-Typen
// hinken noch hinterher (Regen aufgeschoben — database.types.ts wird parallel von anderen Sessions
// bearbeitet). Lokale Typ-Erweiterung haelt die Feldpruefung auf allen bekannten Spalten intakt.
type AnspruchUpdate = Database['public']['Tables']['anspruch_schaetzungen']['Update'] & { schuld?: string | null }

const BUCKET = 'fall-dokumente'
const MAX_FOTOS = 8

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `leadId` (optional): kommt aus `/embed/anspruch-pruefen?lead=<uuid>` — den Link setzt der
 * /check-Funnel NACH dem Lead-Submit. Ohne ihn bleibt `lead_id` NULL und die Schaetzung
 * erreicht niemanden: `getAnspruchVorschauFuerFall` laeuft ueber claims.lead_id ->
 * anspruch_schaetzungen.lead_id, d.h. eine Session ohne lead_id ist fuer den SV unsichtbar
 * (prod 30.08.: 62 Schaetzungen, 0 mit lead_id).
 *
 * Die ID wird serverseitig geprueft (UUID-Form + Lead existiert), damit ein manipulierter
 * Query-Param keine Schaetzung an einen beliebigen Fremd-Lead haengt. Schlaegt die Pruefung
 * fehl, entsteht die Session trotzdem — nur eben unverknuepft. Der Foto-Check ist ein anonymes
 * Embed; mehr Schutz als "nicht erratbare UUID" gibt es hier nicht (gleiches Vertrauensmodell
 * wie beim bestehenden `?schaetzung=<session_token>`-Handoff zum Gutachter-Finder).
 */
export async function erstelleSession(
  leadId?: string | null,
): Promise<{ ok: true; sessionToken: string } | { ok: false; error: string }> {
  const db = createAdminClient()
  const sessionToken = randomUUID()

  let verknuepft: string | null = null
  if (leadId && UUID_RE.test(leadId)) {
    const { data: lead } = await db.from('leads').select('id').eq('id', leadId).maybeSingle()
    if (lead) verknuepft = lead.id
    else console.warn('[anspruch/session] lead-Param zeigt auf keinen Lead:', leadId)
  }

  const { error } = await db
    .from('anspruch_schaetzungen')
    .insert({ session_token: sessionToken, lead_id: verknuepft })
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
  schuld: Schuldform,
  positionen: AnspruchPosition[],
  totalschaden?: TotalschadenInfo,
): Promise<void> {
  const db = createAdminClient()
  const patch: AnspruchUpdate = { erkanntes_segment: segment, schweregrad, fahrbereit, ez_jahr: ezJahr, schuld, positionen, totalschaden: totalschaden ?? null }
  const { error } = await db
    .from('anspruch_schaetzungen')
    .update(patch)
    .eq('session_token', sessionToken)
  if (error) console.error('[anspruch/session] speicherePositionen failed:', error.message)
}

export async function promoteSessionAufLead(sessionToken: string, leadId: string): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('anspruch_schaetzungen').update({ lead_id: leadId }).eq('session_token', sessionToken)
  if (error) console.error('[anspruch/session] promoteSessionAufLead failed:', error.message)
}
