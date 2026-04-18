'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFlowStore } from '@/lib/flow/flow-store'
import { GegnerClient } from './GegnerClient'

// AAR-474 C8: Client-Guard — leadId lebt nur in sessionStorage (zustand-persist).
// Ohne leadId → zurück zu Schritt 1.

type Versicherer = { id: string; name: string }

export function GegnerGuard({ versicherer }: { versicherer: Versicherer[] }) {
  const router = useRouter()
  const leadId = useFlowStore((s) => s.leadId)

  useEffect(() => {
    if (!leadId) router.replace('/schaden-melden/schritt-1')
  }, [leadId, router])

  if (!leadId) {
    return <p className="text-sm text-slate-500">Leite weiter …</p>
  }

  return <GegnerClient leadId={leadId} versicherer={versicherer} />
}
