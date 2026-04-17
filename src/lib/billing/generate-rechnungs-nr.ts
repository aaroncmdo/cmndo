import { createAdminClient } from '@/lib/supabase/admin'

/**
 * AAR-416: Atomare Rechnungs-Nr.-Generierung via DB-Counter.
 *
 * Format: `{serie}-{YYYY}-{NNNNN}` (5-stellige laufende Nr., pro Jahr zurückgesetzt).
 *
 * Serien:
 *   - `CM-ONB` → Setup-Anzahlungs-Rechnungen (AAR-401)
 *   - `CMNDO`  → Monatsabrechnung (KFZ-149, mit Monat-Suffix anders)
 *
 * Atomar: SELECT ... FOR UPDATE wird durch UPSERT mit RETURNING in der
 * `next_rechnungs_nr()`-PG-Function gewährleistet — keine Race-Condition.
 */
export async function generateRechnungsNr(
  serie: 'CM-ONB' | 'CMNDO',
  jahr: number = new Date().getFullYear(),
): Promise<string> {
  const db = createAdminClient()

  const { data, error } = await db.rpc('next_rechnungs_nr', {
    p_serie: serie,
    p_jahr: jahr,
  })

  if (error || data === null || data === undefined) {
    throw new Error(
      `[AAR-416] generateRechnungsNr fehlgeschlagen (serie=${serie}, jahr=${jahr}): ${error?.message ?? 'leer'}`,
    )
  }

  const laufendeNr = Number(data)
  const padded = String(laufendeNr).padStart(5, '0')
  return `${serie}-${jahr}-${padded}`
}
