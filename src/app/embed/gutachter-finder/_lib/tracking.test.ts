import { describe, it, expect } from 'vitest'
import { reservierungConversion, rueckrufConversion } from './tracking'

// AAR-956: lockt die Conversion-Werte (reservierter Termin = 150 €, Rückruf = 25 €) + den
// Bag-Vertrag. Der 150er-Wert weicht BEWUSST von Monikas haftpflicht-Lead (100 €) ab — dieser
// Test verhindert ein stilles "Re-Sync auf 100".
describe('reservierungConversion (reservierter Termin)', () => {
  it('Wert 150 EUR, schadenart haftpflicht, lead_id durchgereicht', () => {
    const bag = reservierungConversion({ leadId: 'lead-1' })
    expect(bag.value).toBe(150)
    expect(bag.currency).toBe('EUR')
    expect(bag.schadenart).toBe('haftpflicht')
    expect(bag.lead_id).toBe('lead-1')
  })

  it('laesst lead_id weg wenn leer (kein Dedupe-Merge id-loser Conversions)', () => {
    const bag = reservierungConversion({})
    expect('lead_id' in bag).toBe(false)
    expect(bag.value).toBe(150)
  })

  it('user_data: Telefon E.164-normalisiert + Email lowercase (Enhanced Conversions)', () => {
    const bag = reservierungConversion({ leadId: 'l', telefon: '0170 1234567', email: 'A@B.de' })
    const ud = bag.user_data as Record<string, unknown>
    expect(ud.phone_number).toBe('+491701234567')
    expect(ud.email).toBe('a@b.de')
  })
})

describe('rueckrufConversion (Rückruf = Beratungsgespräch)', () => {
  it('Wert 25 EUR, schadenart schadensberatung (= Monika)', () => {
    const bag = rueckrufConversion({ leadId: 'l' })
    expect(bag.value).toBe(25)
    expect(bag.currency).toBe('EUR')
    expect(bag.schadenart).toBe('schadensberatung')
  })
})
