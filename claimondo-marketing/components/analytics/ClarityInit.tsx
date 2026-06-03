'use client'

import { usePathname } from 'next/navigation'
import { useClarityConsentInit } from './useClarityConsentInit'

// Microsoft Clarity Session-Recording + Heatmaps.
// Lädt nur wenn NEXT_PUBLIC_CLARITY_ID gesetzt ist — damit lokale Dev-Sessions
// und Preview-Deploys ohne ID stillschweigend kein Tracking starten.
//
// Masking: Wird serverseitig im Clarity-Dashboard konfiguriert
// (Settings → Privacy → Masking-Mode: "Strict"). Strict maskiert alle
// Text-Inhalte + Inputs automatisch — Pflicht für Admin/Dispatch/SV-Portale
// wegen Mandantendaten, IBANs, Telefonnummern, Schadenshöhen.
//
// Consent-Gate + Init: in useClarityConsentInit (geteilt mit ClarityInitLP),
// mount-only und DSGVO-consent-gated.
//
// Skip-Routes: Routes mit eigenem Clarity-Snippet (siehe SKIP_ROUTES). Microsoft
// Clarity unterstützt nur eine Project-ID pro Page-Load sauber (window.clarity
// ist global). Damit zwei Projekte nicht kollidieren, lässt ClarityInit dort
// die Init bewusst weg — ausser es wird ein expliziter projectId-Prop gesetzt.
const SKIP_ROUTES = [
  // /kfzgutachter-lp hat eigene LP-spezifische Clarity-ID — siehe
  // src/app/kfzgutachter-lp/page.tsx (CLARITY_ID) + ClarityInitLP.
  '/kfzgutachter-lp',
]

export function ClarityInit({ projectId }: { projectId?: string } = {}) {
  const pathname = usePathname()
  const skip =
    !projectId && !!pathname && SKIP_ROUTES.some((r) => pathname.startsWith(r))
  const id = skip ? undefined : (projectId ?? process.env.NEXT_PUBLIC_CLARITY_ID)
  useClarityConsentInit(id)
  return null
}
