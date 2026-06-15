'use client'

import { Fragment, useState } from 'react'
import type { City } from '@/lib/cluster'
import { CLUSTER } from '@/lib/cluster'
import { FAQ, fillTokens } from '@/lib/content'
import { LOKALDATEN } from '@/lib/lokaldaten'

// CLIENT-Komponente: rendert die FAQ-Sektion (#faq) nach v3-praxis-v2-Spec:
// 5 kuratierte FAQ (Akkordeon) mit Spezial-Elementen (Q1 0€-Badge, Q4 Trust-Bullets,
// Q5 Werkstatt-Andock) + 2 Lokal-Mini-Cards (Stadtteile/Wochenende) + Quellen-Anker
// + Ratgeber-Bruecke (Magazin-Divider + 4 Pills + Magazin-CTA).
// - Sichtbare Antwort == faqAnswerText() (lib/content) -> JSON-LD (lib/schema) bleibt synchron.
// - .faq-* Klassen aus globals.css. Tracking: Pills via data-action delegiert (SiteScripts).
// - Cluster-Daten: CLUSTER.achsen (Q2), CLUSTER.stadtteile (Lokal-Card), CLUSTER.quellenAnker.

// Wandelt **fett**-Marker (aus content.ts-Intros/Workshop) in <strong> fuer Inline-Hervorhebung.
function renderRich(text: string) {
  return text
    .split('**')
    .map((seg, i) => (i % 2 === 1 ? <strong key={i} className="text-ink font-semibold">{seg}</strong> : <Fragment key={i}>{seg}</Fragment>))
}

