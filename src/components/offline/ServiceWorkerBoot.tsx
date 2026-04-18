'use client'

// AAR-388: Client-Boot für Service-Worker + Background-Sync. Wird in
// src/app/layout.tsx einmal gemountet.

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/offline/register-sw'

export default function ServiceWorkerBoot() {
  useEffect(() => {
    void registerServiceWorker()
  }, [])
  return null
}
