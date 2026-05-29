'use client'

import { useEffect, useRef, useState } from 'react'
import type { City } from '@/lib/cluster'
import { CASES } from '@/lib/content'
import { trackEvent } from '@/lib/tracking'

// CLIENT-Sub-Komponente der ReviewsSection: "Aus der Praxis"-Karussell.
// Rendert die 5 Praxis-Cases (aus content.ts CASES) als horizontale Snap-Karten
// mit Erstangebot→Anspruch, aufklappbarem Positions-Breakdown (Gold-Toggle) und
// kontinuierlichem Auto-Scroll (rAF). Idiom + Klassen 1:1 aus Mock (buildCard-JS).
// data-placeholder="true" auf jedem Case-Foto (KI-Platzhalter, UWG).

// €-Formatter — wie Mock: Tausenderpunkte, keine Nachkommastellen.
function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function CasesCarousel({ city }: { city: City }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [openIdx, setOpenIdx] = useState<Set<number>>(new Set())
  const [current, setCurrent] = useState(0)

  function toggleBreakdown(i: number) {
    setOpenIdx((prev) => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
      } else {
        next.add(i)
        trackEvent('cases_breakdown_open', { card_idx: i })
      }
      return next
    })
  }

  function scrollToCard(i: number) {
    const track = trackRef.current
    if (!track) return
    const card = track.children[i] as HTMLElement | undefined
    if (!card) return
    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' })
  }

  // Dot-Sync an Scroll-Position.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let scrollTimer: ReturnType<typeof setTimeout>
    function updateDots() {
      const tr = trackRef.current
      if (!tr) return
      let minDiff = Infinity
      let bestIdx = 0
      Array.prototype.forEach.call(tr.children, (card: HTMLElement, i: number) => {
        const diff = Math.abs(card.offsetLeft - tr.scrollLeft - tr.offsetLeft)
        if (diff < minDiff) {
          minDiff = diff
          bestIdx = i
        }
      })
      setCurrent(bestIdx)
    }
    function onScroll() {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(updateDots, 80)
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(scrollTimer)
      track.removeEventListener('scroll', onScroll)
    }
  }, [])

  // Kontinuierliches Auto-Scroll (rAF) — pausiert bei Hover/Touch/offenem
  // Breakdown, respektiert prefers-reduced-motion, läuft nur wenn sichtbar.
  useEffect(() => {
    const track: HTMLDivElement | null = trackRef.current
    if (!track) return
    if (typeof window === 'undefined') return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return
    // Non-null-Alias für die rAF-Closures (TS narrowt sonst zurück auf null).
    const el: HTMLDivElement = track

    const SCROLL_SPEED = 0.35 // px/Frame (~21px/s)
    let rafId: number | null = null
    let paused = false
    let visible = false
    let resumeTimer: ReturnType<typeof setTimeout> | undefined
    let endTimer: ReturnType<typeof setTimeout> | undefined
    let loopTimer: ReturnType<typeof setTimeout> | undefined

    function frame() {
      if (!paused && visible) {
        const maxScroll = el.scrollWidth - el.clientWidth
        if (maxScroll > 0) {
          if (el.scrollLeft >= maxScroll - 1) {
            paused = true
            endTimer = setTimeout(() => {
              el.scrollTo({ left: 0, behavior: 'smooth' })
              loopTimer = setTimeout(() => {
                paused = false
              }, 1200)
            }, 1500)
          } else {
            el.scrollLeft += SCROLL_SPEED
          }
        }
      }
      rafId = requestAnimationFrame(frame)
    }

    function pause(durationMs = 5000) {
      paused = true
      clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => {
        paused = false
      }, durationMs)
    }

    const onTouch = () => pause(5000)
    const onMouseDown = () => pause(5000)
    const onWheel = () => pause(5000)
    const onMouseEnter = () => {
      paused = true
    }
    const onMouseLeave = () => {
      paused = false
    }

    el.addEventListener('touchstart', onTouch, { passive: true })
    el.addEventListener('mousedown', onMouseDown, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('mouseenter', onMouseEnter)
    el.addEventListener('mouseleave', onMouseLeave)

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          visible = e.isIntersecting
        })
      },
      { threshold: 0.25 },
    )
    io.observe(el)

    rafId = requestAnimationFrame(frame)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      clearTimeout(resumeTimer)
      clearTimeout(endTimer)
      clearTimeout(loopTimer)
      io.disconnect()
      el.removeEventListener('touchstart', onTouch)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mouseenter', onMouseEnter)
      el.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  useEffect(() => {
    trackEvent('cases_rendered', { card_count: CASES.length })
  }, [])

  return (
    <div className="relative">
      <div
        ref={trackRef}
        id="casesTrack"
        className="cases-track flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-6 px-6 sm:mx-0 sm:px-0"
      >
        {CASES.map((c, idx) => {
          const diff = c.anspruch - c.erstangebot
          const isOpen = openIdx.has(idx)
          return (
            <div
              key={c.img}
              data-idx={idx}
              role="group"
              aria-roledescription="Karte"
              aria-label={`${idx + 1} von ${CASES.length}: ${c.label}`}
              className="snap-start flex-none w-[88%] sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)] rounded-2xl overflow-hidden border border-border bg-surface shadow-sm hover:-translate-y-[3px] hover:shadow-md transition flex flex-col"
            >
              {/* Foto 16:9 mit "Realfall"-Badge */}
              <div className="aspect-[16/9] relative bg-gradient-to-br from-[#cdd9dd] to-[#aebfc6] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/assets/img/shared/cases/${c.img}`}
                  alt={c.alt}
                  data-placeholder="true"
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-petrol/85 backdrop-blur-sm text-white text-[10.5px] font-mono font-bold tracking-[.06em] uppercase px-2.5 py-1 rounded-full z-[1]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber" /> Realfall
                </span>
              </div>
              {/* Body */}
              <div className="p-4 flex flex-col gap-3 flex-1">
                <h3 className="font-display font-bold text-[15px] text-petrol leading-snug min-h-[44px] flex items-start">
                  {c.label}
                </h3>
                <div className="flex flex-col gap-2 min-h-[88px]">
                  <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-border">
                    <span className="text-[11px] text-muted leading-tight">
                      Schnell-Angebot
                      <br />
                      der Versicherung
                    </span>
                    <span className="font-mono text-[14px] text-muted line-through tabular-nums">
                      {eur(c.erstangebot)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] text-secondary leading-tight">
                      Tatsächlicher Anspruch
                      <br />
                      <span className="text-[9.5px] text-muted">mit unabh. Gutachten + Anwalt</span>
                    </span>
                    <span className="font-mono font-bold text-[20px] text-petrol tabular-nums leading-none">
                      {eur(c.anspruch)}
                    </span>
                  </div>
                </div>
                {/* Gold-Toggle-Badge — klickbar zum Aufklappen des Breakdowns */}
                <button
                  type="button"
                  onClick={() => toggleBreakdown(idx)}
                  className="cases-toggle rounded-xl px-4 py-2.5 text-center w-full cursor-pointer transition hover:brightness-110 active:scale-[.98]"
                  aria-expanded={isOpen}
                  aria-controls={`breakdown-${idx}`}
                  style={{
                    background:
                      'linear-gradient(135deg, var(--amber) 0%, var(--amber-700) 100%)',
                    boxShadow: '0 4px 14px color-mix(in srgb, var(--amber) 28%, transparent)',
                  }}
                >
                  <div className="flex items-center justify-center gap-2 font-display font-bold text-white text-[16px] leading-tight">
                    <span className="tabular-nums">+ {eur(diff)} mehr für Sie</span>
                    <svg
                      className="cases-toggle-icon w-4 h-4 stroke-current fill-none transition-transform duration-300"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>
                {/* Aufklapp-Container für Positions-Breakdown */}
                <div
                  id={`breakdown-${idx}`}
                  className="cases-breakdown overflow-hidden transition-[max-height] duration-400 ease-out"
                  style={{ maxHeight: isOpen ? '600px' : '0' }}
                >
                  <div className="pt-2.5 pb-1">
                    <div className="text-[10.5px] font-mono font-bold tracking-[.06em] uppercase text-muted mb-2">
                      Positions-Aufschlüsselung
                    </div>
                    <ul className="list-none p-0 m-0">
                      {c.breakdown.map((p) => (
                        <li
                          key={p.label}
                          className="flex items-start justify-between gap-3 py-2 border-b border-border/60"
                        >
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <svg
                              className="w-3.5 h-3.5 stroke-green fill-none flex-none mt-0.5"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <div className="min-w-0 flex-1">
                              <span className="text-[12.5px] text-secondary leading-tight font-medium block">
                                {p.label}
                              </span>
                              {p.beleg ? (
                                <span className="text-[10px] text-muted/75 leading-tight block mt-0.5">
                                  {p.beleg}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-[13.5px] text-petrol tabular-nums flex-none">
                            + {eur(p.betrag)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2.5 pt-2 border-t-2 border-amber/30 flex items-baseline justify-between gap-3">
                      <span className="text-[11.5px] text-petrol font-semibold leading-tight">
                        = mit unabh. Gutachten + Anwalt durchgesetzt
                      </span>
                      <span className="font-mono font-bold text-[16px] text-amber tabular-nums">
                        + {eur(diff)}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Mikro-Trust — am Card-Boden */}
                <div className="flex items-center gap-1.5 pt-0.5 mt-auto">
                  <svg
                    className="w-3 h-3 stroke-green fill-none flex-none"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-[10.5px] text-muted font-medium">
                    anonymisierter Realfall · Beträge in Euro
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div
        id="casesDots"
        className="flex justify-center gap-2 mt-4"
        role="group"
        aria-label="Karten-Navigation"
      >
        {CASES.map((c, i) => (
          <button
            key={c.img}
            type="button"
            onClick={() => scrollToCard(i)}
            aria-label={`Zu Karte ${i + 1}`}
            aria-current={i === current ? 'true' : undefined}
            className={
              i === current
                ? 'w-6 h-2 rounded-full bg-amber transition-all'
                : 'w-2 h-2 rounded-full bg-border hover:bg-secondary/40 transition-all'
            }
          />
        ))}
      </div>
    </div>
  )
}
