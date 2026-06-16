'use client'

// AAR-956 Consent-Bridge (Embed-Seite). Der Embed läuft cross-origin im iframe auf
// claimondo.de; sein GTM-Container (GTM-KD2L63T3) startet via consent-default auf `denied`
// (s. page.tsx, VOR gtm.js). Diese Bridge empfängt den Consent-State der Parent-Seite
// (postMessage von GutachterFindenSection) und hebt ihn per gtag('consent','update') an —
// so feuern Ads/EC erst nach echter Einwilligung. Nicht-eingewilligt → Tags bleiben denied
// (Advanced Consent Mode: cookieless Modeling-Ping; Container-Einstellung).

import { useEffect } from 'react'
import { isTrustedParentOrigin } from '../_lib/trusted-origin'

// Genau die 5 Signale, die das Parent-CMP (categoriesToGcm) steuert. Allowlist — wir
// übernehmen KEINE beliebigen consent-Keys aus der Message.
const CONSENT_KEYS = [
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
  'analytics_storage',
  'functionality_storage',
] as const
type ConsentValue = 'granted' | 'denied'

// window.gtag ist projektweit global typisiert (kein eigenes declare global → sonst TS2717).

export function ConsentBridge() {
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isTrustedParentOrigin(e.origin)) return
      const data = e.data as { type?: string; gcm?: Record<string, unknown> } | null
      if (!data || data.type !== 'claimondo-consent' || !data.gcm) return
      const update: Record<string, ConsentValue> = {}
      for (const key of CONSENT_KEYS) {
        const v = data.gcm[key]
        if (v === 'granted' || v === 'denied') update[key] = v
      }
      if (Object.keys(update).length === 0) return
      try {
        window.gtag?.('consent', 'update', update)
      } catch {
        /* gtag (noch) nicht da → no-op */
      }
    }
    window.addEventListener('message', onMessage)
    // Handshake: dem Parent signalisieren, dass der Listener steht → er (re)sendet den
    // aktuellen Consent. Löst die Race „Parent sendet bevor iframe bereit ist". Der Ready-Ping
    // trägt keine Daten → targetOrigin '*' ist hier unkritisch.
    try {
      window.parent?.postMessage({ type: 'claimondo-consent-ready' }, '*')
    } catch {
      /* kein Parent / sandboxed → no-op */
    }
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return null
}
