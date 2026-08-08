'use server'

// GEO-P2 SP2: Anon Token-Response für die NPS-Umfrage. Kein Login.
// Muster: /kunde-termin/[token] — Service-Role-Write nach Token-Validierung.
import { createAdminClient } from '@/lib/supabase/admin'
import { isTokenExpired, isRatingValid } from '@/lib/nps/nps'

export type NpsFeedback = {
  claim_nummer: string | null
  beantwortet: boolean
}

async function loadByToken(token: string) {
  const db = createAdminClient()
  const { data } = await db
    .from('kunde_feedback')
    .select('id, claim_id, token_expires_at, beantwortet_am, abgemeldet_am')
    .eq('response_token', token)
    .maybeSingle()
  return { db, row: data }
}

export async function getNpsByToken(
  token: string,
): Promise<{ feedback: NpsFeedback | null; error?: string }> {
  const { db, row } = await loadByToken(token)
  if (!row) return { feedback: null, error: 'Link ungültig.' }
  if (row.beantwortet_am) {
    return { feedback: null, error: 'Vielen Dank — Ihre Bewertung liegt uns bereits vor.' }
  }
  if (isTokenExpired(row.token_expires_at as string | null)) {
    return { feedback: null, error: 'Dieser Link ist abgelaufen.' }
  }
  let claimNummer: string | null = null
  if (row.claim_id) {
    const { data: claim } = await db
      .from('claims')
      .select('claim_nummer')
      .eq('id', row.claim_id as string)
      .maybeSingle()
    claimNummer = (claim?.claim_nummer as string | null) ?? null
  }
  return { feedback: { claim_nummer: claimNummer, beantwortet: false } }
}

export async function submitNpsByToken(
  token: string,
  rating: number,
  kommentar?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isRatingValid(rating)) {
    return { ok: false, error: 'Bitte eine Bewertung von 0 bis 10 wählen.' }
  }
  const { db, row } = await loadByToken(token)
  if (!row) return { ok: false, error: 'Link ungültig.' }
  if (row.beantwortet_am) return { ok: false, error: 'Ihre Bewertung liegt uns bereits vor.' }
  if (isTokenExpired(row.token_expires_at as string | null)) {
    return { ok: false, error: 'Dieser Link ist abgelaufen.' }
  }
  const now = new Date().toISOString()
  const { data: upd, error } = await db
    .from('kunde_feedback')
    .update({ rating, kommentar: kommentar?.trim() || null, beantwortet_am: now, token_expires_at: now })
    .eq('response_token', token)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!upd || upd.length === 0) return { ok: false, error: 'Bewertung konnte nicht gespeichert werden.' }
  return { ok: true }
}

export async function abmeldenByToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const { db, row } = await loadByToken(token)
  if (!row) return { ok: false, error: 'Link ungültig.' }
  const now = new Date().toISOString()
  const { error } = await db
    .from('kunde_feedback')
    .update({ abgemeldet_am: now, token_expires_at: now })
    .eq('response_token', token)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
