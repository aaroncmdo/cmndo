import { articleSchema, autoSchemaGraph, mergeFaqStemsIntoSchema, breadcrumbsSchema, jsonLdScript } from '@/lib/seo/jsonld'
import { extractFaqPairs } from '@/lib/content/claimondo-mdx'
import type { FaqStem } from '@/data/faq-stems-mapping'

interface Props {
  /** Hand-gepflegtes JSON-LD aus dem MD (extractSchemaJson) oder null. */
  schemaJson: string | null
  /** Fallback, falls das MD keinen validen Schema-Block hat. */
  fallback: { headline: string; description: string; datePublished: string; url: string; dateModified?: string; citations?: string[] }
  crumbs: Array<{ name: string; url: string }>
  /**
   * Roher MD-Body. Wenn gesetzt UND kein handgepflegter Schema-Block vorliegt,
   * generiert autoSchemaGraph aus der "## Häufige Fragen"-Sektion zusätzlich
   * FAQPage + speakable (Stream E). Ohne FAQ-Paare bleibt es beim articleSchema.
   */
  body?: string
  /**
   * Stream-F FAQ-Stems für diesen Slug. Werden in die EINE FAQPage der Seite
   * gemergt (nicht als 2. FAQPage emittiert) — Google empfiehlt eine pro Seite.
   * Den sichtbaren Q&A-Block rendert separat <FaqStems>.
   */
  faqStems?: FaqStem[]
}

/**
 * Injiziert pro-Artikel-JSON-LD als EIN Schema-Dokument. Basis-Priorität:
 *  1) hand-gepflegtes @graph aus dem MD (extractSchemaJson) — der eigentliche GEO-Hebel,
 *  2) Auto-@graph (Article + FAQPage + speakable) aus dem Body, falls FAQ-Paare existieren,
 *  3) generisches articleSchema (mit citation) als letzter Fallback.
 * Anschließend werden die FAQ-Stems (Stream F) in die FAQPage dieses Dokuments
 * gemergt → genau eine FAQPage pro Seite. Breadcrumbs immer separat.
 */
export function ContentJsonLd({ schemaJson, fallback, crumbs, body, faqStems = [] }: Props) {
  const auto =
    !schemaJson && body
      ? autoSchemaGraph(
          {
            headline: fallback.headline,
            description: fallback.description,
            datePublished: fallback.datePublished,
            dateModified: fallback.dateModified,
            url: fallback.url,
            citation: fallback.citations,
          },
          extractFaqPairs(body),
        )
      : null
  const base = schemaJson ?? auto ?? JSON.stringify(articleSchema({ ...fallback, citation: fallback.citations }))
  const finalSchema = mergeFaqStemsIntoSchema(base, faqStems.map((s) => ({ question: s.question, answer: s.answer })))

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: finalSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumbsSchema(crumbs))} />
    </>
  )
}
