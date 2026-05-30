import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Quote } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import { VersichererHero } from '@/components/content/VersichererHero'
import { VersichererProfileCard } from '@/components/content/VersichererProfileCard'
import { KuerzungsHeatmap } from '@/components/content/KuerzungsHeatmap'
import { BafinFaktencheck } from '@/components/content/BafinFaktencheck'
import { UrteilsListe } from '@/components/content/UrteilsListe'
import { SchadensNetzwerk } from '@/components/content/SchadensNetzwerk'
import { KontaktwegeBox } from '@/components/content/KontaktwegeBox'
import { AuthorBox } from '@/components/seo/AuthorBox'
import {
  getVersicherer,
  getVersichererBySlug,
  getAllAssets,
  metaDescriptionFromSnippet,
  stripSchemaSection,
  stripLeadingSnippet,
  extractFaqPairs,
} from '@/lib/content/claimondo-mdx'
import { BAFIN_BRANCHENSCHNITT_2024, getKonzernSiblings } from '@/data/versicherer-mapping'
import { getKuerzungen } from '@/data/decoder-versicherer-cross'
import { getVersichererDetail } from '@/data/versicherer-detail'
import { SITE_URL, WHATSAPP_HREF } from '@/lib/seo/jsonld'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

// Fixe Content-Menge: nur per generateStaticParams bekannte (live) Hubs existieren.
export const dynamicParams = false

