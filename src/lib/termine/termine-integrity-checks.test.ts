import { describe, it, expect } from 'vitest'
import {
  intervalleUeberlappen,
  konfliktKategorie,
  findeBelegungKonflikte,
  gruppiereNachAssignee,
  type BelegungFenster,
} from './termine-integrity-checks'

const f = (
  o: Partial<BelegungFenster> & Pick<BelegungFenster, 'start' | 'end' | 'typ' | 'quelleId'>,
): BelegungFenster => ({ assigneeTyp: 'sachverstaendiger', assigneeId: 'sv-1', ...o })

describe('intervalleUeberlappen', () => {
  it('true bei echter Ueberlappung', () => {
    expect(
      intervalleUeberlappen('2026-07-10T09:00:00Z', '2026-07-10T11:00:00Z', '2026-07-10T10:00:00Z', '2026-07-10T12:00:00Z'),
    ).toBe(true)
  })
  it('false bei Adjazenz (Ende == Start)', () => {
    expect(
      intervalleUeberlappen('2026-07-10T09:00:00Z', '2026-07-10T10:00:00Z', '2026-07-10T10:00:00Z', '2026-07-10T11:00:00Z'),
    ).toBe(false)
  })
  it('false bei disjunkt', () => {
    expect(
      intervalleUeberlappen('2026-07-10T09:00:00Z', '2026-07-10T10:00:00Z', '2026-07-10T11:00:00Z', '2026-07-10T12:00:00Z'),
    ).toBe(false)
  })
  it('true bei vollstaendiger Enthaltung', () => {
    expect(
      intervalleUeberlappen('2026-07-10T09:00:00Z', '2026-07-10T17:00:00Z', '2026-07-10T10:00:00Z', '2026-07-10T11:00:00Z'),
    ).toBe(true)
  })
  it('false bei ungueltigem Datum', () => {
    expect(
      intervalleUeberlappen('kaputt', '2026-07-10T11:00:00Z', '2026-07-10T10:00:00Z', '2026-07-10T12:00:00Z'),
    ).toBe(false)
  })
  it('korrekt ueber eine DST-Umstellung (instant-basiert, UTC)', () => {
    // 2026-03-29 Berlin Sommerzeit-Sprung — Instants sind UTC, Overlap DST-unabhaengig.
    expect(
      intervalleUeberlappen('2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z', '2026-03-29T01:00:00Z', '2026-03-29T02:00:00Z'),
    ).toBe(true)
  })
})

describe('konfliktKategorie', () => {
  it('buchung+buchung -> buchung_buchung', () => {
    expect(konfliktKategorie('buchung', 'buchung')).toBe('buchung_buchung')
  })
  it('buchung+extern -> buchung_caldav (Reihenfolge egal)', () => {
    expect(konfliktKategorie('buchung', 'extern')).toBe('buchung_caldav')
    expect(konfliktKategorie('extern', 'buchung')).toBe('buchung_caldav')
  })
  it('buchung+ausnahme -> buchung_urlaub', () => {
    expect(konfliktKategorie('buchung', 'ausnahme')).toBe('buchung_urlaub')
  })
  it('kein buchung -> null', () => {
    expect(konfliktKategorie('extern', 'ausnahme')).toBeNull()
    expect(konfliktKategorie('extern', 'extern')).toBeNull()
  })
})

describe('findeBelegungKonflikte', () => {
  it('findet Buchung<->CalDAV-Ueberlappung', () => {
    const res = findeBelegungKonflikte([
      f({ start: '2026-07-10T09:00:00Z', end: '2026-07-10T11:00:00Z', typ: 'buchung', quelleId: 'b1' }),
      f({ start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z', typ: 'extern', quelleId: 'c1' }),
    ])
    expect(res).toHaveLength(1)
    expect(res[0].kategorie).toBe('buchung_caldav')
  })
  it('ignoriert dasselbe Fenster (gleiche quelleId)', () => {
    expect(
      findeBelegungKonflikte([
        f({ start: '2026-07-10T09:00:00Z', end: '2026-07-10T11:00:00Z', typ: 'buchung', quelleId: 'x' }),
        f({ start: '2026-07-10T09:00:00Z', end: '2026-07-10T11:00:00Z', typ: 'buchung', quelleId: 'x' }),
      ]),
    ).toHaveLength(0)
  })
  it('ignoriert extern<->ausnahme (keine Buchung beteiligt)', () => {
    expect(
      findeBelegungKonflikte([
        f({ start: '2026-07-10T09:00:00Z', end: '2026-07-10T11:00:00Z', typ: 'extern', quelleId: 'c1' }),
        f({ start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z', typ: 'ausnahme', quelleId: 'a1' }),
      ]),
    ).toHaveLength(0)
  })
  it('ignoriert nicht-ueberlappende Buchungen', () => {
    expect(
      findeBelegungKonflikte([
        f({ start: '2026-07-10T09:00:00Z', end: '2026-07-10T10:00:00Z', typ: 'buchung', quelleId: 'b1' }),
        f({ start: '2026-07-10T11:00:00Z', end: '2026-07-10T12:00:00Z', typ: 'buchung', quelleId: 'b2' }),
      ]),
    ).toHaveLength(0)
  })
  it('findet Buchung<->Buchung-Ueberlappung', () => {
    const res = findeBelegungKonflikte([
      f({ start: '2026-07-10T09:00:00Z', end: '2026-07-10T11:00:00Z', typ: 'buchung', quelleId: 'b1' }),
      f({ start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z', typ: 'buchung', quelleId: 'b2' }),
    ])
    expect(res).toHaveLength(1)
    expect(res[0].kategorie).toBe('buchung_buchung')
  })
})

describe('gruppiereNachAssignee', () => {
  it('trennt verschiedene Assignees', () => {
    const g = gruppiereNachAssignee([
      f({ assigneeId: 'sv-1', start: 'a', end: 'b', typ: 'buchung', quelleId: '1' }),
      f({ assigneeId: 'sv-2', start: 'a', end: 'b', typ: 'buchung', quelleId: '2' }),
    ])
    expect(g.size).toBe(2)
  })
  it('gruppiert gleiche Assignees zusammen', () => {
    const g = gruppiereNachAssignee([
      f({ assigneeId: 'sv-1', start: 'a', end: 'b', typ: 'buchung', quelleId: '1' }),
      f({ assigneeId: 'sv-1', start: 'c', end: 'd', typ: 'extern', quelleId: '2' }),
    ])
    expect(g.size).toBe(1)
    expect([...g.values()][0]).toHaveLength(2)
  })
  it('trennt gleiche id aber anderen Typ (sv vs kb)', () => {
    const g = gruppiereNachAssignee([
      f({ assigneeTyp: 'sachverstaendiger', assigneeId: 'x', start: 'a', end: 'b', typ: 'buchung', quelleId: '1' }),
      f({ assigneeTyp: 'kundenbetreuer', assigneeId: 'x', start: 'a', end: 'b', typ: 'buchung', quelleId: '2' }),
    ])
    expect(g.size).toBe(2)
  })
})
