import { describe, it, expect } from 'vitest'
import { scanErhebtFelder } from '../flow-erhebt-felder-scan.mjs'

const defaults = { kennzeichen: false, hat_vorschaeden: true, unfallort: false, schadentyp: false }

describe('scanErhebtFelder', () => {
  it('sauber -> keine Verletzer', () => {
    expect(scanErhebtFelder([{ step_id: 'x', erhebt_felder: ['kennzeichen', 'unfallort'] }], defaults)).toEqual([])
  })
  it('DB-Default -> Verletzer (der Symptom-1-Fall)', () => {
    expect(scanErhebtFelder([{ step_id: 'x', erhebt_felder: ['hat_vorschaeden'] }], defaults)).toEqual([
      'x:hat_vorschaeden:hat-default',
    ])
  })
  it('abgeleitetes *_effektiv -> Verletzer (der Symptom-2-Fall)', () => {
    expect(scanErhebtFelder([{ step_id: 'x', erhebt_felder: ['fahrzeug_standort_effektiv'] }], defaults)).toEqual([
      'x:fahrzeug_standort_effektiv:abgeleitet',
    ])
  })
  it('unbekannte Spalte -> Verletzer (Tippfehler)', () => {
    expect(scanErhebtFelder([{ step_id: 'x', erhebt_felder: ['tippfehler'] }], defaults)).toEqual([
      'x:tippfehler:unbekannte-spalte',
    ])
  })
  it('mehrere Steps + leere/fehlende erhebt_felder -> ignoriert', () => {
    expect(
      scanErhebtFelder(
        [
          { step_id: 'a', erhebt_felder: [] },
          { step_id: 'b' },
          { step_id: 'c', erhebt_felder: ['schadentyp'] },
        ],
        defaults,
      ),
    ).toEqual([])
  })
})
