/**
 * Verzeichnis-Sync-Adapter-Interface.
 *
 * Eine `SvLeadSource` repraesentiert ein externes SV-Verzeichnis (z.B. DAT, BVSK, obuev),
 * das Kandidaten fuer sv_leads liefert. Alle Kandidaten werden ueber den kanonischen
 * `upsertSvLead`-Pfad eingetragen (Dedup dat_id ODER normalized_name+plz,
 * Coalesce-Enrichment, kein direkter DB-Schreib-Zugriff).
 *
 * Usage:
 *   const result = await syncSvLeadsFromSource(datStubSource)
 */

import type { SvLeadPayload } from '../upsert'

export interface SvLeadSource {
  /** Technischer Name der Quelle — wird als `quelle`-Fallback in sv_leads eingetragen. */
  readonly name: string
  /**
   * Liefert alle Kandidaten, die in sv_leads upserted werden sollen.
   * Gibt [] zurueck, wenn (noch) keine Quelle angebunden ist.
   */
  fetchCandidates(): Promise<SvLeadPayload[]>
}
