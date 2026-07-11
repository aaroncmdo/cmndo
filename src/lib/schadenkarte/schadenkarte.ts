// Schadenkarte-Service: Mint, Binden, Resolve, Liste.
// Spiegelt src/app/admin/werkstaetten/qr-pool-actions.ts (Mint-Retry-Loop)
// und src/lib/flotte/konto-firma.ts (AnyDb-Pattern, kein typed .from()).
// schadenkarten ist noch NICHT in database.types.ts (Regel-2-Lag) ->
// AnyDb-Cast noetig.

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSchadenkarteToken } from './token'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

const MAX_BATCH = 200

/**
 * Batch N Karten-Token fuer eine Firma anlegen (status='bestellt').
 * UNIQUE-Retry je Token (max 5 Versuche). Max 200 pro Batch.
 */
export async function mintSchadenkarten(
  db: AnyDb,
  params: { firmaId: string; anzahl: number; charge?: string | null },
): Promise<{ ok: true; tokens: string[] } | { ok: false; error: string }> {
  const n = Math.floor(Number(params.anzahl))
  if (!Number.isFinite(n) || n < 1 || n > MAX_BATCH) {
    return { ok: false, error: `Anzahl muss zwischen 1 und ${MAX_BATCH} liegen.` }
  }
  const chargeVal = params.charge?.trim() ?? null
  const tokens: string[] = []

  for (let i = 0; i < n; i++) {
    let inserted = false
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const token = generateSchadenkarteToken()
      const { error } = await db.from('schadenkarten').insert({
        karten_token: token,
        firma_id: params.firmaId,
        status: 'bestellt',
        charge: chargeVal,
      })
      if (!error) {
        tokens.push(token)
        inserted = true
      } else {
        const msg = (error.message ?? '').toLowerCase()
        // UNIQUE-Kollision auf karten_token -> neuer Token; anderer Fehler -> abbrechen.
        if (!msg.includes('duplicate') && !msg.includes('unique') && error.code !== '23505') {
          return { ok: false, error: error.message }
        }
      }
    }
    if (!inserted) {
      return { ok: false, error: 'Token-Generierung fehlgeschlagen (zu viele Kollisionen).' }
    }
  }

  return { ok: true, tokens }
}

/**
 * Freie oder bestellte Karte an ein Fahrzeug binden (status -> 'gebunden').
 * Nur Karten der eigenen Firma. Optimistic-Guard auf .eq('status', alterStatus).
 */
export async function bindeSchadenkarteAnFahrzeug(
  db: AnyDb,
  params: { token: string; fahrzeugId: string; firmaId: string; userId: string },
): Promise<{ ok: boolean; error?: string }> {
  // 1) Karte holen
  const { data: karte } = await db
    .from('schadenkarten')
    .select('id, status, firma_id')
    .eq('karten_token', params.token)
    .maybeSingle()

  const row = karte as { id: string; status: string; firma_id: string } | null

  if (!row) return { ok: false, error: 'Karte nicht gefunden.' }
  if (row.firma_id !== params.firmaId) {
    return { ok: false, error: 'Karte gehoert zu einer anderen Firma.' }
  }
  if (row.status !== 'bestellt' && row.status !== 'frei') {
    return { ok: false, error: 'Karte ist bereits gebunden oder gesperrt.' }
  }

  // 2) Optimistic update mit Status-Guard (verhindert Race + partial-unique Verletzung)
  const { data: updated, error } = await db
    .from('schadenkarten')
    .update({
      status: 'gebunden',
      fahrzeug_id: params.fahrzeugId,
      gebunden_am: new Date().toISOString(),
      gebunden_von: params.userId,
    })
    .eq('id', row.id)
    .eq('status', row.status)
    .select('id')
    .maybeSingle()

  if (error) {
    // UNIQUE(fahrzeug_id) WHERE status='gebunden' -> dieses Fahrzeug hat bereits eine aktive Karte
    if (error.code === '23505') {
      return { ok: false, error: 'Dieses Fahrzeug hat bereits eine aktive Karte.' }
    }
    return { ok: false, error: error.message }
  }
  if (!updated) {
    return { ok: false, error: 'Karte wurde zwischenzeitlich geaendert.' }
  }

  return { ok: true }
}

/**
 * Reverse-Lookup Token -> Fahrzeug (fuer: welches Fahrzeug ist diese Karte?).
 * Gibt null zurueck wenn der Token unbekannt ist.
 */
export async function resolveSchadenkarteToFahrzeug(
  db: AnyDb,
  token: string,
): Promise<{ fahrzeugId: string | null; firmaId: string | null; status: string } | null> {
  const { data } = await db
    .from('schadenkarten')
    .select('fahrzeug_id, firma_id, status')
    .eq('karten_token', token)
    .maybeSingle()

  if (!data) return null

  const row = data as { fahrzeug_id: string | null; firma_id: string | null; status: string }
  return {
    fahrzeugId: row.fahrzeug_id,
    firmaId: row.firma_id,
    status: row.status,
  }
}

/**
 * Alle Karten einer Firma (fuer die Karten-Liste).
 */
export async function getKartenFuerFirma(
  db: AnyDb,
  firmaId: string,
): Promise<Array<{ id: string; token: string; status: string; fahrzeugId: string | null }>> {
  const { data } = await db
    .from('schadenkarten')
    .select('id, karten_token, status, fahrzeug_id')
    .eq('firma_id', firmaId)
    .order('erstellt_am', { ascending: false })

  if (!data) return []

  return (data as Array<{ id: string; karten_token: string; status: string; fahrzeug_id: string | null }>).map(
    (row) => ({
      id: row.id,
      token: row.karten_token,
      status: row.status,
      fahrzeugId: row.fahrzeug_id,
    }),
  )
}
