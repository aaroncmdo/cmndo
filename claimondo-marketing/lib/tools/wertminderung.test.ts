import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeWertminderung, WM_FAKTOREN } from './wertminderung'

describe('computeWertminderung', () => {
  it('reproduziert die Tabellen-Beispiele (Alter 1, 10.000 EUR -> 2.500 EUR)', () => {
    const r = computeWertminderung({ reparaturkosten: 10000, alterJahre: 1 })
    expect(r).toMatchObject({ kind: 'schaetzung', betrag: 2500, pct: 0.25 })
  })
  it('Faktor je Alter (2->20%, 3->15%, 4->10%)', () => {
    expect(computeWertminderung({ reparaturkosten: 10000, alterJahre: 2 })).toMatchObject({ betrag: 2000 })
    expect(computeWertminderung({ reparaturkosten: 10000, alterJahre: 3 })).toMatchObject({ betrag: 1500 })
    expect(computeWertminderung({ reparaturkosten: 10000, alterJahre: 4 })).toMatchObject({ betrag: 1000 })
  })
  it('ab Jahr 5 -> einzelfall (kein Betrag)', () => {
    const r = computeWertminderung({ reparaturkosten: 10000, alterJahre: 6 })
    expect(r.kind).toBe('einzelfall')
    expect(r.hinweise).toContain('einzelfall_alter')
  })
  it('erheblicher Vorschaden -> einzelfall, dominiert selbst Alter 1', () => {
    const r = computeWertminderung({ reparaturkosten: 10000, alterJahre: 1, vorschaden: 'erheblich' })
    expect(r.kind).toBe('einzelfall')
    expect(r.hinweise).toContain('einzelfall_vorschaden')
  })
  it('reparierter Vorschaden -> schaetzung + Hinweis', () => {
    const r = computeWertminderung({ reparaturkosten: 10000, alterJahre: 1, vorschaden: 'repariert' })
    expect(r.kind).toBe('schaetzung')
    expect(r.hinweise).toContain('vorschaden_repariert')
  })
  it('fehlende Inputs -> unvollstaendig', () => {
    expect(computeWertminderung({ reparaturkosten: 0, alterJahre: 1 }).kind).toBe('unvollstaendig')
    expect(computeWertminderung({ reparaturkosten: 5000, alterJahre: NaN }).kind).toBe('unvollstaendig')
  })
  it('weiche Kontext-Hinweise (hohe km / kleiner Schaden)', () => {
    const r = computeWertminderung({ reparaturkosten: 4000, alterJahre: 2, km: 150000, wbw: 60000 })
    expect(r.hinweise).toEqual(expect.arrayContaining(['hohe_km', 'kleiner_schaden']))
  })
  it('rundet auf 50 EUR', () => {
    const r = computeWertminderung({ reparaturkosten: 3333, alterJahre: 1 }) // 25% = 833.25
    expect((r as { betrag: number }).betrag % 50).toBe(0)
  })
})

describe('Paritaet WM_FAKTOREN <-> de.json-Faustregel (Drift-Schutz)', () => {
  it('Faktoren stimmen mit der Tabelle ueberein', () => {
    const de = JSON.parse(readFileSync(new URL('../../i18n/messages/de.json', import.meta.url), 'utf8'))
    const rows = de.kfz_gutachter_wertminderung.faustregel as Array<{ jahr: string; faktor: string }>
    const numeric = rows
      .map((r) => ({ jahr: parseInt(r.jahr, 10), pct: r.faktor.includes('%') ? parseInt(r.faktor, 10) / 100 : null }))
      .filter((r) => r.pct != null)
    for (const row of numeric) {
      const f = WM_FAKTOREN.find((x) => x.maxJahr === row.jahr)
      expect(f?.pct, `Faktor fuer Jahr ${row.jahr}`).toBe(row.pct)
    }
    expect(rows.some((r) => !r.faktor.includes('%'))).toBe(true)
  })
})
