import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { TableOfContents } from '@/components/content/TableOfContents'
import { GuidePopover } from '@/components/content/GuidePopover'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import {
  metaDescriptionFromSnippet,
  stripSchemaSection,
  stripLeadingSnippet,
  extractHeadings,
  extractTrustChips,
  extractCitations,
  readingTimeMin,
  extractFaqPairs,
} from '@/lib/content/claimondo-mdx'
import { getPublishedArtikelBySlug } from '@/lib/wissen/db-articles'
import { SITE_URL, WHATSAPP_HREF, articleSchema, autoSchemaGraph, OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'
import { FOUNDER_AARON_NAME } from '@/lib/seo/brand-constants'
import { ArticleComments } from '@/components/community/ArticleComments'
import { WissenVerwandteThemen } from '@/components/content/WissenVerwandteThemen'
import { ReviewerByline } from '@/components/landing/ReviewerByline'

const WA = WHATSAPP_HREF

// Vollständig dynamisch — kein generateStaticParams (Artikel kommen aus der DB,
// kein Build-Zeit-Snapshot). notFound() greift bei unbekanntem / unveröffentlichtem Slug.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = await getPublishedArtikelBySlug(slug)
  if (!a) return {}

  const description =
    a.meta_description ||
    (a.excerpt ? metaDescriptionFromSnippet(a.excerpt) : null) ||
    a.title

  return {
    // Kurzer SERP-Titel wenn in der DB gepflegt; sonst der volle Artikel-Titel
    // (= die sichtbare H1). openGraph.title unten behaelt bewusst den vollen —
    // dort ist mehr Platz. Spalte: wissen_artikel.meta_title.
    title: a.meta_title || a.title,
    description,
    alternates: { canonical: `/wissen/${slug}` },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}/wissen/${slug}`,
      title: a.title,
      description: description ?? undefined,
      locale: 'de_DE',
      siteName: 'Claimondo',

      images: OG_DEFAULT_IMAGES,
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = await getPublishedArtikelBySlug(slug)
  if (!a) notFound()

  // Body aufbereiten: Schema-Sektion + führendes Snippet-Blockquote entfernen
  const cleaned = stripLeadingSnippet(stripSchemaSection(a.body))
  const headings = extractHeadings(cleaned)

  // Datum-Hierarchie: last_modified (date string) > veroeffentlicht_am (timestamptz ISO) > Fallback
  const lastModifiedDate: Date = (() => {
    if (a.last_modified) {
      const d = new Date(a.last_modified)
      if (!Number.isNaN(d.getTime())) return d
    }
    if (a.veroeffentlicht_am) {
      const d = new Date(a.veroeffentlicht_am)
      if (!Number.isNaN(d.getTime())) return d
    }
    return new Date('2024-01-01T00:00:00Z')
  })()

  const dateIso = lastModifiedDate.toISOString()

  const description =
    a.meta_description ||
    (a.excerpt ? metaDescriptionFromSnippet(a.excerpt) : null) ||
    a.title

  // Article (Person=Aaron) + citation + speakable + FAQPage (aus der "## Häufige Fragen"-
  // Sektion des Bodys). autoSchemaGraph gibt null ohne FAQ-Paare -> Fallback aufs reine
  // articleSchema. FAQPage ist der GEO-Hebel, den die KI-Artikel bisher verschenkt haben.
  const articleArgs = {
    headline: a.title,
    description: description ?? a.title,
    datePublished: dateIso,
    dateModified: dateIso,
    url: `${SITE_URL}/wissen/${slug}`,
    citation: extractCitations(a.body),
    authorName: FOUNDER_AARON_NAME,
  }
  const articleJsonLd =
    autoSchemaGraph(articleArgs, extractFaqPairs(a.body)) ?? JSON.stringify(articleSchema(articleArgs))

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ContentJsonLd
        schemaJson={articleJsonLd}
        fallback={{
          headline: a.title,
          description: description ?? a.title,
          datePublished: dateIso,
          dateModified: dateIso,
          url: `${SITE_URL}/wissen/${slug}`,
          citations: extractCitations(a.body),
        }}
        crumbs={[
          { name: 'Start', url: '/' },
          { name: 'Wissen', url: '/wissen' },
          { name: a.title, url: `/wissen/${slug}` },
        ]}
        body={a.body}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1140px] px-6 py-10">
        <AssetHero
          title={a.title}
          snippet={a.excerpt ?? undefined}
          clusterLabel={a.cluster ?? undefined}
          trustChips={extractTrustChips(a.body)}
          lastModified={lastModifiedDate}
          readingMin={readingTimeMin(a.body)}
        />
        <div className="grid grid-cols-1 gap-12 pt-9 lg:grid-cols-[230px_1fr]">
          <TableOfContents headings={headings} />
          <article>
            <MarkdownRenderer body={cleaned} pageHasOwnH1 />
            {/* Brücke in den Fach-Cluster: die Wissen-Artikel waren bis 23.08.2026
                vollständige Sackgassen (0 interne Links). Gesteuert über `tags`,
                nicht über `cluster` — Begründung in der Komponente. */}
            <WissenVerwandteThemen tags={a.tags} />
            <ArticleComments articleSlug={`wissen/${slug}`} />
          </article>
        </div>
        {/* Autorenschaft + Stand — SICHTBAR, nicht nur im Schema.
            `wissen_artikel` traegt `author`, `last_modified` und `veroeffentlicht_am`
            auf ALLEN 68 veroeffentlichten Artikeln (gemessen 28.08.2026) — die Felder
            wurden nur nie angezeigt. Von 187 geprueften Nicht-Stadtseiten trugen 184
            keine Autorenschaft; benannte Autorenschaft ist eines der Signale, die
            AI-Systeme fuer E-E-A-T lesen.

            `rolle="verantwortlich"`: die Artikel sind redaktionell erstellt, aber es
            gibt kein Feld, das eine fachliche EINZELpruefung belegt. „Fachlich geprüft"
            zu behaupten, ohne dass es einen Nachweis dafuer gibt, waere geraten. */}
        <ReviewerByline
          rolle="verantwortlich"
          autor={a.author}
          datum={(a.last_modified ?? a.veroeffentlicht_am ?? '').slice(0, 10)}
        />
        <SpokeCtaBand />
      </main>
      {/* Guide-Angebot bei 15 % Lesetiefe. Das Band positioniert sich selbst
          ueber der StickyCallBar (bandAbstand in GuidePopover) — der Prop
          `mobilBand` muss dafuer NICHT abgeschaltet werden. */}
      <GuidePopover cluster={a.cluster ?? null} />
      <LandingFooter />
      <StickyCallBar quelle={`Wissen: ${slug}`} whatsappHref={WA} />
    </div>
  )
}
