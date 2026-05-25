'use client'

import { useEffect } from 'react'

// Site-weites phone_call-Conversion-Tracking: feuert gtag('event','phone_call')
// beim Klick auf einen tel:-Link. Consent-gated via Consent-Mode v2 (gtag haelt
// das Event zurueck, solange kein Consent erteilt ist). Auf Portalen/Subdomains
// ist window.gtag nicht geladen (Host-Allow-list) → optional-chaining no-op.
//
// Ergaenzt das LP-spezifische TrackingHooks (data-tracking="call-*"): solche
// Links ueberspringen wir hier, um Doppel-Zaehlung zu vermeiden.
export function PhoneClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const link = target?.closest('a[href^="tel:"]') as HTMLAnchorElement | null
      if (!link) return
      if (link.dataset.tracking?.startsWith('call-')) return // TrackingHooks zaehlt das
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
