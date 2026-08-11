import { describe, it, expect } from 'vitest'
import { buildIntakeSystemPrompt } from './prompt'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

const F = (o: Partial<IntakeFeld>): IntakeFeld => ({
  feld_key: 'unfallhergang',
  typ: 'text',
  label: 'Unfallhergang',
  hint: null,
  optionen: null,
  pflicht: true,
  sektion: 'unfall',
  spalte: 'unfallhergang',
  ...o,
})

describe('buildIntakeSystemPrompt', () => {
  it('nennt den Firmennamen als Persona', () => {
    const p = buildIntakeSystemPrompt({ firmenname: 'KFZ Mueller', schema: [F({})], bekannt: {} })
    expect(p).toContain('KFZ Mueller')
  })
  it('faellt ohne Firmennamen auf Claimondo zurueck', () => {
    const p = buildIntakeSystemPrompt({ firmenname: null, schema: [F({})], bekannt: {} })
    expect(p).toContain('Claimondo')
  })
  it('listet noch leere Felder, bereits gefuellte nicht mehr', () => {
    const schema = [
      F({ feld_key: 'unfallhergang' }),
      F({ feld_key: 'unfallort', label: 'Unfallort', spalte: 'unfallort' }),
    ]
    const p = buildIntakeSystemPrompt({ firmenname: null, schema, bekannt: { unfallhergang: 'x' } })
    expect(p).toContain('Unfallort')
    expect(p).not.toContain('- Unfallhergang')
  })

  // Prod-Smoke 11.08.: die Feststellungs-Felder sind in onboarding_felder fast
  // durchgaengig pflicht=false. Filterte der Prompt auf pflicht, sah das Modell eine
  // leere Feldliste und extrahierte NICHTS — der Kunde erzaehlte, nichts landete in
  // der Akte. Optionale Felder MUESSEN gelistet werden.
  it('listet auch optionale (pflicht=false) Felder', () => {
    const schema = [F({ feld_key: 'unfallort', label: 'Unfallort', spalte: 'unfallort', pflicht: false })]
    const p = buildIntakeSystemPrompt({ firmenname: null, schema, bekannt: {} })
    expect(p).toContain('Unfallort')
    expect(p).not.toContain('(alle Angaben liegen vor)')
  })

  // Prod-Smoke 11.08.: das Modell lieferte unfalldatum="gestern" -> Postgres
  // "invalid input syntax for type date" -> der GANZE Turn ging verloren.
  it('verlangt ISO-Datum und nennt das heutige Datum', () => {
    const p = buildIntakeSystemPrompt({
      firmenname: null,
      schema: [F({ feld_key: 'unfalldatum', label: 'Unfalldatum', spalte: 'unfalldatum' })],
      bekannt: {},
      heute: '2026-08-11',
    })
    expect(p).toContain('YYYY-MM-DD')
    expect(p).toContain('2026-08-11')
  })

  it('markiert Pflichtfelder als [PFLICHT]', () => {
    const schema = [
      F({ feld_key: 'unfallort', label: 'Unfallort', spalte: 'unfallort', pflicht: true }),
      F({ feld_key: 'zeugen', label: 'Zeugen', spalte: 'zeugen', pflicht: false }),
    ]
    const p = buildIntakeSystemPrompt({ firmenname: null, schema, bekannt: {} })
    expect(p).toContain('Unfallort [PFLICHT]')
    expect(p).toContain('- Zeugen (feld_key: zeugen')
    expect(p).not.toContain('Zeugen [PFLICHT]')
  })
})
