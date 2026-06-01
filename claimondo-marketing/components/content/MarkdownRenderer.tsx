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
export function MarkdownRenderer({ body }: { body: string }) {
  return (
    <div className="max-w-[68ch] text-[1.0625rem] leading-[1.7] text-claimondo-shield">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]}
        components={{
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
            <div className="my-6 overflow-x-auto rounded-ios-md border border-claimondo-border">
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
            <pre className="my-5 overflow-x-auto rounded-ios-md bg-claimondo-navy p-4 text-[0.8125rem] leading-relaxed text-white/90">
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
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">
                {children}
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
