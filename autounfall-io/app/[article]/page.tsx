import { OG_IMAGE } from '@/lib/site'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getArticle, getArticleSlugs } from '@/lib/articles'
import { siteGraph, articleGraph } from '@/lib/jsonld'
import { JsonLd } from '@/components/JsonLd'
import {
  ArticleBreadcrumb,
  ArticleHero,
  ArticleHeader,
  QuickAnswer,
  AtAGlance,
  Prose,
  FaqAccordion,
  Sources,
  ArticleDisclaimer,
  ArticleCta,
} from '@/components/article/parts'
import { RelatedTopics } from '@/components/RelatedTopics'
import { metaTitle } from '@/lib/meta'

// Nur bekannte Artikel-Slugs werden statisch erzeugt; alles andere → 404.
// (Statische Routen wie /impressum gehen vor diesem dynamischen Segment vor.)
export const dynamicParams = false

export function generateStaticParams() {
  return getArticleSlugs().map((article) => ({ article }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ article: string }>
}): Promise<Metadata> {
  const { article: slug } = await params
  const article = getArticle(slug)
  if (!article) return {}
  const url = `/${article.slug}`
  return {
    title: metaTitle(article.title),
    description: article.description,
    alternates: { canonical: url },
    // Hero-Bild wenn vorhanden, sonst das Standard-Bild. Der Fallback ist
    // noetig, weil dieser openGraph-Block den des Layouts ERSETZT (Next merged
    // `metadata` nur flach) — ohne ihn hatten die 31 Artikel ohne Hero gar kein
    // Vorschaubild. Gemessen 18.08.: 223 von 254 Sitemap-URLs hatten eins.
    openGraph: {
      type: 'article',
      url,
      title: article.title,
      description: article.description,
      images: article.hero
        ? [
            {
              url: article.hero.src,
              width: article.hero.width,
              height: article.hero.height,
              alt: article.hero.alt,
            },
          ]
        : [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
      images: article.hero ? [article.hero.src] : [OG_IMAGE],
    },
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ article: string }> }) {
  const { article: slug } = await params
  const article = getArticle(slug)
  if (!article) notFound()

  return (
    <>
      <JsonLd data={siteGraph(articleGraph(article))} />
      <ArticleBreadcrumb article={article} />
      {article.hero ? <ArticleHero hero={article.hero} /> : null}
      <article className="container-prose px-4 pb-16 pt-10 sm:px-0 lg:pt-14">
        <ArticleHeader article={article} />
        <QuickAnswer paragraphs={article.quickAnswer} />
        {article.atAGlance ? <AtAGlance items={article.atAGlance} /> : null}
        <Prose markdown={article.body} />
        {article.faq ? <FaqAccordion faq={article.faq} /> : null}
        {article.sources ? <Sources sources={article.sources} /> : null}
        <ArticleDisclaimer />
      </article>
      <RelatedTopics route={'/' + article.slug} />
      <ArticleCta />
    </>
  )
}
