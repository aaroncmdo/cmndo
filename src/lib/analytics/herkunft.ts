// Bewusst OHNE `import 'server-only'`: das wirft in der vitest-Node-Umgebung
// schon beim Import, und die pure `herkunftAusReferer()` soll testbar bleiben.
// `next/headers` ist selbst ein Server-Marker — ein Client-Import brich den Build
// ohnehin, der Schutz geht also nicht verloren.
import { headers } from 'next/headers'

// Woher kam die Anfrage? — die Frage, die bisher niemand beantworten konnte.
//
// Gemessen am 21.08.2026 auf `gutachter_finder_anfragen` (44 Zeilen, der aktive
// Marketing-Kanal): `page_url` war in **1** Zeile gefuellt, die fuenf utm_*-Spalten
// in **keiner**. Die Spalten existieren seit ihrer Migration, der Haupt-Writer
// setzt sie nur nicht. Folge: Keine der 678 Marketingseiten laesst sich einer
// Anfrage zuordnen — jede Priorisierung von Content-Arbeit ist damit geraten.
//
// ⚠ `source` wird hier BEWUSST NICHT gesetzt. Es ist kein Attributionsfeld,
// sondern ein RLS-Steuerfeld: die INSERT-Policy lautet `with_check (source IS NULL)`,
// drei weitere Policies haengen daran (`source IS NULL` = nativer anonymer Finder,
// `'sv_embed'` = Embed). Ein Domainname in `source` wuerde jeden anonymen
// Finder-Submit von RLS ablehnen lassen.
//
// ⚠ KEINE Cookies. `cookies().set()` crasht im Server-Component-Render-Pfad von
// Next 16+ deterministisch (drei CMM-14-Vorfaelle, s. `promo-attribution.ts`).
// Der Referer-Header ist ein reiner Read und damit unproblematisch.

/** Die Attributions-Spalten von `gutachter_finder_anfragen`, ohne `source`. */
export type Herkunft = {
  page_url: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
}

export const LEERE_HERKUNFT: Herkunft = {
  page_url: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
}

/** Datensparsam: mehr als das wird aus der URL nicht uebernommen. */
const UTM_PARAMETER = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/** Deckungsgleich mit `EmbedAnfrageSchema` (page_url max 500, utm_* max 150),
 *  damit ein serverseitig ergaenzter Wert nie laenger ist als ein vom Client
 *  gelieferter. */
const MAX_URL = 500
const MAX_UTM = 150

function kappe(wert: string | null, max: number): string | null {
  if (!wert) return null
  const t = wert.trim()
  return t ? t.slice(0, max) : null
}

/**
 * Leitet die Herkunft aus einem Referer-Header ab.
 *
 * **Datensparsam by design:** uebernommen werden nur `origin + pathname` und die
 * fuenf Standard-UTM-Parameter. Alle uebrigen Query-Parameter werden VERWORFEN —
 * sie koennen personenbezogene Daten tragen (Suchbegriffe, Token, E-Mail-Adressen
 * aus fremden Systemen), und die Zeile haengt an einer Person.
 *
 * Pure Funktion — der Header-Zugriff liegt in `herkunftAusRequest()`.
 */
export function herkunftAusReferer(referer: string | null | undefined): Herkunft {
  if (!referer) return LEERE_HERKUNFT

  let url: URL
  try {
    url = new URL(referer)
  } catch {
    return LEERE_HERKUNFT // kaputter Header -> lieber nichts als Muell
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return LEERE_HERKUNFT

  const herkunft: Herkunft = {
    ...LEERE_HERKUNFT,
    page_url: kappe(`${url.origin}${url.pathname}`, MAX_URL),
  }
  for (const p of UTM_PARAMETER) {
    herkunft[p] = kappe(url.searchParams.get(p), MAX_UTM)
  }
  return herkunft
}

/**
 * Herkunft aus dem laufenden Request (Server-Action / Route-Handler).
 *
 * Wirft nie: fehlt der Header oder ist der Kontext keiner mit Request, kommt
 * `LEERE_HERKUNFT` zurueck. Attribution darf eine Anfrage nie scheitern lassen.
 */
export async function herkunftAusRequest(): Promise<Herkunft> {
  try {
    const h = await headers()
    return herkunftAusReferer(h.get('referer'))
  } catch {
    return LEERE_HERKUNFT
  }
}
