import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Die DB-beruehrenden Engine-Deps des Routers mocken — die Routing-Logik des Routers
// selbst + die PURE 2+1-Verteilung/Wunschzeit-Filter bleiben echt (das ist der Test-Gegenstand).
vi.mock('./slots', () => ({ freieSlots: vi.fn() }))
vi.mock('./matching', () => ({ findeBestePerson: vi.fn() }))
vi.mock('./writes', () => ({ reserviere: vi.fn() }))

import {
  passtZuWunschzeit,
  verteileAusSlots,
  planeTermin,
  type PlaneTerminInput,
} from './plane-termin'
import type { PersonKandidat } from './matching'
import type { Assignee, TagVerfuegbarkeit } from './types'
import { freieSlots } from './slots'
import { findeBestePerson } from './matching'
import { reserviere } from './writes'

const mockFreieSlots = vi.mocked(freieSlots)
const mockFinde = vi.mocked(findeBestePerson)
const mockReserviere = vi.mocked(reserviere)

const DB = {} as unknown as SupabaseClient
const sv = (id: string): Assignee => ({ typ: 'sachverstaendiger', id })

function mkKandidat(id: string, score: number): PersonKandidat {
  return {
    assignee: sv(id), name: `SV ${id}`, score, distanzKm: 10,
    etaVomBueroMin: 12, slotVon: null, slotBis: null, reasons: [`score:${score}`],
  }
}

/** freieSlots-Rueckgabe (ein Tag mit den gegebenen Uhrzeiten als 40-min-Slots). */
function tag(datum: string, uhrzeiten: string[]): TagVerfuegbarkeit {
  return {
    datum, wochentag: 'Mo', frei: uhrzeiten.length > 0, anzahl_slots: uhrzeiten.length,
    slots: uhrzeiten.map((uhrzeit) => ({ uhrzeit, dauer: 40 })),
  }
}

beforeEach(() => vi.clearAllMocks())

// ── passtZuWunschzeit (PURE) ────────────────────────────────────────────────
describe('passtZuWunschzeit', () => {
  const s = { datum: '2026-06-12', uhrzeit: '10:00' }
  it('ohne Filter immer true', () => expect(passtZuWunschzeit(s, null)).toBe(true))
  it('Tag-Mismatch → false', () => expect(passtZuWunschzeit(s, { tag: '2026-06-13' })).toBe(false))
  it('Tag-Match → true', () => expect(passtZuWunschzeit(s, { tag: '2026-06-12' })).toBe(true))
  it('vor vonUhr → false', () => expect(passtZuWunschzeit(s, { vonUhr: '11:00' })).toBe(false))
  it('nach bisUhr → false', () => expect(passtZuWunschzeit(s, { bisUhr: '09:00' })).toBe(false))
  it('im Zeitfenster → true', () => expect(passtZuWunschzeit(s, { vonUhr: '09:00', bisUhr: '11:00' })).toBe(true))
})

// ── verteileAusSlots (PURE) — Aarons Kernpunkt: max 3, 2 best + 1 zweitbester ─
describe('verteileAusSlots — 2+1-Verteilung (Spec §3)', () => {
  const slot = (n: number) => ({ von: `2026-06-12T1${n}:00:00Z`, bis: `2026-06-12T1${n}:40:00Z` })
  const best = mkKandidat('best', 300)
  const zweit = mkKandidat('zweit', 200)

  it('2 beim Best + 1 beim Zweitbesten', () => {
    const r = verteileAusSlots([
      { k: best, slots: [slot(1), slot(2), slot(3)] },
      { k: zweit, slots: [slot(4), slot(5)] },
    ])
    expect(r.map((v) => v.assignee.id)).toEqual(['best', 'best', 'zweit'])
  })

  it('nur 1 Kandidat → bis zu 3 beim Best', () => {
    const r = verteileAusSlots([{ k: best, slots: [slot(1), slot(2), slot(3), slot(4)] }])
    expect(r.map((v) => v.assignee.id)).toEqual(['best', 'best', 'best'])
  })

  it('Best hat nur 1 Slot → adaptiv vom Zweitbesten auffuellen', () => {
    const r = verteileAusSlots([
      { k: best, slots: [slot(1)] },
      { k: zweit, slots: [slot(4), slot(5)] },
    ])
    expect(r.map((v) => v.assignee.id)).toEqual(['best', 'zweit', 'zweit'])
  })

  it('leere Eingabe → []', () => expect(verteileAusSlots([])).toEqual([]))

  it('nie mehr als 3 — auch bei 3 Kandidaten mit vielen Slots', () => {
    const r = verteileAusSlots([
      { k: best, slots: [slot(1), slot(2), slot(3)] },
      { k: zweit, slots: [slot(4), slot(5), slot(6)] },
      { k: mkKandidat('dritt', 100), slots: [slot(7)] },
    ])
    expect(r).toHaveLength(3)
  })

  it('uebernimmt score/eta/reasons/name des Kandidaten in den Vorschlag', () => {
    const r = verteileAusSlots([{ k: best, slots: [slot(1)] }])
    expect(r[0]).toMatchObject({ score: 300, etaVomBueroMin: 12, reasons: ['score:300'], name: 'SV best' })
  })
})

