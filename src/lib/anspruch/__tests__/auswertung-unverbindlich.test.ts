import { describe, it, expect } from 'vitest'
import { leseAuswertung } from '../auswertung-unverbindlich'

// auswertung_unverbindlich ist jsonb OHNE Schema-Zwang: dort kann alles stehen, was je
// geschrieben wurde (auch von aelteren Code-Staenden). Der Leser muss jede Ebene pruefen,
// statt zu casten — sonst wirft die Anzeige beim ersten unerwarteten Wert.

describe('leseAuswertung', () => {
  it('liefert null fuer alles, was keine verwertbare Auswertung ist', () => {
    expect(leseAuswertung(null)).toBeNull()
    expect(leseAuswertung(undefined)).toBeNull()
    expect(leseAuswertung('voll')).toBeNull()
    expect(leseAuswertung(42)).toBeNull()
    // Array ist typeof 'object'. Positivkontrolle gefahren: dieser Fall bleibt auch OHNE
    // den Array.isArray-Guard gruen — ein Array hat keine tier-Property, der tier-Check
    // faengt ihn also schon. Der Guard ist Defense-in-Depth, NICHT von hier abgesichert.
    expect(leseAuswertung([{ tier: 'voll' }])).toBeNull()
    // Objekt ohne tier: nichts anzuzeigen
    expect(leseAuswertung({ quelle: 'anspruchspruefung' })).toBeNull()
    // tier vorhanden, aber kein String. DAS sichert dieser Fall wirklich ab:
    // tier-Check ausgehebelt -> dieser Test wird rot (verifiziert).
    expect(leseAuswertung({ tier: 7 })).toBeNull()
  })

  it('uebersetzt tier und Antworten in Klartext', () => {
    const a = leseAuswertung({
      quelle: 'anspruchspruefung',
      tier: 'voll',
      erstellt_am: '2026-08-30T20:12:42Z',
      antworten: { schuld: 'gegner', unfall_her: 'bis_monat', gutachten: 'versicherung' },
    })
    expect(a).not.toBeNull()
    expect(a!.tierLabel).toContain('Vollanspruch')
    expect(a!.antwortZeilen).toHaveLength(3)
    expect(a!.antwortZeilen).toContain('Schuld: der Unfallgegner')
    expect(a!.erstelltAm).toBe('30.08.2026')
  })

  it('markiert den zeitkritischen Fall: die Gegner-VS will einen eigenen Gutachter', () => {
    const ja = leseAuswertung({ tier: 'voll', antworten: { gutachten: 'versicherung' } })
    expect(ja!.gegnerVsWillGutachter).toBe(true)
    const nein = leseAuswertung({ tier: 'voll', antworten: { gutachten: 'nein' } })
    expect(nein!.gegnerVsWillGutachter).toBe(false)
    // ohne Antworten darf es nicht faelschlich true werden
    expect(leseAuswertung({ tier: 'voll' })!.gegnerVsWillGutachter).toBe(false)
  })

  it('haelt teils (quote) von unklar (pruefen) getrennt', () => {
    // Der Grund, warum die Rohantworten mitgespeichert werden: leads.schuldfrage traegt
    // fuer BEIDE 'unklar' (CHECK-Constraint kennt kein 'teils').
    expect(leseAuswertung({ tier: 'quote', antworten: { schuld: 'teils' } })!.tierLabel)
      .toContain('Teilschuld')
    expect(leseAuswertung({ tier: 'pruefen', antworten: { schuld: 'unklar' } })!.tierLabel)
      .toContain('offen')
  })

  it('uebersteht unbekannte und kaputte Werte, statt zu werfen', () => {
    const a = leseAuswertung({
      tier: 'ein-neuer-tier',
      erstellt_am: 'kein-datum',
      antworten: { schuld: 'voellig-neu', unbekanntes_feld: 'x', zahl: 5 },
    })
    expect(a).not.toBeNull()
    // unbekannter tier faellt auf den Rohwert zurueck (kein leeres Label)
    expect(a!.tierLabel).toBe('ein-neuer-tier')
    // unbekannte Antworten werden weggelassen, nicht roh angezeigt
    expect(a!.antwortZeilen).toEqual([])
    expect(a!.erstelltAm).toBeNull()
  })
})
