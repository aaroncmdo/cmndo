// src/app/kfzgutachter-lp/WarumCardsClient.tsx
'use client'

import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { WARUM_CARDS, type WarumCard } from './warum-cards-data'
import { trackLpEvent } from './track'

// Reveal-Karten für die "Warum unabhängiger Gutachter"-Section.
// - Ganze Karte ist klickbar (kein "Mehr erfahren"-Button).
// - Hover: subtile Hebung + Border-Highlight + leichte Shadow.
// - Click: in-place Expand mit Bullets/Stats/CTA. Multi-Open erlaubt.
// - Keyboard: Enter/Space toggled, Esc kollabiert offene Karten.
// - CTA dispatch'd entweder Custom-Event 'claimondo:open-popover' oder
//   scrollt zu #lead-form. trackLpEvent loggt Expand + CTA-Click.

export function WarumCardsClient() {
  const [open, setOpen] = useState<Set<string>>(new Set())

  function toggle(slug: WarumCard['slug']) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
        trackLpEvent('select_promotion', {
          event_label: `warum-card-${slug}-expand`,
        })
      }
      return next
    })
  }

  function handleKey(
    event: ReactKeyboardEvent<HTMLDivElement>,
    slug: WarumCard['slug'],
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle(slug)
    }
    if (event.key === 'Escape') {
      setOpen(new Set())
    }
  }

  function handleCta(card: WarumCard, event: ReactMouseEvent) {
    event.stopPropagation()
    trackLpEvent('select_promotion', {
      event_label: `warum-card-${card.slug}-cta`,
    })
    if (card.cta.kind === 'scroll-to-form') {
      const target = document.getElementById('lead-form')
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }
    if (card.cta.kind === 'open-popover') {
      window.dispatchEvent(
        new CustomEvent('claimondo:open-popover', {
          detail: { step: card.cta.popoverStep ?? 1, source: card.slug },
        }),
      )
    }
  }

  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-3 sm:gap-6">
      {WARUM_CARDS.map((card) => {
        const isOpen = open.has(card.slug)
        const { Icon } = card
        return (
          <div
            key={card.slug}
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            aria-controls={`warum-card-${card.slug}-body`}
            onClick={() => toggle(card.slug)}
            onKeyDown={(e) => handleKey(e, card.slug)}
            className={`group cursor-pointer rounded-ios-lg border bg-white p-5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo focus-visible:ring-offset-2 sm:p-6 ${
              isOpen
                ? 'border-claimondo-ondo bg-gradient-to-b from-white to-claimondo-bg/30 shadow-claimondo-md'
                : 'border-claimondo-border hover:-translate-y-0.5 hover:border-claimondo-light-blue hover:shadow-claimondo-md'
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-claimondo-light-blue/12 text-claimondo-ondo">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 text-claimondo-ondo/60 transition-transform duration-300 ${
                  isOpen ? 'rotate-180' : 'group-hover:translate-y-0.5'
                }`}
              />
            </div>
            <h3 className="mt-4 text-base font-bold text-claimondo-navy">
              {card.titel}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">
              {card.text}
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo/80">
              {card.quelle}
            </p>

            <div
              id={`warum-card-${card.slug}-body`}
              className={`grid overflow-hidden transition-all duration-300 ease-out ${
                isOpen ? 'grid-rows-[1fr] opacity-100 mt-4 pt-4 border-t border-claimondo-border' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                {card.stats && card.stats.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider text-claimondo-navy">
                      Typische Kürzungen (Ø NRW-Netzwerk):
                    </p>
                    <ul className="mt-2 space-y-1">
                      {card.stats.map((s) => (
                        <li
                          key={s.label}
                          className="flex justify-between text-sm text-claimondo-navy"
                        >
                          <span>{s.label}</span>
                          <span className="font-bold text-claimondo-ondo">{s.amount}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {card.bullets.length > 0 && (
                  <ul className="space-y-2">
                    {card.bullets.map((b) => (
                      <li
                        key={b}
                        className="relative pl-4 text-sm leading-relaxed text-claimondo-shield before:absolute before:left-0 before:top-[0.55rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-claimondo-ondo"
                      >
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                {card.hinweis && (
                  <p className="mt-3 text-sm font-semibold text-claimondo-navy">
                    {card.hinweis}
                  </p>
                )}

                <button
                  type="button"
                  onClick={(e) => handleCta(card, e)}
                  data-tracking={`warum-card-${card.slug}-cta`}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-5 py-2.5 text-sm font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98]"
                >
                  {card.cta.label} →
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
