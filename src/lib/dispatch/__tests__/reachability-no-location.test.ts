import { describe, it, expect } from 'vitest'
import { isSlotReachable, type SlotEtaContext } from '../reachability'

// P0 (universelle Termin-Engine): Marge 10 + kein-Standort=50.
// isSlotReachable ist pur (nimmt etaMin direkt) — beweist hier die 10er-Marge
// mit einer unterscheidenden 57-min-Lücke. Den no-loc=50-Set-Pfad (in
// precomputeSvSlotEtas, I/O) deckt der Live-Verify ab.
describe('Reachability — Marge 10 + kein-Standort=50 (P0)', () => {
  // Vortermin endet 08:00, Slot startet 08:57 → 57 min Lücke.
  // etaMin=50 (no-location-Fallback) + Marge 10 = 60 > 57 → NICHT erreichbar.
  // (Mit alter Marge 5: 55 < 57 → wäre erreichbar — der Test beweist die 10.)
  it('blockt bei 50-min-ETA + 57-min-Lücke (Marge 10)', () => {
    const ctx: SlotEtaContext = {
      termine: [{ id: 'v', startZeit: '2026-06-10T07:30:00Z', endZeit: '2026-06-10T08:00:00Z', etaMin: 50 }],
    }
    const r = isSlotReachable(new Date('2026-06-10T08:57:00Z'), new Date('2026-06-10T09:37:00Z'), ctx)
    expect(r.reachable).toBe(false)
  })

  // 65 min Lücke → 50+10=60 < 65 → erreichbar.
  it('erlaubt bei 50-min-ETA + 65-min-Lücke', () => {
    const ctx: SlotEtaContext = {
      termine: [{ id: 'v', startZeit: '2026-06-10T07:30:00Z', endZeit: '2026-06-10T08:00:00Z', etaMin: 50 }],
    }
    const r = isSlotReachable(new Date('2026-06-10T09:05:00Z'), new Date('2026-06-10T09:45:00Z'), ctx)
    expect(r.reachable).toBe(true)
  })

  // etaMin=null (Mapbox-null bei BEKANNTEM Standort) → übersprungen → erreichbar (fail-open, transient).
  it('lässt etaMin=null durch (fail-open, transient)', () => {
    const ctx: SlotEtaContext = {
      termine: [{ id: 'v', startZeit: '2026-06-10T08:30:00Z', endZeit: '2026-06-10T08:35:00Z', etaMin: null }],
    }
    const r = isSlotReachable(new Date('2026-06-10T08:40:00Z'), new Date('2026-06-10T09:20:00Z'), ctx)
    expect(r.reachable).toBe(true)
  })
})
