import { describe, it, expect } from 'vitest'
import { berechneQcAutoChecks, slotVorhanden, SA_SLOTS, VOLLMACHT_SLOTS } from './auto-checks'

const P = (slot: string, vorhanden: boolean) => ({ slot_id: slot, vorhanden })

describe('slotVorhanden', () => {
  it('true wenn EIN passender Slot vorhanden ist', () => {
    expect(slotVorhanden([P('halter_vollmacht', true)], VOLLMACHT_SLOTS)).toBe(true)
    expect(slotVorhanden([P('sa_vollmacht', true)], SA_SLOTS)).toBe(true)
  })
  it('false wenn passender Slot existiert aber nicht vorhanden', () => {
    expect(slotVorhanden([P('halter_vollmacht', false)], VOLLMACHT_SLOTS)).toBe(false)
  })
  it('false wenn kein passender Slot in der Liste', () => {
    expect(slotVorhanden([P('schadensfotos', true)], VOLLMACHT_SLOTS)).toBe(false)
    expect(slotVorhanden([], SA_SLOTS)).toBe(false)
  })
})

describe('berechneQcAutoChecks', () => {
  it('leitet gutachten_vorhanden aus gutachtenUrlVorhanden ab', () => {
    expect(berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: null, pflichtItems: [] }).gutachten_vorhanden).toBe(true)
    expect(berechneQcAutoChecks({ gutachtenUrlVorhanden: false, vorschaedenGeprueft: null, pflichtItems: [] }).gutachten_vorhanden).toBe(false)
  })

  it('leitet sa_vorhanden + vollmacht_vorhanden aus pflichtItems ab', () => {
    const r = berechneQcAutoChecks({
      gutachtenUrlVorhanden: true,
      vorschaedenGeprueft: null,
      pflichtItems: [P('sa_vollmacht', true), P('halter_vollmacht', true)],
    })
    expect(r.sa_vorhanden).toBe(true)
    expect(r.vollmacht_vorhanden).toBe(true)
  })

  it('vorschaeden_beruecksichtigt: abgeleitet wenn geprueft true/false, ABSENT wenn null', () => {
    expect(berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: true, pflichtItems: [] }).vorschaeden_beruecksichtigt).toBe(true)
    expect(berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: false, pflichtItems: [] }).vorschaeden_beruecksichtigt).toBe(false)
    expect('vorschaeden_beruecksichtigt' in berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: null, pflichtItems: [] })).toBe(false)
  })

  it('leitet NUR die sicheren Felder ab — fin/kundendaten/gutachten_vollstaendig/fotos/positionen bleiben offen', () => {
    const r = berechneQcAutoChecks({ gutachtenUrlVorhanden: true, vorschaedenGeprueft: true, pflichtItems: [P('sa_vollmacht', true)] })
    for (const offen of ['fin_17_zeichen', 'kundendaten_vollstaendig', 'gutachten_vollstaendig', 'fotos_ausreichend', 'schadenspositionen_erfasst']) {
      expect(offen in r).toBe(false)
    }
  })
})
