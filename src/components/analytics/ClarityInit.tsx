'use client'

import { useEffect } from 'react'
import Clarity from '@microsoft/clarity'

// Microsoft Clarity Session-Recording + Heatmaps.
// Lädt nur wenn NEXT_PUBLIC_CLARITY_ID gesetzt ist — damit lokale Dev-Sessions
// und Preview-Deploys ohne ID stillschweigend kein Tracking starten.
//
// Masking: Wird serverseitig im Clarity-Dashboard konfiguriert
// (Settings → Privacy → Masking-Mode: "Strict"). Strict maskiert alle
// Text-Inhalte + Inputs automatisch — Pflicht für Admin/Dispatch/SV-Portale
// wegen Mandantendaten, IBANs, Telefonnummern, Schadenshöhen.
export function ClarityInit() {
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_CLARITY_ID
    if (!projectId) return
    Clarity.init(projectId)
  }, [])

  return null
}
