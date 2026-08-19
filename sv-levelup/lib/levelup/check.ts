import type { Db } from '../anreicherung/schreiben'
import type { ModulId, Modus } from './registry'

/**
 * Die Zeile aus `levelup_checks`, soweit der Code sie liest.
 *
 * ⚠ Bewusst NICHT die ganze Tabelle: `massnahmen` steht nicht drin. Was nicht
 * gelesen wird, kann in keiner Antwort durchrutschen — das ist die technische
 * Seite von R-E, die nicht auf Disziplin angewiesen ist.
 */
export type Check = {
  id: string
  token: string
  modus: Modus
  /** Optional erhoben — `wett` braucht ihn fuer den Rang, F-06 fuer den Lead-Namen. */
  firmenname: string | null
  /** Gesetzt, sobald F-06 einen Lead erzeugt hat. Traegt die Idempotenz. */
  sv_lead_id: string | null
  status: 'neu' | 'laeuft' | 'fertig' | 'fehler'
  website_url: string | null
  gsc_freigabe_am: string | null
  module_gewaehlt: ModulId[]
  module_gewuenscht: ModulId[]
  punkte_erhebbar: number | null
  score: number | null
  kein_score: boolean
  befunde: Record<string, unknown>
  fehlstellen: Record<string, unknown>
  standort_lat: number | null
  standort_lng: number | null
  standort_ort: string | null
  standort_plz: string | null
  erhoben_am: string | null
  fehler_text: string | null
  gueltig_bis: string
}

/** Die Spalten, die der Code braucht — `massnahmen` ist nicht dabei (s.o.). */
export const CHECK_SPALTEN =
  'id,token,modus,firmenname,sv_lead_id,status,website_url,gsc_freigabe_am,' +
  'module_gewaehlt,module_gewuenscht,' +
  'punkte_erhebbar,score,kein_score,befunde,fehlstellen,' +
  'standort_lat,standort_lng,standort_ort,standort_plz,erhoben_am,fehler_text,gueltig_bis'

/**
 * Die Felder, die `Check` verspricht — zum Abgleich gegen CHECK_SPALTEN.
 *
 * ⚠ Warum das als Liste existiert: Ein Feld im Typ, das die Select-Liste nicht
 * holt, ist zur Laufzeit still `undefined`. Genau das passierte am 19.08. mit
 * `firmenname` und `sv_lead_id` — der Typ kannte sie, die Abfrage nicht. Die
 * Idempotenz von F-06 haengt an `sv_lead_id`: ohne sie haette JEDER zweite
 * Terminwunsch einen zweiten Lead erzeugt, und kein Test haette es gemerkt
 * (Fakes liefern, was man ihnen sagt).
 */
export const CHECK_FELDER = [
  'id', 'token', 'modus', 'firmenname', 'sv_lead_id', 'status', 'website_url',
  'gsc_freigabe_am', 'module_gewaehlt', 'module_gewuenscht', 'punkte_erhebbar',
  'score', 'kein_score', 'befunde', 'fehlstellen', 'standort_lat', 'standort_lng',
  'standort_ort', 'standort_plz', 'erhoben_am', 'fehler_text', 'gueltig_bis',
] as const

/**
 * Loest einen Token auf.
 *
 * Gibt `null` fuer „unbekannt" UND fuer „Abfrage gescheitert" zurueck. Das ist
 * Absicht: der Aufrufer antwortet in beiden Faellen mit 404 ohne Hinweis
 * worauf (F-01/Welle 2 A). Ein unterscheidbarer Fehler waere ein Orakel, mit
 * dem sich gueltige Token erraten liessen.
 */
export async function ladeCheck(db: Db, token: string): Promise<Check | null> {
  if (!token || token.length > 64) return null

  const { data, error } = await db
    .from('levelup_checks')
    .select(CHECK_SPALTEN)
    .eq('token', token)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as Check
}
