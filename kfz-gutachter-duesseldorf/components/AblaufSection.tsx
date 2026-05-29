import type { ReactNode } from 'react'
import { CLUSTER } from '@/lib/cluster'
import { ABLAUF, type AblaufStep } from '@/lib/content'
import { renderRich } from '@/lib/text'
import { NutzungsausfallTooltip } from './NutzungsausfallTooltip'

// ABLAUF (5 Schritte) — Server-Component. Schritte aus lib/content.ts (ABLAUF),
// Icons per step.icon-Key gemappt (SVGs 1:1 aus Mock Z486/498/510/522/540).
// Schritt 4 (icon 'car') traegt zusaetzlich den Nutzungsausfall-Tooltip (CLIENT).
// Telefon-CTA: <a href={`tel:${CLUSTER.phone.tel}`} data-cta="ablauf_call"> —
// Klick-Tracking laeuft delegiert ueber SiteScripts (kein onClick noetig).

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
        <div className="max-w-[720px] mx-auto text-center mb-[clamp(32px,4vw,46px)]">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
            <span className="eyebrow-dot" /> In 5 Schritten
          </span>
          <h2 className="font-display font-bold text-section-h2 mb-3.5">So läuft Ihr Kfz-Gutachten ab</h2>
          <p className="text-secondary text-[16.5px] leading-relaxed">
            Sie melden den Schaden — wir und die{' '}
            <strong className="text-petrol font-semibold">Claimondo Unfall-Assistance</strong> übernehmen den Rest.{' '}
            <strong className="text-petrol font-semibold">Bei unverschuldetem Unfall für Sie kostenlos.</strong>
          </p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-5 gap-x-3.5 gap-y-8 md:gap-y-3.5 mt-2.5">
          {/* Verbindungslinie (nur Desktop) */}
          <div className="hidden md:block absolute top-8 left-[11%] right-[11%] h-0.5 bg-gradient-to-r from-green to-green/30 z-0" />

          {ABLAUF.map((step, i) => (
            <div key={step.title} className="relative z-[1] text-center px-1 flex flex-col items-center">
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
                {step.titleAccent && (
                  <span className="whitespace-nowrap text-amber">
                    {' '}
                    {step.titleAccent}
                  </span>
                )}
              </h3>
              <p className="text-[13px] md:text-[13px] text-secondary leading-snug min-h-[60px]">
                {renderRich(step.text)}
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
            Jeden Schritt live verfolgen — in Ihrem persönlichen <strong className="text-petrol">Claimondo-Portal</strong>.
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

        <p className="text-center mt-8 text-muted text-[13px] font-medium">
          Powered by <strong className="text-secondary font-bold">Claimondo</strong> — Plattform für komplette Unfall-Schadenabwicklung.{' '}
          <a
            href="https://autounfall.io/gutachter/"
            target="_blank"
            rel="noopener"
            className="text-petrol font-bold underline underline-offset-[3px] ml-1"
          >
            Kfz-Gutachter-Ratgeber →
          </a>
        </p>
        <div className="flex items-center justify-center gap-3.5 mt-4 flex-wrap">
          <span className="text-muted text-[13px] font-semibold">Partnerkanzlei für Verkehrsrecht:</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/brand/kanzlei-lexdrive-logo.png"
            alt="LexDrive — Partnerkanzlei für Verkehrsrecht"
            className="h-[30px] w-auto"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  )
}
