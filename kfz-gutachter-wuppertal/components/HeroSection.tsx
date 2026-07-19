import ReactDOM from 'react-dom'
import type { City } from '@/lib/cluster'
import { CLUSTER } from '@/lib/cluster'
import { GOOGLE_RATING, HERO_FEATURES, PARTNER_LINE, type HeroFeature } from '@/lib/content'
import { ClaimondoLink } from '@/lib/text'

// 08n N11c · Icon-Set der Hero-Features (Stroke-Stil wie gehabt, 18px/1.9).
const FEATURE_ICON: Record<HeroFeature['icon'], React.ReactNode> = {
  shield: (
    <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  clock: (
    <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  chart: (
    <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-5" />
    </svg>
  ),
  check: (
    <svg className="w-[18px] h-[18px] stroke-amber fill-none flex-none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
}

/** {city}-Token -> Akzent-Span (.loc-uspsm); Texte kommen aus HERO_FEATURES. */
function featureText(text: string, cityName: string) {
  if (!text.includes('{city}')) return <span>{text}</span>
  const [pre, post] = text.split('{city}')
  return (
    <span>
      {pre}
      <span className="loc-uspsm">{cityName}</span>
      {post}
    </span>
  )
}

// HeroSection — Server-Component (kein 'use client').
// Mock-Quelle: MASTER_preview-complete_v3-praxis-v2.html Z.4252-4383 (v14b/v15).
// Mobile (<640): Editorial-Header (★ 5,0 + Tagline) -> H1 -> 0€-Anker-Block (3-zeilig)
//   -> kompakte USPs -> CTA -> Trust-Stripe (★5,0 Google · BVSK) -> Brand-Anker
//   -> Scroll-Chevron (verschwindet bei Scroll via SiteScripts).
// Desktop/Tablet (>=640, BRIEF 08h Editorial-Port): H1+Sub (15/400 italic, Indent) ->
//   0€-GEORGIA-ANKER (3-zeilig, ohne Glas-Box; SUPERSEDE 08-A0.3/08e-A2.1) -> USPs
//   (vertikal, Indent) -> CTA (Telefonnummer) -> Gradient-Divider + 3-Zeilen-Trust-Block
//   (kleine mt-Stufe statt mt-auto). Alle >=640-Masse: globals.css 08h-Block (Matrix).
//   BRIEF 08f: #heroTrustClusterDesktop entfernt — im Mock per display:none deaktiviert
//   (Z.1190-1192 "v7 · custom Trust-Cluster raus"); stand faelschlich in BRIEF 08 Action 0 P6.
// Token-Hinweis: Die Mock-CSS nutzt ein fremdes Token-System (--space-*/--type-*); hier
//   LP-nativ nachgebaut (Tailwind-Utilities + .hero-* Klassen mit Konkretwerten in globals.css).
// Siegel: siegel-claimondo-partner-v3.svg (Master-Siegel, 2026-06-03 ausgeliefert + auf VPS deployed).
// Haupt-CTA traegt id="heroCallCta" (FabStack observed es). Klick-Tracking via data-cta.
export function HeroSection({ city }: { city: City }) {
  // LCP: Hero-Bild ist CSS-background -> Preload zieht den Fetch nach vorn.
  // Desktop/Tablet (>=641px) = hero-{key}.webp; Handy (<=640px) = dediziertes hero-{key}-mobile.webp.
  // 08m A1: avif-ONLY-Preload — der type-Filter prueft nur Format-SUPPORT,
  // nicht die image-set-Wahl: ein zusaetzlicher webp-Preload wuerde in avif-
  // faehigen Browsern immer ungenutzt bleiben (Console-Warn). Browser ohne
  // avif (Rand-Gruppe) laden ohne Preload-Vorsprung — graceful.
  ReactDOM.preload(`${CLUSTER.imgPath}hero-${CLUSTER.key}.avif?v=${CLUSTER.assetVersion}`, { as: 'image', type: 'image/avif', fetchPriority: 'high', media: '(min-width: 1024px)' })
  ReactDOM.preload(`${CLUSTER.imgPath}hero-${CLUSTER.key}-mobile.avif?v=${CLUSTER.assetVersion}`, { as: 'image', type: 'image/avif', fetchPriority: 'high', media: '(max-width: 1023px)' })
  const rating = GOOGLE_RATING.value.replace('.', ',')
  return (
    // 08h A4b: >=1280 zieht der A4-Block -mt auf -92/-100 (Header-Leiter).
    <section className="hero-section relative bg-petrol text-white overflow-hidden -mt-[60px] sm:-mt-[72px] md:-mt-[80px] lg:-mt-[84px]">
      {/* Hero-Bild: Desktop = hero-{key}.webp (inline). Handy (<=640px) = dediziertes
          hero-{key}-mobile.webp via --hero-mobile-img (globals.css .hero-photo-bg). Gradient ebd.
          TODO avif (BRIEF 08 A2): beim Asset-Drop auf image-set umstellen —
          `image-set(url(...avif) type("image/avif"), url(...webp) type("image/webp"))`
          (jetzt NICHT aktiv: avif-Eintrag ohne Datei = 404-Hero in avif-faehigen Browsern). */}
      <div
        className="hero-photo hero-photo-bg absolute inset-0 z-0"
        style={{ background: `url(${CLUSTER.imgPath}hero-${CLUSTER.key}.webp?v=${CLUSTER.assetVersion}) center 22%/cover no-repeat` }}
      />
      {/* Verschwommener Verlauf: Foto unten-links blurren, diagonal bis ~25% ausblenden (Aaron 05.06.) */}
      <div className="hero-blur-corner absolute inset-0 z-0" aria-hidden="true" />
      {/* 08h: >=640-Geometrie (pt/pb/minH) im globals-08h-Block (.hero-shell) — Mobile-Klassen unveraendert. */}
      <div className="hero-shell relative z-[1] max-w-wrap mx-auto px-6 pt-[clamp(70px,11.4vh,108px)] [@media(max-height:700px)]:pt-[62px] pb-[16px] [@media(max-height:700px)]:pb-[4px] flex flex-col min-h-[100svh]">
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_.75fr] grid-rows-[1fr_auto] lg:grid-rows-none gap-14 items-stretch flex-1">
          <div className="flex flex-col md:pl-7 lg:pl-0 sm:pb-2.5 hero-copy-fade">
            {/* Editorial-Header NUR MOBILE: ★★★★★ 5,0 + Tagline als EINE zusammenhaengende Gruppe (fix beieinander). */}
            <div className="sm:hidden">
              <p className="hero-eyebrow" aria-label={`${rating} von 5 Sternen`}>
                <span className="eyebrow-stars" aria-hidden="true">★★★★★</span>
                <span className="eyebrow-rating">{rating}</span>
              </p>
              <p className="hero-tagline">Unabhängige Sachverständige</p>
            </div>
            {/* BRIEF 08 Action 0 (Mock Z.4266-4272): H1 desktop EINzeilig mit City inline +
                integriertem italic-Sub-Span; danach Sub-Lead-<p>; 0€ desktop als Fliesstext. */}
            {/* 08h A7 (Aaron-Regel): Stadt steht <1024 IMMER strukturell in Zeile 2
                (br VOR dem Stadt-Span, lg:hidden); ab 1024 einzeilig. Der alte
                Mock-br NACH der Stadt brach nichts (toter Umbruch) — entfernt. */}
            <h1 className="font-grotesk font-bold text-hero-h1 text-white mt-2.5 mb-0 sm:mt-3 sm:mb-4 leading-[1.15] tracking-[-0.016em] hero-h1-shadow">
              Kfz-Gutachter <br className="lg:hidden" /><span className="text-amber loc">{city.name}</span>
              {/* Action 0 P2: Copy aus CLUSTER.h1SubSpan (FINAL Aaron 10.06.).
                  08m A7 GUARD-REGRESSION-FIX: zurueck auf lg (NUR >=1024) — der
                  urspruengliche Aaron-Entscheid (BRIEF 08 A0 P2), heute erneut
                  bestaetigt (iPad-Sichtung Leverkusen). SUPERSEDE: Die Matrix-
                  Zeile .h1-sub@768 (Wuppertal-Mock) gilt fuer Koeln/Aachen NICHT.
                  Typo >=1024 (15/400 italic + Indent) im 08h-Block. */}
              <span className="hidden lg:block italic text-white/85 mt-1 sm:mt-2 leading-snug tracking-normal h1-sub">
                {CLUSTER.h1SubSpan}
              </span>
            </h1>
            {/* 08h A1: Sub-Lead-P + 0€-Fliesstext entfernt (Matrix: P unsichtbar auf
                ALLEN >=640; 0€ ist der Georgia-Anker — Mock-Render, nicht Mock-CSS). */}
            {/* 0€-Anker: 08q Q1 — Glas-Box auch mobil ENTFERNT (Bridge-A/B @390:
                Top-Scrim + dunkle Bildzone tragen die Lesbarkeit, 0 € wirkt frei
                staerker; Card-over-Photo-Anti-Pattern + Blur-Last raus). Block
                steht frei auf dem Scrim, linksbuendig; mt-auto-Dock bleibt,
                >=640 weiter Georgia-Serif-Editorial (08h-Block). */}
            <div className="zero-anchor-block mt-auto sm:mt-0 self-start">
              <p className="za-big zero-accent font-bold text-amber leading-[0.95] tracking-tight text-[clamp(34px,5.2vh,68px)] [text-shadow:0_3px_14px_rgba(0,0,0,.42)]" style={{ fontFamily: 'Georgia, serif' }}>0&nbsp;€</p>
              <p className="za-cond font-semibold text-white/95 leading-snug text-[clamp(14px,1.7vw,19px)] mt-1.5 [text-shadow:0_1px_4px_rgba(0,0,0,.55)]">Bei unverschuldetem Unfall</p>
              <p className="za-post italic text-white/75 leading-snug text-[clamp(12px,1.4vw,16px)] mt-0.5 [text-shadow:0_1px_4px_rgba(0,0,0,.55)]">Versicherung zahlt alles</p>
            </div>
            {/* 08h A1: USPs vertikal mit Indent (Matrix: column auf ALLEN >=640 —
                SUPERSEDE 08-A0.4 row/wrap); Masse im 08h-Block. */}
            {/* 08n N11c: Texte + Format-Flags aus HERO_FEATURES (lib/content) —
                EINE Datenquelle fuer Mobile (4) und sm+ (3); "aus einer Hand"
                und "Gegengutachten" raus (Entscheid Aaron 2026-06-10). */}
            <ul className="hero-usps list-none flex flex-col gap-2 mt-[clamp(14px,2.3vh,22px)] mb-0 max-w-[580px] hero-text-shadow">
              {HERO_FEATURES.map((f) => (
                <li
                  key={f.icon}
                  className={`${
                    f.mobile && f.desktop ? 'flex' : f.mobile ? 'sm:hidden flex' : 'hidden sm:flex'
                  } items-center gap-[11px] font-medium text-[15px] text-white/95 leading-snug`}
                >
                  {FEATURE_ICON[f.icon]}{' '}
                  {f.textMobile ? (
                    <>
                      <span className="sm:hidden">{featureText(f.textMobile, city.name)}</span>
                      <span className="hidden sm:inline">{featureText(f.text, city.name)}</span>
                    </>
                  ) : (
                    featureText(f.text, city.name)
                  )}
                </li>
              ))}
            </ul>
            {/* CTA: mobile "Jetzt anrufen" (Verb), Desktop Telefonnummer (Glaubwuerdigkeit). */}
            <div className="mt-[clamp(14px,2.3vh,22px)] sm:mt-0 flex flex-col sm:flex-row sm:items-center gap-3 mb-0 max-w-[580px]">
              <a
                id="heroCallCta"
                className="inline-flex items-center justify-center gap-2.5 bg-amber text-white font-display font-bold text-[clamp(14.5px,4vw,16.5px)] px-7 py-4 sm:py-[15px] rounded-[12px] tracking-[.005em] shadow-[0_6px_20px_color-mix(in_srgb,var(--amber)_30%,transparent)] hover:bg-amber-700 hover:-translate-y-px hover:shadow-[0_8px_24px_color-mix(in_srgb,var(--amber)_42%,transparent)] active:scale-[.98] transition-all duration-200 min-h-[52px] w-full sm:w-auto"
                href={`tel:${CLUSTER.phone.tel}`}
                data-cta="hero_call"
                aria-label={`Jetzt anrufen — ${CLUSTER.phone.displayNational}`}
              >
                <svg className="w-5 h-5 fill-current flex-none" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                </svg>
                <span className="whitespace-nowrap sm:hidden">Jetzt anrufen</span>
                {/* 08e A2: Desktop national formatiert (Mock Z.4295). */}
                <span className="hidden sm:inline whitespace-nowrap">{CLUSTER.phone.displayNational}</span>
              </a>
            </div>
            {/* Trust-Block — Desktop 3 Zeilen + Gradient-Divider (Mock Z.4312-4314); 08h A1:
                kleine mt-Stufe + Indent statt mt-auto-Loch (Matrix-Zeile Trust), kompakter
                Stack + Brand-Anker auf Mobile. Einzige Trust-Instanz >=640 (BRIEF 08f). */}
            <div className="hero-trust-wrap mt-3 max-w-[580px]">
              {/* 08m A3: Gradient-Divider entfernt — die Mock-Editorial-Schicht
                  setzt ihn display:none, der 08h-Port hatte das uebersehen. */}
              {/* Trust-Block: DESKTOP-Variante (3 Zeilen, konsistente Gaps); 08h: Rating-
                  und strong-Stufen (Matrix) im 08h-Block via .trust-rating/.hero-trust-desk. */}
              <div className="hero-trust-desk hidden sm:flex flex-col gap-2.5">
                <div className="flex items-center gap-2 leading-tight">
                  <span className="text-[#FCD34D] text-[15px] tracking-[1.5px] flex-none" aria-hidden="true">★★★★★</span>
                  <span className="trust-rating font-mono font-bold text-white text-[15px]" aria-label={`Bewertung ${rating} von 5`}>{rating}</span>
                  <span className="text-white/30" aria-hidden="true">·</span>
                  <span className="text-[14px] text-white/90 font-medium">Google-Bewertungen</span>
                </div>
                <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[14px] leading-tight">
                  <span className="text-white/85"><strong className="text-white font-semibold">Zertifiziert</strong></span>
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
                    width={28}
                    height={28}
                  />
                  <span className="flex flex-col leading-tight">
                    {/* 08o O3: Wortlaut aus PARTNER_LINE (ein Datenfeld, drei Lockups). */}
                    <strong className="text-white font-semibold text-[14px] tracking-tight">{PARTNER_LINE.pre} <ClaimondoLink>{PARTNER_LINE.brand}</ClaimondoLink></strong>
                    <span className="text-white/45 font-normal text-[10.5px] tracking-normal mt-0.5">{PARTNER_LINE.sub}</span>
                  </span>
                </div>
              </div>

              {/* Trust-Block: MOBILE — ★ 5,0 Google · BVSK + zentraler Brand-Anker. */}
              <div className="flex sm:hidden flex-col">
                <div className="flex items-center justify-center gap-x-2 leading-tight hero-text-shadow flex-wrap">
                  <span className="text-[#FCD34D] text-[12.5px] tracking-[1.2px] flex-none" aria-hidden="true">★★★★★</span>
                  <span className="font-mono font-bold text-white text-[12.5px]" aria-label={`Bewertung ${rating} von 5`}>{rating}</span>
                  <span className="text-[11.5px] text-white/70 font-medium">Google</span>
                  <span className="text-white/40" aria-hidden="true">·</span>
                  <span className="text-[12px] text-white/85 font-semibold">Zertifiziert</span>
                  <span className="text-white/40" aria-hidden="true">·</span>
                  <span className="text-[12px] text-white/85 font-semibold">BVSK</span>
                </div>
                <div className="hero-brand-anchor">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="mini-seal" src="/assets/brand/siegel-claimondo-partner-v3.svg" alt="Claimondo-Partner-Siegel" loading="lazy" />
                  <div className="brand-text-block brand-text-block-centered">
                    {/* 08o O3: Badge-Stil bleibt, Worte aus PARTNER_LINE. */}
                    <span className="brand-line-main">{PARTNER_LINE.pre} <ClaimondoLink>{PARTNER_LINE.brand}</ClaimondoLink></span>
                    <span className="brand-line-sub">{PARTNER_LINE.sub}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Scroll-Chevron — NUR Mobile, im Copy-Stack am Fold-Boden (via justify-between klar vom Trust/Claimondo-Link getrennt). Scrollt zu #reviews. */}
            <a
              href="#reviews"
              id="heroScrollChevron"
              className="sm:hidden hero-scroll-chevron relative z-[3] mt-2 mx-auto grid place-items-center w-12 h-10 text-white/80 shrink-0"
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
        {/* Mehr erfahren — NUR Desktop. Mobile: Scroll-Chevron (siehe unten).
            08h A6: .hero-more-pill rezentriert die Pill >=1440 auf den Viewport
            (der 11.5vw-Copy-Start macht die Container-Paddings asymmetrisch). */}
        <div className="hero-more-pill hidden sm:flex justify-center pt-6 pb-3.5">
          <a
            href="#reviews"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border-[1.5px] border-white/[.32] bg-white/[.08] backdrop-blur-[8px] text-white text-[14px] font-semibold tracking-[.01em] transition hover:bg-white/[.16] hover:border-white/[.55]"
            style={{ animation: 'scrollPulse 2.2s ease-in-out infinite' }}
            aria-label="Mehr erfahren — nach unten scrollen"
          >
            Mehr erfahren
            <svg className="w-4 h-4 stroke-current fill-none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}
