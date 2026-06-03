'use client'

// P2d-2: gegner_versicherung als Autocomplete (Versicherungen-Stammdaten, 95+)
// statt Freitext. Schreibt FK + denormalisierten Namen via saveStammdaten
// (Allowlist: gegner_versicherung + gegner_versicherung_id), Freitext-Fallback
// setzt die id auf null.

import { useState } from 'react'
import VersicherungAutocomplete from '@/components/VersicherungAutocomplete'
import type { OnboardingFeld } from '@/components/onboarding/types'
import { saveStammdaten } from '../_actions/stammdaten'
import { OverrideFieldShell, type OverrideSaveStatus } from './OverrideFieldShell'

export function DispatchVersichererField({
  feld,
  leadId,
  lead,
}: {
  feld: OnboardingFeld
  leadId: string
  lead: Record<string, unknown>
}) {
  const [status, setStatus] = useState<OverrideSaveStatus>('idle')

  async function persist(name: string, id: string | null) {
    setStatus('saving')
    const r = await saveStammdaten(leadId, {
      gegner_versicherung: name.trim() || null,
      gegner_versicherung_id: id,
    })
    setStatus(r.success ? 'saved' : 'error')
  }

  return (
    <OverrideFieldShell feld={feld} status={status}>
      <VersicherungAutocomplete
        initialName={(lead.gegner_versicherung as string | null) ?? null}
        initialId={(lead.gegner_versicherung_id as string | null) ?? null}
        status={status}
        onSelect={(sel) => persist(sel.name, sel.id)}
        onFreitextConfirm={(name) => persist(name, null)}
      />
    </OverrideFieldShell>
  )
}
