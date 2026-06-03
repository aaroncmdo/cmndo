// Identitaets-Engine §12 Login-Tor — Slice A (read-only Detection).
//
// Findet Orphan-Personen (Shell-Personen ohne eigenen Account), die laut
// Match-Engine (match_person_candidates, §12-2) wahrscheinlich = der eingeloggte
// User sind — als Kandidaten fuer eine spaetere User-first-Self-Confirm (Slice B,
// supervised). Beispiel: der User war frueher als Gegner unter einer Shell-Person
// erfasst und hat jetzt einen Account.
//
// KEIN Write, KEIN Auto-Merge. §13-A (Review-Schaerfung): default nur tier
// hart/stark (starke/verifizierte Signale), damit auf weichem Match KEIN
// PII-Prefill / keine Selbst-Confirm-Aufforderung an Unauthentifizierte passiert.
//
// db untypisiert (wie ensure-person.ts), da personen + die RPC den generierten
// DB-Types voraus sind (AGENTS Regel 2 Schritt 6). Non-throwing Result-Object.

import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchTier = 'hart' | 'stark' | 'weich'

export type OrphanMatch = {
  personId: string
  score: number
  tier: MatchTier
  signals: string[]
}

export type FindOrphanMatchesResult =
  | { ok: true; matches: OrphanMatch[] }
  | { ok: false; error: string }

const TIER_RANK: Record<MatchTier, number> = { hart: 3, stark: 2, weich: 1 }

type RawMatch = { person_id: string; score: number; tier: string; signals: string[] | null }

/**
 * Read-only Detection des Login-Tors. Probe = die Account-Person des Users
 * (personen.user_id = userId); ruft match_person_candidates mit deren
 * Kontakten/Name und schliesst die Account-Person selbst aus.
 *
 * @param minTier Mindest-Tier der zurueckgelieferten Kandidaten (default 'stark'
 *   = hart + stark; 'weich' liefert alles). §13-A: weich standardmaessig aus.
 */
export async function findOrphanPersonMatchesForUser(params: {
  db: SupabaseClient
  userId: string
  minTier?: MatchTier
}): Promise<FindOrphanMatchesResult> {
  const { db, userId } = params
  const minRank = TIER_RANK[params.minTier ?? 'stark']

  try {
    const { data: acct, error: accErr } = await db
      .from('personen')
      .select('id, email, telefon, mobil, vorname, nachname, geburtsdatum')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (accErr) return { ok: false, error: accErr.message }
    if (!acct?.id) return { ok: true, matches: [] }

    const { data: rows, error: rpcErr } = await db.rpc('match_person_candidates', {
      p_email: acct.email ?? null,
      p_phone: acct.telefon ?? acct.mobil ?? null,
      p_vorname: acct.vorname ?? null,
      p_nachname: acct.nachname ?? null,
      p_geburtsdatum: acct.geburtsdatum ?? null,
      p_exclude_person_id: acct.id,
    })
    if (rpcErr) return { ok: false, error: rpcErr.message }

    const matches: OrphanMatch[] = ((rows as RawMatch[] | null) ?? [])
      .filter((r) => (TIER_RANK[r.tier as MatchTier] ?? 0) >= minRank)
      .map((r) => ({
        personId: r.person_id,
        score: r.score,
        tier: r.tier as MatchTier,
        signals: r.signals ?? [],
      }))
    return { ok: true, matches }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
