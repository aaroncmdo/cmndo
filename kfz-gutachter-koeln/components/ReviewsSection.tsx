import type { City } from '@/lib/cluster'
import { REVIEWS, GOOGLE_RATING } from '@/lib/content'

// SERVER-Section: Google-Bewertungen (BRIEF 08i) — 6 Aaron-kuratierte GBP-Karten
// im Grid statt Inline-Liste. Staffel: Desktop >=1024 alle 6 (2x3) · Tablet
// 640-1023 Slots 1-4 (2x2) · Mobile <640 Slots 1, 2, 5 gestapelt.
// TEXT-PFLICHT-FILTER: Reviews ohne echten Text (>=40 Zeichen) werden NIE als
// Karte gerendert — Zukunfts-Guard, egal was der GBP-Sync liefert (Stern-only-
// Reviews bleiben im Profil und zaehlen in gbpReviewCount).
// Zitate sind ORIGINAL (Bewertungsrecht): nichts umformulieren, Kuerzung nur „…".
// Sterne dekorativ (Unicode ★, #FCD34D = Branding-Ausnahme).

// Slot-Sichtbarkeit (Index nach Filter = Whitelist-Reihenfolge).
const SLOT_CLASS = [
  '',                      // 1: alle Formate
  '',                      // 2: alle Formate
  'hidden sm:block',       // 3: ab Tablet
  'hidden sm:block',       // 4: ab Tablet
  'sm:hidden lg:block',    // 5: Mobile + Desktop (Tablet zeigt 1-4)
  'hidden lg:block',       // 6: nur Desktop
]

export function ReviewsSection({ city }: { city: City }) {
  const rating = GOOGLE_RATING.value.replace('.', ',')
  // Text-Pflicht (BRIEF 08i Action 2): nie Karten ohne sichtbares Zitat.
  const cards = REVIEWS.filter((r) => r.hasText && r.text.trim().length >= 40).slice(0, 6)
  return (
    <section id="reviews" className="py-9 md:py-12 bg-paper">
      <div className="max-w-[480px] sm:max-w-[760px] lg:max-w-[1080px] mx-auto px-5">
        <p className="rev-eyebrow">
          <span className="rev-stars" aria-hidden="true">★★★★★</span>{' '}
          <span className="rev-rating">{rating}</span> · aus {GOOGLE_RATING.gbpReviewCount} Google-Bewertungen
        </p>
        <h2 className="font-display font-bold text-[clamp(20px,5.5vw,24px)] mb-5 text-center leading-[1.18] tracking-[-0.012em]">
          Was <span className="text-amber">{city.residents}</span> über uns sagen
        </h2>
        <div className="rev-grid">
          {cards.map((r, i) => (
            <article key={r.name} className={`rev-card ${SLOT_CLASS[i] ?? ''}`}>
              <div className="flex items-center gap-3">
                <div className="rev-ava" style={{ background: r.avatarBg }}>
                  {r.initials}
                </div>
                <div className="min-w-0">
                  <div className="rev-name">{r.name}</div>
                  <div className="rev-meta">
                    <span className="rev-stars-mini" aria-hidden="true">★★★★★</span>
                    {r.localGuide ? <span className="rev-lg-badge">Local Guide</span> : null}
                    {r.meta ? <span>· {r.meta}</span> : null}
                  </div>
                </div>
              </div>
              {/* line-clamp-4: gleiche Kartenhoehe pro Reihe; Volltext steht bei Google. */}
              <div className="rev-quote line-clamp-4">{r.text}</div>
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