// ── planeTermin (Router) — Branch-Routing via gemockte Engine-Deps ───────────
describe('planeTermin — Router-Branches', () => {
  const base: PlaneTerminInput = {
    bezug: { typ: 'lead', id: 'lead-1' }, quelle: 'self_service',
    assigneeTyp: 'sachverstaendiger', modus: 'vorschlagen', db: DB,
  }
  const wunsch = { wunschzeit: { naheZeitpunkt: '2026-06-12T09:00:00Z' } }

  it('FIX + buchen + naheZeitpunkt → reserviere → kind=gebucht', async () => {
    mockReserviere.mockResolvedValue({ ok: true, terminId: 't-1', reserviertBis: '2026-06-12T10:30:00Z' })
    const r = await planeTermin({ ...base, modus: 'buchen', assignee: sv('sv-fix'), ...wunsch })
    expect(r).toMatchObject({ ok: true, kind: 'gebucht', terminId: 't-1', assignee: { id: 'sv-fix' } })
    expect(mockReserviere).toHaveBeenCalledOnce()
    expect(mockFinde).not.toHaveBeenCalled()
  })

  it('FIX + buchen → reserviere meldet belegt → code=belegt', async () => {
    mockReserviere.mockResolvedValue({ ok: false, code: 'belegt', error: 'Slot belegt' })
    const r = await planeTermin({ ...base, modus: 'buchen', assignee: sv('sv-fix'), ...wunsch })
    expect(r).toMatchObject({ ok: false, code: 'belegt' })
  })

  it('FIX + vorschlagen → max 3 Slots des fixen Assignees (kein reserviere)', async () => {
    mockFreieSlots.mockResolvedValue([tag('2026-06-12', ['09:00', '10:00', '11:00', '12:00'])])
    const r = await planeTermin({ ...base, assignee: sv('sv-fix') })
    expect(r.ok && r.kind === 'slots' ? r.vorschlaege.length : -1).toBe(3)
    expect(mockReserviere).not.toHaveBeenCalled()
  })

  it('KB ohne fixen Assignee → nicht_unterstuetzt (kein Matching)', async () => {
    const r = await planeTermin({ ...base, assigneeTyp: 'kundenbetreuer' })
    expect(r).toMatchObject({ ok: false, code: 'nicht_unterstuetzt' })
    expect(mockFinde).not.toHaveBeenCalled()
  })

  it('SV-Match ohne Schadenort → kein_kandidat', async () => {
    const r = await planeTermin({ ...base, schadenort: null })
    expect(r).toMatchObject({ ok: false, code: 'kein_kandidat' })
    expect(mockFinde).not.toHaveBeenCalled()
  })

  it('SV-Match mit Schadenort → findeBestePerson → 2+1-Slots', async () => {
    mockFinde.mockResolvedValue({ ok: true, gebucht: false, kandidaten: [mkKandidat('best', 300), mkKandidat('zweit', 200)] })
    mockFreieSlots.mockResolvedValue([tag('2026-06-12', ['09:00', '10:00', '11:00'])])
    const r = await planeTermin({ ...base, schadenort: { lat: 51, lng: 7 } })
    expect(r.ok && r.kind === 'slots').toBe(true)
    expect(mockFinde).toHaveBeenCalledOnce()
  })

  it('SV-Match aber keine buchbaren Slots → kein_slot', async () => {
    mockFinde.mockResolvedValue({ ok: true, gebucht: false, kandidaten: [mkKandidat('best', 300)] })
    mockFreieSlots.mockResolvedValue([tag('2026-06-12', [])])
    const r = await planeTermin({ ...base, schadenort: { lat: 51, lng: 7 } })
    expect(r).toMatchObject({ ok: false, code: 'kein_slot' })
  })

  it('remote (video) nullt den Schadenort → SV-Match-Pfad ohne Ort → kein_kandidat', async () => {
    const r = await planeTermin({ ...base, kanal: 'video', schadenort: { lat: 51, lng: 7 } })
    expect(r).toMatchObject({ ok: false, code: 'kein_kandidat' })
  })
})
