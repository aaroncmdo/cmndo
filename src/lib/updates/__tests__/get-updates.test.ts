import { describe, it, expect, vi, beforeEach } from 'vitest'

// #updates-rebuild Phase 0: getUpdates merged die abgeleitete Action-Worklist
// (RPC get_updates_action) + den Info-Log (mitteilungen) zum einheitlichen Item.
const h = vi.hoisted(() => {
  const state = { rpc: [] as unknown[], info: [] as unknown[] }
  const db = {
    rpc: (_fn: string, _args: unknown) => Promise.resolve({ data: state.rpc, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: () =>
        Promise.resolve({ data: state.info, error: null }) }) }) }) }),
    }),
  }
  return { state, db }
})

import { getUpdates } from '../get-updates'

beforeEach(() => { h.state.rpc = []; h.state.info = [] })

describe('getUpdates', () => {
  it('Action-Items (RPC) zuerst mit modus=action, Info-Log danach mit modus=info', async () => {
    h.state.rpc = [{ id: 'a1', typ: 'task', modus: 'action', prioritaet: 'dringend', titel: 'T', inhalt: null, kontext_typ: 'claim', kontext_id: 'c1', source: 'offene_aufgabe', created_at: '2026-06-29T10:00:00Z' }]
    h.state.info = [{ id: 'i1', kategorie: 'update', titel: 'Info', inhalt: null, kontext_typ: 'claim', kontext_id: 'c2', route_url: '/x', prioritaet: 'normal', created_at: '2026-06-29T09:00:00Z' }]
    const items = await getUpdates(h.db as never, 'u1', 'admin')
    expect(items[0]).toMatchObject({ modus: 'action', source: 'offene_aufgabe', typ: 'task' })
    expect(items.at(-1)).toMatchObject({ modus: 'info', id: 'i1', typ: 'event' })
  })

  it('Action-Items werden nach Prioritaet sortiert (dringend vor normal)', async () => {
    h.state.rpc = [
      { id: 'n1', typ: 'message', modus: 'action', prioritaet: 'normal', titel: 'N', inhalt: null, kontext_typ: 'claim', kontext_id: 'c1', source: 'unbeantw_nachricht', created_at: '2026-06-29T11:00:00Z' },
      { id: 'd1', typ: 'task', modus: 'action', prioritaet: 'dringend', titel: 'D', inhalt: null, kontext_typ: 'claim', kontext_id: 'c2', source: 'offene_aufgabe', created_at: '2026-06-29T08:00:00Z' },
    ]
    const items = await getUpdates(h.db as never, 'u1', 'admin')
    expect(items.map(i => i.id)).toEqual(['d1', 'n1'])
  })

  it('Anruf-Mitteilung (kategorie=anruf) -> Info-Item mit typ=call (Anrufe-Filter greift)', async () => {
    h.state.info = [
      { id: 'call1', kategorie: 'anruf', titel: 'Verpasster Anruf', inhalt: null, kontext_typ: null, kontext_id: null, route_url: null, prioritaet: 'normal', created_at: '2026-06-29T09:00:00Z' },
      { id: 'upd1', kategorie: 'update', titel: 'Aktivitaet', inhalt: null, kontext_typ: 'claim', kontext_id: 'c1', route_url: '/x', prioritaet: 'normal', created_at: '2026-06-29T08:00:00Z' },
    ]
    const items = await getUpdates(h.db as never, 'u1', 'dispatch')
    expect(items.find(i => i.id === 'call1')).toMatchObject({ modus: 'info', typ: 'call', source: 'anruf' })
    expect(items.find(i => i.id === 'upd1')).toMatchObject({ modus: 'info', typ: 'event', source: 'info' })
  })
})
