// AAR-840: Shared Phase-Pipeline für claims (zwei Modi)
//
// Modus A — aktiver Claim (Phase 0–6):
//   ●─────●─────●─────●─────○─────○─────○
//   Lead  Neu   KB    Gut.  Rep.  VS    [end]
//                     ↑ aktuell
//
// Modus B — abgeschlossener Claim (Phase 9_*):
//   ●─────●─────●─────●─────●─────●─────✅/❌/🏛️/⏸
//   Lead  Neu   KB    Gut.  Rep.  VS    Endzustand
//
// Bei früher Stornierung (Storniert in Phase 2): durchgehende Linie bis
// Phase 2, gestrichelte Linie zum Endzustand-Icon. Heißt: Wir kennen die
// "echte" Phase-Höhe vor Endzustand nur aus phase_transitions — ohne diesen
// Lookup nehmen wir defensiv max(reachedPhase, currentPhaseOrder).

import { CLAIM_PHASE, PIPELINE_PHASES, getPhaseMapping } from './phase-mappings'
import type { ClaimPhase } from './phase-mappings'

type Props = {
  phase: string
  /** Phase die vor Endzustand erreicht war — optional, fallback auf order vor Endzustand */
  reachedBeforeEndzustand?: ClaimPhase
  viewerRole?: 'admin' | 'kb' | 'sv' | 'kunde'
  /** Vertikal (Sidebar-Aside) oder horizontal (Header-Strip). Default: horizontal */
  orientation?: 'horizontal' | 'vertical'
}

const NAVY = '#0D1B3E'
const ONDO = '#4573A2'
const SHIELD = '#7BA3CC'
const BG_LIGHT = '#f8f9fb'

export function PhasePipeline({
  phase,
  reachedBeforeEndzustand,
  viewerRole = 'admin',
  orientation = 'horizontal',
}: Props) {
  const current = getPhaseMapping(phase)
  const isEnd   = current.isEndzustand

  // In Modus B kennen wir den letzten erreichten Aktiv-Phase nicht direkt aus
  // claims.phase. Caller kann reachedBeforeEndzustand setzen (z.B. aus
  // phase_transitions). Fallback: alle Aktiv-Phasen als erreicht zeichnen.
  const reachedOrder = isEnd
    ? (reachedBeforeEndzustand ? CLAIM_PHASE[reachedBeforeEndzustand].order : 6)
    : current.order

  const isVertical = orientation === 'vertical'

  return (
    <div
      className={
        isVertical
          ? 'flex flex-col gap-1'
          : 'flex flex-row items-center gap-1 overflow-x-auto'
      }
      role="list"
      aria-label="Fall-Phasen-Pipeline"
    >
      {PIPELINE_PHASES.map((p, idx) => {
        const m = CLAIM_PHASE[p]
        const reached = m.order <= reachedOrder
        const isCurrent = !isEnd && p === phase
        const Icon = m.icon
        const label = viewerRole === 'kunde' ? m.labelKunde : m.label

        const dotColor = isCurrent ? NAVY : reached ? ONDO : SHIELD
        const lineColor = idx > 0 && reachedOrder >= m.order ? ONDO : SHIELD

        return (
          <div
            key={p}
            role="listitem"
            className={isVertical ? 'flex items-center gap-2' : 'flex items-center gap-1'}
          >
            {/* Verbindungslinie zur Vorgängerphase */}
            {idx > 0 && (
              <div
                aria-hidden
                className={isVertical ? 'h-4 border-l-2' : 'flex-1 border-t-2'}
                style={{ borderColor: lineColor, minWidth: isVertical ? undefined : 16 }}
              />
            )}

            {/* Phasen-Punkt */}
            <div
              title={label}
              className="flex items-center gap-1.5 shrink-0"
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  isCurrent ? 'ring-2 ring-offset-2' : ''
                }`}
                style={{
                  backgroundColor: reached ? dotColor : BG_LIGHT,
                  color:           reached ? '#fff' : SHIELD,
                  borderColor:     dotColor,
                  borderWidth:     reached ? 0 : 2,
                  borderStyle:     'solid',
                }}
              >
                <Icon className="w-3 h-3" />
              </div>
              {isVertical && (
                <span
                  className="text-xs"
                  style={{ color: isCurrent ? NAVY : reached ? ONDO : SHIELD, fontWeight: isCurrent ? 600 : 400 }}
                >
                  {label}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {/* Endzustand-Indikator (Modus B) */}
      {isEnd && (
        <div className={isVertical ? 'flex items-center gap-2 mt-1' : 'flex items-center gap-1'}>
          {/* Linie zum Endzustand: gestrichelt wenn nicht alle Aktiv-Phasen erreicht */}
          <div
            aria-hidden
            className={isVertical ? 'h-4 border-l-2' : 'flex-1 border-t-2'}
            style={{
              borderColor: reachedOrder >= 6 ? ONDO : SHIELD,
              borderStyle: reachedOrder >= 6 ? 'solid' : 'dashed',
              minWidth:    isVertical ? undefined : 16,
            }}
          />
          <div
            title={viewerRole === 'kunde' ? current.labelKunde : current.label}
            className="flex items-center gap-1.5 shrink-0"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: current.tone === 'success' ? '#059669'
                  : current.tone === 'danger' ? '#dc2626'
                  : current.tone === 'brand' ? NAVY
                  : '#6b7280',
                color: '#fff',
              }}
            >
              <current.icon className="w-3.5 h-3.5" />
            </div>
            {isVertical && (
              <span className="text-xs font-semibold" style={{ color: NAVY }}>
                {viewerRole === 'kunde' ? current.labelKunde : current.label}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
