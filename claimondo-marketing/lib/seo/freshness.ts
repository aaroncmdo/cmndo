// Per-Route Freshness-Signal fuer Marketing-Seiten.
//
// WARUM: KI-Antwortmaschinen gewichten Aktualitaet stark — ohne `dateModified`
// im JSON-LD fehlt einer Seite das Signal komplett. Die GEO-Baseline vom
// 18.08.2026 (docs/2026-08-18-geo-baseline-claimondo.md, Befund B2) hat
// gemessen: 14 von 27 gepruften Seiten trugen KEIN Datum — darunter die
// Startseite, /faq, der /wissen-Hub und ALLE Stadt-Seiten.
//
// Zusaetzlich behebt diese Map den zweiten Teil des Befunds: `app/sitemap.ts`
// setzte `lastModified: new Date()` — also bei JEDEM Build "jetzt". Ein lastmod,
// das sich ohne inhaltliche Aenderung bewegt, ist kein Aktualitaetssignal,
// sondern Rauschen; Suchmaschinen entwerten es fuer die ganze Domain.
//
// ABGRENZUNG zu lib/kfz-gutachter/freshness.ts: dort liegen die ~160 STADT-
// Slugs (eigener Pflege-Workflow, mehrere Sessions editieren dort parallel).
// Hier liegen die statischen Marketing-ROUTEN. Gleiches Muster, getrennte
// Datenmengen — bewusst nicht zusammengelegt.
//
// PFLEGE: Wer eine Seite inhaltlich aendert, bumpt hier ihr Datum. Die
// Startwerte stammen aus `git log -1 --format=%cs -- <page.tsx>` (Stand
// 18.08.2026), sind also nachweisbar und nicht geschaetzt. Ein Datum hier
// bedeutet "Seite zuletzt inhaltlich angefasst" — es wird NICHT automatisch
// hochgezaehlt, weil ein unehrliches Datum schlechter ist als keines.

/** Fallback fuer Routen, die (noch) nicht gelistet sind. */
const ROUTE_LASTMOD_DEFAULT = '2026-07-18'

const ROUTE_LASTMOD: Record<string, string> = {
  '/': '2026-07-18',
  '/agb': '2026-07-18',
  '/autor/aaron-sprafke': '2026-07-18',
  '/beratung-anfragen': '2026-07-18',
  '/check': '2026-07-18',
  '/community-regeln': '2026-07-18',
  '/datenschutz': '2026-08-13',
  '/decoder': '2026-07-18',
  '/e-auto-gutachter': '2026-07-18',
  '/ersteinschaetzung': '2026-07-19',
  '/faq': '2026-07-18',
  '/flotte/partner-werden': '2026-08-05',
  '/gegnerische-versicherung-zahlt-nicht': '2026-07-18',
  '/gutachter-finden': '2026-07-19',
  '/gutachter-partner': '2026-08-04',
  '/gutachter-partner/leads-generieren': '2026-07-18',
  '/gutachter-partner/marketing': '2026-07-18',
  '/gutachter-partner/neukundengewinnung': '2026-07-18',
  '/haftpflicht': '2026-07-18',
  '/impressum': '2026-07-18',
  '/kfz-gutachter': '2026-08-11',
  '/kfz-gutachter/ablauf': '2026-08-17',
  '/kfz-gutachter/autoschaden-soforthilfe': '2026-08-17',
  '/kfz-gutachter/gutachten-service': '2026-08-17',
  '/kfz-gutachter/kosten': '2026-08-17',
  '/kfz-gutachter/nutzungsausfall': '2026-08-17',
  '/kfz-gutachter/online-kfz-gutachten': '2026-08-17',
  '/kfz-gutachter/sachverstaendiger-vs-gutachter': '2026-08-17',
  '/kfz-gutachter/vermittlungsportale-vergleich': '2026-08-17',
  '/kfz-gutachter/wertminderung': '2026-08-17',
  '/kfz-gutachter-koeln': '2026-07-18',
  '/kfz-haftpflicht-schaden': '2026-07-18',
  '/kommentar-regeln': '2026-07-18',
  '/kosten-kfz-gutachten': '2026-07-18',
  '/lkw-gutachter': '2026-07-18',
  '/makler/partner-werden': '2026-07-19',
  '/motorrad-gutachter': '2026-07-18',
  '/nutzungsbedingungen': '2026-07-18',
  '/ratgeber': '2026-07-18',
  '/sa-volltext': '2026-07-18',
  '/sachverstaendige': '2026-07-18',
  '/schaden-melden': '2026-07-18',
  '/schaden-melden/link-versendet': '2026-07-18',
  '/schaden-melden/selbstverschulden': '2026-07-24',
  '/schadensreport-2026': '2026-07-18',
  '/ueber-uns': '2026-07-19',
  '/unfall-was-tun-als-geschaedigter': '2026-07-18',
  '/unfallskizze': '2026-07-18',
  '/unverschuldeter-unfall-rechte': '2026-07-18',
  '/versicherer': '2026-07-18',
  '/versicherung-schickt-gutachter': '2026-07-18',
  '/vorteile': '2026-07-19',
  '/werkstatt-finden': '2026-07-18',
  '/werkstatt/partner-werden': '2026-07-19',
  '/wie-es-funktioniert': '2026-07-19',
  '/wissen': '2026-07-18',
}

/**
 * ISO-Datum (YYYY-MM-DD) der letzten inhaltlichen Aenderung einer Marketing-Route.
 * Pfad ohne Locale-Praefix und ohne Trailing-Slash, z.B. '/faq'.
 */
export function getRouteLastUpdatedISO(path: string): string {
  const key = path !== '/' ? path.replace(/\/+$/, '') : '/'
  return ROUTE_LASTMOD[key] ?? ROUTE_LASTMOD_DEFAULT
}

/** Als Date — fuer sitemap `lastModified`. */
export function getRouteLastUpdated(path: string): Date {
  return new Date(getRouteLastUpdatedISO(path))
}
