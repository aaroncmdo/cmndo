'use client'

// Kompakte gutachter-finden-Section (variant='teaser'): Überschrift + PLZ/Stadt-
// Eingabe + CTA, die zur vollen /gutachter-finden-Seite (vorzentriert) führt.
// Keine schwere Karte mitten im Content — ideal für Content-/Ratgeber-Seiten.
// Platzierbar auf beliebiger Marketing-Seite; Copy via Props überschreibbar.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, ChevronRight } from 'lucide-react'

type Props = {
  eyebrow?: string
  heading?: string
  subline?: string
  placeholder?: string
  ctaLabel?: string
}

export function GutachterFindenTeaser({
  eyebrow = 'Sachverständigen-Finder',
  heading = 'Kfz-Gutachter in Ihrer Nähe finden',
  subline = 'Geben Sie Ihre PLZ oder Stadt ein — wir zeigen Ihnen unabhängige Sachverständige in Ihrer Region auf der Karte.',
  placeholder = 'PLZ oder Stadt — z.B. 50667 oder Köln',
  ctaLabel = 'Gutachter finden',
}: Props) {
  const [q, setQ] = useState('')
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = q.trim()
    const param = /^\d{5}$/.test(v) ? `plz=${encodeURIComponent(v)}` : v ? `stadt=${encodeURIComponent(v)}` : ''
    router.push(`/gutachter-finden${param ? `?${param}` : ''}`)
  }

  return (
    <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="gf-teaser-heading">
      <div className="mx-auto max-w-2xl px-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">{eyebrow}</p>
        <h2 id="gf-teaser-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
          {heading}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-claimondo-shield">{subline}</p>
        <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-lg flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-claimondo-ondo" aria-hidden />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              className="w-full rounded-full border border-claimondo-border bg-white py-3.5 pl-12 pr-4 text-sm text-claimondo-navy shadow-claimondo-sm outline-none transition focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/20"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-claimondo-navy px-7 py-3.5 text-sm font-bold text-white transition-all hover:bg-claimondo-shield active:scale-[0.97]"
            data-tracking="cta-gutachter-finden-teaser"
          >
            {ctaLabel}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </div>
    </section>
  )
}
