import { getAllAssets, getVersicherer, type ClaimondoAsset } from '@/lib/content/claimondo-mdx'

// Soll-Bereiche aus geo-feeds-spec §1.
const EXCERPT_MIN = 100
const EXCERPT_MAX = 600
const KEYFACTS_MIN = 3
const KEYFACTS_MAX = 6
const KEYFACT_MIN = 20
const KEYFACT_MAX = 150

let _checked = false

/**
 * Build-Gate für die Feed-Pflichtfelder `excerpt` + `keyFacts` (geo-feeds-spec §1).
 *
 * Die 4 Feed-Routen sind `force-static` → diese Funktion läuft zur BUILD-Zeit (CI/Prod).
 *  - STRUKTURELLE Fehler (kein excerpt / keyFacts ausserhalb 3–6) WERFEN im
 *    Production-Build: ein solches Asset erzeugt ein kaputtes Feed-Item (leere
 *    Summary bzw. leerer Key-Facts-Block). Lieber den Build rot als stiller Mist
 *    im Feed — der in geo-feeds-spec §1 als „kritisch" geforderte Validator war
 *    bislang gar nicht verdrahtet (validate-frontmatter.ts war toter Code).
 *  - LÄNGEN-Verstösse sind nur `console.warn` (Feed bleibt valide, nur Qualität).
 *
 * In `next dev` (NODE_ENV !== 'production') wird auch strukturell nur geloggt,
 * damit ein WIP-Draft die lokale Entwicklung nicht blockt. Memoisiert → läuft 1×.
 */
export interface FeedFrontmatterIssues {
  /** Build-brechende Fehler (kein excerpt / keyFacts ausserhalb 3–6). */
  structural: string[]
  /** Nicht-brechende Laengen-Hinweise. */
  warnings: string[]
}

/** Reine, testbare Pruefung — sammelt Issues ohne Seiteneffekte (vgl. validate.test.ts). */
export function collectFeedFrontmatterIssues(assets: ClaimondoAsset[]): FeedFrontmatterIssues {
  const structural: string[] = []
  const warnings: string[] = []

  for (const a of assets) {
    const ex = a.excerpt?.trim() ?? ''
    const kf = a.keyFacts ?? []
    if (ex === '') {
      structural.push(`${a.filePath}: excerpt fehlt`)
    } else if (ex.length < EXCERPT_MIN || ex.length > EXCERPT_MAX) {
      warnings.push(`${a.filePath}: excerpt ${ex.length} Zeichen (Soll ${EXCERPT_MIN}-${EXCERPT_MAX})`)
    }
    if (kf.length < KEYFACTS_MIN || kf.length > KEYFACTS_MAX) {
      structural.push(`${a.filePath}: keyFacts=${kf.length} (Soll ${KEYFACTS_MIN}-${KEYFACTS_MAX})`)
    }
    for (const f of kf) {
      if (f.length < KEYFACT_MIN || f.length > KEYFACT_MAX) {
        warnings.push(`${a.filePath}: keyFact ${f.length} Zeichen – "${f.slice(0, 40)}…"`)
      }
    }
  }

  return { structural, warnings }
}

export function assertFeedFrontmatterValid(): void {
  if (_checked) return
  _checked = true

  const { structural, warnings } = collectFeedFrontmatterIssues([...getAllAssets(), ...getVersicherer()])

  if (warnings.length > 0) {
    console.warn(`[feed-validate] ${warnings.length} Laengen-Hinweis(e):\n${warnings.join('\n')}`)
  }
  if (structural.length > 0) {
    const msg = `[feed-validate] ${structural.length} struktureller Feed-Frontmatter-Fehler:\n${structural.join('\n')}`
    if (process.env.NODE_ENV === 'production') throw new Error(msg)
    console.error(msg)
  }
}
