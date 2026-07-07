// Aaron 07.07.: zeigt im Admin-SV-Detail, ob der SV im oeffentlichen Finder
// sichtbar ist — und wenn nicht, WARUM (Selbstdiagnose statt nachfragen).
// Reine Praesentation ueber deriveFinderVisibility (Gates = Finder-Eligibility).

import { Badge } from '@/components/primitives'
import {
  deriveFinderVisibility,
  type FinderVisibilityInput,
  type FinderVisibilityReason,
} from '@/lib/finder/visibility'

const REASON_LABEL: Record<FinderVisibilityReason, string> = {
  'nicht-verifiziert': 'nicht verifiziert',
  'nicht-aktiv': 'nicht aktiv',
  'keine-isochrone': 'keine Isochrone berechnet',
  'kein-standort': 'kein Standort',
  'test-name': 'Test-/Demo-Firmenname',
}

export function FinderVisibilityBadge({ sv }: { sv: FinderVisibilityInput }) {
  const v = deriveFinderVisibility(sv)
  if (v.visible) {
    return (
      <Badge tone="success" size="sm">
        Im Finder sichtbar
      </Badge>
    )
  }
  return (
    <Badge tone="warning" size="sm">
      Nicht im Finder: {v.reason ? REASON_LABEL[v.reason] : 'ausgeblendet'}
    </Badge>
  )
}
