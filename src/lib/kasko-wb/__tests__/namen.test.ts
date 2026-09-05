// src/lib/kasko-wb/__tests__/namen.test.ts — Namens-Abgleich der Wissensbasis (Phase 2, Task 4)
import { describe, it, expect } from 'vitest'
import { normalisiereName, waehleTreffer } from '../namen'

describe('normalisiereName', () => {
  it('klein, ohne Rechtsform, Bindestriche/Leerzeichen egal', () => {
    expect(normalisiereName('HUK-COBURG')).toBe('hukcoburg')
    expect(normalisiereName('Huk Coburg Versicherung AG')).toBe('hukcoburg')
    expect(normalisiereName('  Allianz Direct ')).toBe('allianzdirect')
    expect(normalisiereName('Classic SELECT')).toBe('classicselect')
  })
  it('Umlaute werden aufgeloest, nicht geloescht', () => {
    expect(normalisiereName('Württembergische')).toBe('wuerttembergische')
    expect(normalisiereName('Gothaer Kfz-Versicherung')).toBe('gothaer')
  })
})

describe('waehleTreffer', () => {
  const k = [{ name: 'HUK-COBURG' }, { name: 'HUK24' }, { name: 'Allianz' }, { name: 'Allianz Direct' }]
  it('exakter Treffer gewinnt vor Teiltreffer', () => {
    expect(waehleTreffer(k, 'Allianz')).toEqual({ status: 'eindeutig', treffer: { name: 'Allianz' } })
    expect(waehleTreffer(k, 'allianz versicherung ag')).toEqual({ status: 'eindeutig', treffer: { name: 'Allianz' } })
  })
  it('ein Teiltreffer ist eindeutig', () => {
    expect(waehleTreffer(k, 'coburg')).toEqual({ status: 'eindeutig', treffer: { name: 'HUK-COBURG' } })
    expect(waehleTreffer(k, 'Allianz Direct Versicherung')).toEqual({ status: 'eindeutig', treffer: { name: 'Allianz Direct' } })
  })
  it('mehrere Teiltreffer sind mehrdeutig — nie raten', () => {
    const r = waehleTreffer(k, 'huk')
    expect(r.status).toBe('mehrdeutig')
    if (r.status === 'mehrdeutig') expect(r.kandidaten.map((x) => x.name)).toEqual(['HUK-COBURG', 'HUK24'])
  })
  it('kein Treffer, auch bei leerer Eingabe', () => {
    expect(waehleTreffer(k, 'Gothaer')).toEqual({ status: 'kein_treffer' })
    expect(waehleTreffer(k, '')).toEqual({ status: 'kein_treffer' })
    expect(waehleTreffer(k, 'AG')).toEqual({ status: 'kein_treffer' })
  })
})
