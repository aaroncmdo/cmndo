import { describe, it, expect } from 'vitest'
import { groupFelderByTarget } from './group-felder-by-target'
import type { OnboardingFeld } from '@/components/onboarding/types'

// Test-Helper: minimaler OnboardingFeld mit den fuer die Gruppierung relevanten Feldern.
function feld(
  p: Pick<OnboardingFeld, 'feld_key' | 'typ' | 'db_target'>,
): OnboardingFeld {
  return {
    id: p.feld_key,
    phase_id: 'p',
    reihenfolge: 0,
    label: '',
    pflicht: false,
    ...p,
  } as OnboardingFeld
}

const NOW = () => '2026-06-01T00:00:00.000Z'

describe('groupFelderByTarget', () => {
  it('gruppiert Felder einer Tabelle in {spalte: wert}', () => {
    const felder = [
      feld({ feld_key: 'vorname', typ: 'text', db_target: { tabelle: 'leads', spalte: 'vorname' } }),
      feld({ feld_key: 'schuldfrage', typ: 'segmented', db_target: { tabelle: 'leads', spalte: 'schuldfrage' } }),
    ]
    const out = groupFelderByTarget(felder, { vorname: 'Max', schuldfrage: 'gegner' }, {
      allowedTables: new Set(['leads']),
      now: NOW,
    })
    expect(out).toEqual({ leads: { vorname: 'Max', schuldfrage: 'gegner' } })
  })

  it('trennt mehrere Ziel-Tabellen (GFA + leads)', () => {
    const felder = [
      feld({ feld_key: 'besichtigungsort', typ: 'text', db_target: { tabelle: 'gutachter_finder_anfragen', spalte: 'besichtigungsort_adresse' } }),
      feld({ feld_key: 'service_typ', typ: 'toggle-cards', db_target: { tabelle: 'leads', spalte: 'service_typ' } }),
    ]
    const out = groupFelderByTarget(felder, { besichtigungsort: 'Köln', service_typ: 'komplett' }, {
      allowedTables: new Set(['gutachter_finder_anfragen', 'leads']),
      now: NOW,
    })
    expect(out).toEqual({
      gutachter_finder_anfragen: { besichtigungsort_adresse: 'Köln' },
      leads: { service_typ: 'komplett' },
    })
  })

  it('checkbox → TIMESTAMPTZ: true = now, false = null', () => {
    const felder = [
      feld({ feld_key: 'dsgvo', typ: 'checkbox', db_target: { tabelle: 'leads', spalte: 'dsgvo_zustimmung_am' } }),
      feld({ feld_key: 'nope', typ: 'checkbox', db_target: { tabelle: 'leads', spalte: 'nope_am' } }),
    ]
    const out = groupFelderByTarget(felder, { dsgvo: true, nope: false }, {
      allowedTables: new Set(['leads']),
      now: NOW,
    })
    expect(out).toEqual({ leads: { dsgvo_zustimmung_am: NOW(), nope_am: null } })
  })

  it('skippt nicht-erlaubte Tabellen', () => {
    const felder = [feld({ feld_key: 'x', typ: 'text', db_target: { tabelle: 'verboten', spalte: 'x' } })]
    const out = groupFelderByTarget(felder, { x: 'y' }, { allowedTables: new Set(['leads']), now: NOW })
    expect(out).toEqual({})
  })

  it('skippt Felder ohne Wert (nicht in values oder undefined)', () => {
    const felder = [
      feld({ feld_key: 'a', typ: 'text', db_target: { tabelle: 'leads', spalte: 'a' } }),
      feld({ feld_key: 'b', typ: 'text', db_target: { tabelle: 'leads', spalte: 'b' } }),
    ]
    const out = groupFelderByTarget(felder, { a: 'set', b: undefined }, { allowedTables: new Set(['leads']), now: NOW })
    expect(out).toEqual({ leads: { a: 'set' } })
  })

  it('leere allowedTables → leeres Ergebnis', () => {
    const felder = [feld({ feld_key: 'a', typ: 'text', db_target: { tabelle: 'leads', spalte: 'a' } })]
    expect(groupFelderByTarget(felder, { a: 'x' }, { allowedTables: new Set(), now: NOW })).toEqual({})
  })
})
