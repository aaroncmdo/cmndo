'use client'

import { useEffect } from 'react'

// Site-weites phone_call-Conversion-Tracking: feuert gtag('event','phone_call')
// beim Klick auf einen tel:-Link. Consent-gated via Consent-Mode v2 (gtag haelt
// das Event zurueck, solange kein Consent erteilt ist). Auf Portalen/Subdomains
// ist window.gtag nicht geladen (Host-Allow-list) → optional-chaining no-op.
//
// Auf der LP laeuft zusaetzlich TrackingHooks (data-tracking="call-*" mit
// lp_variant/source). Damit phone_call DORT nicht doppelt zaehlt, setzt
// TrackingHooks window.__lpPhoneTracking=true und wir ueberlassen ihm die
// call-*-Links. Auf der Hauptdomain (kein TrackingHooks) tracken wir ALLE
// tel:-Links — sonst blieben die call-*-CTAs dort ungetrackt (Bug-Fix 26.05.).
export function PhoneClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const link = target?.closest('a[href^="tel:"]') as HTMLAnchorElement | null
      if (!link) return
      const lpTracking =
        (window as unknown as { __lpPhoneTracking?: boolean }).__lpPhoneTracking === true
      // Nur wo TrackingHooks aktiv ist (LP) die call-*-Links ihm ueberlassen.
      if (lpTracking && link.dataset.tracking?.startsWith('call-')) return
      const tel = link.getAttribute('href')?.replace('tel:', '') ?? ''
      window.gtag?.('event', 'phone_call', {
        event_category: 'cta',
        event_label: tel,
      })
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [])
  return null
}
