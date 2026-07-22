import { describe, it, expect } from 'vitest'
import { normalizeWhatsappNummer } from '../whatsapp-nummer'

// T2 (operativer-schaden-flow): FM-WhatsApp-Nummer-Eingabe normalisieren.
// Leeres Feld -> null (Loeschen erlaubt). Sonst E.164 (reuse normalizeE164),
// Formatierungszeichen tolerant, zu kurz/Buchstaben -> Fehler.
describe('normalizeWhatsappNummer', () => {
  it('leer -> null (Feld leeren erlaubt)', () => {
    expect(normalizeWhatsappNummer('')).toEqual({ ok: true, value: null })
  })
  it('nur Whitespace -> null', () => {
    expect(normalizeWhatsappNummer('   ')).toEqual({ ok: true, value: null })
  })
  it('deutsche 0-Nummer -> +49', () => {
    expect(normalizeWhatsappNummer('0163 3628571')).toEqual({ ok: true, value: '+491633628571' })
  })
  it('bereits +E.164 bleibt unveraendert', () => {
    expect(normalizeWhatsappNummer('+491633628571')).toEqual({ ok: true, value: '+491633628571' })
  })
  it('Formatierungszeichen (Klammern/Bindestrich/Punkt) werden entfernt', () => {
    expect(normalizeWhatsappNummer('+49 (163) 362-8571')).toEqual({ ok: true, value: '+491633628571' })
  })
  it('00-Praefix -> +', () => {
    expect(normalizeWhatsappNummer('0049 163 3628571')).toEqual({ ok: true, value: '+491633628571' })
  })
  it('zu kurz -> Fehler', () => {
    expect(normalizeWhatsappNummer('123').ok).toBe(false)
  })
  it('Buchstaben -> Fehler', () => {
    expect(normalizeWhatsappNummer('kein-telefon').ok).toBe(false)
  })
})
