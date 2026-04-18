'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFlowStore } from '@/lib/flow/flow-store'
import { Schritt2aClient } from './Schritt2aClient'

// AAR-471 C5: Client-Guard — leadId lebt nur in sessionStorage (zustand-persist).
// Daher kann der Guard nicht rein server-seitig sein. Ohne leadId → zurück zu
// Schritt 1.

export function Schritt2aGuard() {
  const router = useRouter()
  const leadId = useFlowStore((s) => s.leadId)

  useEffect(() => {
    if (!leadId) router.replace('/schaden-melden/schritt-1')
  }, [leadId, router])

  if (!leadId) {
    return <p className="text-sm text-slate-500">Leite weiter …</p>
  }

  return <Schritt2aClient leadId={leadId} />
}
