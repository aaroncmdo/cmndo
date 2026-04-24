'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFlowStore } from '@/lib/flow/flow-store'
import { loadLeadForSignup } from '@/lib/actions/signup-and-convert'
import { SignupClient } from './SignupClient'

// AAR-476 C10: Client-Guard für Schritt 4.
// Prüft: leadId gesetzt + zb1Erfasst true. Wenn nicht → Redirect auf frühere
// Schritte (sessionStorage-basiert, deswegen client-seitig).
// Lädt anschließend Lead-Metadaten (Email-Prefill + Makler-Firma) via
// Server-Action, damit die Consent-Box den Makler-Namen zeigen kann.

type LeadMeta = {
  id: string
  email: string | null
  maklerFirma: string | null
  hasPromotionCode: boolean
}

export function Schritt4Guard() {
  const router = useRouter()
  const leadId = useFlowStore((s) => s.leadId)
  const zb1Erfasst = useFlowStore((s) => s.zb1Erfasst)
  const [lead, setLead] = useState<LeadMeta | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!leadId) {
      router.replace('/schaden-melden/schritt-1')
      return
    }
    if (!zb1Erfasst) {
      router.replace('/schaden-melden/schritt-3')
      return
    }
    let cancelled = false
    void (async () => {
      const res = await loadLeadForSignup(leadId)
      if (cancelled) return
      if (!res.success) {
        setLoadError(res.error)
        return
      }
      setLead(res.lead)
    })()
    return () => {
      cancelled = true
    }
  }, [leadId, zb1Erfasst, router])

  if (!leadId || !zb1Erfasst) {
    return <p className="text-sm text-claimondo-ondo">Leite weiter …</p>
  }
  if (loadError) {
    return <p className="text-sm text-red-600">Fehler beim Laden: {loadError}</p>
  }
  if (!lead) {
    return <p className="text-sm text-claimondo-ondo">Lädt …</p>
  }

  return <SignupClient lead={lead} />
}
