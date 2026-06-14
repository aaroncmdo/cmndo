import Link from 'next/link'
import { getRelatedFor } from '@/lib/relations'

// "Verwandte Themen"-Block (BRIEF-04 Teil A). Erzeugt kontextuelle interne
// Inbound-Links aus dem Relations-Layer — additiv, ohne Hand-Edit der Bodies.
export function RelatedTopics({ route }: { route: string }) {
  const items = getRelatedFor(route)
  if (items.length < 2) return null
  return (
    <section aria-label="Verwandte Themen" className="container-narrow px-4 pb-14 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-ios-md border border-au-sand-dark bg-au-paper-warm p-6">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-ink-soft">
          Verwandte Themen
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it.url}>
              <Link
                href={it.url}
                className="text-sm font-medium text-au-amber-dark underline-offset-2 hover:underline"
              >
                {it.title} →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
