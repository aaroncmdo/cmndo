import Link from 'next/link'

/**
 * Inhaltsverzeichnis aus den H2-Slugs. Desktop: sticky in der linken Spalte.
 * Mobil: native einklappbare <details>-Karte. Statische Anker (kein Scroll-Spy
 * im MVP). Rendert nichts bei < 2 Überschriften.
 */
export function TableOfContents({ headings }: { headings: Array<{ id: string; text: string }> }) {
  if (headings.length < 2) return null

  const list = (
    <ul className="border-l border-claimondo-border">
      {headings.map((h) => (
        <li key={h.id}>
          <Link
            href={`#${h.id}`}
            className="-ml-px block border-l border-transparent py-1.5 pl-3.5 text-[0.8125rem] leading-snug text-claimondo-shield/80 transition-colors hover:border-claimondo-ondo hover:text-claimondo-ondo"
          >
            {h.text}
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      <nav aria-label="Inhaltsverzeichnis" className="sticky top-[88px] hidden self-start lg:block">
        <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-claimondo-shield/45">
          Auf dieser Seite
        </p>
        {list}
      </nav>
      <details className="group mb-6 rounded-ios-md border border-claimondo-border bg-white px-4 py-3 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-claimondo-navy">
          Auf dieser Seite
          <span aria-hidden className="text-claimondo-ondo transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="mt-3">{list}</div>
      </details>
    </>
  )
}
