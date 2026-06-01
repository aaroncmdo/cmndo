import { describe, it, expect } from 'vitest'
import { filterFelderByAudience } from './filter-felder-by-audience'
import type { OnboardingFeld } from '@/components/onboarding/types'

// P1 (dispatch-config-unify): Regressions-Guard fuer den audience-Leak-Schutz (Spec §9).
// Die 6 dispatcher-only-Felder der unified Flow 'lead-erfassung' duerfen NIE im
// Kunden-Renderer (audience in {kunde,beide}) auftauchen.
const mk = (k: string, a: 'beide' | 'dispatcher' | 'kunde'): OnboardingFeld =>
  ({ id: k, phase_id: 'p', reihenfolge: 0, feld_key: k, typ: 'text', label: k, pflicht: false,
     db_target: { tabelle: 'leads', spalte: k }, audience: a } as unknown as OnboardingFeld)

// Repraesentativer Ausschnitt: 2 geteilte + die 6 dispatcher-only Felder.
const felder = [
  mk('vorname', 'beide'),
  mk('schadentyp', 'beide'),
  mk('whatsapp_verfuegbar', 'dispatcher'),
  mk('sprache', 'dispatcher'),
  mk('notiz', 'dispatcher'),
  mk('aufklaerung_teilschuld_bestaetigt', 'dispatcher'),
  mk('disqualifiziert', 'dispatcher'),
  mk('disqualifiziert_grund', 'dispatcher'),
]

describe('lead-erfassung audience-Trennung (Leak-Schutz §9)', () => {
  it('Kunde sieht KEINE dispatcher-only-Felder', () => {
    expect(filterFelderByAudience(felder, 'kunde').map((f) => f.feld_key)).toEqual([
      'vorname', 'schadentyp',
    ])
  })
  it('Dispatcher sieht alle Felder', () => {
    expect(filterFelderByAudience(felder, 'dispatcher').map((f) => f.feld_key)).toEqual([
      'vorname', 'schadentyp', 'whatsapp_verfuegbar', 'sprache', 'notiz',
      'aufklaerung_teilschuld_bestaetigt', 'disqualifiziert', 'disqualifiziert_grund',
    ])
  })
})
