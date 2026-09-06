// Die Uebersetzungen muessen bei der SEITE ankommen, nicht nur im Repo liegen.
//
// Hintergrund (06.09.2026): `localizeAsset` existierte seit Doc 48 Phase 2, war
// dokumentiert, hatte Frontmatter-Handling und Fallback-Logik — und fuer die
// Haftpflicht-Spokes NULL Aufrufer. 95 englische Uebersetzungen lagen im Repo, die Seite
// holte den deutschen Text und zeigte darueber den Sprachhinweis. Auf prod gemessen:
// /en/haftpflicht/nutzungsausfall trug lang="en" und einen vollstaendig deutschen Artikel.
// Weil die Decoder-Route verdrahtet WAR, sah die Sache von aussen intakt aus.
//
// Weder Typecheck noch Build fangen das: die Funktion ist gueltig, sie wird nur nicht
// gerufen. Deshalb pruefen diese Tests beides — die Funktion UND ihren Aufruf in der Route.
// Positivkontrolle gefahren: `translated`-Parameter am Banner entfernt -> Test rot,
// wieder eingesetzt -> gruen.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getLocalizedHaftpflichtSpoke, getLocalizedDecoder } from '../claimondo-mdx'

const WURZEL = process.cwd()

function ersteUebersetzung(locale: string, ordner: string): string | null {
  const dir = path.join(WURZEL, 'content/claimondo/_translations', locale, ordner)
  if (!fs.existsSync(dir)) return null
  const dateien = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
  return dateien.length ? dateien[0].replace(/\.md$/, '') : null
}

describe('Uebersetzungen erreichen die Fachseiten', () => {
  it('laedt fuer einen uebersetzten Haftpflicht-Artikel den fremdsprachigen Text', () => {
    const slug = ersteUebersetzung('en', 'haftpflicht')
    if (!slug) return
    const res = getLocalizedHaftpflichtSpoke(slug, 'en')
    expect(res, `${slug} existiert als Uebersetzung, aber nicht als Asset`).not.toBeNull()
    expect(res!.translated, `${slug}: Uebersetzung liegt vor, wird aber nicht geladen`).toBe(true)
    // Der Body MUSS ein anderer sein — sonst greift still der deutsche Fallback.
    const de = getLocalizedHaftpflichtSpoke(slug, 'de')
    expect(res!.asset.body).not.toBe(de!.asset.body)
  })

  it('faellt ohne Uebersetzungsdatei sauber auf Deutsch zurueck', () => {
    const slug = ersteUebersetzung('en', 'haftpflicht')
    if (!slug) return
    const res = getLocalizedHaftpflichtSpoke(slug, 'tr')
    expect(res).not.toBeNull()
    const trDaten = path.join(WURZEL, 'content/claimondo/_translations/tr/haftpflicht', `${slug}.md`)
    expect(res!.translated).toBe(fs.existsSync(trDaten))
  })

  it('gibt fuer einen unbekannten Slug null zurueck', () => {
    expect(getLocalizedHaftpflichtSpoke('gibt-es-nicht-xyz', 'en')).toBeNull()
    expect(getLocalizedDecoder('gibt-es-nicht-xyz', 'en')).toBeNull()
  })

  it('⭐ die Haftpflicht-ROUTE ruft den Helfer auf', () => {
    // Genau dieser Aufruf fehlte. Ohne ihn ist jede Uebersetzung wirkungslos.
    const route = fs.readFileSync(
      path.join(WURZEL, 'app/[locale]/haftpflicht/[slug]/page.tsx'),
      'utf8',
    )
    expect(route, 'Route holt den Artikel nicht lokalisiert').toContain(
      'getLocalizedHaftpflichtSpoke',
    )
    expect(route, 'Sprachhinweis erscheint unbedingt statt nur beim Fallback').toContain(
      'MdxLanguageBanner translated={translated}',
    )
  })

  it('⭐ die Decoder-ROUTE ruft ihren Helfer auf', () => {
    const route = fs.readFileSync(path.join(WURZEL, 'app/[locale]/decoder/[slug]/page.tsx'), 'utf8')
    expect(route).toContain('getLocalizedDecoder')
    expect(route).toContain('MdxLanguageBanner translated={translated}')
  })
})
