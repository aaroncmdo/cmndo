import { describe, it, expect } from 'vitest'
import { collectFeedFrontmatterIssues } from './validate'
import { getWissenData } from './wissen'
import { getAllAssets, getVersicherer } from '@/lib/content/claimondo-mdx'

// Ersetzt den frueher in geo-feeds-spec §1 geforderten, aber nie verdrahteten
// Validator (validate-frontmatter.ts war toter Code). Laeuft jetzt im Marketing-
// vitest-Suite (`npm run test`) — zusaetzlich zum Build-Throw in assertFeedFrontmatterValid().

describe('Feed-Frontmatter', () => {
  it('alle Feed-Assets bestehen die strukturelle Pruefung (excerpt + keyFacts)', () => {
    const assets = [...getAllAssets(), ...getVersicherer()]
    expect(assets.length).toBeGreaterThan(0)
    const { structural } = collectFeedFrontmatterIssues(assets)
    expect(structural).toEqual([])
  })
})

describe('getWissenData (lesbare /wissen-Aufbereitung)', () => {
  it('liefert mindestens 4 nicht-leere Themen-Gruppen + 2 Hub-Verweise', async () => {
    const { gruppen, weiterstoebern } = await getWissenData()
    // Mindestens die 4 MDX-Gruppen (cornerstone/decoder/versicherer/sachverstaendige);
    // optional kommt noch eine 'redaktion'-Gruppe voran wenn DB-Artikel vorhanden sind.
    expect(gruppen.length).toBeGreaterThanOrEqual(4)
    expect(gruppen.every((g) => g.items.length > 0)).toBe(true)
    expect(weiterstoebern.map((h) => h.href)).toEqual(['/haftpflicht', '/kfz-gutachter'])
  })

  it('MDX-Item-Links sind absolut (Voraussetzung fuer toInternalHref)', async () => {
    const { gruppen } = await getWissenData()
    // Nur MDX-Gruppen pruefen (DB-Artikel / 'redaktion'-Gruppe nutzen relative Links).
    const mdxGruppen = gruppen.filter((g) => g.key !== 'redaktion')
    const links = mdxGruppen.flatMap((g) => g.items).map((i) => i.link)
    expect(links.length).toBeGreaterThan(0)
    expect(links.every((l) => l.startsWith('https://claimondo.de'))).toBe(true)
  })
})
