import { createAdminClient } from '@/lib/supabase/admin'

/**
 * AAR-416 / AAR-948: Atomare laufende Nummer aus dem DB-Counter
 * (`rechnungs_nr_counter` via SECDEF `next_rechnungs_nr`, UPSERT + RETURNING →
 * lückenlos, keine Race-Condition). Liefert die rohe laufende Nr. für eine
 * frei wählbare Serie + Jahr; der Caller baut daraus sein Rechnungsnummern-Schema.
 *
 * Für per-Monat-Serien wird der Monat in den `serie`-Key kodiert (z.B.
 * `CMNDO-K-09`), damit der Zähler pro Monat zurücksetzt — ohne Schema-Änderung
 * an der (serie, jahr)-gekeyten Counter-Tabelle.
 */
export async function nextRechnungsNrRaw(serie: string, jahr: number): Promise<number> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('next_rechnungs_nr', { p_serie: serie, p_jahr: jahr })
  if (error || data === null || data === undefined) {
    throw new Error(
      `[AAR-948] nextRechnungsNrRaw fehlgeschlagen (serie=${serie}, jahr=${jahr}): ${error?.message ?? 'leer'}`,
    )
  }
  return Number(data)
}

