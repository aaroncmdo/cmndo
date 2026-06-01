import { Star } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getGoogleReviews } from '@/lib/reviews/google-places'

// E1 — Google-Bewertungen-Block fuer die Trust-Strip. Self-fetching async Server-
// Component: holt LIVE-Daten (lib/reviews/google-places, 24h-cached) und rendert
// Rating + Anzahl + bis zu 3 echte Stimmen. Bei null (kein Key / Fehler) rendert
// die Komponente NICHTS — nie erfundene Bewertungen (UWG §5).
//
// Reviews-Text bleibt im Original (Deutsch, language=de) — echte UGC, nicht
// uebersetzt. Nur die Labels sind i18n (home.reviews.*).

function Stars({ rating, className }: { rating: number; className?: string }) {
  const full = Math.round(rating)
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ''}`} aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < full ? 'fill-amber-400 text-amber-400' : 'fill-claimondo-border text-claimondo-border'}`}
        />
      ))}
    </span>
  )
}

export async function GoogleReviews() {
  const data = await getGoogleReviews()
  if (!data) return null

  const t = await getTranslations('home')
  const ratingLabel = data.rating.toFixed(1).replace('.', ',')

  return (
    <div className="mt-12 border-t border-claimondo-border/60 pt-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
          {t('reviews.eyebrow')}
        </p>
        <div className="mt-1 flex items-center gap-2.5">
          <Stars rating={data.rating} />
          <span className="text-xl font-extrabold text-claimondo-navy" aria-hidden>
            {ratingLabel}
          </span>
        </div>
        <p className="text-sm text-claimondo-shield">
          {t('reviews.count', { count: data.count, rating: ratingLabel })}
        </p>
      </div>

      {data.reviews.length > 0 ? (
        <ul className="mx-auto mt-9 grid max-w-5xl gap-4 sm:grid-cols-3">
          {data.reviews.map((rv, i) => (
            <li
              key={`${rv.author}-${i}`}
              className="flex flex-col rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5"
            >
              <Stars rating={rv.rating} />
              <p className="mt-3 flex-1 text-sm leading-relaxed text-claimondo-shield">
                „{rv.text}"
              </p>
              <p className="mt-4 text-xs font-semibold text-claimondo-navy">
                {rv.author}
                {rv.relativeTime ? (
                  <span className="font-normal text-claimondo-shield/60"> · {rv.relativeTime}</span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
