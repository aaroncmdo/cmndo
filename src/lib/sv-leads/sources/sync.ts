/**
 * Sync-Runner: holt Kandidaten von einer SvLeadSource und upserted sie
 * ueber den kanonischen `upsertSvLead`-Pfad (kein direkter DB-Zugriff).
 *
 * Fehler einzelner Kandidaten brechen den Batch NICHT ab — sie werden
 * gesammelt und im Ergebnis als `fehler[]` zurueckgegeben.
 */

import { upsertSvLead } from '../upsert'
import type { SvLeadSource } from './types'

export async function syncSvLeadsFromSource(
  source: SvLeadSource,
): Promise<{ ok: true; importiert: number; fehler: string[] } | { ok: false; error: string }> {
  let candidates
  try {
    candidates = await source.fetchCandidates()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Fehler beim Laden der Kandidaten aus "${source.name}": ${msg}` }
  }

  let importiert = 0
  const fehler: string[] = []

  for (const candidate of candidates) {
    const result = await upsertSvLead({
      ...candidate,
      quelle: candidate.quelle ?? source.name,
    })
    if (result.ok) {
      importiert++
    } else {
      fehler.push(`[${candidate.name ?? 'unbekannt'}] ${result.error}`)
    }
  }

  return { ok: true, importiert, fehler }
}
