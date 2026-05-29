'use client'

import { useState } from 'react'
import type { City } from '@/lib/cluster'
import { CLUSTER } from '@/lib/cluster'
import { FAQ, fillTokens } from '@/lib/content'

// CLIENT-Komponente: rendert die gesamte FAQ-Sektion (#faq) + Accordion.
// - Sichtbare Q/A == fillTokens(item.q/.a, city, CLUSTER.region) — identisch zum
//   faqSchema (lib/schema.ts), damit JSON-LD und UI deckungsgleich bleiben.
// - Accordion: mehrere Items gleichzeitig offen (Set<number>). Klasse "open"
//   togglet — globals.css klappt dann .qa.open .a auf und rotiert .chev (+→×).
// - Farben/Radien NUR ueber Tokens (Mock rounded-sm → rounded-cta).
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
    <section id="faq" className="py-[clamp(52px,7vw,84px)] bg-paper">
      <div className="max-w-wrap mx-auto px-6">
        <div className="max-w-[700px] mx-auto text-center mb-[clamp(32px,4vw,46px)]">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
            <span className="eyebrow-dot" /> Häufige Fragen
          </span>
          <h2 className="font-display font-bold text-section-h2 mb-3.5">Häufig gestellte Fragen</h2>
          <p className="text-secondary text-[17px] leading-relaxed">
            Die wichtigsten Antworten rund um Ihr Kfz-Gutachten in {city.name}.
          </p>
        </div>
        <div className="max-w-[760px] mx-auto space-y-3">
          {FAQ.map((item, i) => (
            <div
              key={i}
              className={`qa border border-border rounded-cta bg-surface overflow-hidden${
                open.has(i) ? ' open' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={open.has(i)}
                aria-controls={`faq-panel-${i}`}
                className="w-full flex items-center justify-between px-5 py-4 text-left font-display font-bold text-[16px] text-ink cursor-pointer bg-transparent border-0"
              >
                {fillTokens(item.q, city, CLUSTER.region)}{' '}
                <span className="chev text-amber font-bold text-xl" aria-hidden="true">
                  +
                </span>
              </button>
              {/* inert + aria-hidden im geschlossenen Zustand: entfernt Antworttext
                  und Link aus Tab-Order + A11y-Tree (max-height:0 blendet nur visuell aus). */}
              <div
                id={`faq-panel-${i}`}
                role="region"
                className="a px-5 pb-4"
                aria-hidden={!open.has(i)}
                inert={!open.has(i) ? true : undefined}
              >
                <p className="text-secondary text-[15px] leading-relaxed">
                  {fillTokens(item.a, city, CLUSTER.region)}
                  {item.link ? (
                    <>
                      {' '}
                      <a
                        href={item.link.href}
                        target="_blank"
                        rel="noopener"
                        className="text-petrol font-semibold underline underline-offset-[3px] hover:text-amber"
                      >
                        {item.link.label}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
