'use client'

// AAR-388: Client-Boot für Service-Worker + Background-Sync. Wird in
// src/app/layout.tsx einmal gemountet.
//
// CMM-14: SW-Registration auf 3 Sekunden verzögert. Ohne Delay rennt der
// SW-Installation-Lifecycle in einen Race mit RSC-Stream-Navigation
// (z.B. nach Auth-Redirect): der install-Phase fängt der noch-nicht-aktive
// SW den `?_rsc=`-Stream ab → Browser bekommt kaputten Response → weiße
// Seite, erst Reload behebt es. Mit 3s Delay sind kritische initiale
// Navigations sicher durch bevor der SW seinen ersten fetch-Handler
// installiert.

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/offline/register-sw'

export default function ServiceWorkerBoot() {
  useEffect(() => {
    const t = setTimeout(() => {
      void registerServiceWorker()
    }, 3000)
    return () => clearTimeout(t)
  }, [])
  return null
}
