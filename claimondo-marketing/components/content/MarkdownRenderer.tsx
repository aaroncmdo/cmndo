import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import Link from 'next/link'
import { isInternalHref } from '@/lib/content/claimondo-mdx'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * Rendert einen bereits gereinigten Markdown-Body (stripSchemaSection +
 * stripLeadingSnippet) zu HTML mit Claimondo-Tokens. Server-Component (RSC),
 * kein prose/typography-Plugin — Element-Styling über die components-Map.
 * Interne Links (inkl. claimondo.de-Absolut) laufen über next/link.
 */
export function MarkdownRenderer({
  body,
  pageHasOwnH1 = false,
}: {
  body: string
  /**
   * Setzen, wenn die Seite den Titel bereits selbst als H1 rendert (AssetHero).
   * Dann wird die H1 des Markdown-Bodys unterdrueckt — sonst steht sie ein
   * zweites Mal im DOM, mit identischem Text: `extractTitle()` gewinnt den
   * Seitentitel genau aus dieser H1 (claimondo-mdx.ts), der Hero zeigt ihn
   * also 1:1. Ergebnis war 2x H1 pro Seite und der Titel doppelt sichtbar.
   *
   * Aktuell setzen es alle 7 Consumer: 6 rendern `AssetHero`, /versicherer/[slug]
   * rendert `VersichererHero` — beide mit eigener H1. NICHT setzen, wenn eine
   * kuenftige Seite den Body OHNE eigene Ueberschrift rendert; dann waere die
   * Body-H1 die einzige H1 der Seite.
   */
  pageHasOwnH1?: boolean
}) {
  return (
    <div className="max-w-[68ch] text-[1.0625rem] leading-[1.7] text-claimondo-shield">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]}
        components={{
          ...(pageHasOwnH1 ? { h1: () => null } : {}),
          h2: ({ children, id }) => (
            <h2 id={id} style={HEAD_FONT} className="mt-12 mb-3 scroll-mt-24 text-2xl font-bold text-claimondo-navy">
              {children}
            </h2>
          ),
          h3: ({ children, id }) => (
            <h3 id={id} style={HEAD_FONT} className="mt-8 mb-2 text-lg font-bold text-claimondo-shield">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-4">{children}</p>,
          ul: ({ children }) => <ul className="my-4 space-y-1.5 pl-5 [&>li]:list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 space-y-1.5 pl-5 [&>li]:list-decimal">{children}</ol>,
          li: ({ children }) => <li className="pl-1 leading-relaxed marker:text-claimondo-light-blue">{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-claimondo-navy">{children}</strong>,
          em: ({ children }) => <em className="font-semibold not-italic text-claimondo-navy">{children}</em>,
          hr: () => <hr className="my-9 border-0 border-t border-claimondo-border" />,
          // Zitat: bg-Tint + voller dünner Border (kein Side-Stripe — impeccable).
          blockquote: ({ children }) => (
            <blockquote className="my-5 rounded-ios-md border border-claimondo-border bg-claimondo-bg px-5 py-3.5 italic text-claimondo-shield/90">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto rounded-ios-md border border-claimondo-border" tabIndex={0} role="region" aria-label="Tabelle, horizontal scrollbar">
              <table className="w-full border-collapse text-[0.9375rem]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-claimondo-bg">{children}</thead>,
          th: ({ children }) => (
            <th style={HEAD_FONT} className="border-b border-claimondo-border px-4 py-2.5 text-left text-sm font-bold text-claimondo-navy">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-t border-claimondo-border px-4 py-2.5 align-top">{children}</td>,
          pre: ({ children }) => (
            <pre className="my-5 overflow-x-auto rounded-ios-md bg-claimondo-navy p-4 text-[0.8125rem] leading-relaxed text-white/90" tabIndex={0}>
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            // Block-Code (gefenced): language-Klasse ODER mehrzeilig (Brief-Vorlagen
            // sind ``` ohne Sprache) -> unverändert im <pre> lassen.
            const isBlock = (className?.includes('language-') ?? false) || String(children).includes('\n')
            if (isBlock) return <code className={className}>{children}</code>
            return <code className="rounded bg-claimondo-bg px-1.5 py-0.5 text-[0.9em] text-claimondo-navy">{children}</code>
          },
          a: ({ href, children }) => {
            if (href && isInternalHref(href)) {
              const internal = href.startsWith('https://claimondo.de')
                ? href.replace('https://claimondo.de', '') || '/'
                : href
              return (
                <Link href={internal} className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">
                  {children}
                </Link>
              )
            }
            // Externer Link. Zwei Korrekturen (25.08.2026), beide gemessen:
            //
            // 1) rel="nofollow". Von 68 Wissensartikeln tragen 28 einen
            //    Quellenlink auf eine fremde Redaktion — und alle 28 waren
            //    FOLLOW. 16 davon zeigen auf dieselbe Domain. Das gibt
            //    Ranking-Signal einseitig an Publikationen im eigenen
            //    Wettbewerbsumfeld ab.
            //    Die Quellenangabe selbst BLEIBT: sie ist nach § 51 UrhG
            //    Voraussetzung fuer ein zulaessiges Zitat, und "Cite Sources"
            //    ist laut GEO-Forschung die staerkste Einzelmethode fuer
            //    Sichtbarkeit in KI-Antworten. Entfernen waere in beide
            //    Richtungen schaedlich; nofollow loest nur den Abfluss.
            //
            // 2) Eigene Subdomains (app./gutachter./werkstatt.claimondo.de)
            //    sind ausgenommen — `isInternalHref` kennt nur die nackte
            //    Domain, sonst wuerden wir unsere eigenen Portale abwerten.
            //
            // 3) Ist der Ankertext die nackte URL (so stehen die Quellen im
            //    Artikel-Body), zeigen wir nur den Hostnamen: lesbarer, und
            //    die Fremdseite bekommt keinen exakten URL-Anker.
            const eigeneDomain = /^https?:\/\/([a-z0-9-]+\.)*claimondo\.de(\/|$)/i.test(href ?? '')
            const anker = typeof children === 'string' ? children : null
            const zeigeHost =
              anker && /^https?:\/\/\S+$/.test(anker.trim())
                ? anker.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
                : children
            return (
              <a
                href={href}
                target="_blank"
                rel={eigeneDomain ? 'noopener noreferrer' : 'noopener noreferrer nofollow'}
                className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline"
              >
                {zeigeHost}
              </a>
            )
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
