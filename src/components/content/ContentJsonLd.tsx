import { articleSchema, autoSchemaGraph, breadcrumbsSchema, jsonLdScript } from '@/lib/seo/jsonld'
import { extractFaqPairs } from '@/lib/content/claimondo-mdx'

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
}

/**
 * Injiziert pro-Artikel-JSON-LD. Priorität:
 *  1) hand-gepflegtes @graph aus dem MD (extractSchemaJson) — der eigentliche GEO-Hebel,
 *  2) Auto-@graph (Article + FAQPage + speakable) aus dem Body, falls FAQ-Paare existieren,
 *  3) generisches articleSchema (mit citation) als letzter Fallback.
 * Breadcrumbs immer separat.
 */
export function ContentJsonLd({ schemaJson, fallback, crumbs, body }: Props) {
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
  const primary = schemaJson ?? auto

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={primary ? { __html: primary } : jsonLdScript(articleSchema({ ...fallback, citation: fallback.citations }))}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumbsSchema(crumbs))} />
    </>
  )
}
