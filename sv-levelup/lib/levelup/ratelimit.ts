import type { Db } from '../anreicherung/schreiben'

/** F-01: 5 Checks je IP-Hash und Stunde. */
export const RATE_GRENZE = 5
export const RATE_FENSTER_MIN = 60

/**
 * Zaehlt die Checks eines IP-Hashes im laufenden Fenster.
 *
 * Vorbild ist `gfa_rate_limit` aus dem Hauptprojekt — dieselbe Tabelle wird
 * mitbenutzt, statt eine zweite fuer denselben Zweck anzulegen.
 *
 * ⚠ Ein Lesefehler blockt. Im Zweifel durchzulassen waere die falsche
 * Richtung: ein kaputter Zaehler darf kein offenes Tor sein.
 */
export async function darfNoch(db: Db, ipHash: string): Promise<boolean> {
  const seit = new Date(Date.now() - RATE_FENSTER_MIN * 60_000).toISOString()

  const { data, error } = await db
    .from('gfa_rate_limit')
    .select('id')
    .eq('ip_hash', ipHash)
    .gte('created_at', seit)

  if (error) return false
  return (data?.length ?? 0) < RATE_GRENZE
}

/** Vermerkt einen Versuch. Ein Fehlschlag ist nicht kritisch — er zaehlt nur nicht mit. */
export async function vermerkeVersuch(db: Db, ipHash: string): Promise<void> {
  const { error } = await db.from('gfa_rate_limit').insert({ ip_hash: ipHash })
  if (error) console.error('Rate-Limit-Vermerk fehlgeschlagen:', error.message)
}
