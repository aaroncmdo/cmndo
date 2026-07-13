import { describe, it, expect } from 'vitest'
import { deriveVermittler } from './vermittler'

// #8 Vermittler-SSoT Phase 2: genau EIN Vermittler (INBOUND) pro Claim = genau EINE Provision.
// Praezedenz identisch zum Phase-1-Backfill UND zu den 3 Provisions-Triggern (create_makler_/
// werkstatt_/firmen_flotte_provision): makler > werkstatt-inbound > firmen_flotte > keiner.
// INBOUND = wer uns den Claim gebracht hat. NIE outbound (reparatur_werkstatt_id / sv_id).

describe('deriveVermittler', () => {
  it('makler_id gesetzt -> makler (hoechste Praezedenz)', () => {
    expect(deriveVermittler({ maklerId: 'm1', werkstattId: null, flotteKontoId: null })).toEqual({
      vermittlerTyp: 'makler',
      vermittlerId: 'm1',
    })
  })

  it('nur werkstatt_id (inbound) -> werkstatt', () => {
    expect(deriveVermittler({ maklerId: null, werkstattId: 'w1', flotteKontoId: null })).toEqual({
      vermittlerTyp: 'werkstatt',
      vermittlerId: 'w1',
    })
  })

  it('nur aktives Flotten-Konto -> firmen_flotte', () => {
    expect(deriveVermittler({ maklerId: null, werkstattId: null, flotteKontoId: 'k1' })).toEqual({
      vermittlerTyp: 'firmen_flotte',
      vermittlerId: 'k1',
    })
  })

  it('keiner gesetzt -> kein Vermittler (null)', () => {
    expect(deriveVermittler({ maklerId: null, werkstattId: null, flotteKontoId: null })).toEqual({
      vermittlerTyp: null,
      vermittlerId: null,
    })
  })

  it('Praezedenz: makler schlaegt werkstatt UND flotte', () => {
    expect(deriveVermittler({ maklerId: 'm1', werkstattId: 'w1', flotteKontoId: 'k1' })).toEqual({
      vermittlerTyp: 'makler',
      vermittlerId: 'm1',
    })
  })

  it('Praezedenz: werkstatt schlaegt flotte', () => {
    expect(deriveVermittler({ maklerId: null, werkstattId: 'w1', flotteKontoId: 'k1' })).toEqual({
      vermittlerTyp: 'werkstatt',
      vermittlerId: 'w1',
    })
  })
})
