import { describe, it, expect } from 'vitest'
import { pruefeSchuldfrage, SCHULDFRAGE_DEEPLINK } from './schuldfrage'

// Der teuerste Fehler waere hier NICHT ein abgelehnter gueltiger Wert (dann fragt der
// Wizard eben nach), sondern ein DURCHGELASSENER ungueltiger: `teilschuld` oder
// `eigenverantwortung` wuerden beim Promote gfa->lead die CHECK-Constraint verletzen und
// damit die gesamte Flowlink-Ausstellung scheitern lassen — nicht nur dieses eine Feld.
// Deshalb liegt das Gewicht der Faelle unten auf dem Ablehnen.

describe('pruefeSchuldfrage', () => {
  it('nimmt die beiden kanonischen Werte an', () => {
    expect(pruefeSchuldfrage('gegner')).toBe('gegner')
    expect(pruefeSchuldfrage('unklar')).toBe('unklar')
  })

  it('ist tolerant bei Schreibweise und Leerzeichen — eine KI formuliert nicht normiert', () => {
    expect(pruefeSchuldfrage('Gegner')).toBe('gegner')
    expect(pruefeSchuldfrage('  UNKLAR  ')).toBe('unklar')
  })

  it('uebersetzt das Vokabular der eigenen Berater-API', () => {
    // /api/v1/pruefe-anspruch nimmt `unverschuldet` — ein Assistent, der erst den Anspruch
    // prueft und dann den Buchungslink baut, reicht diesen Wert folgerichtig weiter.
    expect(pruefeSchuldfrage('unverschuldet')).toBe('gegner')
    expect(pruefeSchuldfrage('fremdverschulden')).toBe('gegner')
    expect(pruefeSchuldfrage('strittig')).toBe('unklar')
  })

  it('lehnt Werte ab, die `leads` nicht kennt — sonst braeche der Lead-Insert', () => {
    // In `gutachter_finder_anfragen` erlaubt, in `leads` NICHT:
    expect(pruefeSchuldfrage('teilschuld')).toBeNull()
    // Umgekehrt: in `leads` erlaubt, aber als Deeplink-Wert bewusst ausgeschlossen —
    // Selbstverschulden ist ein Kasko-Fall und gehoert ins Beratungsgespraech.
    expect(pruefeSchuldfrage('eigenverantwortung')).toBeNull()
    expect(pruefeSchuldfrage('selbst')).toBeNull()
  })

  it('lehnt Unfug ab, ohne zu werfen', () => {
    expect(pruefeSchuldfrage('')).toBeNull()
    expect(pruefeSchuldfrage('   ')).toBeNull()
    expect(pruefeSchuldfrage('DROP TABLE leads')).toBeNull()
    expect(pruefeSchuldfrage(undefined)).toBeNull()
    expect(pruefeSchuldfrage(null)).toBeNull()
    expect(pruefeSchuldfrage(42)).toBeNull()
    expect(pruefeSchuldfrage(['gegner'])).toBeNull()
  })

  it('gibt ausschliesslich Werte aus der kanonischen Liste zurueck', () => {
    // Schuetzt gegen einen Alias, der versehentlich auf einen Wert zeigt, den `leads`
    // nicht kennt — der Tippfehler waere sonst erst beim Insert auf prod sichtbar.
    const eingaben = ['gegner', 'unklar', 'unverschuldet', 'gegnerisch', 'fremdverschulden', 'offen', 'strittig']
    for (const e of eingaben) {
      const r = pruefeSchuldfrage(e)
      expect(r, `Alias "${e}" muss auf einen kanonischen Wert zeigen`).not.toBeNull()
      expect(SCHULDFRAGE_DEEPLINK).toContain(r!)
    }
  })
})
