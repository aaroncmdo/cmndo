'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Clarity from '@microsoft/clarity'
import { hasTrackingConsent, CONSENT_CHANGED_EVENT } from '@/lib/analytics/consent'

// Microsoft Clarity Session-Recording + Heatmaps.
// Lädt nur wenn NEXT_PUBLIC_CLARITY_ID gesetzt ist — damit lokale Dev-Sessions
// und Preview-Deploys ohne ID stillschweigend kein Tracking starten.
//
// Masking: Wird serverseitig im Clarity-Dashboard konfiguriert
// (Settings → Privacy → Masking-Mode: "Strict"). Strict maskiert alle
// Text-Inhalte + Inputs automatisch — Pflicht für Admin/Dispatch/SV-Portale
// wegen Mandantendaten, IBANs, Telefonnummern, Schadenshöhen.
//
// Skip-Routes: Routes mit eigenem Clarity-Snippet (siehe SKIP_ROUTES). Microsoft
// Clarity unterstützt nur eine Project-ID pro Page-Load sauber (window.clarity
// ist global). Damit zwei Projekte nicht kollidieren, lässt ClarityInit dort
// die Init bewusst weg.
const SKIP_ROUTES = [
  // /kfzgutachter-lp hat eigene LP-spezifische Clarity-ID — siehe
  // src/app/kfzgutachter-lp/page.tsx (CLARITY_ID-Konstante).
  '/kfzgutachter-lp',
]

export function ClarityInit({ projectId }: { projectId?: string } = {}) {
  const pathname = usePathname()
  const startedRef = useRef(false)
  useEffect(() => {
    const id = projectId ?? process.env.NEXT_PUBLIC_CLARITY_ID
    if (!id) return
    if (!projectId && pathname && SKIP_ROUTES.some((r) => pathname.startsWith(r))) return

    const start = () => {
      if (startedRef.current) return
      if (!hasTrackingConsent()) return
      startedRef.current = true
      Clarity.init(id)
    }

    // Consent-Gate (DSGVO): Clarity nur bei Cookiebot-'statistics'-Consent.
    // Sofort versuchen (Wiederkehrer mit Consent) + auf das Cookiebot-Consent-
    // Event hoeren (feuert bei jeder Auswahl; start prueft den Consent selbst).
    // Mount-only: SPA-Navigation re-initialisiert Clarity NICHT.
    start()
    window.addEventListener(CONSENT_CHANGED_EVENT, start)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
