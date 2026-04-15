'use client'

// AAR-137 / W3: Phase-Router. Rendert die aktive Phase aus dem Context.
// Zusätzlich der Disqualifikations-Überblick: ist der Lead disqualifiziert,
// wird stattdessen das ExitSkript gerendert — vorher waren diese Wrapper
// in einem separaten PhaseStubs.tsx, das nach der W4-W8-Migration obsolete
// geworden ist (AAR-144 Cleanup).

import { useDispatchPhase } from './lib/phase-context'
import Phase1Qualifizierung from './phases/Phase1Qualifizierung'
import Phase2TerminServiceTyp from './phases/Phase2TerminServiceTyp'
import Phase3Schadentyp from './phases/Phase3Schadentyp'
import Phase4Stammdaten from './phases/Phase4Stammdaten'
import Phase5Zusammenfassung from './phases/Phase5Zusammenfassung'
import Phase6StatusTracking from './phases/Phase6StatusTracking'
import ExitSkript, { type DisqualifikationsGrund } from './ExitSkript'

type FlowLinkRow = {
  id: string
  token: string
  status: string
  created_at: string
  expires_at: string
  geoeffnet_am?: string | null
  abgeschlossen_am?: string | null
  fall_id?: string | null
}

type FallSnapshot = {
  sa_unterschrieben?: boolean | null
  vollmacht_unterschrieben?: boolean | null
}

function DisqualifiziertOverlay() {
  const { lead } = useDispatchPhase()
  const grund = (lead as { disqualifikations_grund_key?: string | null })
    .disqualifikations_grund_key as DisqualifikationsGrund | null
  if (!grund) return null
  return <ExitSkript grund={grund} />
}

export default function PhaseContent({
  flowLinks,
  fall,
}: {
  flowLinks: FlowLinkRow[]
  fall: FallSnapshot | null
}) {
  const { currentPhase, qualification } = useDispatchPhase()

  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />

  switch (currentPhase) {
    case 1:
      return <Phase1Qualifizierung />
    case 2:
      return <Phase2TerminServiceTyp />
    case 3:
      return <Phase3Schadentyp />
    case 4:
      return <Phase4Stammdaten />
    case 5:
      return <Phase5Zusammenfassung />
    case 6:
      return <Phase6StatusTracking flowLinks={flowLinks} fall={fall} />
    default:
      return null
  }
}
