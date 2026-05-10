'use client'

// Markdown-Renderer fuer Legal-Dokumente. Wird sowohl in der Full-Page-
// Variante (LegalDocPage) als auch im Popover (LegalDocPopover) verwendet.
// Eigene Styles damit es zur claimondo-CI passt — kein generisches prose.

import ReactMarkdown from 'react-markdown'

export default function LegalDocBody({ markdown }: { markdown: string }) {
  return (
    <div className="leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-xl font-bold text-claimondo-navy mb-3">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-claimondo-navy mt-6 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-claimondo-navy mt-4 mb-1.5">{children}</h3>,
          p: ({ children }) => <p className="mb-2.5 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-2.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-2.5">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-claimondo-ondo underline hover:text-claimondo-shield"
            >{children}</a>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          hr: () => <hr className="my-4 border-claimondo-border" />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
