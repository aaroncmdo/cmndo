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

// Zaehlt den Anspruch-Betrag von erstangebot -> anspruch hoch, sobald die Zahl
// in den Viewport scrollt (AAR-962, Aaron-Wunsch). easeOutCubic, ~1.3s, einmalig.
// Respektiert prefers-reduced-motion (zeigt direkt den Endwert).
function CountUpEur({ from, to }: { from: number; to: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(from)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(to)
      return
    }
    let started = false
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started) {
            started = true
            const dur = 1300
            const t0 = performance.now()
            const step = (now: number) => {
              const p = Math.min(1, (now - t0) / dur)
              const eased = 1 - Math.pow(1 - p, 3)
              setVal(Math.round(from + (to - from) * eased))
              if (p < 1) requestAnimationFrame(step)
            }
            requestAnimationFrame(step)
            io.disconnect()
          }
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [from, to])
  return <span ref={ref}>{eur(val)}</span>
}

export function CasesCarousel({ city }: { city: City }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [allOpen, setAllOpen] = useState(false)
  const [current, setCurrent] = useState(0)

  // Refs fuer die Auto-Advance-Interval-Closure (State waere dort stale).
  const currentRef = useRef(0)
  const pausedRef = useRef(false)
  const allOpenRef = useRef(false)

  // Klick auf EINE Karte enthuellt ALLE Breakdowns gleichzeitig (globaler
  // Reveal, AAR-962) und pausiert das Auto-Advance (Lesen).
  function toggleAll() {
    setAllOpen((prev) => {
      const next = !prev
      allOpenRef.current = next
      pausedRef.current = next
      if (next) trackEvent('cases_breakdown_open', { mode: 'all' })
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
      currentRef.current = bestIdx
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

  // Diskretes Auto-Advance: alle 3s eine Karte weiter (AAR-962). Pausiert bei
  // User-Interaktion (Hover/Touch/Wheel) + offenem Reveal, respektiert
  // prefers-reduced-motion, laeuft nur wenn sichtbar (IntersectionObserver).
  useEffect(() => {
    const track: HTMLDivElement | null = trackRef.current
    if (!track) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el: HTMLDivElement = track

    let visible = false
    let resumeTimer: ReturnType<typeof setTimeout> | undefined

    function advance() {
      if (pausedRef.current || allOpenRef.current || !visible) return
      const next = (currentRef.current + 1) % CASES.length
      const card = el.children[next] as HTMLElement | undefined
      if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' })
    }

    const interval = setInterval(advance, 3000)

    // Interaktion pausiert; 6s nach letzter Interaktion (und nur wenn Reveal zu) weiter.
    function pauseTemp() {
      pausedRef.current = true
      clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => {
        if (!allOpenRef.current) pausedRef.current = false
      }, 6000)
    }
    const onEnter = () => {
      pausedRef.current = true
    }
    const onLeave = () => {
      if (!allOpenRef.current) pausedRef.current = false
    }

    el.addEventListener('touchstart', pauseTemp, { passive: true })
    el.addEventListener('wheel', pauseTemp, { passive: true })
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          visible = e.isIntersecting
        })
      },
      { threshold: 0.25 },
    )
    io.observe(el)

    return () => {
      clearInterval(interval)
      clearTimeout(resumeTimer)
      io.disconnect()
      el.removeEventListener('touchstart', pauseTemp)
      el.removeEventListener('wheel', pauseTemp)
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
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
          const isOpen = allOpen
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
                      <CountUpEur from={c.erstangebot} to={c.anspruch} />
                    </span>
                  </div>
                </div>
                {/* Gold-Toggle-Badge — klickbar zum Aufklappen des Breakdowns */}
                <button
                  type="button"
                  onClick={toggleAll}
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
