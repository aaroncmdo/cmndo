import { describe, it, expect } from 'vitest'
import { formatiereDatumEingabe, deZuIso, isoZuDe } from '../datum-de'

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
