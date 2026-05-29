import type { City } from '@/lib/cluster'
import { CLUSTER } from '@/lib/cluster'
import { GOOGLE_RATING } from '@/lib/content'

// HeroSection — Server-Component (kein 'use client', keine Interaktivitaet).
// Mock-Quelle: preview-complete.html Z294-385.
// - Hero-Foto-Layer als .hero-photo + .hero-photo-bg (Gradient-::after + Mobile-
//   background-position kommen aus globals.css).
// - Haupt-CTA traegt id="heroCallCta" (FabStack observed es per IntersectionObserver).
// - Klick-Tracking laeuft delegiert ueber SiteScripts via data-cta (kein onClick).
export function HeroSection({ city }: { city: City }) {
  return (
    <section className="relative bg-petrol text-white overflow-hidden">
      {/* Hero-Bild: cluster-spezifisch (heroImg = hero-{key}.webp) */}
      <div
        className="hero-photo hero-photo-bg absolute inset-0 z-0"
        style={{ background: `url(${CLUSTER.imgPath}hero-${CLUSTER.key}.webp) center 22%/cover no-repeat` }}
      />
      <div className="relative z-[1] max-w-wrap mx-auto px-6 pt-[56px] pb-[48px] flex flex-col min-h-[640px] md:min-h-[760px]">
        <div className="grid grid-cols-1 md:grid-cols-[1.25fr_.75fr] gap-14 items-stretch flex-1">
          <div className="flex flex-col pb-2.5">
            <h1 className="font-display font-bold text-hero-h1 text-white mt-3 mb-4 leading-[1.15] tracking-[-0.016em]">
              Kfz-Gutachter <span className="text-amber loc">{city.name}</span>
              <br className="sm:hidden" />
              <span className="block font-semibold text-white/85 mt-2 text-[clamp(20px,2.4vw,26px)] leading-snug tracking-normal h1-sub">
                {city.h1Sub}
              </span>
            </h1>
            <p className="hidden sm:block text-[clamp(17px,1.8vw,19px)] leading-[1.55] text-white/[.92] font-normal mb-4 max-w-[560px]">
              Gerichtsfestes Gutachten — neutral und schnell vor Ort.
            </p>
            <p className="font-bold text-[clamp(19px,2vw,22px)] leading-snug text-white mb-7 max-w-[580px]">
              Bei unverschuldetem Unfall zahlen Sie <span className="text-amber">0{' '}€</span> — die Versicherung übernimmt alles.
            </p>
            <ul className="list-none flex flex-col sm:flex-row sm:flex-wrap gap-2.5 gap-x-7 mb-7 max-w-[580px]">
              <li className="flex items-center gap-[11px] font-medium text-[15.5px] text-white/95 leading-snug">
                <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>{' '}
                Gutachten, Anwalt & Mietwagen — ein Netzwerk
              </li>
              <li className="flex items-center gap-[11px] font-medium text-[15.5px] text-white/95 leading-snug">
                <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>{' '}
                In 60{' '}Min vor Ort in <span className="loc-uspsm">{city.name}</span>
              </li>
              <li className="hidden sm:flex items-center gap-[11px] font-medium text-[15.5px] text-white/95 leading-snug">
                <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 4 4 5-5" />
                </svg>{' '}
                Versicherung kürzt? Wir holen mit Gegengutachten nach
              </li>
            </ul>
            {/* CTA: buendig links wie USPs, mobile full-width fuer Touch-Target */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-7 max-w-[580px]">
              <a
                id="heroCallCta"
                className="inline-flex items-center justify-center gap-2.5 bg-amber text-white font-display font-bold text-[16px] sm:text-[16.5px] px-7 py-4 sm:py-[15px] rounded-[12px] tracking-[.005em] shadow-[0_6px_20px_rgba(229,55,43,.32)] hover:bg-amber-700 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(229,55,43,.42)] active:scale-[.98] transition-all duration-200 min-h-[52px] w-full sm:w-auto"
                href={`tel:${CLUSTER.phone.tel}`}
                data-cta="hero_call"
                aria-label={`Jetzt anrufen — ${CLUSTER.phone.display}`}
              >
                <svg className="w-5 h-5 fill-current flex-none" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                </svg>
                <span className="whitespace-nowrap">Jetzt anrufen · {CLUSTER.phone.display}</span>
              </a>
              <span className="hidden sm:inline-block text-white/65 text-[13.5px] font-medium leading-snug">
                oder<br />Schaden melden
              </span>
            </div>
            {/* Trust-Block — Gradient-Trennlinie, kompakter Strip, einheitliche 14px-Hierarchie */}
            <div className="mt-auto max-w-[580px]">
              {/* Eleganter Gradient-Divider (statt harter border-t) */}
              <div
                className="h-px mb-6"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,.18) 22%, rgba(255,255,255,.18) 78%, transparent 100%)' }}
                aria-hidden="true"
              />

              {/* Trust-Block: DESKTOP-Variante (3 Zeilen, original) */}
              <div className="hidden sm:flex flex-col gap-2.5">
                {/* Zeile 1: Social Proof — Sterne sind dominant (intentional, staerkster Trust-Code) */}
                <div className="flex items-center gap-2 leading-tight">
                  <span className="text-[#FCD34D] text-[15px] tracking-[1.5px] flex-none" aria-hidden="true">★★★★★</span>
                  <span className="font-mono font-bold text-white text-[15px]" aria-label="Bewertung 5 von 5">5,0</span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-[14px] text-white/90 font-medium">{GOOGLE_RATING.count} Google-Bewertungen</span>
                </div>
                {/* Zeile 2: Authority — Cert-Strip mit einheitlicher Tonalitaet */}
                <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[14px] leading-tight">
                  <span className="text-white/85"><strong className="text-white font-semibold">DAT-Expert</strong></span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-white/85"><strong className="text-white font-semibold">BVSK</strong></span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-white/85"><strong className="text-white font-semibold">2.500+</strong> Schäden</span>
                </div>
                {/* Zeile 3: Brand-Anker — Mini-Siegel (28px) + Text */}
                <div className="flex items-center gap-2.5 leading-tight">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-[28px] h-[28px] flex-none drop-shadow-[0_2px_4px_rgba(0,0,0,.35)]"
                    src="/assets/brand/siegel-claimondo-partner.svg"
                    alt="Claimondo-Partner-Siegel"
                    loading="lazy"
                  />
                  <span className="text-[14px] text-white/85 font-medium">Zertifizierter <strong className="text-white font-semibold">Claimondo-Partner</strong></span>
                </div>
              </div>

              {/* Trust-Block: MOBILE-Variante (2 Zeilen kompakt, ohne Siegel) */}
              <div className="flex sm:hidden flex-col gap-1.5">
                {/* Mobile-Zeile 1: Sterne + 5,0 + Google + DAT + BVSK in einer flex-wrap-Reihe */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 leading-tight text-[13.5px]">
                  <span className="text-[#FCD34D] text-[14px] tracking-[1.5px] flex-none" aria-hidden="true">★★★★★</span>
                  <span className="font-mono font-bold text-white" aria-label="Bewertung 5 von 5">5,0</span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-white/85">{GOOGLE_RATING.count} Bewertungen</span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-white font-semibold">DAT</span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-white font-semibold">BVSK</span>
                </div>
                {/* Mobile-Zeile 2: 2.500+ Schaeden + Claimondo-Partner */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 leading-tight text-[13.5px]">
                  <span className="text-white/85"><strong className="text-white font-semibold">2.500+</strong> Schäden</span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-white/85"><strong className="text-white font-semibold">Claimondo-Partner</strong></span>
                </div>
              </div>
            </div>
          </div>
          {/* Rechte Spalte leer (Gutachter im Hero-Bild ist der visuelle Anker) */}
          <div />
        </div>
        {/* Mehr erfahren */}
        <div className="flex justify-center pt-6 pb-3.5">
          <a
            href="#reviews"
            className="inline-flex items-center gap-2.5 px-[22px] py-[11px] rounded-full border-[1.5px] border-white/[.32] bg-white/[.06] backdrop-blur-[8px] text-white font-semibold text-sm tracking-[.01em] transition hover:bg-white/[.14] hover:border-white/[.55] hover:translate-y-0.5"
            style={{ animation: 'scrollPulse 2.6s ease-in-out infinite' }}
            aria-label="Mehr erfahren"
          >
            <span>Mehr erfahren</span>
            <svg className="w-4 h-4 stroke-current fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}
