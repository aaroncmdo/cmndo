import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { groupSpokesByCluster, clusterLabel } from '@/lib/content/claimondo-mdx'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

const ORDER = ['H1', 'H2', 'H3', 'H4', 'H6', 'H7']

/**
 * Cornerstone-Hub: Cluster-Navigation in die 57 Spokes (SEO-Silostruktur +
 * Orientierung). Nur auf der Haftpflicht-Pillar. Kurz-Labels kommen aus dem
 * `content`-Namespace (Sprachumschalter); die Langform `clusterLabel()` bleibt
 * deutscher Tooltip (SSoT in claimondo-mdx, von sitemap/llms genutzt).
 */
export function ClusterHubGrid() {
  const t = useTranslations('content')
  const short = t.raw('cluster.short') as Record<string, string>
  const groups = groupSpokesByCluster()
  const clusters = ORDER.filter((c) => groups[c]?.length)
  if (clusters.length === 0) return null

  return (
    <section className="my-9">
      <h2 style={HEAD_FONT} className="mb-4 text-xl font-bold text-claimondo-navy">{t('cluster.heading')}</h2>
      <div className="grid gap-3.5 md:grid-cols-3">
        {clusters.map((c) => (
          <div key={c} className="rounded-ios-md border border-claimondo-border bg-white p-[18px]">
            <div className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-claimondo-light-blue">{t('cluster.cluster_prefix')} {c}</div>
            <h3 style={HEAD_FONT} className="mb-2.5 mt-1 font-bold text-claimondo-navy" title={clusterLabel(c)}>
              <Link
                href={`/haftpflicht#cluster-${c.toLowerCase()}`}
                className="transition-colors hover:text-claimondo-ondo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-ondo"
              >
                {short[c] ?? clusterLabel(c)}
              </Link>
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
      <div className="mt-4">
        <Link
          href="/haftpflicht"
          className="text-[0.8125rem] font-semibold text-claimondo-ondo transition-colors hover:text-claimondo-navy"
        >
          {t('cluster.all_glossary')}
        </Link>
      </div>
    </section>
  )
}
