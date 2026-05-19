// src/app/kfzgutachter-lp/WarumCardsClient.tsx
'use client'

import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { X } from 'lucide-react'
import { WARUM_CARDS, type WarumCard } from './warum-cards-data'
import { trackLpEvent } from './track'

// Card-Tabs-Pattern für die "Warum unabhängiger Gutachter"-Section:
//   - 3 kompakte Karten in Row, eine aktiv (Tab-Look mit Connector-Pfeil
//     nach unten).
//   - Drawer darunter spannt die volle Breite + zeigt den Detail-Inhalt
//     der aktiven Karte. Tab-Wechsel cross-fadet den Inhalt.
//   - Klick auf aktive Karte (oder X im Drawer) schließt den Drawer.
//   - Mobile (< sm): Karten stapeln vertikal, Drawer kommt unter der
//     letzten Karte.
//   - a11y: role=tablist / role=tab / aria-selected / aria-controls. ESC
//     schließt den Drawer.
//
// Aaron 2026-05-19: vorheriger "Multi-Open Reveal-in-place"-Modus hatte
// das CSS-Grid-Stretch-Problem (andere Karten zogen sich beim Open mit
// hoch). Card-Tabs-Pattern löst das sauber, weil die Karten selbst
// immer kompakt bleiben.

type Slug = WarumCard['slug']

export function WarumCardsClient() {
  const [active, setActive] = useState<Slug | null>(null)

  function activate(slug: Slug) {
    setActive((prev) => {
      const next = prev === slug ? null : slug
      if (next === slug) {
        trackLpEvent('select_promotion', {
          event_label: `warum-card-${slug}-activate`,
        })
      }
      return next
    })
  }

  function handleKey(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    slug: Slug,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(slug)
    }
    if (event.key === 'Escape') {
      setActive(null)
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

  const activeCard =
    active !== null ? WARUM_CARDS.find((c) => c.slug === active) ?? null : null

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Warum unabhängiger Gutachter"
        className="grid gap-4 sm:grid-cols-3"
      >
        {WARUM_CARDS.map((card) => {
          const isActive = active === card.slug
          const { Icon } = card
          return (
            <button
              key={card.slug}
              type="button"
              role="tab"
              id={`warum-tab-${card.slug}`}
              aria-selected={isActive}
              aria-controls="warum-drawer"
              tabIndex={isActive ? 0 : -1}
              onClick={() => activate(card.slug)}
              onKeyDown={(e) => handleKey(e, card.slug)}
              className={`relative rounded-ios-md border bg-white p-4 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo focus-visible:ring-offset-2 sm:p-5 ${
                isActive
                  ? 'border-claimondo-ondo bg-gradient-to-b from-white to-claimondo-bg/40 shadow-claimondo-md'
                  : 'border-claimondo-border hover:-translate-y-0.5 hover:border-claimondo-light-blue hover:shadow-claimondo-md'
              }`}
            >
              {/* Connector-Pfeil zum Drawer — nur Desktop, nur wenn aktiv */}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-1/2 -bottom-[9px] hidden h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-claimondo-ondo bg-white sm:block"
                />
              )}
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  isActive
                    ? 'bg-claimondo-navy text-white'
                    : 'bg-claimondo-light-blue/12 text-claimondo-ondo'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="mt-3 text-[15px] font-bold leading-tight text-claimondo-navy">
                {card.titel}
              </h3>
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-claimondo-shield">
                {card.text}
              </p>
              <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-wider text-claimondo-ondo/80">
                {card.quelle}
              </p>
            </button>
          )
        })}
      </div>

      {/* Drawer mit Detail-Inhalt — volle Breite unter den 3 Karten */}
      {activeCard && (
        <div
          id="warum-drawer"
          role="tabpanel"
          aria-labelledby={`warum-tab-${activeCard.slug}`}
          tabIndex={-1}
          className="relative mt-5 rounded-ios-lg border border-claimondo-ondo bg-white px-6 py-7 shadow-[0_8px_28px_rgba(13,27,62,0.06)] sm:mt-6 sm:px-8"
        >
          <button
            type="button"
            onClick={() => setActive(null)}
            aria-label="Schließen"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-claimondo-shield/60 transition-colors hover:bg-claimondo-bg hover:text-claimondo-navy"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          <h3 className="text-lg font-extrabold text-claimondo-navy sm:text-xl">
            {activeCard.titel}
          </h3>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
            {activeCard.quelle}
          </p>

          <div className="mt-4 max-w-3xl text-sm leading-relaxed text-claimondo-shield">
            {activeCard.stats && activeCard.stats.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wider text-claimondo-navy">
                  Typische Kürzungen (Ø NRW-Netzwerk):
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {activeCard.stats.map((s) => (
                    <div
                      key={s.label}
                      className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/60 px-4 py-3"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-shield/80">
                        {s.label}
                      </p>
                      <p className="mt-0.5 text-xl font-extrabold text-claimondo-ondo">
                        {s.amount}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeCard.bullets.length > 0 && (
              <ul className="mt-3 space-y-2">
                {activeCard.bullets.map((b) => (
                  <li
                    key={b}
                    className="relative pl-4 text-sm leading-relaxed before:absolute before:left-0 before:top-[0.55rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-claimondo-ondo"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {activeCard.hinweis && (
              <p className="mt-4 text-sm font-semibold text-claimondo-navy">
                {activeCard.hinweis}
              </p>
            )}

            <button
              type="button"
              onClick={(e) => handleCta(activeCard, e)}
              data-tracking={`warum-card-${activeCard.slug}-cta`}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98]"
            >
              {activeCard.cta.label} →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
