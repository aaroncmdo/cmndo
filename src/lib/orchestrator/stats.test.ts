import { describe, it, expect } from 'vitest'
import { windowAndCount, computeReadiness } from './stats'
import type { AutoMode } from './types'
import { GRADUATION } from './types'

// ── windowAndCount ────────────────────────────────────────────────────────────

describe('windowAndCount', () => {
  // (a) 2 Gruppen sauber getrennt
  it('trennt 2 Gruppen (typ x rolle) korrekt', () => {
    const decisions = [
      { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', status: 'angenommen', entschiedenAm: '2026-06-01T10:00:00Z' },
      { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', status: 'verworfen', entschiedenAm: '2026-06-02T10:00:00Z' },
      { vorschlagTyp: 'escalation', zielRolle: 'admin', status: 'angenommen', entschiedenAm: '2026-06-01T10:00:00Z' },
      { vorschlagTyp: 'escalation', zielRolle: 'admin', status: 'angenommen', entschiedenAm: '2026-06-02T10:00:00Z' },
    ]
    const result = windowAndCount(decisions, 30)
    expect(result).toHaveLength(2)

    const taskGroup = result.find(r => r.vorschlagTyp === 'task' && r.zielRolle === 'kundenbetreuer')
    expect(taskGroup).toBeDefined()
    expect(taskGroup!.angenommen).toBe(1)
    expect(taskGroup!.verworfen).toBe(1)

    const escalationGroup = result.find(r => r.vorschlagTyp === 'escalation' && r.zielRolle === 'admin')
    expect(escalationGroup).toBeDefined()
    expect(escalationGroup!.angenommen).toBe(2)
    expect(escalationGroup!.verworfen).toBe(0)
  })

  // (b) >windowSize → nur die neuesten windowSize gezaehlt (aeltere ignoriert)
  it('nimmt nur die letzten windowSize Eintraege je Gruppe (aeltere ignoriert)', () => {
    // 5 Entscheidungen, aber windowSize=3 → nur die 3 neuesten zaehlen
    // Neueste 3: alle angenommen → angenommen=3, verworfen=0
    // Aelteste 2: verworfen → sollen ignoriert werden
    const decisions = [
      { vorschlagTyp: 'task', zielRolle: 'sachverstaendiger', status: 'verworfen', entschiedenAm: '2026-05-01T00:00:00Z' },
      { vorschlagTyp: 'task', zielRolle: 'sachverstaendiger', status: 'verworfen', entschiedenAm: '2026-05-02T00:00:00Z' },
      { vorschlagTyp: 'task', zielRolle: 'sachverstaendiger', status: 'angenommen', entschiedenAm: '2026-05-10T00:00:00Z' },
      { vorschlagTyp: 'task', zielRolle: 'sachverstaendiger', status: 'angenommen', entschiedenAm: '2026-05-11T00:00:00Z' },
      { vorschlagTyp: 'task', zielRolle: 'sachverstaendiger', status: 'angenommen', entschiedenAm: '2026-05-12T00:00:00Z' },
    ]
    const result = windowAndCount(decisions, 3)
    expect(result).toHaveLength(1)
    expect(result[0].angenommen).toBe(3)
    expect(result[0].verworfen).toBe(0)
  })

  // (c) leere Eingabe → []
  it('gibt [] fuer leere Eingabe zurueck', () => {
    const result = windowAndCount([], 30)
    expect(result).toEqual([])
  })
})

// ── computeReadiness ──────────────────────────────────────────────────────────

describe('computeReadiness', () => {
  // (a) task, 27 angenommen/3 verworfen (30 gesamt, quote 0.9) → ready=true
  it('ready=true fuer task mit quote>=schwelle UND entscheidungen>=min', () => {
    const count = { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', angenommen: 27, verworfen: 3 }
    const mode: AutoMode = 'manual'
    const stats = computeReadiness(count, mode)

    expect(stats.entscheidungen).toBe(30)
    expect(stats.angenommen).toBe(27)
    expect(stats.verworfen).toBe(3)
    expect(stats.quote).toBeCloseTo(0.9)
    expect(stats.ready).toBe(true)
    expect(stats.mode).toBe('manual')
  })

  // (b) task, quote 0.9 aber nur 20 Entscheidungen → ready=false (unter min)
  it('ready=false fuer task mit guter quote aber zu wenig Entscheidungen', () => {
    const count = { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', angenommen: 18, verworfen: 2 }
    const mode: AutoMode = 'manual'
    const stats = computeReadiness(count, mode)

    expect(stats.entscheidungen).toBe(20)
    expect(stats.quote).toBeCloseTo(0.9)
    expect(stats.ready).toBe(false) // unter GRADUATION.minEntscheidungen=30
  })

  // (c) escalation, quote 1.0/40 → ready=false (nur task graduierbar)
  it('ready=false fuer escalation auch bei hoher Quote und genug Entscheidungen', () => {
    const count = { vorschlagTyp: 'escalation', zielRolle: 'admin', angenommen: 40, verworfen: 0 }
    const mode: AutoMode = 'manual'
    const stats = computeReadiness(count, mode)

    expect(stats.entscheidungen).toBe(40)
    expect(stats.quote).toBe(1.0)
    expect(stats.ready).toBe(false) // escalation ist niemals graduierbar
  })

  // (d) 0 Entscheidungen → quote 0, ready false
  it('quote=0 und ready=false wenn keine Entscheidungen vorliegen', () => {
    const count = { vorschlagTyp: 'task', zielRolle: 'sachverstaendiger', angenommen: 0, verworfen: 0 }
    const mode: AutoMode = 'manual'
    const stats = computeReadiness(count, mode)

    expect(stats.entscheidungen).toBe(0)
    expect(stats.quote).toBe(0)
    expect(stats.ready).toBe(false)
  })

  // Bonus: mode wird korrekt durchgeleitet
  it('setzt mode aus Parameter durch', () => {
    const count = { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', angenommen: 30, verworfen: 0 }
    const stats = computeReadiness(count, 'auto')
    expect(stats.mode).toBe('auto')
  })

  // Bonus: Kontrolle GRADUATION-Schwellen (0.8 Grenzfall)
  it('ready=true wenn quote exakt 0.8 und entscheidungen exakt 30', () => {
    const count = { vorschlagTyp: 'task', zielRolle: 'admin', angenommen: 24, verworfen: 6 }
    const stats = computeReadiness(count, 'manual')
    // quote = 24/30 = 0.8 >= GRADUATION.quoteSchwelle (0.8) → ready
    expect(stats.ready).toBe(true)
  })

  it('ready=false wenn quote knapp unter 0.8', () => {
    const count = { vorschlagTyp: 'task', zielRolle: 'admin', angenommen: 23, verworfen: 7 }
    const stats = computeReadiness(count, 'manual')
    // quote = 23/30 ~ 0.767 < 0.8 → nicht ready
    expect(stats.ready).toBe(false)
  })
})

// Sicherstellen dass GRADUATION-Konstanten die richtigen Werte haben
describe('GRADUATION-Konstanten', () => {
  it('hat quoteSchwelle=0.8 und minEntscheidungen=30', () => {
    expect(GRADUATION.quoteSchwelle).toBe(0.8)
    expect(GRADUATION.minEntscheidungen).toBe(30)
  })
})
