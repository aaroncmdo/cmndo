'use client'

import { useEffect } from 'react'
import { useFlowStore } from '@/lib/flow/flow-store'

// AAR-469 C3: Reset Client-Side Flow-Store beim Mount des Abort-Screens.
// Der Lead in der DB bleibt bestehen (disqualifiziert) — nur der lokale
// Session-State wird geleert, damit ein neuer Versuch sauber startet.

export function ClearFlowOnMount() {
  useEffect(() => {
    useFlowStore.getState().reset()
  }, [])
  return null
}
