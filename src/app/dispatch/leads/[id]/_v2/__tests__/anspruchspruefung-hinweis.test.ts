// Phase 2, Task 8: pure Formatierung der unverbindlichen Selbst-Auswertung fuer den Dispatch.
import { describe, it, expect } from 'vitest'
import { formatiereAuswertung } from '../DispatchAnspruchspruefungHinweis'

describe('formatiereAuswertung', () => {
  it('Tier + Antworten in Dispatcher-Sprache, Datum in Europe/Berlin', () => {
    expect(
      formatiereAuswertung({
        quelle: 'anspruchspruefung',
        tier: 'kasko',
        erstellt_am: '2026-09-05T10:00:00Z',
        antworten: { schuld: 'selbst', unfall_her: 'unter_woche', gutachten: 'nein' },
      }),
    ).toEqual({
      tier: 'Kasko (Eigenverschulden)',
      zeilen: ['Schuld: Ich war (haupt)schuld', 'Unfall: vor weniger als einer Woche', 'Gutachten: noch keins'],
      datum: '05.09.2026',
    })
  })
  it('unbekannte Felder und Werte werden roh gezeigt, nichts wird erfunden', () => {
    const r = formatiereAuswertung({ tier: 'voll', antworten: { schuld: 'gegner', foo: 'bar' } })
    expect(r?.tier).toBe('Vollanspruch (unverschuldet)')
    expect(r?.zeilen).toEqual(['Schuld: Der Gegner', 'foo: bar'])
    expect(r?.datum).toBeNull()
  })
  it('leer/null/kaputt -> null (Card rendert nicht)', () => {
    expect(formatiereAuswertung(null)).toBeNull()
    expect(formatiereAuswertung('x')).toBeNull()
    expect(formatiereAuswertung({})).toBeNull()
    expect(formatiereAuswertung({ antworten: {} })).toBeNull()
  })
})
