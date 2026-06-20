import type { Metadata } from 'next'
import Link from 'next/link'
import { getRestPage, getRestSlugsUnder, restMetadata } from '@/lib/rest'
import { siteGraph } from '@/lib/jsonld'
import { JsonLd } from '@/components/JsonLd'

export function generateMetadata(): Metadata {
  // noindex (Footprint-Schutz, Entscheidung Aaron 2026-06-15) — Hub bleibt live,
  // aber nicht im Index; follow=true. Analog zur [slug]-Detailroute.
  return { ...restMetadata('/vergleich'), robots: { index: false, follow: true } }
}

export default function VergleichHubPage() {
  const hub = getRestPage('/vergleich')
  const items = getRestSlugsUnder('vergleich')
    .map((slug) => getRestPage(`/vergleich/${slug}`))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  return (
    <>
      <JsonLd data={siteGraph()} />
      <div className="container-narrow px-4 py-16 sm:px-6 sm:py-20">
        <header className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-au-amber">Vergleiche</p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink sm:text-5xl">
            {hub?.h1 ?? 'Vergleiche im Kfz-Schadenmanagement'}
          </h1>
          {hub?.description ? (
            <p className="mt-6 text-lg leading-relaxed text-au-ink-soft">{hub.description}</p>
          ) : null}
        </header>

        <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2">
          {items.map((p) => (
            <Link
              key={p.route}
              href={p.route}
              className="block rounded-ios-lg border border-au-sand-dark bg-au-surface p-5 shadow-au-sm transition-transform hover:-translate-y-0.5"
            >
              <h2 className="font-display text-lg font-bold text-au-ink">{p.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-au-ink-soft">{p.description}</p>
              <span className="mt-3 inline-block font-mono text-xs font-semibold text-au-amber-dark">
                Vergleich ansehen →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
