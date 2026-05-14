'use client'

// 2026-05-14: App-weiter Floating-Sidebar-Default. Setzt das data-sidebar-mode-
// Attribut auf <body>, sodass alle Portal-Shells (Gutachter, Admin, Dispatch,
// Kanzlei, Kunde, Mitarbeiter) zentral entscheiden können wie ihre Asides
// rendern — via CSS-Descendant-Selector in globals.css. Default ist 'floating'
// (Liquid-Glass-Pills); opt-out via ?sidebar=bar oder localStorage.

import { useEffect } from 'react'
import { useFloatingSidebar } from '@/lib/branding/use-floating-sidebar'

export default function SidebarModeApplier() {
  const floating = useFloatingSidebar()
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.dataset.sidebarMode = floating ? 'floating' : 'bar'
  }, [floating])
  return null
}
