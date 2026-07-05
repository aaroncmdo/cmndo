// Beweist: die neue Registry-basierte FallStatusBadge-Ableitung ist byte-identisch
// zur Legacy-Ableitung aus FALL_STATUS_LABELS/FALL_STATUS_COLORS — fuer ALLE Codes
// plus Edge-Cases (leer/unbekannt/null). Kein visueller Smoke noetig.
import { describe, it, expect } from 'vitest'
import { FALL_STATUS_LABELS, FALL_STATUS_COLORS } from '@/lib/statusLabels'
import { fallStatusBadgeParts } from '@/components/shared/FallStatusBadge'

function legacy(status: string | null | undefined): { label: string; color: string } {
  const code = status ?? ''
  return {
    label: FALL_STATUS_LABELS[code] ?? code ?? '—',
    color: FALL_STATUS_COLORS[code] ?? 'bg-claimondo-bg text-claimondo-navy border-claimondo-border',
  }
}

describe('FallStatusBadge parity (registry vs legacy)', () => {
  it('is byte-identical for every FALL_STATUS code + edge cases', () => {
    const cases: (string | null | undefined)[] = [
      ...Object.keys(FALL_STATUS_LABELS),
      '', 'bogus-unknown-code', null, undefined,
    ]
    for (const c of cases) {
      expect(fallStatusBadgeParts(c), `parts for "${c}"`).toEqual(legacy(c))
    }
  })
})
