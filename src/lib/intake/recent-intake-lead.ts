import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDedupKey, dedupKeyIsUsable, type DedupKeyInput } from './dedup-key'

const DEFAULT_WINDOW_MS = 10 * 60_000 // 10 min — analog recent-lead-dedup.ts

/**
 * Findet einen frischen Lead, der zu Person (telefon bevorzugt, sonst email) UND kennzeichen im
 * Fenster passt. Best-effort: bei nicht-nutzbarem Key ODER DB-Fehler -> null (lieber neu anlegen
 * als falsch mergen). Gibt die schon konvertierte claim-id mit zurueck (Caller reuse-t den Vorgang).
 *
 * Sicherheit: NUR parameterisiertes `.eq()` (KEIN `.or()` mit interpoliertem User-Input -> keine
 * PostgREST-Filter-Injektion, wie die bestehenden findRecent*-Helfer). Der Doppel-Submit-Threat
 * traegt dieselbe Person-Kennung (telefon+email identisch), daher fasst EINE Person-Achse.
 */
export async function findRecentIntakeLead(
  input: DedupKeyInput,
  opts?: { windowMs?: number },
): Promise<{ leadId: string; claimId: string | null } | null> {
  if (!dedupKeyIsUsable(input)) return null
  const k = normalizeDedupKey(input)
  const sinceIso = new Date(Date.now() - (opts?.windowMs ?? DEFAULT_WINDOW_MS)).toISOString()
  const admin = createAdminClient()

  let q = admin
    .from('leads')
    .select('id, konvertiert_zu_claim_id')
    .eq('kennzeichen', k.kennzeichen as string)
    .gt('created_at', sinceIso)
  // dedupKeyIsUsable garantiert telefon ODER email; telefon bevorzugt (dichter belegt).
  q = k.telefon ? q.eq('telefon', k.telefon) : q.eq('email', k.email as string)

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[intake/dedup] findRecentIntakeLead fehlgeschlagen:', error.message)
    return null
  }
  return data
    ? { leadId: data.id as string, claimId: (data.konvertiert_zu_claim_id as string | null) ?? null }
    : null
}
