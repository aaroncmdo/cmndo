'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Clarity from '@microsoft/clarity'

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

export function ClarityInit() {
  const pathname = usePathname()
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_CLARITY_ID
    if (!projectId) return
    if (pathname && SKIP_ROUTES.some((r) => pathname.startsWith(r))) return
    Clarity.init(projectId)
    // Mount-only Init: pathname wird nur einmal beim ersten Render gelesen,
    // SPA-Navigation re-initialisiert Clarity NICHT (window.clarity bleibt
    // global an die initiale ID gebunden).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
