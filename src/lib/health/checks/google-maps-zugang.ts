// Health-Check: Google-Maps-Zugang (Kontingent + Schluessel)
//
// ⚠ WOZU: Seit dem Vorfall vom 21.08.2026 (82.047 Abrufe an einem Tag, 2.798 EUR)
// steht das Places-Tageskontingent bei 32. Das ist die einzige harte Bremse —
// ein Budget-Alarm meldet nur und stoppt nichts. Die Kehrseite: reisst das
// Kontingent, faellt die Adressvervollstaendigung STILL aus. Der Kunde tippt,
// es kommen keine Vorschlaege, er geht. Kein Fehler, kein Log, keine Spur.
//
// Dieser Check macht genau das sichtbar. Er liest, was die echten Aufrufe
// erlebt haben (`client_error_log`), und sondiert NICHT selbst — eine Sonde
// wuerde das Kontingent verbrauchen, das sie ueberwacht.
//
// Zwei Kanaele, beide zaehlen:
//   maps        — Google-Maps-JS hat den Schluessel abgelehnt (gm_authFailure).
//                 Seit der Referrer-Einschraenkung vom 25.08. der wahrscheinlichste
//                 Weg, wie eine fehlende Domain auffliegt.
//   maps-server — OVER_QUERY_LIMIT / REQUEST_DENIED aus Server-Aufrufen.
//
// Fenster 24 h, weil das Kontingent taeglich zurueckgesetzt wird (Mitternacht
// Pazifik). Ein laengeres Fenster wuerde einen laengst behobenen Ausfall
// tagelang rot halten.

import type { HealthCheck, CheckResult } from '@/lib/health/types'

const FENSTER_STUNDEN = 24
const WARN_AB = 1 // ein einziger Treffer heisst: mindestens einer kam nicht durch
const CRIT_AB = 3 // Haeufung -> systemisch, nicht Zufall

export const MAPS_BOUNDARIES = ['maps', 'maps-server'] as const

export type MapsFehlerZeile = { boundary: string; message: string | null }

/**
 * Reine Bewertung — voll testbar ohne DB.
 *
 * ⚠ Die Schwelle steht bei EINS und nicht hoeher. Jeder Treffer bedeutet, dass
 * ein Aufruf nicht durchkam; bei der Adresseingabe ist das ein Nutzer, der
 * nicht weiterkonnte. Ein Waechter, der einzelne Faelle schluckt, meldet genau
 * den Zustand nicht, fuer den er gebaut wurde.
 */
export function bewerteMapsZugang(
  zeilen: MapsFehlerZeile[],
  warnAb: number,
  critAb: number,
  fensterStunden: number,
): CheckResult {
  const n = zeilen.length
  if (n === 0) {
    return {
      status: 'ok',
      metric: 0,
      detail: `Keine abgewiesenen Google-Maps-Aufrufe in ${fensterStunden} h`,
    }
  }

  const status: 'warn' | 'crit' = n >= critAb ? 'crit' : n >= warnAb ? 'warn' : 'warn'

  // Kontingent und Schluessel brauchen VERSCHIEDENE Reaktionen — das gehoert in
  // die Meldung, sonst sucht der Empfaenger an der falschen Stelle.
  const kontingent = zeilen.filter((z) => (z.message ?? '').includes('OVER_QUERY_LIMIT')).length
  const verweigert = zeilen.filter((z) => (z.message ?? '').includes('REQUEST_DENIED')).length
  const browser = zeilen.filter((z) => z.boundary === 'maps').length

  const teile: string[] = []
  if (kontingent > 0) teile.push(`${kontingent}× Tageskontingent erschöpft (Limit anheben)`)
  if (verweigert > 0) teile.push(`${verweigert}× Zugriff verweigert (Schlüssel/API/Billing prüfen)`)
  if (browser > 0) teile.push(`${browser}× im Browser abgelehnt (Referrer-Einschränkung prüfen)`)

  return {
    status,
    metric: n,
    detail:
      `${n} abgewiesene Google-Maps-Aufrufe in ${fensterStunden} h — `
      + `${teile.join(', ')}. Adresseingabe fällt dabei still aus.`,
  }
}

export const googleMapsZugangCheck: HealthCheck = {
  id: 'google-maps-zugang',
  category: 'config',
  title: 'Google-Maps-Zugang (Kontingent & Schlüssel, 24 h)',

  async run(ctx): Promise<CheckResult> {
    const cutoff = new Date(Date.now() - FENSTER_STUNDEN * 3_600_000).toISOString()

    const { data, error } = await ctx.supabase
      .from('client_error_log')
      .select('boundary, message')
      .in('boundary', MAPS_BOUNDARIES as unknown as string[])
      .gte('created_at', cutoff)

    if (error) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Maps-Fehler: ${error.message}` }
    }

    return bewerteMapsZugang((data ?? []) as MapsFehlerZeile[], WARN_AB, CRIT_AB, FENSTER_STUNDEN)
  },
}
