'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFlowStore } from '@/lib/flow/flow-store'
import { AnalyseClient } from './AnalyseClient'

// AAR-472 C6: Client-Guard — leadId + fotos leben in sessionStorage. Ohne
// leadId zurück zu Schritt 1, mit weniger als 3 Fotos zurück zu 2a.

export function AnalyseGuard() {
  const router = useRouter()
  const leadId = useFlowStore((s) => s.leadId)
  const fotos = useFlowStore((s) => s.fotos)

  useEffect(() => {
    if (!leadId) {
      router.replace('/schaden-melden/schritt-1')
      return
    }
    if (fotos.length < 3) {
      router.replace('/schaden-melden/schritt-2')
    }
  }, [leadId, fotos.length, router])

  if (!leadId || fotos.length < 3) {
    return <p className="text-sm text-slate-500">Leite weiter …</p>
  }

  return <AnalyseClient leadId={leadId} />
}
