'use client'

import { useState } from 'react'

// Google-Reviews-Strip — portiert aus docs/18.05.2026/html (fertiges Widget).
// 5,0-Score-Badge + endloses Auto-Scroll-Karussell echter Google-Bewertungen.
// Google-Business-Profil von Claimondo (Bewertungen). Von Aaron, 18.05.2026.
const GOOGLE_REVIEWS_URL = 'https://share.google/zj25kQndK5IHp1GCQ'

type Review = {
  initials: string
  name: string
  date: string
  color: string
  /** null = Bewertung ohne Text (nur Sterne) */
  text: string | null
}

const REVIEWS: Review[] = [
  {
    initials: 'VH',
    name: 'Vincent Heinen',
    date: 'vor 5 Tagen',
    color: '#4573A2',
    text: 'Claimondo war von vorne bis hinten einfach nur super. Besonders gut hat mir das Kundenportal gefallen und die Schnelligkeit der Abwicklung.',
  },
  { initials: 'KP', name: 'Kevin Privat', date: 'vor 6 Tagen · Local Guide', color: '#0D1B3E', text: null },
  {
    initials: 'DB',
    name: 'daniel bonn',
    date: 'vor 6 Tagen',
    color: '#1E3A5F',
    text: 'Top Service! Gut erreichbar, schnell und kompetent.',
  },
  { initials: 'CS', name: 'charli st.', date: 'vor 6 Tagen', color: '#374151', text: null },
  {
    initials: 'DB',
    name: 'Daniel Bundesmann',
    date: 'vor 6 Tagen',
    color: '#4573A2',
    text: 'Vielen Dank für die hervorragende Abwicklung.',
  },
  { initials: 'DN', name: 'David Nelles', date: 'vor 3 Tagen', color: '#0D1B3E', text: null },
  { initials: 'VW', name: 'Victoria Weden', date: 'vor 3 Tagen', color: '#1E3A5F', text: null },
]

function Star() {
  return (
    <svg viewBox="0 0 24 24" fill="#FCD34D" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 01-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09a6.97 6.97 0 010-4.18V7.07H2.18A11 11 0 001 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function ReviewCard({ review, ariaHidden }: { review: Review; ariaHidden?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <article className={`crv-c${open ? ' crv-open' : ''}`} aria-hidden={ariaHidden}>
      <div className="crv-h">
        <div className="crv-l">
          <div className="crv-av" style={{ background: review.color }}>
            {review.initials}
          </div>
          <div className="crv-meta">
            <div className="crv-name">{review.name}</div>
            <div className="crv-date">{review.date}</div>
          </div>
        </div>
        <span className="crv-gi">
          <GoogleG />
        </span>
      </div>
      <div className="crv-s">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} />
        ))}
      </div>
      {review.text ? (
        <>
          <p className="crv-t">{review.text}</p>
          <button type="button" className="crv-m" onClick={() => setOpen((o) => !o)}>
            {open ? 'Weniger' : 'Mehr lesen'}
          </button>
        </>
      ) : (
        <p className="crv-t crv-mute">Bewertet mit 5 Sternen.</p>
      )}
    </article>
  )
}

export function GoogleReviewsStrip() {
  const [paused, setPaused] = useState(false)
  return (
    <section className="crv" aria-label="Google Bewertungen">
      <div className="crv-badge">
        <div className="crv-score">5,0</div>
        <div className="crv-badge-body">
          <div className="crv-stars-row">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} />
            ))}
          </div>
          <div className="crv-gline">
            <GoogleG />
            <span className="crv-gline-text">
              Google Bewertungen ·{' '}
              <a href={GOOGLE_REVIEWS_URL} target="_blank" rel="noopener noreferrer">
                Alle ansehen
              </a>
            </span>
          </div>
        </div>
      </div>
      <div className="crv-divider" />
      <div
        className="crv-wrap"
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        <div className={`crv-track${paused ? ' crv-paused' : ''}`}>
          {REVIEWS.map((r, i) => (
            <ReviewCard key={`a${i}`} review={r} />
          ))}
          {REVIEWS.map((r, i) => (
            <ReviewCard key={`b${i}`} review={r} ariaHidden />
          ))}
        </div>
      </div>
      <style>{`
        .crv{background:#f8f9fb;width:100%;padding:32px 0 28px;overflow:hidden;font-family:'Montserrat',system-ui,sans-serif}
        .crv-badge{display:flex;align-items:center;justify-content:center;gap:14px;padding:0 20px}
        .crv-score{font-size:40px;font-weight:800;color:#0D1B3E;line-height:1;letter-spacing:-.03em}
        .crv-badge-body{display:flex;flex-direction:column;gap:4px}
        .crv-stars-row{display:flex;gap:2px}
        .crv-stars-row svg{width:19px;height:19px}
        .crv-gline{display:flex;align-items:center;gap:5px}
        .crv-gline svg{width:14px;height:14px;flex-shrink:0}
        .crv-gline-text{font-size:12px;font-weight:600;color:#374151}
        .crv-gline-text a{color:#4573A2;text-decoration:none;font-weight:700}
        .crv-gline-text a:hover{text-decoration:underline}
        .crv-divider{width:36px;height:2px;background:#4573A2;border-radius:1px;margin:14px auto 16px;opacity:.4}
        .crv-wrap{position:relative;width:100%;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 16px,#000 calc(100% - 16px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 16px,#000 calc(100% - 16px),transparent 100%)}
        @keyframes crvSlide{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .crv-track{display:flex;gap:10px;width:max-content;animation:crvSlide 44s linear infinite;padding:4px 16px 8px;will-change:transform}
        .crv-track:hover,.crv-track.crv-paused{animation-play-state:paused}
        .crv-c{width:230px;flex-shrink:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:13px;display:flex;flex-direction:column;gap:6px;-webkit-user-select:none;user-select:none}
        .crv-h{display:flex;align-items:center;justify-content:space-between;gap:6px}
        .crv-l{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
        .crv-av{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0}
        .crv-meta{min-width:0;flex:1}
        .crv-name{font-size:12.5px;font-weight:600;color:#0D1B3E;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .crv-date{font-size:10px;color:#9CA3AF;margin-top:1px}
        .crv-gi{display:block}
        .crv-gi svg{width:14px;height:14px;display:block}
        .crv-s{display:flex;gap:1px}
        .crv-s svg{width:12px;height:12px}
        .crv-t{font-size:12.5px;line-height:1.5;color:#374151;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .crv-t.crv-mute{color:#9CA3AF;font-style:italic;font-size:11.5px}
        .crv-open .crv-t{-webkit-line-clamp:unset;overflow:visible}
        .crv-m{font-size:11px;font-weight:600;color:#4573A2;background:none;border:none;padding:0;cursor:pointer;align-self:flex-start;font-family:inherit}
        @media(prefers-reduced-motion:reduce){.crv-track{animation:none;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scroll-behavior:smooth}.crv-c{scroll-snap-align:start}}
        @media(min-width:768px){.crv{padding:44px 0 36px}.crv-score{font-size:46px}.crv-stars-row svg{width:21px;height:21px}.crv-gline-text{font-size:13px}.crv-gi svg{width:15px;height:15px}.crv-c{width:280px;padding:15px}.crv-track{gap:14px;padding:8px 40px;animation-duration:52s}.crv-wrap{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 48px,#000 calc(100% - 48px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 48px,#000 calc(100% - 48px),transparent 100%)}}
      `}</style>
    </section>
  )
}