export function generateStaticParams() {
  return getVersicherer().map((v) => ({ slug: v.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = getVersichererBySlug(slug)
  if (!a) return {}
  const description = a.metaDescription || metaDescriptionFromSnippet(a.snippet) || a.title
  return {
    title: `${a.title} · Claimondo`,
    description,
    alternates: { canonical: a.url },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}${a.url}`,
      title: a.title,
      description,
      locale: 'de_DE',
      siteName: 'Claimondo',
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = getVersichererBySlug(slug)
  if (!a) notFound()

  const base = a.base
  const detail = getVersichererDetail(slug)
  const kuerzungen = getKuerzungen(slug)
  const faqPairs = extractFaqPairs(a.body)

  // Narrativ = Prosa vor der "## Häufige Fragen"-Sektion (FAQ wird separat gerendert).
  const cleaned = stripLeadingSnippet(stripSchemaSection(a.body))
  const narrative = cleaned.split(/^##\s+Häufige Fragen\s*$/m)[0].trimEnd()

  const orgId = `${SITE_URL}${a.url}#versicherer`
  const iso = a.lastModified.toISOString()
  const titleByUrl = new Map(getAllAssets().map((x) => [x.url, x.title]))
  const andereHubs = getVersicherer().filter((v) => v.slug !== slug).slice(0, 3)

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Article',
      headline: a.title,
      datePublished: iso,
      dateModified: iso,
      inLanguage: 'de-DE',
      author: { '@type': 'Organization', name: 'Claimondo' },
      publisher: { '@type': 'Organization', name: 'Claimondo' },
      about: { '@id': orgId },
      mainEntityOfPage: `${SITE_URL}${a.url}`,
    },
    {
      '@type': 'Organization',
      '@id': orgId,
      name: base.name,
      address: { '@type': 'PostalAddress', addressLocality: base.hauptsitz, addressCountry: 'DE' },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Start', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Versicherer', item: `${SITE_URL}/versicherer` },
        { '@type': 'ListItem', position: 3, name: base.anzeigename, item: `${SITE_URL}${a.url}` },
      ],
    },
    ...(faqPairs.length > 0
      ? [
          {
            '@type': 'FAQPage',
            mainEntity: faqPairs.map((f) => ({
              '@type': 'Question',
              name: f.question,
              acceptedAnswer: { '@type': 'Answer', text: f.answer },
            })),
          },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }) }}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[860px] px-6 py-10">
        <VersichererHero
          title={a.title}
          marktanteilPct={base.marktanteilPct}
          bafinQuote={base.bafinQuote2024}
          branchenschnitt={BAFIN_BRANCHENSCHNITT_2024}
          hauptsitz={base.hauptsitz}
          cta={{ href: '/gutachter-finden', label: 'Kostenlosen Gutachter finden' }}
        />

        <div className="mt-8 grid gap-8">
          <VersichererProfileCard
            rechtsform={base.rechtsform}
            mutterkonzern={base.mutterkonzern}
            hauptsitz={base.hauptsitz}
            gegruendet={base.gegruendet}
            vertraegeKfzHpMio={base.vertraegeKfzHpMio}
            bruttopraemienKfzMrd={base.bruttopraemienKfzMrd}
            bruttopraemienStand={base.bruttopraemienStand}
            vertriebsweg={base.vertriebsweg}
            tags={base.tags}
          />

          {narrative && (
            <article>
              <MarkdownRenderer body={narrative} />
            </article>
          )}

          {kuerzungen.length > 0 && <KuerzungsHeatmap versichererSlug={slug} kuerzungen={kuerzungen} />}

          <BafinFaktencheck
            versicherer={base.anzeigename}
            beschwerden2024={base.bafinBeschwerden2024}
            quote2024={base.bafinQuote2024}
            branchenschnitt={BAFIN_BRANCHENSCHNITT_2024}
            note={base.bafinNote}
          />

          {detail?.sentiment && (
            <section>
              <h2 style={HEAD_FONT} className="text-2xl font-extrabold text-claimondo-navy">
                Was Geschädigte und Anwälte berichten
              </h2>
              {detail.sentiment.davForsa && (
                <div className="mt-4 flex gap-3 rounded-ios-md border border-claimondo-ondo/25 bg-white p-4 shadow-claimondo-sm">
                  <Quote className="h-5 w-5 shrink-0 text-claimondo-ondo" aria-hidden />
                  <p className="text-[0.9375rem] leading-relaxed text-claimondo-shield">{detail.sentiment.davForsa}</p>
                </div>
              )}
              <p className="mt-4 text-[0.8125rem] font-semibold uppercase tracking-wide text-claimondo-shield/60">
                Häufige Kritikpunkte (dokumentierte Einzelfälle)
              </p>
              <ul className="mt-2 space-y-1.5">
                {detail.sentiment.topBeschwerden.map((b) => (
                  <li key={b} className="flex gap-2 text-[0.9375rem] text-claimondo-shield">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
              {(detail.sentiment.trustpilot || detail.sentiment.google) && (
                <p className="mt-3 text-xs text-claimondo-shield/60">
                  Zitierte Drittquellen{detail.sentiment.scoreStand ? ` (Stand ${detail.sentiment.scoreStand})` : ''}:{' '}
                  {detail.sentiment.trustpilot && `Trustpilot ${detail.sentiment.trustpilot.toLocaleString('de-DE')}/5`}
                  {detail.sentiment.trustpilot && detail.sentiment.google && ' · '}
                  {detail.sentiment.google && `Google ${detail.sentiment.google.toLocaleString('de-DE')}/5`}. Nicht
                  repräsentativ für alle Schadenfälle.
                </p>
              )}
            </section>
          )}

          {detail?.urteile && detail.urteile.length > 0 && <UrteilsListe urteile={detail.urteile} />}

          {detail?.schadensNetzwerk && (
            <SchadensNetzwerk
              pruefdienste={detail.schadensNetzwerk.pruefdienste}
              restwertboerse={detail.schadensNetzwerk.restwertboerse}
              werkstattnetz={detail.schadensNetzwerk.werkstattnetz}
              mietwagenpartner={detail.schadensNetzwerk.mietwagenpartner}
              kalkulationssoftware={detail.schadensNetzwerk.kalkulationssoftware}
              controlExpertHinweis={detail.schadensNetzwerk.controlExpertHinweis}
              pruefberichtDecoderUrl="/decoder/unser-sachverstaendiger"
            />
          )}

          {detail?.kontakt && (
            <KontaktwegeBox
              versichererName={base.name}
              orgId={orgId}
              hotline247={detail.kontakt.hotline247}
              hotlineAusland={detail.kontakt.hotlineAusland}
              schadenUrl={detail.kontakt.schadenUrl}
              postanschrift={detail.kontakt.postanschrift}
              email={detail.kontakt.email}
              warnDecoderUrl="/decoder/wir-pruefen-sachverhalt"
            />
          )}

          {faqPairs.length > 0 && (
            <section>
              <h2 style={HEAD_FONT} className="text-2xl font-extrabold text-claimondo-navy">
                Häufige Fragen
              </h2>
              <dl className="mt-4 divide-y divide-claimondo-border overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
                {faqPairs.map((f) => (
                  <div key={f.question} className="p-4">
                    <dt className="font-bold text-claimondo-navy">{f.question}</dt>
                    <dd className="mt-1 text-[0.9375rem] leading-relaxed text-claimondo-shield">{f.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <ConversionAnchorBlock variant="spoke" />

          {/* Internes Link-Mesh: verwandte Decoder/Wissens-Seiten + andere Hubs */}
          {(a.related?.length || andereHubs.length > 0) && (
            <section className="border-t border-claimondo-border pt-7">
              {a.related && a.related.length > 0 && (
                <>
                  <h2 style={HEAD_FONT} className="text-lg font-extrabold text-claimondo-navy">
                    Passende Decoder &amp; Wissens-Seiten
                  </h2>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {a.related.map((url) => (
                      <li key={url}>
                        <Link href={url} className="text-[0.9375rem] font-medium text-claimondo-ondo hover:underline">
                          {titleByUrl.get(url) ?? url} →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {andereHubs.length > 0 && (
                <>
                  <h2 style={HEAD_FONT} className="mt-6 text-lg font-extrabold text-claimondo-navy">
                    Weitere Versicherer-Hubs
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {andereHubs.map((v) => (
                      <li key={v.slug}>
                        <Link
                          href={v.url}
                          className="inline-block rounded-full border border-claimondo-border bg-white px-3 py-1.5 text-sm font-semibold text-claimondo-navy hover:border-claimondo-ondo/40"
                        >
                          {v.base.anzeigename}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <AuthorBox author="Kevin Genter" ueberMichUrl="/ueber-uns" />
        </div>
      </main>
      <LandingFooter />
      <StickyCallBar quelle={`Versicherer-Hub: ${slug}`} whatsappHref={WHATSAPP_HREF} />
    </div>
  )
}
