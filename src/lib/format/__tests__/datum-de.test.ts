import { describe, it, expect } from 'vitest'
import { formatiereDatumEingabe, deZuIso, isoZuDe, istUnvollstaendigeEingabe } from '../datum-de'

describe('formatiereDatumEingabe', () => {
  it.each([
    ['1', '1'],
    ['15', '15'],
    ['150', '15.0'],
    ['1503', '15.03'],
    ['150320', '15.03.20'],
    ['15032026', '15.03.2026'],
  ])('setzt die Punkte beim Tippen (%s → %s)', (roh, erwartet) => {
    expect(formatiereDatumEingabe(roh)).toBe(erwartet)
  })

  it('ignoriert bereits getippte Punkte und Buchstaben', () => {
    expect(formatiereDatumEingabe('15.03.2026')).toBe('15.03.2026')
    expect(formatiereDatumEingabe('15a03b2026')).toBe('15.03.2026')
  })

  it('kappt ueberzaehlige Ziffern', () => {
    expect(formatiereDatumEingabe('150320269999')).toBe('15.03.2026')
  })

  it('leere Eingabe bleibt leer', () => {
    expect(formatiereDatumEingabe('')).toBe('')
  })
})

describe('deZuIso', () => {
  it('wandelt ein vollstaendiges Datum', () => {
    expect(deZuIso('15.03.2026')).toBe('2026-03-15')
  })

  it('akzeptiert einstellige Tage/Monate', () => {
    expect(deZuIso('5.3.2026')).toBe('2026-03-05')
  })

  it.each(['', '15.03', '15.03.26', 'quatsch', '2026-03-15'])(
    'liefert null bei unvollstaendiger Eingabe (%s)',
    (roh) => {
      expect(deZuIso(roh)).toBeNull()
    },
  )

  // Ein Datum, das sich tippen laesst, muss es noch lange nicht geben.
  it.each(['31.02.2026', '32.01.2026', '15.13.2026', '00.03.2026'])(
    'weist nicht existierende Daten ab (%s)',
    (roh) => {
      expect(deZuIso(roh)).toBeNull()
    },
  )

  it('kennt Schaltjahre', () => {
    expect(deZuIso('29.02.2024')).toBe('2024-02-29')
    expect(deZuIso('29.02.2026')).toBeNull()
  })
})

describe('isoZuDe', () => {
  it('wandelt zurueck', () => {
    expect(isoZuDe('2026-03-15')).toBe('15.03.2026')
  })

  it('vertraegt einen vollen Zeitstempel', () => {
    expect(isoZuDe('2026-03-15T10:30:00.000Z')).toBe('15.03.2026')
  })

  it.each([null, undefined, '', 'quatsch'])('liefert leer bei %s', (roh) => {
    expect(isoZuDe(roh)).toBe('')
  })
})

describe('Rundlauf', () => {
  it.each(['01.01.2020', '29.02.2024', '31.12.2026'])('de → iso → de bleibt gleich (%s)', (de) => {
    const iso = deZuIso(de)
    expect(iso).not.toBeNull()
    expect(isoZuDe(iso)).toBe(de)
  })
})

// ⚠ Regel-4-Prod-Smoke 13.08.: Die erste Fassung strippte alle Trennzeichen und
// gruppierte stur 2-2-4 — aus "3.4.2026" wurde "34.20.26", deZuIso verwarf das,
// und das Datum ging STILL verloren. Diese Gruppe haelt den Fall fest.
describe('formatiereDatumEingabe — vom Nutzer gesetzte Trennzeichen', () => {
  it.each([
    ['3.4.2026', '3.4.2026'],
    ['15.03.2026', '15.03.2026'],
    ['03/04/2026', '03.04.2026'],
    ['3-4-2026', '3.4.2026'],
  ])('respektiert die Gruppen des Nutzers: %s → %s', (roh, erwartet) => {
    expect(formatiereDatumEingabe(roh)).toBe(erwartet)
  })

  it('die getippte Eingabe bleibt ein speicherbares Datum', () => {
    // Der eigentliche Schaden war nicht die Anzeige, sondern der Verlust:
    // "34.20.26" ergab null und wurde nie geschrieben.
    expect(deZuIso(formatiereDatumEingabe('3.4.2026'))).toBe('2026-04-03')
  })

  it.each([
    ['3.', '3.'],
    ['3.4', '3.4'],
    ['3.4.', '3.4.'],
  ])('paddet waehrend des Tippens nicht (%s bleibt %s)', (roh, erwartet) => {
    expect(formatiereDatumEingabe(roh)).toBe(erwartet)
  })

  it('gruppiert reine Ziffernfolgen weiterhin automatisch', () => {
    expect(formatiereDatumEingabe('15032026')).toBe('15.03.2026')
  })

  it('ignoriert alles ab der vierten Gruppe — ein Datum hat drei Teile', () => {
    expect(formatiereDatumEingabe('1.2.2026.9')).toBe('1.2.2026')
  })
})

// Zweiter Anlauf derselben Bug-Klasse (13.08.): auto-speichernde Felder (InlineEditField
// in der Fallakte) speichern bei BLUR. Dort heisst ein leerer ISO-Wert zweierlei —
// „geleert" oder „noch am Tippen". Ohne Unterscheidung nimmt ein Klick neben das Feld
// das Datum weg, waehrend der Nutzer seinen Text noch davor stehen sieht.
describe('istUnvollstaendigeEingabe — schuetzt auto-speichernde Felder', () => {
  it('leeres Feld ist NICHT unvollstaendig (Loeschen muss erlaubt bleiben)', () => {
    expect(istUnvollstaendigeEingabe('')).toBe(false)
    expect(istUnvollstaendigeEingabe('   ')).toBe(false)
  })

  it('Zwischenstaende beim Tippen sind unvollstaendig', () => {
    expect(istUnvollstaendigeEingabe('1')).toBe(true)
    expect(istUnvollstaendigeEingabe('15.03.')).toBe(true)
    expect(istUnvollstaendigeEingabe('15.03.202')).toBe(true)
  })

  it('ein vollstaendiges Datum ist nicht unvollstaendig — auch einstellig', () => {
    expect(istUnvollstaendigeEingabe('15.03.2026')).toBe(false)
    expect(istUnvollstaendigeEingabe('3.4.2026')).toBe(false)
  })

  it('ein UNMOEGLICHES Datum gilt als unvollstaendig — es darf nichts ueberschreiben', () => {
    // 31.02. laesst sich tippen, existiert aber nicht. Es als "fertig" zu behandeln
    // wuerde den gespeicherten Wert mit Leere ueberschreiben.
    expect(istUnvollstaendigeEingabe('31.02.2026')).toBe(true)
  })
})
