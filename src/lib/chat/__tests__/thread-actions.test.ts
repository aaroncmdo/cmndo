import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable Supabase-Query-Mock: select/eq/order/update geben `this`, Terminals resolven.
function chain(terminal: { maybeSingle?: () => Promise<{ data: unknown; error?: unknown }> }) {
  const c: Record<string, unknown> = {}
  c.select = () => c
  c.eq = () => c
  c.order = () => c
  c.update = () => c
  c.maybeSingle = terminal.maybeSingle ?? (async () => ({ data: null }))
  return c
}

let insertPayload: Record<string, unknown> | null = null
let threadRow: { id: string; claim_id: string } | null = { id: 't1', claim_id: 'c1' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'chat_threads') return chain({ maybeSingle: async () => ({ data: threadRow }) })
      if (table === 'profiles') return chain({ maybeSingle: async () => ({ data: { rolle: 'kundenbetreuer' } }) })
      return chain({})
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'nachrichten') {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertPayload = payload
            return chain({ maybeSingle: async () => ({ data: { id: 'n1' } }) })
          },
        }
      }
      return chain({})
    },
  }),
}))

import { sendeThreadNachricht } from '../thread-actions'

describe('sendeThreadNachricht — Persistenz', () => {
  beforeEach(() => {
    insertPayload = null
    threadRow = { id: 't1', claim_id: 'c1' }
  })

  it('persistiert thread-nativ: thread_id gesetzt, kanal=null, Text getrimmt, fall_id + sender_id', async () => {
    const res = await sendeThreadNachricht('t1', '  hallo welt  ')
    expect(res.ok).toBe(true)
    expect(insertPayload).not.toBeNull()
    expect(insertPayload!.thread_id).toBe('t1')
    expect(insertPayload!.kanal).toBeNull()
    expect(insertPayload!.nachricht).toBe('hallo welt')
    expect(insertPayload!.fall_id).toBe('c1')
    expect(insertPayload!.sender_id).toBe('u1')
    expect(insertPayload!.richtung).toBe('outbound')
  })

  it('lehnt leere Nachricht ab (kein Insert)', async () => {
    const res = await sendeThreadNachricht('t1', '   ')
    expect(res.ok).toBe(false)
    expect(insertPayload).toBeNull()
  })

  it('lehnt ab, wenn kein Thread-Zugriff (RLS liefert null) — kein Insert', async () => {
    threadRow = null
    const res = await sendeThreadNachricht('t1', 'hi')
    expect(res.ok).toBe(false)
    expect(insertPayload).toBeNull()
  })
})
