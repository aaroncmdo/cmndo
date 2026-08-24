// Naechster buchbarer Vor-Ort-Termin einer Stadt — server-seitig, fuer das HTML.
//
// WARUM DAS EXISTIERT: Unsere buchbare Realitaet (welcher Gutachter, welcher Termin)
// lebte bisher ausschliesslich in zwei Kanaelen, die ein browsendes LLM nicht liest:
// der JSON-API und dem cross-origin-iframe des Finders. Gemessen am 24.08.2026 lieferte
// `/gutachter-finden` 232 KB HTML mit **null** Gutachtern und **null** Terminen — fuer
// GPTBot, PerplexityBot und ClaudeBot gleichermassen (alle drei sind per robots.txt
// ausdruecklich erlaubt, sie fanden nur nichts vor). Ein LLM kann uns also empfehlen,
// aber keinen Termin nennen. Diese Datei bringt dieselbe Wahrheit ins HTML.
//
// KEIN Cloaking: ausgeliefert wird fuer alle dasselbe Markup — Crawler wie Menschen.

/** Was die Stadtseite anzeigt. `null` = nichts anzeigen (kein Termin, API stumm). */
export type NaechsterTermin = {
  /** „Montag, 25.08." — Berlin-Zeit, nicht UTC. */
  label: string
  /** Deeplink MIT `sv` + `slot`: oeffnet den Finder mit Gutachter UND Termin vorgewaehlt. */
  buchungsUrl: string
}

const APP_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

/**
 * Wie lange ein Ergebnis wiederverwendet wird.
 *
 * Die Stadtseiten sind voll dynamisch (`headers()` im [locale]-Layout verhindert SSG) —
 * ohne diesen Data-Cache wuerde JEDER Seitenaufruf die Termin-Engine anwerfen, und die
 * ist DB-schwer (findBestSV + parallele Slot-Abfragen). 5 Minuten sind fuer eine Angabe
 * auf TAGES-Ebene reichlich genau und deckeln die Last auf ~12 Abfragen/Stunde je Stadt.
 */
const CACHE_SEKUNDEN = 300

/**
 * Nach dieser Zeit ist uns die Angabe die Wartezeit nicht wert — die Seite gewinnt.
 *
 * Gemessen am 24.08.2026 gegen prod: warm 0,14–0,18 s, Kaltstart einer nie abgefragten
 * Stadt 0,66–0,69 s, ein einzelner Ausreisser bei 2,14 s. Ein erster Entwurf mit 2500 ms
 * lief bei genau diesem Ausreisser in den Abort — und weil ein abgebrochener Fetch nichts
 * cacht, waere der Block DAUERHAFT unsichtbar geblieben statt einmal langsam zu sein.
 * 4000 ms liegt komfortabel ueber dem gemessenen Maximum; getragen wird die Wartezeit
 * ohnehin nur beim Cache-Miss (alle 5 Minuten je Stadt).
 */
const TIMEOUT_MS = 4000

type ApiSlot = { start?: string; buchungs_url?: string }
type ApiGutachter = { termine?: ApiSlot[] }

/**
 * Frueheste freie Zeit in `stadt` + der Deeplink dorthin.
 *
 * Faellt IMMER weich aus: Timeout, HTTP-Fehler, kaputtes JSON, keine Termine → `null`,
 * und die Stadtseite rendert diesen Block einfach nicht. Eine Marketingseite darf nie
 * an einer Terminabfrage haengen.
 */
export async function ladeNaechstenTermin(stadt: string): Promise<NaechsterTermin | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    // `ort=` statt `plz=`: STAEDTE fuehrt nur ein PLZ-PRAEFIX ("50–51"), keine echte
    // 5-stellige PLZ. Die API geocodet Freitext-Orte ohnehin selbst.
    const url = `${APP_ORIGIN}/api/v1/gutachter-termine?ort=${encodeURIComponent(stadt)}`
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: CACHE_SEKUNDEN } })
    if (!res.ok) return null
    const daten = (await res.json()) as { gutachter?: ApiGutachter[] }

    // Frühesten Slot über ALLE Gutachter suchen — die API sortiert nach Entfernung,
    // nicht nach Zeit. Der bestgerankte Gutachter hat also nicht zwingend den
    // frühesten Termin, und genau der ist hier die Aussage.
    let fruehester: { zeit: number; url: string } | null = null
    for (const g of daten.gutachter ?? []) {
      for (const s of g.termine ?? []) {
        if (!s.start || !s.buchungs_url) continue
        const zeit = Date.parse(s.start)
        if (!Number.isFinite(zeit)) continue
        if (!fruehester || zeit < fruehester.zeit) fruehester = { zeit, url: s.buchungs_url }
      }
    }
    if (!fruehester) return null

    // Berlin-Zeit, nicht UTC: ein Slot um 22:30 UTC ist in Deutschland schon der
    // Folgetag — ohne timeZone stuende auf der Seite das falsche Datum.
    const label = new Date(fruehester.zeit).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Europe/Berlin',
    })
    return { label, buchungsUrl: fruehester.url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
