import { articleSchema, breadcrumbsSchema, jsonLdScript } from '@/lib/seo/jsonld'

interface Props {
  /** Hand-gepflegtes JSON-LD aus dem MD (extractSchemaJson) oder null. */
  schemaJson: string | null
  /** Fallback, falls das MD keinen validen Schema-Block hat. */
  fallback: { headline: string; description: string; datePublished: string; url: string; dateModified?: string; citations?: string[] }
  crumbs: Array<{ name: string; url: string }>
}

/**
 * Injiziert pro-Artikel-JSON-LD. Bevorzugt das im MD ausformulierte @graph
 * (Article + FAQPage + HowTo) — der eigentliche GEO-Hebel. Fällt auf den
 * generischen articleSchema zurück, wenn kein valider Block vorliegt.
 * Breadcrumbs immer separat.
 */
export function ContentJsonLd({ schemaJson, fallback, crumbs }: Props) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={schemaJson ? { __html: schemaJson } : jsonLdScript(articleSchema({ ...fallback, citation: fallback.citations }))}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumbsSchema(crumbs))} />
    </>
  )
}
