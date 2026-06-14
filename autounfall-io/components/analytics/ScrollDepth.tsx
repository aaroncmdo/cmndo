'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { trackScrollDepth } from '@/lib/track'

// Feuert `scroll_50` / `scroll_90` je einmal pro Seitenaufruf (Funnel-Engagement,
// cookielos via Plausible). Reset bei Routenwechsel (pathname-Dep), da das
// Root-Layout bei Client-Navigation nicht neu mountet. Kein setState im Effekt.
export function ScrollDepth() {
  const pathname = usePathname()
  useEffect(() => {
    let fired50 = false
    let fired90 = false
    function onScroll() {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - doc.clientHeight
      if (scrollable <= 0) return
      const pct = (doc.scrollTop / scrollable) * 100
      if (!fired50 && pct >= 50) {
        fired50 = true
        trackScrollDepth(50)
      }
      if (!fired90 && pct >= 90) {
        fired90 = true
        trackScrollDepth(90)
      }
      if (fired50 && fired90) window.removeEventListener('scroll', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname])
  return null
}
