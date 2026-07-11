import { describe, it, expect } from 'vitest'
import { aggregiereInbox, type AggMessage, type AggClaimMeta } from '@/lib/chat/inbox-aggregation'

const meta = (over: Partial<AggClaimMeta> & { claimId: string }): [string, AggClaimMeta] => [
  over.claimId,
  { claimId: over.claimId, fallId: 'fallId' in over ? over.fallId ?? null : `fall-${over.claimId}`, fallNummer: over.fallNummer ?? null, kundeName: over.kundeName ?? 'Max Muster' },
]

describe('aggregiereInbox', () => {
  it('waehlt pro Claim die neueste Nachricht (ordnungsunabhaengig)', () => {
    const messages: AggMessage[] = [
      { claimId: 'c1', nachricht: 'alt', createdAt: '2026-07-01T10:00:00Z' },
      { claimId: 'c1', nachricht: 'neu', createdAt: '2026-07-05T10:00:00Z' },
    ]
    const res = aggregiereInbox(messages, new Map([meta({ claimId: 'c1' })]), {})
    expect(res).toHaveLength(1)
    expect(res[0].lastMessage).toBe('neu')
    expect(res[0].lastAt).toBe('2026-07-05T10:00:00Z')
  })

  it('ueberspringt Claims ohne fallId oder ohne Meta (kein Store-Key)', () => {
    const messages: AggMessage[] = [
      { claimId: 'c1', nachricht: 'a', createdAt: '2026-07-01T10:00:00Z' },
      { claimId: 'c2', nachricht: 'b', createdAt: '2026-07-02T10:00:00Z' }, // kein Meta
      { claimId: 'c3', nachricht: 'c', createdAt: '2026-07-03T10:00:00Z' }, // fallId null
    ]
    const claimMeta = new Map([meta({ claimId: 'c1' }), meta({ claimId: 'c3', fallId: null })])
    const res = aggregiereInbox(messages, claimMeta, {})
    expect(res.map((t) => t.claimId)).toEqual(['c1'])
    expect(res[0].fallId).toBe('fall-c1')
  })

  it('sortiert ungelesen zuerst, dann nach Aktualitaet', () => {
    const messages: AggMessage[] = [
      { claimId: 'gelesen-alt', nachricht: 'x', createdAt: '2026-07-01T00:00:00Z' },
      { claimId: 'gelesen-neu', nachricht: 'y', createdAt: '2026-07-09T00:00:00Z' },
      { claimId: 'ungelesen', nachricht: 'z', createdAt: '2026-07-03T00:00:00Z' },
    ]
    const claimMeta = new Map([
      meta({ claimId: 'gelesen-alt' }),
      meta({ claimId: 'gelesen-neu' }),
      meta({ claimId: 'ungelesen' }),
    ])
    const res = aggregiereInbox(messages, claimMeta, { ungelesen: 2 })
    // ungelesen zuerst (trotz aelterer Nachricht), dann gelesene nach Aktualitaet desc
    expect(res.map((t) => t.claimId)).toEqual(['ungelesen', 'gelesen-neu', 'gelesen-alt'])
  })

  it('setzt unreadCount default 0 und fuellt Kundenname/Fallnummer aus der Meta', () => {
    const messages: AggMessage[] = [{ claimId: 'c1', nachricht: 'hallo', createdAt: '2026-07-01T10:00:00Z' }]
    const claimMeta = new Map([meta({ claimId: 'c1', fallNummer: 'AZ-42', kundeName: 'Erika Beispiel' })])
    const res = aggregiereInbox(messages, claimMeta, {})
    expect(res[0]).toMatchObject({ claimId: 'c1', fallNummer: 'AZ-42', kundeName: 'Erika Beispiel', unreadCount: 0 })
  })

  it('leere Eingabe -> leeres Ergebnis', () => {
    expect(aggregiereInbox([], new Map(), {})).toEqual([])
  })

  it('behandelt leere nachricht als leeren String', () => {
    const messages: AggMessage[] = [{ claimId: 'c1', nachricht: null, createdAt: '2026-07-01T10:00:00Z' }]
    const res = aggregiereInbox(messages, new Map([meta({ claimId: 'c1' })]), {})
    expect(res[0].lastMessage).toBe('')
  })
})
