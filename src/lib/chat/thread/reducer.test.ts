import { describe, it, expect } from 'vitest'
import { chatReducer, type ChatMessage } from './reducer'

const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, fall_id: 'f1', kanal: 'whatsapp', sender_id: 'other', nachricht: 'h', created_at: '2026-06-02T10:00:00Z', gelesen: false, ...over })

describe('chatReducer', () => {
  it('loaded replaces state sorted by created_at asc', () => {
    const s = chatReducer([], { type: 'loaded', rows: [msg('b', { created_at: '2026-06-02T11:00:00Z' }), msg('a', { created_at: '2026-06-02T10:00:00Z' })] })
    expect(s.map(m => m.id)).toEqual(['a', 'b'])
  })
  it('realtimeInsert appends + dedups by id', () => {
    const s0 = chatReducer([], { type: 'loaded', rows: [msg('a')] })
    const s1 = chatReducer(s0, { type: 'realtimeInsert', row: msg('b', { created_at: '2026-06-02T11:00:00Z' }) })
    const s2 = chatReducer(s1, { type: 'realtimeInsert', row: msg('b', { created_at: '2026-06-02T11:00:00Z' }) }) // dup
    expect(s2.map(m => m.id)).toEqual(['a', 'b'])
  })
  it('optimisticAdd then sendResolved swaps temp id -> real id', () => {
    const s0 = chatReducer([], { type: 'optimisticAdd', message: msg('temp-1', { sender_id: 'me', pending: true }) })
    const s1 = chatReducer(s0, { type: 'sendResolved', tempId: 'temp-1', realId: 'r1' })
    expect(s1.map(m => m.id)).toEqual(['r1'])
    expect(s1[0].pending).toBe(false)
  })
  it('sendResolved dedups when realtime echo already delivered the real id', () => {
    let s = chatReducer([], { type: 'optimisticAdd', message: msg('temp-1', { sender_id: 'me', pending: true }) })
    s = chatReducer(s, { type: 'realtimeInsert', row: msg('r1', { sender_id: 'me' }) })
    s = chatReducer(s, { type: 'sendResolved', tempId: 'temp-1', realId: 'r1' })
    expect(s.map(m => m.id)).toEqual(['r1']) // temp removed, no dupe
  })
  it('sendFailed removes the optimistic temp', () => {
    const s0 = chatReducer([], { type: 'optimisticAdd', message: msg('temp-1', { pending: true }) })
    const s1 = chatReducer(s0, { type: 'sendFailed', tempId: 'temp-1' })
    expect(s1).toEqual([])
  })
})
