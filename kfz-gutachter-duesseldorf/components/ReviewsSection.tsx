import type { City } from '@/lib/cluster'
import { REVIEWS, GOOGLE_RATING } from '@/lib/content'

// SERVER-Section: Google-Bewertungen als Inline-List (Mock v3-praxis-v2 "Mobile
// Option E", Z.4387-4399) — ersetzt den alten 7-Karten-Scroller fuer ALLE Viewports.
// Die Praxis-Cases sind jetzt eine eigene Section (PraxisSection).
// Authentizitaet/UWG: rev-quote nur fuer Reviews MIT echtem Text (hasText). Der Mock
// zeigt 4 z.T. paraphrasierte Quotes (Kevin/David haben live keinen Text) — hier
// bleiben die echten REVIEWS-Daten (alle 7), kein erfundener Review-Text.
// Sterne sind dekorativ (Unicode ★, #FCD34D = Branding-Ausnahme).
export function ReviewsSection({ city }: { city: City }) {
  const rating = GOOGLE_RATING.value.replace('.', ',')
  return (
    <section id="reviews" className="py-9 md:py-12 bg-paper">
      <div className="max-w-[480px] mx-auto px-5">
        <p className="rev-eyebrow">
          <span className="rev-stars" aria-hidden="true">★★★★★</span>{' '}
          <span className="rev-rating">{rating}</span> · GOOGLE-BEWERTUNGEN
        </p>
        <h2 className="font-display font-bold text-[clamp(20px,5.5vw,24px)] mb-5 text-center leading-[1.18] tracking-[-0.012em]">
          Was <span className="text-amber">{city.residents}</span> über uns sagen
        </h2>
        <div className="rev-list">
          {REVIEWS.slice(0, 4).map((r) => (
            <article key={r.name} className="rev-item">
              <div className="rev-ava" style={{ background: r.avatarBg }}>
                {r.initials}
              </div>
              <div className="rev-body">
                <div className="rev-name">{r.name}</div>
                <div className="rev-meta">
                  <span className="rev-stars-mini" aria-hidden="true">★★★★★</span>
                  <span>· {r.meta}</span>
                </div>
                {r.hasText ? <div className="rev-quote">{r.text}</div> : null}
              </div>
            </article>
          ))}
        </div>
        <a className="rev-all-link" href={GOOGLE_RATING.reviewsUrl} target="_blank" rel="noopener">
          Alle Bewertungen anzeigen
        </a>
      </div>
    </section>
  )
}
