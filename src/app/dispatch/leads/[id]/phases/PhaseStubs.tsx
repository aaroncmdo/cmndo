'use client'

// AAR-137 / W3: Phasen-Router für die DispatchShell.
// Jede exportierte Komponente umhüllt die jeweilige Phase-Implementation mit
// einer Disqualifikations-Überprüfung — ist der Lead disqualifiziert, rendert
// statt der Phase das ExitSkript. Nach W3 war das hier noch ein Stub-File;
// mit W4-W8 sind alle Phasen echte Implementationen.

import Phase1Qualifizierung from './Phase1Qualifizierung'
import Phase2TerminServiceTypComponent from './Phase2TerminServiceTyp'
import Phase3SchadentypComponent from './Phase3Schadentyp'
import Phase4StammdatenComponent from './Phase4Stammdaten'
import Phase5ZusammenfassungComponent from './Phase5Zusammenfassung'
import Phase6StatusTrackingComponent from './Phase6StatusTracking'
import ExitSkript, { type DisqualifikationsGrund } from '../ExitSkript'
import { useDispatchPhase } from '../lib/phase-context'

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

function DisqualifiziertOverlay() {
  const { lead } = useDispatchPhase()
  const grund = (lead as { disqualifikations_grund_key?: string | null })
    .disqualifikations_grund_key as DisqualifikationsGrund | null
  if (!grund) return null
  return <ExitSkript grund={grund} />
}

/** Phase 1 — Qualifizierung (AAR-138 / W4). */
export function Phase1() {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase1Qualifizierung />
}

/** Phase 2 — SV-Termin + Service-Typ (AAR-139 / W5). */
export function Phase2TerminServiceTyp() {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase2TerminServiceTypComponent />
}

/** Phase 3 — Schadentyp-Wrapper (AAR-139 / W5). */
export function Phase3Schadentyp() {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase3SchadentypComponent />
}

/** Phase 4 — Stammdaten Inline-Edit (AAR-140 / W6). */
export function Phase4Stammdaten() {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase4StammdatenComponent />
}

/** Phase 5 — Zusammenfassung + Multi-Channel-FlowLink (AAR-141 / W7). */
export function Phase5Zusammenfassung(_props: { flowLinks: FlowLinkRow[]; calls: CallRow[] }) {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase5ZusammenfassungComponent />
}

/** Phase 6 — Status-Tracking nach FlowLink-Versand (AAR-142 / W8). */
export function Phase6StatusTracking({
  flowLinks,
  fall,
}: {
  flowLinks: FlowLinkRow[]
  fall: FallSnapshot | null
}) {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase6StatusTrackingComponent flowLinks={flowLinks} fall={fall} />
}
