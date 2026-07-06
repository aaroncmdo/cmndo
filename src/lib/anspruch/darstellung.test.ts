import { describe, it, expect } from 'vitest'
import { darstellePositionen, schuldBotschaft } from './darstellung'
import type { AnspruchPosition } from './types'

const POSITIONEN: AnspruchPosition[] = [
  { typ: 'reparatur', label: 'Reparaturkosten', minEur: 1000, maxEur: 2000 },
  { typ: 'nutzungsausfall', label: 'Nutzungsausfall', minEur: 300, maxEur: 500 },
  { typ: 'gutachterkosten', label: 'Sachverständigenkosten', minEur: null, maxEur: null, gedecktDurchGegner: true },
  { typ: 'anwaltskosten', label: 'Anwaltskosten', minEur: null, maxEur: null, gedecktDurchGegner: true },
  { typ: 'kostenpauschale', label: 'Auslagenpauschale', minEur: 30, maxEur: 30 },
]

const artFuer = (r: ReturnType<typeof darstellePositionen>, typ: string) =>
  r.positionen.find((p) => p.key === typ)!.art

describe('darstellePositionen', () => {
  it('unverschuldet: gegner-gedeckte Posten -> gegner, Rest -> betrag; Summe = betrag-Positionen', () => {
    const r = darstellePositionen({ positionen: POSITIONEN, schuld: 'unverschuldet' }, 'Ihr möglicher Anspruch')
    expect(artFuer(r, 'reparatur')).toBe('betrag')
    expect(artFuer(r, 'nutzungsausfall')).toBe('betrag')
    expect(artFuer(r, 'gutachterkosten')).toBe('gegner')
    expect(artFuer(r, 'anwaltskosten')).toBe('gegner')
    expect(artFuer(r, 'kostenpauschale')).toBe('betrag')
    // 1000 + 300 + 30 = 1330 ; 2000 + 500 + 30 = 2530
    expect(r.gesamt.minEur).toBe(1330)
    expect(r.gesamt.maxEur).toBe(2530)
    expect(r.gesamt.label).toBe('Ihr möglicher Anspruch')
  })

  it('teilschuld verhaelt sich wie unverschuldet (gleiche Wert-Arten + Summe)', () => {
    const r = darstellePositionen({ positionen: POSITIONEN, schuld: 'teilschuld' }, 'Ihr möglicher Anspruch')
    expect(artFuer(r, 'gutachterkosten')).toBe('gegner')
    expect(r.gesamt.minEur).toBe(1330)
    expect(r.gesamt.maxEur).toBe(2530)
  })

  it('selbst: nur Fahrzeugschaden gedeckt, Rest ausgegraut; Summe = nur Reparatur; Kasko-Label', () => {
    const r = darstellePositionen({ positionen: POSITIONEN, schuld: 'selbst' }, 'Ihr möglicher Anspruch')
    expect(artFuer(r, 'reparatur')).toBe('betrag')
    expect(artFuer(r, 'nutzungsausfall')).toBe('nicht_gedeckt')
    expect(artFuer(r, 'gutachterkosten')).toBe('nicht_gedeckt')
    expect(artFuer(r, 'kostenpauschale')).toBe('nicht_gedeckt')
    // nur Reparatur zaehlt: 1000..2000
    expect(r.gesamt.minEur).toBe(1000)
    expect(r.gesamt.maxEur).toBe(2000)
    expect(r.gesamt.label).toBe('Fahrzeugschaden über Ihre Vollkasko')
    // Reparatur traegt den Kasko-/Selbstbeteiligungs-Hinweis
    expect(r.positionen.find((p) => p.key === 'reparatur')!.hinweis).toMatch(/Selbstbeteiligung/i)
  })

  it('kein schuld-Feld -> Fallback unverschuldet', () => {
    const r = darstellePositionen({ positionen: POSITIONEN }, 'X')
    expect(artFuer(r, 'gutachterkosten')).toBe('gegner')
    expect(r.gesamt.minEur).toBe(1330)
  })

  it('Positionsbetraege bleiben unveraendert (nur Darstellung verzweigt)', () => {
    const u = darstellePositionen({ positionen: POSITIONEN, schuld: 'unverschuldet' }, 'X')
    const s = darstellePositionen({ positionen: POSITIONEN, schuld: 'selbst' }, 'X')
    const rep = (r: typeof u) => r.positionen.find((p) => p.key === 'reparatur')!
    expect(rep(u).minEur).toBe(1000)
    expect(rep(s).minEur).toBe(1000) // identischer Betrag, nur andere Darstellung
  })
})

describe('schuldBotschaft', () => {
  it('unverschuldet -> Erfolg mit 0-Euro-Botschaft', () => {
    const b = schuldBotschaft('unverschuldet')
    expect(b.ton).toBe('erfolg')
    expect(b.titel).toMatch(/0 €/)
    expect(b.beleg).toMatch(/249/)
  })
  it('teilschuld -> neutral, anteilig', () => {
    const b = schuldBotschaft('teilschuld')
    expect(b.ton).toBe('neutral')
    expect(b.beleg).toMatch(/anteilig|Quote/i)
  })
  it('selbst -> Warnung, Kasko/Selbst', () => {
    const b = schuldBotschaft('selbst')
    expect(b.ton).toBe('warnung')
    expect(b.titel).toMatch(/Kasko/i)
  })
})
