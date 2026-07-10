import { describe, it, expect } from 'vitest'
import { prunePartnerRang } from '../prune'

describe('prunePartnerRang', () => {
  it('loescht je Typ Zeilen NICHT im Kandidaten-Set (not-in) + Leeres-Set-Guard', async () => {
    const calls: Array<Record<string, unknown>> = []
    const makeDelete = () => {
      const rec: Record<string, unknown> = {}
      const chain = {
        eq: (_col: string, val: unknown) => { rec.typ = val; return chain },
        not: (col: string, op: string, val: unknown) => {
          rec.notCol = col; rec.notOp = op; rec.notVal = val; calls.push(rec)
          return Promise.resolve({ error: null })
        },
      }
      return chain
    }
    const supabase = { from: () => ({ delete: () => makeDelete() }) }
    const rows = [
      { partner_typ: 'makler', partner_id: 'm1' },
      { partner_typ: 'makler', partner_id: 'm2' },
      { partner_typ: 'sachverstaendiger', partner_id: 's1' },
      // werkstatt: leeres Kandidaten-Set -> Guard -> kein delete
    ]
    await prunePartnerRang(supabase as unknown as Parameters<typeof prunePartnerRang>[0], rows)

    expect(calls).toHaveLength(2) // makler + sachverstaendiger; werkstatt uebersprungen
    const makler = calls.find((c) => c.typ === 'makler')!
    expect(makler.notCol).toBe('partner_id')
    expect(makler.notOp).toBe('in')
    expect(makler.notVal).toBe('(m1,m2)') // not-in genau die behaltenen IDs
    expect(calls.find((c) => c.typ === 'werkstatt')).toBeUndefined()
  })

  it('leeres rows -> gar kein delete (kein Massen-Delete)', async () => {
    let deletes = 0
    const supabase = {
      from: () => ({
        delete: () => { deletes++; return { eq: () => ({ not: () => Promise.resolve({ error: null }) }) } },
      }),
    }
    await prunePartnerRang(supabase as unknown as Parameters<typeof prunePartnerRang>[0], [])
    expect(deletes).toBe(0)
  })
})
