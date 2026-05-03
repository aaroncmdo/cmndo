'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFlowStore } from '@/lib/flow/flow-store'
import { Schritt3Client } from './Schritt3Client'

// AAR-475 C9: Client-Guard — leadId + gegnerDatenErfasst. Ohne leadId →
// Schritt 1; ohne Gegner-Daten → Schritt 2c/gegner.

export function Schritt3Guard() {
  const router = useRouter()
  const leadId = useFlowStore((s) => s.leadId)
  const gegnerDatenErfasst = useFlowStore((s) => s.gegnerDatenErfasst)

  useEffect(() => {
    if (!leadId) {
      router.replace('/schaden-melden/schritt-1')
      return
    }
    if (!gegnerDatenErfasst) {
      router.replace('/schaden-melden/schritt-2/gegner')
    }
  }, [leadId, gegnerDatenErfasst, router])

  if (!leadId || !gegnerDatenErfasst) {
    return <p className="text-sm text-claimondo-ondo">Leite weiter …</p>
  }

  return <Schritt3Client leadId={leadId} />
}
