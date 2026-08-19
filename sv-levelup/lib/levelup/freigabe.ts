import type { Db } from '../anreicherung/schreiben'
import { ladeCheck } from './check'
import { leiteAb, type Massnahme } from './massnahmen'
import type { ModulErgebnis } from './messmaschine'

export type PhasenPlan = { nr: number; massnahmen: Massnahme[] }

export type FreigabeErgebnis =
  | { ok: true; phasen: PhasenPlan[] }
  | { ok: false; error: string }

/**
 * F-09 · Massnahmen freigeben — der EINZIGE Endpunkt, der sie ausliefert.
 *
 * Die Regel dahinter ist keine technische, sondern das Geschaeftsmodell: der
 * Befund zeigt, WO es klemmt; was zu tun ist, gehoert ins Gespraech. Deshalb
 * gibt es genau eine Tuer, und sie oeffnet erst, wenn ein Termin steht.
 *
 * ⚠ F-05 bleibt davon unberuehrt und liefert auch nach der Freigabe keine
 * Massnahmen — dafuer sorgt, dass `CHECK_SPALTEN` die Spalte gar nicht liest.
 * Ein Test prueft beides zusammen.
 */
export async function gibFrei(db: Db, token: string): Promise<FreigabeErgebnis> {
  const check = await ladeCheck(db, token)
  if (!check) return { ok: false, error: 'unbekannt' }

  // Ohne Termin keine Massnahmen. Das ist die ganze Regel.
  const { data: termin } = await db
    .from('levelup_termine')
    .select('id')
    .eq('check_id', check.id)
    .maybeSingle()

  if (!termin) return { ok: false, error: 'kein_termin' }

  const massnahmen = leiteAb((check.befunde ?? {}) as Record<string, ModulErgebnis>)

  const { data: zeilen, error } = await db
    .from('levelup_checks')
    .update({ massnahmen })
    .eq('token', token)
    .select()

  if (error) return { ok: false, error: `Plan nicht speicherbar: ${error.message}` }
  if (!zeilen || zeilen.length === 0) return { ok: false, error: 'plan_nicht_gespeichert' }

  const { error: evFehler } = await db.from('levelup_events').insert({
    check_id: check.id,
    typ: 'plan_gesendet',
    payload: { anzahl: massnahmen.length },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  return { ok: true, phasen: nachPhasen(massnahmen) }
}

function nachPhasen(massnahmen: Massnahme[]): PhasenPlan[] {
  const jePhase = new Map<number, Massnahme[]>()
  for (const m of massnahmen) {
    jePhase.set(m.ph, [...(jePhase.get(m.ph) ?? []), m])
  }
  return [...jePhase.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([nr, liste]) => ({ nr, massnahmen: liste }))
}
