'use client'

// P2d-2b (dispatch-config-unify): kennzeichen als Parts-Editor (Stadt / Kennung
// / Zahl / Typ) statt generischem Freitext-FieldRenderer. Self-save der fünf
// kennzeichen*-Spalten via saveStammdaten (alle in der STAMMDATEN-Allowlist);
// Save-Status über OverrideFieldShell. Hinweis: gegner_kennzeichen bekommt KEIN
// Override — leads hat dafür keine Parts-Spalten, es bleibt Freitext.

import { useState } from 'react'
import type { OnboardingFeld } from '@/components/onboarding/types'
import { KennzeichenPartsInput } from '@/components/shared/KennzeichenPartsInput'
import type { KennzeichenFields } from '@/lib/format/kennzeichen'
import { saveStammdaten } from '../_actions/stammdaten'
import { OverrideFieldShell, type OverrideSaveStatus } from './OverrideFieldShell'

export function DispatchKennzeichenField({
  feld,
  leadId,
  lead,
}: {
  feld: OnboardingFeld
  leadId: string
  lead: Record<string, unknown>
}) {
  const [status, setStatus] = useState<OverrideSaveStatus>('idle')

  async function persist(fields: KennzeichenFields) {
    setStatus('saving')
    const r = await saveStammdaten(leadId, fields)
    setStatus(r.success ? 'saved' : 'error')
  }

  return (
    <OverrideFieldShell feld={feld} status={status}>
      <KennzeichenPartsInput
        value={{
          kreis: (lead.kennzeichen_kreis as string | null) ?? null,
          buchstaben: (lead.kennzeichen_buchstaben as string | null) ?? null,
          zahl: (lead.kennzeichen_zahl as string | null) ?? null,
          suffix: (lead.kennzeichen_suffix as string | null) ?? null,
        }}
        syncEnabled={status === 'idle'}
        onSave={persist}
      />
    </OverrideFieldShell>
  )
}
