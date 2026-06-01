// Per-Stadt Freshness-Signal (geo-freshness-und-stadt-pages-2026-05-24.md, Hebel H1).
//
// BEWUSST separat von staedte.ts gehalten: dort editieren parallel mehrere doc38-
// Sessions die Stadt-Objekte (HYPERLOCAL_DATA, Spokes). Ein `lastUpdated`-Feld in
// jedes der ~85 Objekte zu schreiben waere ein riesiger, kollisionsanfaelliger Diff.
// Hier zentral als Map + Helper — die Sitemap und der Refresh-Cron lesen darueber.
//
// Pflege-Workflow: Wer eine Stadt inhaltlich aendert, traegt/bumpt hier ihr Datum.
// Nicht gelistete Staedte erben STADT_LASTMOD_DEFAULT.

const STADT_LASTMOD_DEFAULT = '2026-05-24'

const STADT_LASTMOD_OVERRIDES: Record<string, string> = {
  // Hub-Cities mit hyperlocaler Tiefe (Doc 38) — zuletzt angereichert:
  koeln: '2026-05-25',
  duesseldorf: '2026-05-25',
  wuppertal: '2026-05-25',
  bonn: '2026-05-25',
}

/** ISO-Datum (YYYY-MM-DD) des letzten inhaltlichen Stadt-Updates. */
export function getStadtLastUpdatedISO(slug: string): string {
  return STADT_LASTMOD_OVERRIDES[slug] ?? STADT_LASTMOD_DEFAULT
}

/** Als Date — fuer sitemap `lastModified`. */
export function getStadtLastUpdated(slug: string): Date {
  return new Date(getStadtLastUpdatedISO(slug))
}
