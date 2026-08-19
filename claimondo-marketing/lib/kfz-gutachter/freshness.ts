// Per-Stadt Freshness-Signal (geo-freshness-und-stadt-pages-2026-05-24.md, Hebel H1).
//
// BEWUSST separat von staedte.ts gehalten: dort editieren parallel mehrere doc38-
// Sessions die Stadt-Objekte (HYPERLOCAL_DATA, Spokes). Ein `lastUpdated`-Feld in
// jedes der ~85 Objekte zu schreiben waere ein riesiger, kollisionsanfaelliger Diff.
// Hier zentral als Map + Helper — die Sitemap und der Refresh-Cron lesen darueber.
//
// Pflege-Workflow: Wer eine Stadt REDAKTIONELL aendert, traegt/bumpt hier ihr
// Datum. Nicht gelistete Staedte erben STADT_LASTMOD_DEFAULT.
//
// ⚠ Fuer generierte Ortsinhalte reicht dieser Workflow NICHT mehr: seit dem
// 19.08.2026 erzeugt ein Cron taeglich zwei Staedte, und ein Pflegeschritt, der
// taeglich faellig ist, wird nicht gepflegt. Sitemap und JSON-LD nutzen deshalb
// `stadtLastModifiedISO(slug, veroeffentlichtAm)` — das Maximum aus dieser Map
// und dem echten Veroeffentlichungsdatum. Die Map bleibt fuer alles, was NICHT
// aus der Pipeline kommt (Hub-Cities, Handarbeit an staedte.ts).

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

/**
 * Das spaetere von gepflegtem Eintrag und tatsaechlicher Veroeffentlichung des
 * generierten Ortsinhalts.
 *
 * WARUM (19.08.2026): Der Pflege-Workflow oben ("wer eine Stadt aendert, traegt
 * hier ihr Datum") war richtig, solange Staedte von Hand angereichert wurden.
 * Seit dem 19.08. erzeugt ein Cron TAEGLICH zwei Staedte — ein manueller
 * Pflegeschritt, der taeglich faellig ist, wird nicht gepflegt. Gemessen an dem
 * Tag: 169 von 182 Stadtseiten meldeten `lastmod = 2026-05-24`, darunter
 * frankfurt (an dem Tag frisch erzeugt) und huerth (Seite existierte seit dem
 * Vortag). Dieselbe Zahl steht als `dateModified` im JSON-LD.
 *
 * MAXIMUM, nicht "DB gewinnt": redaktionelle Pflege darf nicht von einem
 * aelteren Generatorlauf zurueckdatiert werden.
 */
export function stadtLastModifiedISO(slug: string, dbISO?: string | null): string {
  const gepflegt = getStadtLastUpdatedISO(slug)
  if (!dbISO) return gepflegt
  const db = new Date(dbISO)
  // Ein `Invalid Date` im <lastmod> macht die Sitemap fuer Google ungueltig —
  // schlimmer als ein zu altes Datum. Im Zweifel der gepflegte Wert.
  if (Number.isNaN(db.getTime())) return gepflegt
  const dbTag = db.toISOString().slice(0, 10)
  return dbTag > gepflegt ? dbTag : gepflegt
}

/** Als Date — fuer sitemap `lastModified`. */
export function stadtLastModified(slug: string, dbISO?: string | null): Date {
  return new Date(stadtLastModifiedISO(slug, dbISO))
}
