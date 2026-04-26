'use client'

// AAR-841 Frontend Phase C/3: Re-Frage-Trigger im Kunden-Portal
//
// Client-Wrapper der KanzleiWunschModal mit open=true beim Mount rendert.
// Sichtbarkeits-Bedingungen werden server-seitig in page.tsx geprüft —
// wenn diese Component gerendert ist, soll das Modal aufpoppen.
//
// onClose: Modal schließt + revalidiert via Page-Refresh (Server-Component
// re-rendered mit aktualisiertem kanzlei_wunsch_gefragt_in_phase, dann
// fällt die Bedingung weg und der Trigger erscheint nicht mehr).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KanzleiWunschModal } from '@/components/shared/claims'

type Props = {
  claimId: string
}

export function ReFrageKanzleiClient({ claimId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  function handleClose() {
    setOpen(false)
    // Page-Refresh damit kanzlei_wunsch_gefragt_in_phase neu eingelesen wird
    // (verhindert dass Modal beim nächsten Page-Load erneut aufpoppt).
    router.refresh()
  }

  return (
    <KanzleiWunschModal
      open={open}
      claimId={claimId}
      gefragtInPhase="phase_4_re_frage"
      onClose={handleClose}
    />
  )
}
