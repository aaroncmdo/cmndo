import type { Db } from '../anreicherung/schreiben'
import { istDublette, nameAusQuelle } from '../levelup/dubletten'

/**
 * Der Schreibpfad der Lead-Discovery.
 *
 * ⚠ R-M: geschrieben wird ausschliesslich in `sv_leads`. Nie `leads`,
 * `faelle`, `claims`, `partner_leads` — das sind Kundendaten, hier geht es um
 * Vertriebsadressen.
 */

export type Fund = {
  placeId: string
  name: string
  adresse: string | null
  lat: number
  lng: number
}

export type BestandsZeile = {
  id: string
  firma: string | null
  lat: number
  lng: number
  googlePlaceId: string | null
}

export type Entscheidung = 'neu' | 'dublette_place_id' | 'dublette_name' | 'unbrauchbar'

/**
 * Ein Name unter dieser Laenge ist kein Betriebsname.
 *
 * ⚠ Gemeint ist der GANZE Name, nicht sein Kern. Die erste Fassung pruefte
 * `kernName(...)` gegen 4 Zeichen — dieselbe Schwelle wie beim
 * Dublettenvergleich. Das war aus dem falschen Zusammenhang uebernommen und
 * warf im Muensterland-Trockenlauf 14 von 188 Funden weg, darunter:
 *
 *   „HM-KFZ-Gutachter" · „KFZ Sachverständiger Büro Zad" · „KFZ-BSV"
 *   „KFZ-Sachverständigenbüro ELO" · „Sachverständigen- & Ingenieurbüro Tas"
 *
 * Alles echte Bueros — nur mit kurzem Eigennamen. `kernName` entfernt die
 * Gattungswoerter, und uebrig blieben „HM", „Zad", „BSV", „ELO", „Tas".
 *
 * Der Unterschied: Beim VERGLEICH ist ein kurzer Kern nicht belastbar (dort
 * bleibt die Regel richtig, sonst gilt jedes „Sachverständigenbüro" als
 * dasselbe). Bei der Frage „ist das ein brauchbarer Lead" ist sie falsch — der
 * Name steht ja da. Dass so ein Betrieb nicht ueber den Namen entdoppelt
 * werden kann, faengt die Place-Kennung.
 */
const MIN_NAME = 4

/**
 * Postleitzahl und Ort aus einer deutschen Anschrift.
 *
 * Google liefert `formatted_address` als „Strasse Nr, 48163 Muenster,
 * Deutschland". Der Ort steht zwischen der Postleitzahl und dem Land.
 */
export function plzUndOrt(adresse: string | null): { plz: string | null; ort: string | null } {
  if (!adresse) return { plz: null, ort: null }
  const m = adresse.match(/\b(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\- ]{1,40}?)(?:,|$)/)
  if (!m) return { plz: null, ort: null }
  return { plz: m[1], ort: m[2].trim() }
}

/**
 * Gehoert dieser Fund schon zum Bestand?
 *
 * Zwei Stufen, absichtlich in dieser Reihenfolge:
 *   1. die Place-Kennung — hart und stabil, waehrend Namen variieren
 *   2. Name plus Umkreis — faengt, was vor der Discovery importiert wurde
 */
export function beurteile(f: Fund, bestand: BestandsZeile[]): Entscheidung {
  // ⚠ Ein Datensatz ohne Ort ist im Vertrieb wertlos (kein Umkreis) und auf
  // der Karte ein Stift im Nirgendwo. Genau 0/0 liegt im Golf von Guinea.
  if (f.lat === 0 && f.lng === 0) return 'unbrauchbar'
  if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return 'unbrauchbar'
  if (f.name.trim().length < MIN_NAME) return 'unbrauchbar'

  if (bestand.some((b) => b.googlePlaceId === f.placeId)) return 'dublette_place_id'

  const weich = bestand.find((b) =>
    istDublette({ firma: f.name, lat: f.lat, lng: f.lng }, { firma: b.firma, lat: b.lat, lng: b.lng }),
  )
  if (weich) return 'dublette_name'

  return 'neu'
}

/**
 * Schreibt das Ergebnis einer Beurteilung.
 *
 * ⚠ `ist_aktiv: false` ist keine Vorsicht, sondern Pflicht. Der Vorgabewert
 * der Spalte ist `true`, und die Leads erscheinen als Stifte auf zwei
 * oeffentlichen Karten — eine davon im Embed auf FREMDEN Websites. Ein Lauf,
 * der tausende Betriebe aktiv einfuegt, fuellt diese Karten schlagartig mit
 * Bueros, die davon nichts wissen. Sichtbarkeit ist eine eigene Entscheidung.
 *
 * ⚠ `normalized_name` wird NICHT mitgeschickt: die Spalte ist GENERATED
 * ALWAYS. Ein Insert, der sie enthaelt, schlaegt fehl — und zwar fuer jeden
 * Datensatz des Laufs.
 */
export async function schreibeFund(
  db: Db,
  f: Fund,
  laufId: string,
  entscheidung: Entscheidung,
  treffer: BestandsZeile | null,
): Promise<{ ok: boolean; error?: string }> {
  if (entscheidung === 'unbrauchbar' || entscheidung === 'dublette_place_id') {
    return { ok: true }
  }

  if (entscheidung === 'dublette_name') {
    // Die Kennung nachtragen — dann ist die weiche Dublette beim naechsten
    // Lauf eine harte und braucht keinen Namensvergleich mehr.
    if (!treffer || treffer.googlePlaceId) return { ok: true }

    const { data, error } = await db
      .from('sv_leads')
      .update({ google_place_id: f.placeId })
      .eq('id', treffer.id)
      .select()

    if (error) return { ok: false, error: error.message }
    if (!data || (data as unknown[]).length === 0) {
      return { ok: false, error: 'Kennung nicht nachgetragen — keine Zeile getroffen.' }
    }
    return { ok: true }
  }

  const { plz, ort } = plzUndOrt(f.adresse)
  const jetzt = new Date().toISOString()

  const { data, error } = await db
    .from('sv_leads')
    .insert({
      name: nameAusQuelle(f.name, null, ort),
      firma: f.name,
      adresse: f.adresse,
      plz,
      ort,
      lat: f.lat,
      lng: f.lng,
      quelle: 'places_discovery',
      google_place_id: f.placeId,
      entdeckt_am: jetzt,
      entdeckt_lauf: laufId,
      ist_aktiv: false,
    })
    .select()

  if (error) return { ok: false, error: error.message }
  if (!data || (data as unknown[]).length === 0) {
    return { ok: false, error: 'Lead nicht angelegt — keine Zeile zurueck.' }
  }
  return { ok: true }
}
