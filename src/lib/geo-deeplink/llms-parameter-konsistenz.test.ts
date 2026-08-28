import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Waechter gegen eine FEHLERKLASSE, nicht gegen einen Parameter.
 *
 * Am 28.08.2026 stellte sich heraus: `llms.txt` wies KI-Assistenten seit dem 25.08. an,
 * `&schadenart=` an https://claimondo.de/gutachter-finden zu haengen — die Marketing-Seite
 * reicht aber nur eine feste Allowlist an den Embed-iframe durch, und `schadenart` fehlte
 * darin. Der Wert wurde still verworfen. Kein Fehler, kein Log, drei Tage lang. Die drei
 * bestehenden Deeplink-Smokes waren gruen, weil keiner den Parameter je an eine URL haengte.
 *
 * Dieser Test vergleicht die beiden Quellen direkt:
 *
 *   was llms.txt VERSPRICHT   ⟷   was EmbedFinderSection DURCHREICHT
 *
 * Er ersetzt den Prod-Smoke nicht (Text im Repo ist noch kein Verhalten im Browser) —
 * aber er faengt die Luecke beim Schreiben statt drei Tage spaeter, und er kostet kein Netz.
 *
 * ⚠ Beide Dateien werden als TEXT gelesen, nicht importiert: `llms.txt/route.ts` ist eine
 * Next-Route (Server-Only-Importe, Template-Literale) und `EmbedFinderSection.tsx` liegt im
 * separaten Marketing-Build mit eigenem tsconfig/alias. Ein echter Import waere hier der
 * teurere und fragilere Weg.
 */

const WURZEL = join(__dirname, '..', '..', '..')
const LLMS = join(WURZEL, 'claimondo-marketing', 'app', 'llms.txt', 'route.ts')
const SECTION = join(WURZEL, 'claimondo-marketing', 'components', 'embed-finder', 'EmbedFinderSection.tsx')

/**
 * Parameter, die llms.txt zwar nennt, die aber NICHT durch den Finder-Wrapper muessen —
 * mit Begruendung, damit die Liste nicht zur Ausrede wird.
 */
const NICHT_FUER_DEN_FINDER: Record<string, string> = {
  radius: 'API-Parameter von GET /sv-in-naehe — geht direkt an die Route, kein Wrapper dazwischen',
  vollkasko: 'API-Parameter von GET /pruefe-anspruch — dito',
  plz: 'wird server-seitig zu lat/lng geocodet und SO durchgereicht (nicht als plz=)',
  stadt: 'wie plz — server-seitig geocodet',
}

describe('llms.txt verspricht nur Parameter, die auch ankommen', () => {
  const llms = readFileSync(LLMS, 'utf8')
  const section = readFileSync(SECTION, 'utf8')

  it('Instrument lebt: beide Dateien sind lesbar und nicht leer', () => {
    // Ohne diese Gegenprobe wuerde ein umbenannter Pfad als „keine Verstoesse" durchgehen.
    expect(llms.length, 'llms.txt/route.ts leer oder nicht gefunden').toBeGreaterThan(2000)
    expect(section.length, 'EmbedFinderSection.tsx leer oder nicht gefunden').toBeGreaterThan(500)
    // Und: die Allowlist-Zeilen, auf die wir uns stuetzen, existieren ueberhaupt.
    expect(section, 'params.set(...) nicht gefunden — Allowlist-Muster geaendert?').toContain('params.set(')
  })

  it('jeder in llms.txt beworbene URL-Parameter wird durchgereicht oder ist begruendet ausgenommen', () => {
    // Alle `?name=` UND `&name=` aus dem llms.txt-Text — so, wie eine KI sie an eine URL
    // haengen wuerde.
    //
    // ⚠ `[?&]`, nicht nur `&`: der ERSTE Parameter einer URL steht hinter dem Fragezeichen.
    // Die erste Fassung suchte nur `&…=` und haette damit ausgerechnet die Parameter
    // uebersehen, die llms.txt allein stehend bewirbt (`?plz=`, `?stadt=`) — ein Waechter
    // mit genau der Luecke, gegen die er schuetzen soll.
    const beworben = [...llms.matchAll(/[?&]([a-z_]{2,30})=/g)].map((m) => m[1])
    const eindeutig = [...new Set(beworben)]

    expect(eindeutig.length, 'keine Parameter gefunden — Regex oder Datei kaputt').toBeGreaterThan(0)

    const fehlend = eindeutig.filter((p) => {
      if (p in NICHT_FUER_DEN_FINDER) return false
      // Die Allowlist setzt sie als `params.set('name', …)`.
      return !section.includes(`params.set('${p}'`)
    })

    expect(
      fehlend,
      `llms.txt bewirbt Parameter, die EmbedFinderSection NICHT durchreicht: ${fehlend.join(', ')}. ` +
        'Entweder in die Allowlist aufnehmen, oder — wenn sie dort nicht hingehoeren — ' +
        'in NICHT_FUER_DEN_FINDER mit Begruendung eintragen.',
    ).toEqual([])
  })

  it('die Ausnahmeliste enthaelt nichts Totes', () => {
    // Eine Ausnahme fuer einen Parameter, den llms.txt gar nicht mehr nennt, verschleiert
    // spaeter einen echten Fund. Ausnahmen sollen mit ihrem Anlass verschwinden.
    const genannt = new Set([...llms.matchAll(/[?&]([a-z_]{2,30})=/g)].map((m) => m[1]))
    const tot = Object.keys(NICHT_FUER_DEN_FINDER).filter((p) => !genannt.has(p))
    expect(tot, `Ausnahmen fuer Parameter, die llms.txt nicht mehr bewirbt: ${tot.join(', ')}`).toEqual([])
  })
})
