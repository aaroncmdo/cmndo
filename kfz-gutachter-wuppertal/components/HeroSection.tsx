import ReactDOM from 'react-dom'
import type { City } from '@/lib/cluster'
import { CLUSTER } from '@/lib/cluster'
import { GOOGLE_RATING } from '@/lib/content'
import { ClaimondoLink } from '@/lib/text'

// HeroSection — Server-Component (kein 'use client').
// Mock-Quelle: MASTER_preview-complete_v3-praxis-v2.html Z.4252-4383 (v14b/v15).
// Mobile (<640): Editorial-Header (★ 5,0 + Tagline) -> H1 -> 0€-Anker-Block (3-zeilig)
//   -> kompakte USPs -> CTA -> Trust-Stripe (★5,0 Google · DAT · BVSK) -> Brand-Anker
//   -> Scroll-Chevron (verschwindet bei Scroll via SiteScripts).
// Desktop/Tablet (>=640): H1+Sub (italic) -> Sub-Lead -> 0€-Fliesstext -> USPs ->
//   CTA (Telefonnummer) -> heroTrustClusterDesktop (Siegel+Stats) -> 3-Zeilen-Trust-Block.
// Token-Hinweis: Die Mock-CSS nutzt ein fremdes Token-System (--space-*/--type-*); hier
//   LP-nativ nachgebaut (Tailwind-Utilities + .hero-* Klassen mit Konkretwerten in globals.css).
// Siegel: siegel-claimondo-partner-v3.svg (Master-Siegel, 2026-06-03 ausgeliefert + auf VPS deployed).
// Haupt-CTA traegt id="heroCallCta" (FabStack observed es). Klick-Tracking via data-cta.
export function HeroSection({ city }: { city: City }) {
  // LCP: Hero-Bild ist CSS-background -> Preload zieht den Fetch nach vorn.
  // Desktop/Tablet (>=641px) = hero-{key}.webp; Handy (<=640px) = dediziertes hero-{key}-mobile.webp.
  ReactDOM.preload(`${CLUSTER.imgPath}hero-${CLUSTER.key}.webp`, { as: 'image', fetchPriority: 'high', media: '(min-width: 641px)' })
  ReactDOM.preload(`${CLUSTER.imgPath}hero-${CLUSTER.key}-mobile.webp`, { as: 'image', fetchPriority: 'high', media: '(max-width: 640px)' })
  const rating = GOOGLE_RATING.value.replace('.', ',')
  return (
    <section className="relative bg-petrol text-white overflow-hidden -mt-[59px] sm:mt-0">
      {/* Hero-Bild: Desktop = hero-{key}.webp (inline). Handy (<=640px) = dediziertes
          hero-{key}-mobile.webp via --hero-mobile-img (globals.css .hero-photo-bg). Gradient ebd. */}
      <div
        className="hero-photo hero-photo-bg absolute inset-0 z-0"
        style={{ background: `url(${CLUSTER.imgPath}hero-${CLUSTER.key}.webp) center 22%/cover no-repeat` }}
      />
      {/* Verschwommener Verlauf: Foto unten-links blurren, diagonal bis ~25% ausblenden (Aaron 05.06.) */}
      <div className="hero-blur-corner absolute inset-0 z-0" aria-hidden="true" />
      <div className="relative z-[1] max-w-wrap mx-auto px-6 pt-[70px] pb-[16px] sm:pt-[40px] sm:pb-[40px] flex flex-col min-h-[100svh]">
        <div className="grid grid-cols-1 md:grid-cols-[1.25fr_.75fr] grid-rows-[1fr_auto] md:grid-rows-none gap-14 items-stretch flex-1">
          <div className="flex flex-col justify-between sm:justify-start sm:pb-2.5 hero-copy-fade">
            {/* Editorial-Header NUR MOBILE: ★★★★★ 5,0 + Tagline als EINE zusammenhaengende Gruppe (fix beieinander). */}
            <div className="sm:hidden">
              <p className="hero-eyebrow" aria-label={`${rating} von 5 Sternen`}>
                <span className="eyebrow-stars" aria-hidden="true">★★★★★</span>
                <span className="eyebrow-rating">{rating}</span>
              </p>
              <p className="hero-tagline">Unabhängige Sachverständige</p>
            </div>
            <h1 className="font-display font-bold text-hero-h1 text-white mt-1 mb-1 sm:mt-3 sm:mb-4 leading-[1.15] tracking-[-0.016em] hero-h1-shadow">
              Kfz-Gutachter <br className="sm:hidden" />
              <span className="text-amber loc">{city.name}</span>
              <span className="hidden sm:block font-semibold text-white/85 mt-1 sm:mt-2 text-[clamp(16px,1.6vw,18px)] leading-snug tracking-normal h1-sub italic">
                Unabhängige Sachverständige. Gerichtsfeste Gutachten nach DAT-Standard, mit BVSK-Kompetenz.
              </span>
            </h1>
            <p className="hidden sm:block text-[clamp(17px,1.8vw,19px)] leading-[1.55] text-white/[.92] font-normal mb-4 max-w-[560px]">
              Gerichtsfestes Gutachten — neutral und schnell vor Ort.
            </p>
            {/* Desktop: 0€-Fliesstext. Mobile: 3-zeiliger 0€-Anker-Block drunter (sm:hidden). */}
            <p className="hidden sm:block font-bold text-[clamp(19px,2vw,22px)] leading-snug text-white mb-5 sm:mb-7 max-w-[580px]">
              Bei unverschuldetem Unfall zahlen Sie <span className="text-amber">0&nbsp;€</span>. Die Versicherung übernimmt alles.
            </p>
            {/* 0€-Anker NUR MOBILE: Zahl oben, Bedingung, Proof. */}
            <div className="sm:hidden mt-3 hero-text-shadow hero-zero-block">
              <p className="hero-zero-big">0&nbsp;€</p>
              <p className="hero-zero-condition">Bei unverschuldetem Unfall</p>
              <p className="hero-post-zero">Versicherung zahlt alles</p>
            </div>
            <ul className="list-none flex flex-col sm:flex-row sm:flex-wrap gap-2 gap-x-7 sm:gap-y-2.5 mt-3 sm:mt-6 mb-4 sm:mb-7 max-w-[580px] hero-text-shadow">
              <li className="flex items-center gap-[11px] font-medium text-[clamp(13px,3.6vw,15.5px)] text-white/95 leading-snug">
                <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>{' '}
                <span className="sm:hidden">Gutachten, Anwalt, Mietwagen</span>
                <span className="hidden sm:inline">Gutachten, Anwalt &amp; Mietwagen — alles aus einer Hand</span>
              </li>
              <li className="flex items-center gap-[11px] font-medium text-[clamp(13px,3.6vw,15.5px)] text-white/95 leading-snug">
                <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>{' '}
                <span>In 60{' '}Min vor Ort in <span className="loc-uspsm">{city.name}</span></span>
              </li>
              {/* Mobile USP 3: "2.500+ Schäden begleitet" (eigener Bullet). */}
              <li className="sm:hidden flex items-center gap-[11px] font-medium text-[clamp(13px,3.6vw,15.5px)] text-white/95 leading-snug">
                <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 4 4 5-5" />
                </svg>{' '}
                2.500+ Schäden begleitet
              </li>
              {/* USP 4: "10+ Jahre Erfahrung" — alle Viewports. */}
              <li className="flex items-center gap-[11px] font-medium text-[clamp(13px,3.6vw,15.5px)] text-white/95 leading-snug">
                <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="9" />
                </svg>{' '}
                10+ Jahre Erfahrung
              </li>
              {/* Desktop USP 3: Gegengutachten. */}
              <li className="hidden sm:flex items-center gap-[11px] font-medium text-[15.5px] text-white/95 leading-snug">
                <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 4 4 5-5" />
                </svg>{' '}
                Versicherung kürzt? Wir holen mit Gegengutachten nach
              </li>
            </ul>
            {/* CTA: mobile "Jetzt anrufen" (Verb), Desktop Telefonnummer (Glaubwuerdigkeit). */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 sm:mb-7 max-w-[580px]">
              <a
                id="heroCallCta"
                className="inline-flex items-center justify-center gap-2.5 bg-cta text-white font-display font-bold text-[clamp(14.5px,4vw,16.5px)] px-7 py-4 sm:py-[15px] rounded-[12px] tracking-[.005em] shadow-[0_6px_20px_rgba(229,55,43,.32)] hover:bg-cta-700 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(229,55,43,.42)] active:scale-[.98] transition-all duration-200 min-h-[52px] w-full sm:w-auto"
                href={`tel:${CLUSTER.phone.tel}`}
                data-cta="hero_call"
                aria-label={`Jetzt anrufen — ${CLUSTER.phone.display}`}
              >
                <svg className="w-5 h-5 fill-current flex-none" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                </svg>
                <span className="whitespace-nowrap sm:hidden">Jetzt anrufen</span>
                <span className="hidden sm:inline whitespace-nowrap">{CLUSTER.phone.display}</span>
              </a>
            </div>
            {/* Trust-Cluster (Desktop+Tablet) — konsolidiert Siegel + Brand + Stats in 1 Zeile.
                Sichtbarkeit via #heroTrustClusterDesktop CSS (none mobil, flex ab 640). */}
            <div id="heroTrustClusterDesktop" aria-label="Vertrauenssignale">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="htc-siegel" src="/assets/brand/siegel-claimondo-partner-v3.svg" alt="Claimondo-Partner-Siegel" loading="lazy" />
              <div className="htc-text">
                <span className="htc-text-main">Zertifizierter <ClaimondoLink>Claimondo-Partner</ClaimondoLink></span>
                <span className="htc-text-sub">Unfall-Assistance · 2026</span>
              </div>
              <span className="htc-sep" aria-hidden="true" />
              <span className="htc-stats">
                <span><strong>2.500+</strong> Schäden begleitet</span>
                <span><strong>10+ Jahre</strong> Erfahrung</span>
              </span>
            </div>
            {/* Trust-Block — Gradient-Divider + 3 Zeilen auf Desktop, kompakter Stack + Brand-Anker auf Mobile. */}
            <div className="mt-3 sm:mt-auto max-w-[580px]">
              <div
                className="hidden sm:block h-px mb-6"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,.18) 22%, rgba(255,255,255,.18) 78%, transparent 100%)' }}
                aria-hidden="true"
              />

              {/* Trust-Block: DESKTOP-Variante (3 Zeilen) */}
              <div className="hidden sm:flex flex-col gap-2.5">
                <div className="flex items-center gap-2 leading-tight">
                  <span className="text-[#FCD34D] text-[15px] tracking-[1.5px] flex-none" aria-hidden="true">★★★★★</span>
                  <span className="font-mono font-bold text-white text-[15px]" aria-label={`Bewertung ${rating} von 5`}>{rating}</span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-[14px] text-white/90 font-medium">{GOOGLE_RATING.count} Google-Bewertungen</span>
                </div>
                <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[14px] leading-tight">
                  <span className="text-white/85"><strong className="text-white font-semibold">DAT-Expert</strong></span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-white/85"><strong className="text-white font-semibold">BVSK</strong></span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-white/85"><strong className="text-white font-semibold">2.500+</strong> Schäden</span>
                </div>
                <div className="flex items-center gap-2.5 leading-tight">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-[28px] h-[28px] flex-none drop-shadow-[0_2px_4px_rgba(0,0,0,.35)]"
                    src="/assets/brand/siegel-claimondo-partner-v3.svg"
                    alt="Claimondo-Partner-Siegel"
                    loading="lazy"
                  />
                  <span className="flex flex-col leading-tight">
                    <strong className="text-white font-semibold text-[14px] tracking-tight">Zertifizierter <ClaimondoLink>Claimondo-Partner</ClaimondoLink></strong>
                    <span className="text-white/45 font-normal text-[10.5px] tracking-normal mt-0.5">Unfall-Assistance</span>
                  </span>
                </div>
              </div>

              {/* Trust-Block: MOBILE — ★ 5,0 Google · DAT · BVSK + zentraler Brand-Anker. */}
              <div className="flex sm:hidden flex-col">
                <div className="flex items-center justify-center gap-x-2 leading-tight hero-text-shadow flex-wrap">
                  <span className="text-[#FCD34D] text-[12.5px] tracking-[1.2px] flex-none" aria-hidden="true">★★★★★</span>
                  <span className="font-mono font-bold text-white text-[12.5px]" aria-label={`Bewertung ${rating} von 5`}>{rating}</span>
                  <span className="text-[11.5px] text-white/70 font-medium">Google</span>
                  <span className="text-white/40" aria-hidden="true">·</span>
                  <span className="text-[12px] text-white/85 font-semibold">DAT-Expert</span>
                  <span className="text-white/40" aria-hidden="true">·</span>
                  <span className="text-[12px] text-white/85 font-semibold">BVSK</span>
                </div>
                <div className="hero-brand-anchor">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="mini-seal" src="/assets/brand/siegel-claimondo-partner-v3.svg" alt="Claimondo Unfall-Assistance Partner Siegel" loading="lazy" />
                  <div className="brand-text-block brand-text-block-centered">
                    <span className="brand-line-main"><ClaimondoLink>Claimondo</ClaimondoLink> Unfall-Assistance</span>
                    <span className="brand-line-sub">Partner</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Scroll-Chevron — NUR Mobile, im Copy-Stack am Fold-Boden (via justify-between klar vom Trust/Claimondo-Link getrennt). Scrollt zu #reviews. */}
            <a
              href="#reviews"
              id="heroScrollChevron"
              className="sm:hidden hero-scroll-chevron relative z-[3] mx-auto grid place-items-center w-12 h-10 text-white/80 shrink-0"
              aria-label="Weiter scrollen"
            >
              <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </a>
          </div>
          {/* Rechte Spalte leer (Gutachter im Hero-Bild ist der visuelle Anker) */}
          <div />
        </div>
        {/* Mehr erfahren — NUR Desktop. Mobile: Scroll-Chevron (siehe unten). */}
        <div className="hidden sm:flex justify-center pt-6 pb-3.5">
          <a
            href="#reviews"
            className="grid place-items-center w-12 h-12 rounded-full border-[1.5px] border-white/[.32] bg-white/[.06] backdrop-blur-[8px] text-white transition hover:bg-white/[.14] hover:border-white/[.55]"
            style={{ animation: 'scrollPulse 2.2s ease-in-out infinite' }}
            aria-label="Mehr erfahren — nach unten scrollen"
          >
            <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}
