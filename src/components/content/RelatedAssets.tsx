import Link from 'next/link'
import { getAllAssets, type ClaimondoAsset } from '@/lib/content/claimondo-mdx'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * Cluster-Geschwister des aktuellen Assets (gleicher Cluster + Ordner).
 * Rendert nichts, wenn es keine Geschwister gibt (z.B. Cornerstones, Decoder
 * ohne Cluster-Partner).
 */
export function RelatedAssets({ current }: { current: ClaimondoAsset }) {
  if (!current.cluster) return null
  const siblings = getAllAssets()
    .filter((a) => a.cluster === current.cluster && a.folder === current.folder && a.url !== current.url)
    .slice(0, 6)
  if (siblings.length === 0) return null

  return (
    <aside className="mt-14 border-t border-claimondo-border pt-8">
      <h2 style={HEAD_FONT} className="mb-5 text-xl font-bold text-claimondo-navy">
        Verwandte Themen aus Cluster {current.cluster}
      </h2>
      <ul className="grid gap-3.5 sm:grid-cols-2">
        {siblings.map((s) => (
          <li key={s.url}>
            <Link
              href={s.url}
              className="block h-full rounded-ios-md border border-claimondo-border bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-sm"
            >
              {s.nummer && (
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-claimondo-light-blue">
                  {s.nummer}
                </span>
              )}
              <span style={HEAD_FONT} className="mt-1 block font-bold leading-snug text-claimondo-navy">
                {s.title}
              </span>
              {s.snippet && <span className="mt-1 block line-clamp-2 text-[0.8125rem] text-claimondo-shield/70">{s.snippet}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
