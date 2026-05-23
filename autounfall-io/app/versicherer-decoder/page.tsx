import type { Metadata } from 'next'
import Link from 'next/link'
import { getDecodersByCluster } from '@/lib/decoders'
import { siteGraph } from '@/lib/jsonld'
import { JsonLd } from '@/components/JsonLd'

export const metadata: Metadata = {
  title: 'Versicherer-Decoder — was die Kfz-Versicherung wirklich meint',
  description:
    'Standard-Floskeln und Kürzungen der Kfz-Versicherung entschlüsselt: was dahintersteckt, was rechtlich gilt und wie Sie reagieren — mit Musterbriefen.',
  alternates: { canonical: '/versicherer-decoder' },
}

export default function DecoderHubPage() {
  const clusters = getDecodersByCluster()
  return (
    <>
      <JsonLd data={siteGraph()} />
      <div className="container-narrow px-4 py-16 sm:px-6 sm:py-20">
        <header className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-au-amber">Versicherer-Decoder</p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink sm:text-5xl">
            Was die Versicherung wirklich meint
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-au-ink-soft">
            Standard-Floskeln und Kürzungen entschlüsselt — was dahintersteckt, was rechtlich gilt und
            wie Sie reagieren. Mit Musterbriefen zum Kopieren.
          </p>
        </header>

        <div className="mx-auto mt-14 max-w-4xl space-y-12">
          {clusters.map(({ cluster, items }) => (
            <section key={cluster}>
              <h2 className="font-display text-2xl font-bold text-au-ink">{cluster}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {items.map((d) => (
                  <Link
                    key={d.slug}
                    href={`/versicherer-decoder/${d.slug}`}
                    className="block rounded-ios-lg border border-au-sand-dark bg-au-surface p-5 shadow-au-sm transition-transform hover:-translate-y-0.5"
                  >
                    <h3 className="font-display text-lg font-bold text-au-ink">{d.crumbLast}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-au-ink-soft">{d.metaDesc}</p>
                    <span className="mt-3 inline-block font-mono text-xs font-semibold text-au-amber-dark">
                      Entschlüsseln →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
