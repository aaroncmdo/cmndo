import { describe, expect, test } from 'vitest'
import { classifySlot, rankSlots, type TagSlotsInput } from '../ranking'

describe('classifySlot', () => {
  test('exakt am Wunschtermin → wunschtermin', () => {
    expect(classifySlot('2026-06-02T09:00:00', '2026-06-02T09:00:00')).toBe('wunschtermin')
  })
  test('innerhalb ±30 min → wunschtermin', () => {
    expect(classifySlot('2026-06-02T09:25:00', '2026-06-02T09:00:00')).toBe('wunschtermin')
    expect(classifySlot('2026-06-02T08:35:00', '2026-06-02T09:00:00')).toBe('wunschtermin')
  })
  test('selber Tag, > 30 min entfernt → gleicher_tag', () => {
    expect(classifySlot('2026-06-02T14:00:00', '2026-06-02T09:00:00')).toBe('gleicher_tag')
  })
  test('Nachbartag (≤ 1,5 Tage) → nahe', () => {
    expect(classifySlot('2026-06-03T09:00:00', '2026-06-02T09:00:00')).toBe('nahe')
  })
  test('weiter als 1,5 Tage → nach', () => {
    expect(classifySlot('2026-06-05T09:00:00', '2026-06-02T09:00:00')).toBe('nach')
  })
  test('kein Wunschtermin → nach', () => {
    expect(classifySlot('2026-06-02T09:00:00', null)).toBe('nach')
  })
})

describe('rankSlots', () => {
  const tage: TagSlotsInput[] = [
    { datum: '2026-06-02', slots: [{ uhrzeit: '09:00', dauer: 45 }, { uhrzeit: '14:00', dauer: 45 }] },
    { datum: '2026-06-03', slots: [{ uhrzeit: '10:00', dauer: 45 }] },
  ]

  test('flacht datum+uhrzeit zu Wall-Clock start/end OHNE Offset', () => {
    const r = rankSlots(tage, null)
    const neun = r.find((s) => s.start === '2026-06-02T09:00:00')
    expect(neun).toBeDefined()
    expect(neun!.end).toBe('2026-06-02T09:45:00')
    expect(neun!.start).not.toContain('Z')
    expect(neun!.start).not.toContain('+')
  })

  test('rankt den Wunschtermin-Slot auf Position 1', () => {
    const r = rankSlots(tage, '2026-06-02T09:10:00')
    expect(r[0].start).toBe('2026-06-02T09:00:00')
    expect(r[0].matchType).toBe('wunschtermin')
  })

  test('ohne Wunschtermin: chronologisch aufsteigend', () => {
    const r = rankSlots(tage, null)
    expect(r[0].start).toBe('2026-06-02T09:00:00')
    expect(r[r.length - 1].start).toBe('2026-06-03T10:00:00')
  })

  test('respektiert das Limit', () => {
    expect(rankSlots(tage, null, 1)).toHaveLength(1)
  })

  test('leere Tage → []', () => {
    expect(rankSlots([], '2026-06-02T09:00:00')).toEqual([])
  })
})
