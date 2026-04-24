'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFlowStore } from '@/lib/flow/flow-store'

// AAR-477 C11: Client-seitiger Store-Rehydrator. Setzt leadId + Step-Flags
// aus den vom Server abgeleiteten Lead-Feldern und redirectet auf den
// nächsten offenen Schritt. Rendert nur einen kurzen Lade-Hinweis, weil
// der useEffect sofort redirectet.

type Props = {
  leadId: string
  gegnerDatenErfasst: boolean
  zb1Erfasst: boolean
  nextStep: string
}

export function ResumeHandler({
  leadId,
  gegnerDatenErfasst,
  zb1Erfasst,
  nextStep,
}: Props) {
  const router = useRouter()

  useEffect(() => {
    const store = useFlowStore.getState()
    store.setLeadId(leadId)
    if (gegnerDatenErfasst) store.markGegnerErfasst()
    if (zb1Erfasst) store.markZb1Erfasst()
    // currentStep aus nextStep ableiten
    const stepFromPath = nextStep.includes('schritt-4')
      ? 4
      : nextStep.includes('schritt-3')
        ? 3
        : 2
    store.setCurrentStep(stepFromPath as 2 | 3 | 4)
    router.replace(nextStep)
  }, [leadId, gegnerDatenErfasst, zb1Erfasst, nextStep, router])

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-sm text-claimondo-ondo">
        Wir laden Ihren Schadenfall … einen Moment bitte.
      </p>
    </div>
  )
}
