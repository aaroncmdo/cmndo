// Wie viele Partner-Werkstaetten deckt eine Stadt ab? — server-seitig, fuer das HTML.
//
// WARUM DAS EXISTIERT: derselbe Befund wie bei den Gutachtern, gemessen am 25.08.2026.
// `/werkstatt-finden` liefert 132 KB HTML mit NULL konkreten Angaben — kein Werkstatt-Typ,
// keine Entfernung, keine Zahl. Alles liegt im cross-origin-iframe, den kein Crawler liest.
// Die Gutachter-Stadtseiten erwaehnen „Werkstatt" genau einmal, ohne jede Substanz.
// Ein LLM kann den Werkstatt-Weg deshalb nicht empfehlen, obwohl er der Anschluss nach
// dem Gutachten ist — und bei Selbstverschulden sogar der ERSTE Schritt.
//
// ⚠⚠ LEAD-SCHUTZ — das ist hier kein Datenschutz-Detail, sondern der Geschaeftskern:
// Die oeffentliche Werkstatt-API gibt bewusst KEINE Namen, Telefonnummern, Websites oder
// Strassen aus (auf prod verifiziert: einziger Telefon-Treffer im Payload ist UNSERE
// Nummer). Diese Datei haelt sich strikt daran — sie zeigt Anzahl, Typ-Mischung und
// Bewertungsschnitt. Wer eine Werkstatt will, geht ueber uns.
//
// Anders als bei den Gutachtern gibt es hier KEINE Termine: Werkstaetten werden
// vermittelt, nicht terminiert. Die Aussage ist deshalb Abdeckung, nicht Verfuegbarkeit.

export type WerkstattAbdeckung = {
  /** Wie viele Partner-Werkstaetten im Umkreis. */
  anzahl: number
  /** Wie viele davon freie Fachwerkstaetten sind (Rest: Markenbetriebe). */
  freie: number
  /** Bewertungsschnitt ueber die Betriebe, die einen haben — null, wenn keiner. */
  schnitt: number | null
  /** Link in den Werkstatt-Finder, vorgefiltert auf den Ort. */
  finderUrl: string
}

const APP_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'
const CACHE_SEKUNDEN = 900
const TIMEOUT_MS = 4000

type ApiWerkstatt = {
  typ?: string
  ist_freie_werkstatt?: boolean | null
  bewertung_schnitt?: number | null
}

/**
 * Abdeckung fuer `stadt`. Faellt IMMER weich aus (Timeout, HTTP-Fehler, kaputtes JSON,
 * keine Treffer) → `null`, und der Aufrufer rendert nichts.
 *
 * Laengerer Cache als bei den Terminen (15 statt 5 Minuten): eine Werkstatt-Abdeckung
 * aendert sich in Wochen, nicht in Minuten — anders als ein freier Slot, der weggebucht
 * werden kann.
 */
export async function ladeWerkstattAbdeckung(stadt: string): Promise<WerkstattAbdeckung | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const url = `${APP_ORIGIN}/api/v1/werkstatt-in-naehe?ort=${encodeURIComponent(stadt)}`
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: CACHE_SEKUNDEN } })
    if (!res.ok) return null
    const daten = (await res.json()) as { werkstaetten?: ApiWerkstatt[]; werkstatt_finder_url?: string }
    const liste = daten.werkstaetten ?? []
    if (liste.length === 0) return null

    const freie = liste.filter((w) => w.ist_freie_werkstatt === true).length
    const bewertet = liste.map((w) => w.bewertung_schnitt).filter((b): b is number => typeof b === 'number')
    const schnitt = bewertet.length > 0 ? bewertet.reduce((a, b) => a + b, 0) / bewertet.length : null

    return {
      anzahl: liste.length,
      freie,
      schnitt,
      finderUrl:
        daten.werkstatt_finder_url ?? `https://claimondo.de/werkstatt-finden?stadt=${encodeURIComponent(stadt)}`,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
