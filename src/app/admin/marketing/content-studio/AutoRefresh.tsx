'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Aktualisiert die Server-Komponente periodisch via `router.refresh()` (soft — kein
 * Full-Reload, Client-State/Formular/Scroll bleiben erhalten), solange `active`.
 * Fuer live Status-Updates ohne manuelles Neuladen (entwurf->skript_generiert, Queue etc.).
 * Rendert nichts.
 */
export function AutoRefresh({ active = true, intervalMs = 3000 }: { active?: boolean; intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const iv = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(iv)
  }, [active, intervalMs, router])
  return null
}
