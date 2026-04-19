// AAR-565 (B2): Subphase-Detail-Ansicht. Rendert pro übergeordneter Phase
// die sichtbaren Subphasen als eingerückte Liste. Visibility-Filter liegt
// beim Consumer (AAR-566 B3 Visibility-Matrix) — hier filtern wir nur
// hart auf `visible !== false`.

import type { SubphaseData } from './types'
import { PhaseStatusDot } from './PhaseStatusDot'

export function SubphaseStepper({
  subphases,
  showTimestamps,
}: {
  subphases: SubphaseData[]
  showTimestamps?: boolean
}) {
  const sichtbar = subphases.filter((s) => s.visible && s.state !== 'hidden')
  if (sichtbar.length === 0) return null
  return (
    <ul className="mt-1.5 ml-6 space-y-1 border-l border-claimondo-border pl-3">
      {sichtbar.map((sub) => (
        <li key={sub.id} className="flex items-center gap-2" data-subphase-id={sub.id}>
          <PhaseStatusDot state={sub.state} size="xs" />
          <span
            className={
              sub.state === 'active'
                ? 'text-[12px] font-medium text-claimondo-navy'
                : sub.state === 'done'
                  ? 'text-[12px] text-gray-600'
                  : sub.state === 'blocked'
                    ? 'text-[12px] font-medium text-rose-700'
                    : 'text-[12px] text-gray-400'
            }
          >
            {sub.label}
          </span>
          {showTimestamps && sub.reachedAt && (
            <span className="text-[10px] text-gray-400 ml-auto">
              {new Date(sub.reachedAt).toLocaleDateString('de-DE')}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
