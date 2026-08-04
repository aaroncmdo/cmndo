import { describe, it, expect } from 'vitest'
import {
  REPARATUR_LANE,
  laneIndex,
  darfReparaturAdvancen,
  pickNextHop,
} from '@/lib/faelle/reparatur-cursor'

// Reine Kern-Logik des Reparatur-Cursor-Helpers (Gate + Hop-Auswahl). Die DB-getriebenen
// Teile (advanceReparaturCursorTo / closeReparaturClaimViaEngine) laufen ueber die Engine
// und werden im Prod-Smoke geprueft; hier: die Entscheidungslogik, die NICHT driften darf.

describe('laneIndex', () => {
  it('liefert die Lane-Position (aufsteigend)', () => {
    expect(laneIndex('reparatur-werkstatt-suche')).toBe(0)
    expect(laneIndex('reparatur-angefragt')).toBe(1)
    expect(laneIndex('reparatur-laeuft')).toBe(2)
    expect(laneIndex('reparatur-erledigt')).toBe(3)
  })
  it('-1 fuer Nicht-Lane-Status und null', () => {
    expect(laneIndex('ersterfassung')).toBe(-1)
    expect(laneIndex('sv-gesucht')).toBe(-1)
    expect(laneIndex('abgeschlossen')).toBe(-1)
    expect(laneIndex(null)).toBe(-1)
    expect(laneIndex(undefined)).toBe(-1)
  })
})

describe('darfReparaturAdvancen (abrechnungsweg-Gate)', () => {
  it('true fuer reduced-repair (selbstzahler/kasko) auf Entry- oder Lane-Status', () => {
    expect(darfReparaturAdvancen('selbstzahler', 'ersterfassung')).toBe(true)
    expect(darfReparaturAdvancen('selbstzahler', 'onboarding')).toBe(true)
    expect(darfReparaturAdvancen('kasko', 'reparatur-angefragt')).toBe(true)
    expect(darfReparaturAdvancen('kasko', 'reparatur-laeuft')).toBe(true)
  })
  it('false fuer NICHT-reduced-repair (Haftpflicht) — kein Hijack der SV-Achse', () => {
    expect(darfReparaturAdvancen('haftpflicht', 'ersterfassung')).toBe(false)
    expect(darfReparaturAdvancen('irgendwas', 'reparatur-angefragt')).toBe(false) // unbekannter Nicht-Reparatur-Weg ('nicht_zutreffend' mit Mig 20260804161329 abgeschafft)
    expect(darfReparaturAdvancen(null, 'ersterfassung')).toBe(false)
    expect(darfReparaturAdvancen(undefined, 'ersterfassung')).toBe(false)
  })
  it('false fuer terminale Status (kein Reopen)', () => {
    expect(darfReparaturAdvancen('selbstzahler', 'abgeschlossen')).toBe(false)
    expect(darfReparaturAdvancen('selbstzahler', 'storniert')).toBe(false)
  })
  it('false fuer SV-Achsen-Status (nicht Entry, nicht Lane) — kein Hijack', () => {
    expect(darfReparaturAdvancen('selbstzahler', 'sv-gesucht')).toBe(false)
    expect(darfReparaturAdvancen('selbstzahler', 'gutachten-eingegangen')).toBe(false)
  })
})

describe('pickNextHop (forward-only, bevorzugt direkt)', () => {
  it('direkter Hop zum Ziel wenn erlaubt', () => {
    expect(pickNextHop('ersterfassung', 'reparatur-angefragt')).toBe('reparatur-angefragt')
    expect(pickNextHop('reparatur-angefragt', 'reparatur-laeuft')).toBe('reparatur-laeuft')
    expect(pickNextHop('reparatur-angefragt', 'reparatur-erledigt')).toBe('reparatur-erledigt')
    expect(pickNextHop('reparatur-laeuft', 'reparatur-erledigt')).toBe('reparatur-erledigt')
  })
  it('Zwischen-Hop wenn direkt nicht erlaubt (Walk aus der Erfassung)', () => {
    // ersterfassung -> reparatur-erledigt ist NICHT direkt erlaubt -> erst reparatur-angefragt
    expect(pickNextHop('ersterfassung', 'reparatur-erledigt')).toBe('reparatur-angefragt')
    expect(pickNextHop('ersterfassung', 'reparatur-laeuft')).toBe('reparatur-angefragt')
  })
  it('null wenn kein gueltiger Vorwaerts-Schritt (Rueckwaerts verboten)', () => {
    expect(pickNextHop('reparatur-erledigt', 'reparatur-laeuft')).toBeNull()
    expect(pickNextHop('reparatur-laeuft', 'reparatur-angefragt')).toBeNull()
  })
})

describe('REPARATUR_LANE Integritaet', () => {
  it('ist die erwartete lineare Achse', () => {
    expect([...REPARATUR_LANE]).toEqual([
      'reparatur-werkstatt-suche',
      'reparatur-angefragt',
      'reparatur-laeuft',
      'reparatur-erledigt',
    ])
  })
})
