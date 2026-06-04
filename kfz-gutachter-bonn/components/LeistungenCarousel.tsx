'use client'

import { useEffect, useRef, useState } from 'react'
import { LEISTUNGEN } from '@/lib/content'

// CLIENT-Sub-Komponente der LeistungenSection: Mobile-only Karussell (<640px).
// Rendert die 6 Besichtigungs-Schritte (content.ts LEISTUNGEN) als horizontale
// Snap-Karten mit Card-by-Card Auto-Advance (5s), Dots, Tap-Zonen (linkes/rechtes
// 30% = prev/next), Pause bei Touch/Wheel, IntersectionObserver-Start +
// visibilitychange-Stop, prefers-reduced-motion-Guard. Logik 1:1 portiert aus dem
// Mock-Controller (MASTER_preview-complete_v3-praxis-v2.html Z.5304-5407).
// Klassen .leistungen-* liegen in app/globals.css. Desktop/Tablet rendert die
// LeistungenSection das unveraenderte 6-Card-Grid (hidden sm:grid).
const READ_MS = 5000

export function LeistungenCarousel() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    // Non-null-Alias fuer die Closures (TS narrowt sonst zurueck auf null).
    const el: HTMLDivElement = track
    const cards = Array.from(el.querySelectorAll<HTMLElement>('.leistungen-card'))
    if (!cards.length) return

    let currentIdx = 0
    let paused = false
    let advanceTimer: ReturnType<typeof setInterval> | null = null
    let resumeTimer: ReturnType<typeof setTimeout> | undefined
    let scrollTimer: ReturnType<typeof setTimeout> | undefined

    function getCardWidth(): number {
      const styles = window.getComputedStyle(el)
      const gap = parseFloat(styles.columnGap || styles.gap || '14') || 14
      return cards[0].getBoundingClientRect().width + gap
    }
    function gotoCard(idx: number) {
      const cardW = getCardWidth()
      if (!cardW) return
      currentIdx = idx
      el.scrollTo({ left: cardW * idx, behavior: 'smooth' })
      setCurrent(idx)
    }
    function tick() {
      if (paused) return
      let next = currentIdx + 1
      if (next >= cards.length) next = 0
      gotoCard(next)
    }
    function start() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      if (advanceTimer) clearInterval(advanceTimer)
      advanceTimer = setInterval(tick, READ_MS)
    }
    function stop() {
      if (advanceTimer) {
        clearInterval(advanceTimer)
        advanceTimer = null
      }
    }
    function pause(ms = 6500) {
      paused = true
      clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => {
        paused = false
      }, ms)
    }

    const onTouch = () => pause(6500)
    const onWheel = () => pause(6500)
    el.addEventListener('touchstart', onTouch, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })

    // Tap-Zonen: Click auf linkes/rechtes 30% -> prev/next. Drag-Detection (>8px)
    // verhindert, dass ein Swipe als Click gewertet wird.
    let pX: number | null = null
    let pY = 0
    let pMoved = false
    const onPointerDown = (e: PointerEvent) => {
      pX = e.clientX
      pY = e.clientY
      pMoved = false
    }
    const onPointerMove = (e: PointerEvent) => {
      if (pX === null) return
      if (Math.abs(e.clientX - pX) > 8 || Math.abs(e.clientY - pY) > 8) pMoved = true
    }
    const onClick = (e: MouseEvent) => {
      if (pMoved) {
        pMoved = false
        return
      }
      if (cards.length <= 1) return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const w = rect.width
      if (x < w * 0.3) {
        let prev = currentIdx - 1
        if (prev < 0) prev = cards.length - 1
        gotoCard(prev)
        pause(6500)
      } else if (x > w * 0.7) {
        let next = currentIdx + 1
        if (next >= cards.length) next = 0
        gotoCard(next)
        pause(6500)
      }
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('click', onClick)

    // Manueller Swipe -> currentIdx + Dots nachziehen.
    const onScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        const cardW = getCardWidth()
        if (cardW) {
          currentIdx = Math.round(el.scrollLeft / cardW)
          setCurrent(currentIdx)
        }
      }, 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    // Auto-Advance erst starten, wenn das Karussell in den Viewport scrollt.
    let io: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              start()
              io?.unobserve(el)
            }
          })
        },
        { threshold: 0.25 },
      )
      io.observe(el)
    } else {
      setTimeout(start, 800)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      clearTimeout(resumeTimer)
      clearTimeout(scrollTimer)
      el.removeEventListener('touchstart', onTouch)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('click', onClick)
      el.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
      io?.disconnect()
    }
  }, [])

  return (
    <div className="sm:hidden">
      <div
        ref={trackRef}
        id="leistungenTrack"
        className="leistungen-mobile-track"
        role="region"
        aria-label="Besichtigung in 6 Schritten"
      >
        {LEISTUNGEN.map((l, i) => (
          <div
            key={l.img}
            className="leistungen-card"
            role="group"
            aria-label={`Schritt ${i + 1} von ${LEISTUNGEN.length}`}
          >
            <div className="leistungen-card-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/assets/img/shared/besichtigung/${l.img}`}
                alt={l.alt}
                loading="lazy"
                data-placeholder="true"
              />
              <span className="leistungen-card-step">
                {i + 1} / {LEISTUNGEN.length}
              </span>
            </div>
            <div className="leistungen-card-body">
              <h3 className="leistungen-card-title">{l.title}</h3>
              <p className="leistungen-card-desc">{l.text}</p>
              <p
                className={
                  l.badgeLabel.includes('Vorteil')
                    ? 'leistungen-card-hint leistungen-card-hint--vorteil'
                    : 'leistungen-card-hint'
                }
              >
                <strong>{l.badgeLabel}</strong> {l.badgeText}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div id="leistungenDots" className="leistungen-dots" aria-hidden="true">
        {LEISTUNGEN.map((l, i) => (
          <span key={l.img} className={i === current ? 'is-active' : undefined} />
        ))}
      </div>
    </div>
  )
}
