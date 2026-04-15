'use client'

// AAR-137 / W3: Phase-Router. Rendert die aktive Phase aus dem Context.
// W4-W8 ersetzen nach und nach die PhaseStubs durch echte Phase-Components.

import { useDispatchPhase } from './lib/phase-context'
import {
  Phase1,
  Phase2TerminServiceTyp,
  Phase3Schadentyp,
  Phase4Stammdaten,
  Phase5Zusammenfassung,
  Phase6StatusTracking,
} from './phases/PhaseStubs'

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

type CallRow = {
  id: string
  direction: string
  started_at: string
  duration: number | null
  status: string | null
}

type FallSnapshot = {
  sa_unterschrieben?: boolean | null
  vollmacht_unterschrieben?: boolean | null
}

export default function PhaseContent({
  flowLinks,
  calls,
  fall,
}: {
  flowLinks: FlowLinkRow[]
  calls: CallRow[]
  fall: FallSnapshot | null
}) {
  const { currentPhase } = useDispatchPhase()
  switch (currentPhase) {
    case 1:
      return <Phase1 />
    case 2:
      return <Phase2TerminServiceTyp />
    case 3:
      return <Phase3Schadentyp />
    case 4:
      return <Phase4Stammdaten />
    case 5:
      return <Phase5Zusammenfassung flowLinks={flowLinks} calls={calls} />
    case 6:
      return <Phase6StatusTracking flowLinks={flowLinks} fall={fall} />
    default:
      return null
  }
}
