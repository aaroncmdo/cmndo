import { describe, it, expect, vi } from 'vitest'
import { hatKuerzlichMenschlicheKonversation } from '../konversations-guard'

// Baut einen minimalen supabase-Query-Mock, der die Kette
// .from().select().eq().gte().or()/.ilike().limit() unterstuetzt und am Ende `rows` liefert.
// Der `or`-Spy wird zurueckgegeben, damit Tests den PostgREST-Ausdruck pruefen koennen.
function mockDb(rows: Array<{ richtung: string; sender_rolle: string | null }> | null, error = false) {
  const result = { data: error ? null : rows, error: error ? { message: 'boom' } : null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'ilike', 'or']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.limit = vi.fn(() => Promise.resolve(result))
  return { db: { from: vi.fn(() => chain) } as never, chain }
}

describe('hatKuerzlichMenschlicheKonversation', () => {
  it('true bei eingehender WhatsApp im Fenster', async () => {
    const { db } = mockDb([{ richtung: 'inbound', sender_rolle: null }])
    expect(await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1' })).toBe(true)
  })

  it('true bei ausgehender Nachricht eines Menschen (sender_rolle != system)', async () => {
    const { db } = mockDb([{ richtung: 'outbound', sender_rolle: 'kundenbetreuer' }])
    expect(await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1' })).toBe(true)
  })

  it('false bei ausschliesslich System-Nachrichten', async () => {
    const { db } = mockDb([
      { richtung: 'outbound', sender_rolle: 'system' },
      { richtung: 'outbound', sender_rolle: 'system' },
    ])
    expect(await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1' })).toBe(false)
  })

  it('false bei keiner Nachricht', async () => {
    const { db } = mockDb([])
    expect(await hatKuerzlichMenschlicheKonversation(db, { leadId: 'l1' })).toBe(false)
  })

  it('false ohne Kennung (kein Query moeglich)', async () => {
    const { db } = mockDb([{ richtung: 'inbound', sender_rolle: null }])
    expect(await hatKuerzlichMenschlicheKonversation(db, {})).toBe(false)
  })

  it('fail-open: Query-Fehler -> false (Reminder laeuft, nie faelschlich verschluckt)', async () => {
    const { db } = mockDb(null, true)
    expect(await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1' })).toBe(false)
  })

  it('prueft BEIDE Achsen (claim_id OR lead_id), wenn beide vorliegen', async () => {
    const { db, chain } = mockDb([{ richtung: 'inbound', sender_rolle: null }])
    const treffer = await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1', leadId: 'l1', telefon: '+49170123456' })
    expect(treffer).toBe(true)
    // OR ueber beide Bezug-Achsen; Telefon-ilike NICHT genutzt, wenn claim/lead vorliegen.
    expect(chain.or).toHaveBeenCalledWith('claim_id.eq.c1,lead_id.eq.l1')
    expect(chain.ilike).not.toHaveBeenCalled()
  })

  it('faellt auf Telefon-ilike zurueck, wenn weder claimId noch leadId vorliegen', async () => {
    const { db, chain } = mockDb([{ richtung: 'inbound', sender_rolle: null }])
    await hatKuerzlichMenschlicheKonversation(db, { telefon: '+49 170 1234567' })
    expect(chain.or).not.toHaveBeenCalled()
    expect(chain.ilike).toHaveBeenCalledWith('empfaenger_kontakt', '%701234567%')
  })
})
