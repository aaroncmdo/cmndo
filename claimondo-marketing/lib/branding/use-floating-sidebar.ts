'use client'

// 2026-05-14: Shared State für Floating-Sidebar-Modus.
//
// Default: floating (Liquid-Glass-Pills mit backdrop-blur über Content). Opt-
// out via ?sidebar=bar (URL-Param) → schreibt localStorage 'bar' und merkt
// sich die Präferenz portalübergreifend. Wird in jeder Portal-Shell (Gutachter,
// Admin, Dispatch, Kanzlei, Kunde) instanziiert — über localStorage ist die
// Wahl global.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export function useFloatingSidebar(): boolean {
  const pathname = usePathname()
  const [floating, setFloating] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const param = url.searchParams.get('sidebar')
    if (param === 'floating') {
      setFloating(true)
      localStorage.setItem('sidebar-mode', 'floating')
    } else if (param === 'bar') {
      setFloating(false)
      localStorage.setItem('sidebar-mode', 'bar')
    } else {
      setFloating(localStorage.getItem('sidebar-mode') !== 'bar')
    }
  }, [pathname])

  return floating
}