export function FaqAccordion({ city }: { city: City }) {
  const [open, setOpen] = useState<Set<number>>(new Set())

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <section id="faq" className="py-9 sm:py-[clamp(52px,7vw,84px)] bg-paper">
      <div className="max-w-wrap mx-auto px-6">
        <div className="max-w-[700px] mx-auto text-center mb-5 sm:mb-[clamp(32px,4vw,46px)]">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3 sm:mb-3.5">
            <span className="eyebrow-dot" /> Häufige Fragen · Klartext
          </span>
          <h2 className="font-display font-bold text-[clamp(24px,6.4vw,28px)] sm:text-section-h2 mb-2 sm:mb-3.5">
            Sprechen wir <span className="italic text-petrol">Klartext.</span>
          </h2>
          <p className="text-secondary text-[13.5px] sm:text-[17px] leading-relaxed">
            Die fünf häufigsten Antworten — kurz, lokal in {city.name}.
          </p>
        </div>

        {/* Akkordeon — 5 kuratierte FAQ */}
        <div className="max-w-[760px] mx-auto space-y-2.5 sm:space-y-3">
          {/* 08l A4 · 2 lokale Fragen je Stadt an Position 1+2 (Daten-Layer,
              Orts-Label-Chip); Daten-Guard: ohne faqLokal rendern nur die
              generischen. FAQ-Schema (lib/schema) umfasst lokal + generisch. */}
          {(LOKALDATEN[city.slug]?.faqLokal ?? []).map((item, li) => {
            const i = 1000 + li
            return (
              <div
                key={`lokal-${li}`}
                className={`qa border border-border rounded-cta bg-surface overflow-hidden${open.has(i) ? ' open' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={open.has(i)}
                  aria-controls={`faq-panel-lokal-${li}`}
                  className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sm:py-4 text-left font-display font-bold text-[15px] sm:text-[16px] text-ink cursor-pointer bg-transparent border-0"
                >
                  <span className="flex-1">{item.q}</span>
                  <span className="flex items-center gap-2.5 flex-none">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-mono font-bold tracking-[.06em] uppercase bg-[color-mix(in_srgb,var(--amber)_14%,white)] text-[var(--amber-aa)] border border-[color-mix(in_srgb,var(--amber)_32%,white)]">
                      {city.name}
                    </span>
                    <span className="chev text-amber font-bold text-xl" aria-hidden="true">
                      +
                    </span>
                  </span>
                </button>
                <div
                  id={`faq-panel-lokal-${li}`}
                  role="region"
                  className="a px-5 pb-4"
                  aria-hidden={!open.has(i)}
                  inert={!open.has(i) ? true : undefined}
                >
                  <p className="text-secondary text-[15px] leading-relaxed">{item.a}</p>
                </div>
              </div>
            )
          })}
          {FAQ.map((item, i) => (
            <div
              key={i}
              className={`qa border border-border rounded-cta bg-surface overflow-hidden${open.has(i) ? ' open' : ''}`}
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={open.has(i)}
                aria-controls={`faq-panel-${i}`}
                className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sm:py-4 text-left font-display font-bold text-[15px] sm:text-[16px] text-ink cursor-pointer bg-transparent border-0"
              >
                <span className="flex-1">{fillTokens(item.q, city, CLUSTER.region)}</span>
                <span className="flex items-center gap-2.5 flex-none">
                  {item.badge ? (
                    <span className="faq-cost-badge" data-faq-cost-anchor>
                      {item.badge}
                    </span>
                  ) : null}
                  <span className="chev text-amber font-bold text-xl" aria-hidden="true">
                    +
                  </span>
                </span>
              </button>
              <div
                id={`faq-panel-${i}`}
                role="region"
                className="a px-5 pb-4"
                aria-hidden={!open.has(i)}
                inert={!open.has(i) ? true : undefined}
              >
                <p className="text-secondary text-[15px] leading-relaxed">
                  {renderRich(fillTokens(item.intro, city, CLUSTER.region))}
                  {item.axes ? <> {LOKALDATEN[city.slug]?.achsen ?? CLUSTER.achsen.join(' · ')}.</> : null}
                </p>
                {item.bullets ? (
                  <ul className="faq-claimondo-bullets mt-3">
                    {item.bullets.map((b) => (
                      <li key={b.strong}>
                        <span className="faq-claimondo-bullet-icon" aria-hidden="true">
                          ✓
                        </span>
                        <span>
                          <strong className="text-ink font-semibold">{b.strong}</strong> · {b.rest}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {item.schluss ? <p className="text-secondary text-[14px] italic mt-3">{item.schluss}</p> : null}
                {item.workshop ? (
                  <div className="faq-workshop-cta mt-3">
                    <span className="faq-workshop-cta-icon" aria-hidden="true">
                      <svg className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                    </span>
                    <p className="faq-workshop-cta-text">{renderRich(fillTokens(item.workshop, city, CLUSTER.region))}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Lokal-Mini-Cards (cluster-spezifisch) */}
        <div className="max-w-[760px] mx-auto mt-[clamp(32px,4vw,46px)]">
          <span className="flex items-center justify-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-4">
            <span className="eyebrow-dot" /> Lokal in {city.name}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="faq-local-card">
              <span className="faq-local-icon" aria-hidden="true">
                <svg className="w-5 h-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <div className="faq-local-body">
                <p className="faq-local-title">In Ihrem Stadtteil?</p>
                <p className="faq-local-sub" id="faqStadtteileList">
                  {CLUSTER.stadtteile.join(' · ')}
                </p>
              </div>
            </div>
            <div className="faq-local-card">
              <span className="faq-local-icon" aria-hidden="true">
                <svg className="w-5 h-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
              </span>
              <div className="faq-local-body">
                <p className="faq-local-title">Termin am Wochenende?</p>
                <p className="faq-local-sub">7 Tage 08–20 Uhr · in dringenden Fällen auch außerhalb · in 60 Min vor Ort</p>
              </div>
            </div>
          </div>
          <p id="faqSourceAnchor" className="text-center text-muted italic text-[12px] mt-4">
            Quelle: {CLUSTER.quellenAnker}
          </p>
        </div>

        {/* 08n N8: Ratgeber-Bruecke (Divider + 4 Pills + Magazin-CTA) in die
            RatgeberSection verschoben — dort ist der inhaltliche Kontext. */}
      </div>
    </section>
  )
}
