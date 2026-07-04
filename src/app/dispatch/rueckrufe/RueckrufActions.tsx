'use client'

// Compact-Wrapper um den geteilten RueckrufErledigenForm — inline in der
// dispatch/rueckrufe-Liste (lead-scoped). Der Erledigen-Flow (Ergebnis/Notiz/
// Folgetermin) lebt jetzt in @/components/shared/rueckruf/RueckrufErledigenForm
// und wird auch vom vollen RueckrufTerminPanel genutzt.

import { markRueckrufErledigtMitErgebnis } from './actions'
import { RueckrufErledigenForm } from '@/components/shared/rueckruf/RueckrufErledigenForm'

export default function RueckrufActions({
  leadId,
  anrufVersuche,
}: {
  leadId: string
  anrufVersuche: number
}) {
  return (
    <RueckrufErledigenForm
      variant="compact"
      anrufVersuche={anrufVersuche}
      onSubmit={(ergebnis, notiz, folgeterminIso) =>
        markRueckrufErledigtMitErgebnis(leadId, ergebnis, notiz, folgeterminIso)
      }
    />
  )
}
