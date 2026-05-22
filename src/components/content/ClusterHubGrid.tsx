import Link from 'next/link'
import { groupSpokesByCluster, clusterLabel } from '@/lib/content/claimondo-mdx'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

// Kurz-Titel je Cluster für die Karten-Headline (clusterLabel = Langform).
const SHORT: Record<string, string> = {
  H1: 'Haftungs-Grundlagen',
  H2: 'Anspruchs-Grundlagen',
  H3: 'Schadenspositionen',
  H4: 'Fristen',
  H6: 'Standard-Unfälle',
  H7: 'Komplexe Fälle',
}
const ORDER = ['H1', 'H2', 'H3', 'H4', 'H6', 'H7']

/**
 * Cornerstone-Hub: Cluster-Navigation in die 57 Spokes (SEO-Silostruktur +
 * Orientierung). Nur auf der Haftpflicht-Pillar.
 */
export function ClusterHubGrid() {
  const groups = groupSpokesByCluster()
  const clusters = ORDER.filter((c) => groups[c]?.length)
  if (clusters.length === 0) return null

  return (
    <section className="my-9">
      <h2 style={HEAD_FONT} className="mb-4 text-xl font-bold text-claimondo-navy">Wähle dein Thema</h2>
      <div className="grid gap-3.5 md:grid-cols-3">
        {clusters.map((c) => (
          <div key={c} className="rounded-ios-md border border-claimondo-border bg-white p-[18px]">
            <div className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-claimondo-light-blue">Cluster {c}</div>
            <h3 style={HEAD_FONT} className="mb-2.5 mt-1 font-bold text-claimondo-navy" title={clusterLabel(c)}>
              {SHORT[c] ?? clusterLabel(c)}
            </h3>
            <ul>
              {groups[c].slice(0, 3).map((s) => (
                <li key={s.url} className="border-t border-claimondo-bg first:border-t-0">
                  <Link href={s.url} className="block py-1 text-[0.8125rem] text-claimondo-shield transition-colors hover:text-claimondo-ondo">
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
