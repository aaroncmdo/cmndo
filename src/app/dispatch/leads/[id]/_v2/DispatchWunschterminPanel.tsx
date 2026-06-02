'use client'

// P2d-3 (dispatch-config-unify): v2-Wrapper für den Wunschtag-Picker in der
// flachen Dispatcher-Form. Besitzt den lokalen State + self-save via
// saveStammdaten (leads.wunschtermin_wochentage). Die Phase-2-UI nutzt denselben
// presentational Picker, aber mit ihrem eigenen patchLead+refresh-Save.

import { useState, useTransition } from 'react'
import { saveStammdaten } from '../_actions/stammdaten'
import { WunschterminWochentagePills } from '../_components/WunschterminWochentagePills'

export function DispatchWunschterminPanel({
  leadId,
  initialWochentage,
}: {
  leadId: string
  initialWochentage: number[]
}) {
  const [wochentage, setWochentage] = useState<number[]>(initialWochentage)
  const [pending, startTransition] = useTransition()

  function handleChange(next: number[]) {
    setWochentage(next)
    startTransition(async () => {
      await saveStammdaten(leadId, {
        wunschtermin_wochentage: next.length > 0 ? next : null,
      })
    })
  }

  return <WunschterminWochentagePills value={wochentage} onChange={handleChange} disabled={pending} />
}
