'use client'

// Markdown-Renderer fuer Legal-Dokumente. Wird sowohl in der Full-Page-
// Variante (LegalDocPage) als auch im Popover (LegalDocPopover) verwendet.
//
// 2026-05-09 Frontend-Audit: H2/H3 bekommen Anchor-IDs (slugify) damit
// das Sticky-ToC in LegalDocPage funktioniert. Typo-Hierarchie aufgewertet
// fuer den Editorial-Look.

import ReactMarkdown from 'react-markdown'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function nodeToText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(nodeToText).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return nodeToText((children as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

export default function LegalDocBody({ markdown }: { markdown: string }) {
  return (
    <div className="leading-relaxed text-claimondo-navy/90">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1
              className="mb-4 text-2xl font-bold tracking-tight text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => {
            const id = slugify(nodeToText(children))
            return (
              <h2
                id={id}
                className="mb-3 mt-10 scroll-mt-24 text-lg font-bold tracking-tight text-claimondo-navy"
                style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
              >
                {children}
              </h2>
            )
          },
          h3: ({ children }) => {
            const id = slugify(nodeToText(children))
            return (
              <h3
                id={id}
                className="mb-2 mt-6 scroll-mt-24 text-sm font-bold uppercase tracking-[0.12em] text-claimondo-ondo"
              >
                {children}
              </h3>
            )
          },
          p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4573A2] underline decoration-[#7BA3CC] decoration-1 underline-offset-2 transition-colors hover:text-[#1E3A5F] hover:decoration-[#4573A2]"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-claimondo-navy">{children}</strong>,
          hr: () => <hr className="my-6 border-claimondo-border/60" />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
