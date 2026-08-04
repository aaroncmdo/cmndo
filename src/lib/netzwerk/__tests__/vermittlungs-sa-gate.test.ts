import { describe, it, expect } from 'vitest'
import { istAnonymerVermittlungsSaKandidat } from '../vermittlungs-sa-gate'

const basis = {
  sourceChannel: 'gutachter-vermittlung',
  saUnterschrieben: false as boolean | null,
  geschaedigterUserId: null as string | null,
  abrechnungsweg: 'haftpflicht' as string | null,
}

describe('istAnonymerVermittlungsSaKandidat', () => {
  it('frischer Vermittlungs-Claim (SA offen, kein Account) -> Fokus-SA', () => {
    expect(istAnonymerVermittlungsSaKandidat(basis)).toBe(true)
  })

  it('anderer source_channel -> nein (voller Wizard bleibt)', () => {
    expect(istAnonymerVermittlungsSaKandidat({ ...basis, sourceChannel: 'gutachter-finder' })).toBe(false)
    expect(istAnonymerVermittlungsSaKandidat({ ...basis, sourceChannel: null })).toBe(false)
  })

  it('SA schon unterschrieben -> nein (regulaere Pfade greifen)', () => {
    expect(istAnonymerVermittlungsSaKandidat({ ...basis, saUnterschrieben: true })).toBe(false)
    expect(istAnonymerVermittlungsSaKandidat({ ...basis, saUnterschrieben: null })).toBe(false)
  })

  it('Account existiert schon -> nein (der eingeloggte Zweig besitzt den Fall)', () => {
    expect(istAnonymerVermittlungsSaKandidat({ ...basis, geschaedigterUserId: 'user-1' })).toBe(false)
  })

  it('Werkstatt-Reparatur-Weg -> nein (J4/J5: SA ist dort nicht der Gate)', () => {
    expect(istAnonymerVermittlungsSaKandidat({ ...basis, abrechnungsweg: 'kasko' })).toBe(false)
    expect(istAnonymerVermittlungsSaKandidat({ ...basis, abrechnungsweg: 'selbstzahler' })).toBe(false)
  })
})
