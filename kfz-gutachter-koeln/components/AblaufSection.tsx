import type { ReactNode } from 'react'
import { CLUSTER } from '@/lib/cluster'
import { ABLAUF, ABLAUF_TIMELINE, type AblaufStep } from '@/lib/content'
import { renderRich, ClaimondoLink } from '@/lib/text'
import { NutzungsausfallTooltip } from './NutzungsausfallTooltip'

// ABLAUF — Server-Component.
// MOBILE (sm:hidden, #ablaufMobile, v5.2): Tage-Timeline "In ~32 Tagen zum Geld"
// (ABLAUF_TIMELINE), IO-Staggered-Reveal + CTA-Welle + Nutzungsausfall-Tooltip
// (Vanilla in SiteScripts.tsx, analog Burger/Chevron).
// DESKTOP/TABLET (hidden sm:block): Original 5-Schritte-Grid (ABLAUF, Icons per
// step.icon). Schritt 4 (icon 'car') traegt den React-NutzungsausfallTooltip.
// Telefon-CTA: data-cta -> Klick-Tracking delegiert ueber SiteScripts.

const ICONS: Record<AblaufStep['icon'], ReactNode> = {
  phone: (
    <svg className="w-[27px] h-[27px] stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  calendar: (
    <svg className="w-[27px] h-[27px] stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  ),
  scale: (
    <svg className="w-[27px] h-[27px] stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  ),
  car: (
    <svg className="w-[27px] h-[27px] stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  ),
  card: (
    <svg className="w-[27px] h-[27px] stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  ),
}

export function AblaufSection() {
  return (
    <section id="ablauf" className="py-[clamp(52px,7vw,84px)] bg-paper">
      <div className="max-w-wrap mx-auto px-6">
        {/* ===== MOBILE-ONLY · Tage-Timeline ===== */}
        <div className="sm:hidden max-w-[440px] mx-auto" id="ablaufMobile">
          <div className="text-center mb-5">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3">
              <span className="eyebrow-dot" /> Vom Anruf zur Auszahlung
            </span>
            <h2 className="ablauf-mobile-h2">
              In <span className="ablauf-mobile-h2-num">~32{' '}Tagen</span>
              <br />
              zum Geld auf dem Konto
            </h2>
            <p className="ablauf-mobile-h2-sub">Ø Regulierungszeit · branchenüblich nach BGB §286 / VVG §14</p>
          </div>
          <p className="ablauf-mobile-intro">So führt der Weg dahin — Schritt für Schritt:</p>

          <ol className="ablauf-tl" id="ablaufTL">
            {ABLAUF_TIMELINE.map((s) => (
              <li key={s.step} className={`ablauf-tl-item${s.itemEnd ? ' ablauf-tl-item--end' : ''}`}>
                <span className={`ablauf-tl-day${s.dayMod ? ` ablauf-tl-day--${s.dayMod}` : ''}`}>{s.day}</span>
                <span className={`ablauf-tl-dot${s.dotEnd ? ' ablauf-tl-dot--end' : ''}`} data-step={s.step}>
                  {s.dotEnd ? '€' : ''}
                </span>
                <div className="ablauf-tl-body">
                  <h3 className={`ablauf-tl-title${s.titleEnd ? ' ablauf-tl-title--end' : ''}`}>
                    {s.title}
                    {s.pill ? <span className="ablauf-tl-pill">{s.pill}</span> : null}
                    {s.tooltip ? (
                      <button
                        type="button"
                        id="nutzungsausfallTooltipMobile"
                        className="ablauf-tl-info"
                        aria-label="Mehr Infos zum Nutzungsausfall"
                      >
                        ⓘ
                      </button>
                    ) : null}
                  </h3>
                  <p className="ablauf-tl-sub">{renderRich(s.sub, s.subStrong)}</p>
                  {s.tooltip ? (
                    <div id="nutzungsausfallInfoMobile" className="ablauf-tl-tooltip hidden">
                      {renderRich(s.tooltip, 'text-petrol')}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className="ablauf-portal-hint">
            <svg className="w-4 h-4 stroke-petrol fill-none flex-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p>
              Jeden Schritt live verfolgen — in Ihrem persönlichen <strong><ClaimondoLink>Claimondo-Portal</ClaimondoLink></strong>.
            </p>
          </div>

          <div className="text-center mt-6 ablauf-mobile-cta-wrap" id="ablaufMobileCTAWrap">
            <a
              className="ablauf-mobile-cta inline-flex w-full items-center justify-center gap-2 bg-amber text-white font-display font-bold text-[15.5px] px-6 py-[14px] rounded-cta"
              href={`tel:${CLUSTER.phone.tel}`}
              data-cta="ablauf_call_mobile"
            >
              ☎ Jetzt Tag 0 starten
            </a>
            <p className="mt-2.5 text-muted text-[11.5px]">
              Bei unverschuldetem Unfall <strong className="text-petrol">0 €</strong> für Sie · kostenlos &amp;
              unverbindlich
            </p>
          </div>
        </div>

        {/* ===== DESKTOP / TABLET — Original 5-Schritte-Grid ===== */}
        <div className="hidden sm:block">
          <div className="max-w-[720px] mx-auto text-center mb-[clamp(32px,4vw,46px)]">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
              <span className="eyebrow-dot" /> In 5 Schritten
            </span>
            <h2 className="font-display font-bold text-section-h2 mb-3.5">So läuft Ihr Kfz-Gutachten ab</h2>
            <p className="text-secondary text-[16.5px] leading-relaxed">
              Sie melden den Schaden — wir und die{' '}
              <strong className="text-petrol font-semibold"><ClaimondoLink>Claimondo Unfall-Assistance</ClaimondoLink></strong> übernehmen den Rest.{' '}
              <strong className="text-petrol font-semibold">Bei unverschuldetem Unfall für Sie kostenlos.</strong>
            </p>
          </div>

          {/* 08o O4: Animations-Hooks — SiteScripts setzt .ablauf-anim-ready
              (nur >=768 + ohne reduced-motion) und per IO einmalig
              .ablauf-anim-go; CSS im globals-08o-Block. No-JS = statisch. */}
          <div id="ablaufStepsGrid" className="relative grid grid-cols-1 md:grid-cols-5 gap-x-3.5 gap-y-8 md:gap-y-3.5 mt-2.5">
            {/* Verbindungslinie (nur Desktop) */}
            <div className="ablauf-line hidden md:block absolute top-8 left-[11%] right-[11%] h-0.5 bg-gradient-to-r from-green to-green/30 z-0" />

            {ABLAUF.map((step, i) => (
              <div key={step.title} data-ablauf-step={i} className="relative z-[1] text-center px-1 flex flex-col items-center">
                <div className="relative w-16 h-16 mb-3.5">
                  <div className="w-16 h-16 rounded-full bg-surface border-2 border-green-soft text-green grid place-items-center shadow-sm">
                    {ICONS[step.icon]}
                  </div>
                  <span className="absolute -top-0.5 -right-1 md:left-[calc(50%+14px)] md:-right-auto w-5 h-5 rounded-full bg-white text-petrol border-[1.5px] border-green font-mono text-[11px] font-bold grid place-items-center z-[2] shadow-[0_1px_4px_rgba(14,52,70,.18)]">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-display font-bold text-[15.5px] md:text-base mb-1.5 text-petrol leading-tight min-h-[44px] md:min-h-[40px] flex items-start justify-center">
                  {step.title}
                  {/* 08p P3b: Accent als eigene Zeile — "Anwalt —" / "0 € inklusive";
                      der fruehere nowrap-Inline lief @768 in die Nachbarspalte. */}
                  {step.titleAccent && <span className="block text-amber">{step.titleAccent}</span>}
                </h3>
                <p className="hidden lg:block text-[13px] text-secondary leading-snug min-h-[60px]">
                  {/* 08p P3c: Bold neutral in Textfarbe — Akzentfarbe bleibt
                      Nummern/Icons/Linie vorbehalten (Entscheid Aaron). */}
                  {renderRich(step.text, 'text-ink')}
                  {step.icon === 'car' && step.info && <NutzungsausfallTooltip info={step.info} />}
                </p>
              </div>
            ))}
          </div>

          {/* Portal-Zeile als durchgehendes Vertrauenssignal */}
          <div className="flex items-center justify-center gap-2 mt-8 text-secondary text-[13.5px] font-semibold">
            <svg className="w-4 h-4 stroke-current fill-none flex-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              Jeden Schritt live verfolgen — in Ihrem persönlichen <strong className="text-petrol"><ClaimondoLink>Claimondo-Portal</ClaimondoLink></strong>.
            </span>
          </div>

          {/* CTA + Mikro-Text */}
          <div className="text-center mt-9">
            <a
              className="inline-flex items-center gap-2 bg-amber text-white font-display font-bold text-[17px] px-8 py-[18px] rounded-cta shadow-[0_6px_18px_color-mix(in_srgb,var(--amber)_32%,transparent)] hover:bg-amber-700 hover:-translate-y-px transition"
              href={`tel:${CLUSTER.phone.tel}`}
              data-cta="ablauf_call"
            >
              ☎ Jetzt anrufen · Schritt 1 starten
            </a>
            <p className="mt-3 text-muted text-[12.5px]">Kostenlos & unverbindlich bei unverschuldetem Unfall.</p>
          </div>

          {/* 08k A5 (Aaron-Entscheid): Powered-by-Block + LexDrive-Logo-Zeile
              entfernt (zu viel unter dem CTA). SEO-Link-Verbleib: claimondo.de
              bleibt via ClaimondoLink in Hero/Netzwerk/UeberUns/Footer;
              der Ratgeber-Link war NUR hier -> in den Footer aufgenommen
              (Verlinkungs-Strategie 27c). LexDrive bleibt in der 08k-Team-Kette
              + Vergleichstabelle praesent. */}
        </div>
      </div>
    </section>
  )
}
