'use client'

import { useEffect, useState } from 'react'
import { Phone, MessageCircle, ArrowRight } from 'lucide-react'
import { TEL_HREF, WA_HREF } from './constants'

// WhatsApp-Brand-Grün — whitelisted in src/lib/external-brand-colors.ts.
const WA_BG = 'bg-[#25D366]/70 hover:bg-[#25D366]'

// Scroll-Behavior (Aaron 20.05.2026):
//   - initial unsichtbar
//   - sichtbar, sobald scrollY >= 50% der Viewport-Höhe UND Richtung = down
//   - ausblenden, sobald letzte Richtung = up (Delta-Schwelle gegen Jitter)
//   - bei erneutem Runterscrollen sofort wieder einblenden, sobald wieder
//     oberhalb der Schwelle (kein zweiter Initial-Wait)
// Schwelle = innerHeight * 0.5 (nicht scrollHeight) damit kurze und sehr
// lange Landingpages beide nach ~halbem Viewport triggern, statt auf
// langen Seiten 1.5x Viewport-Heights ins Leere scrollen zu müssen.
const VIEWPORT_THRESHOLD_RATIO = 0.5
const DIRECTION_DELTA = 2 // px gegen Scroll-Jitter

export function StickyMobileCta() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let lastY = window.scrollY
    let ticking = false

    const update = (isInitial = false) => {
      ticking = false
      const y = window.scrollY
      const threshold = window.innerHeight * VIEWPORT_THRESHOLD_RATIO
      const pastThreshold = y >= threshold
      const delta = y - lastY

      if (isInitial) {
        setVisible(pastThreshold)
        lastY = y
        return
      }

      if (delta <= -DIRECTION_DELTA) {
        setVisible(false)
        lastY = y
      } else if (delta >= DIRECTION_DELTA) {
        if (pastThreshold) setVisible(true)
        lastY = y
      }
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => update(false))
    }

    update(true)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      aria-hidden={!visible}
      className={[
        'pointer-events-none fixed inset-x-0 bottom-3 z-40 flex items-stretch justify-center gap-2 px-3 md:hidden',
        'transition-all duration-200 ease-out will-change-transform',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
      ].join(' ')}
    >
      <a
        href={TEL_HREF}
        data-tracking="call-sticky"
        tabIndex={visible ? 0 : -1}
        className="pointer-events-auto flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 py-3 text-xs font-bold text-claimondo-navy shadow-glass-card backdrop-blur-md transition-all hover:bg-white/85 active:scale-[0.97]"
      >
        <Phone className="h-4 w-4" aria-hidden />
        Anrufen
      </a>
      <a
        href={WA_HREF}
        target="_blank"
        rel="noopener noreferrer"
        data-tracking="whatsapp-sticky"
        tabIndex={visible ? 0 : -1}
        className={`pointer-events-auto flex flex-1 items-center justify-center gap-1.5 rounded-full ${WA_BG} px-3 py-3 text-xs font-bold text-white shadow-glass-card backdrop-blur-md transition-all active:scale-[0.97]`}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        WhatsApp
      </a>
      <a
        href="#lead-form"
        data-tracking="form-sticky"
        tabIndex={visible ? 0 : -1}
        className="pointer-events-auto flex flex-1 items-center justify-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-3 text-xs font-bold text-white shadow-glass-card backdrop-blur-md transition-all hover:bg-claimondo-shield active:scale-[0.97]"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        Formular
      </a>
    </div>
  )
}
