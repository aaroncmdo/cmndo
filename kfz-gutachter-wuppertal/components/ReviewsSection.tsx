import type { City } from '@/lib/cluster'
import { REVIEWS, GOOGLE_RATING } from '@/lib/content'
import { CasesCarousel } from './CasesCarousel'

// SERVER-Section: Google-Bewertungen + "Aus der Praxis"-Karussell.
// - Google-Badge (5.0 · 5 Sterne · Google-Logo · Link auf reviewsUrl).
// - 7 Review-Karten (REVIEWS aus content.ts) im horizontalen .cr-wrap-Scroller.
// - Praxis-Cases via Client-Sub-Komponente <CasesCarousel> + UWG-Disclaimer.
// Dekorative Nicht-Marken-Farben (Google-Logo-Fills, Avatar-bg, Stern-Gelb
// #FCD34D) bleiben als inline-fill/style — laut Branding-Regel zulässig.

// Wiederverwendetes Google-Logo (4-Farben).
function GoogleGlyph({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 01-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09a6.97 6.97 0 010-4.18V7.07H2.18A11 11 0 001 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

// Ein gelber Stern (dekoratives #FCD34D — Branding-Ausnahme).
function Star({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#FCD34D" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export function ReviewsSection({ city }: { city: City }) {
  return (
    <section id="reviews" className="py-8 md:py-10 bg-paper">
      <div className="max-w-[1000px] mx-auto px-6">
        {/* Google Badge */}
        <div className="flex flex-col items-center mb-5">
          <div className="text-center">
            <div className="text-[44px] font-display font-bold text-petrol leading-none">
              {GOOGLE_RATING.value}
            </div>
            <div className="flex gap-0.5 mt-1 justify-center">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-5 h-5" />
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 justify-center">
              <GoogleGlyph className="w-[13px] h-[13px] flex-none" />
              <span className="text-[13px] text-muted">
                {GOOGLE_RATING.count} Google-Bewertungen ·{' '}
                <a
                  href={GOOGLE_RATING.reviewsUrl}
                  target="_blank"
                  rel="noopener"
                  className="text-claimondo-light underline underline-offset-2"
                >
                  Alle ansehen
                </a>
              </span>
            </div>
          </div>
        </div>
        <h2 className="font-display font-bold text-[clamp(20px,2.1vw,25px)] mb-5 text-center">
          Was <span className="text-amber">{city.residents}</span> über uns sagen?
        </h2>
        <div className="h-px bg-border mb-5" />
        {/* Review track */}
        <div
          className="cr-wrap overflow-x-auto pb-2"
          tabIndex={0}
          role="group"
          aria-label="Kundenbewertungen — seitlich scrollbar"
        >
          <div className="flex gap-2.5 px-8 min-w-max" id="crTrack">
            {REVIEWS.map((r) => (
              <article
                key={r.name}
                className="flex-none w-[180px] md:w-[200px] bg-surface border border-border rounded-[10px] p-3 md:p-[11px_12px] flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
                      style={{ background: r.avatarBg }}
                    >
                      {r.initials}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-petrol leading-tight truncate">
                        {r.name}
                      </div>
                      <div className="text-[10px] text-muted mt-px">{r.meta}</div>
                    </div>
                  </div>
                  <GoogleGlyph className="w-[13px] h-[13px] flex-none" />
                </div>
                <div className="flex gap-px">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-[11px] h-[11px]" />
                  ))}
                </div>
                {r.hasText ? (
                  <p className="text-xs leading-[1.5] text-ink/80">{r.text}</p>
                ) : (
                  <p className="text-xs leading-[1.5] text-muted italic text-[11px]">{r.text}</p>
                )}
              </article>
            ))}
          </div>
        </div>
        {/* Proof Cases — Karussell mit 5 Realfällen + kontinuierliches Auto-Scroll */}
        <div className="mt-7 mb-4 text-center">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber">
            <span className="eyebrow-dot" /> Aus der Praxis · {city.name}
          </span>
        </div>
        <CasesCarousel city={city} />
        {/* Vertrauenszeile (Pflicht §5 UWG) */}
        <p className="mt-5 text-[12px] text-muted leading-relaxed max-w-[820px] mx-auto text-center">
          Alle dargestellten Fälle beruhen auf real abgerechneten, anonymisierten
          Schadenvorgängen aus dem Claimondo-Netzwerk. Die erzielbare Auszahlung ist
          einzelfallabhängig und keine Zusicherung eines bestimmten Betrags. Differenzen
          entstehen typischerweise durch Wertminderung, Nutzungsausfall, Beilackierung,
          UPE-Aufschläge und korrekte Stundensätze.
        </p>
      </div>
    </section>
  )
}
