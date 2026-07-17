// TDD-Tests fuer claims-missing-pflichtdokumente Health-Check.
// Dispatch per TABELLENNAME (nicht Call-Count), weil der Check drei Queries fahren kann:
//   claims          .select('id, lead_id').is().is().gt()  -> Kandidaten {id, lead_id}
//   leads           .select('id, email').in()              -> Lead-Emails {id, email} (Test-Filter)
//   pflichtdokumente .select('fall_id').in()               -> abgedeckte {fall_id}
import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { claimsMissingPflichtdokumenteCheck } from '../claims-missing-pflichtdokumente'

function makeCtx(opts: {
  candidates: Array<{ id: string; lead_id: string | null }>
  leads?: Array<{ id: string; email: string | null }>
  coveredFallIds?: string[]
  claimsError?: string
  leadsError?: string
  pdError?: string
}): CheckCtx {
  const supabase = {
    from(table: string) {
      if (table === 'claims') {
        const res = opts.claimsError
          ? { data: null, error: { message: opts.claimsError } }
          : { data: opts.candidates, error: null }
        return { select: () => ({ is: () => ({ is: () => ({ gt: () => Promise.resolve(res) }) }) }) }
      }
      if (table === 'leads') {
        const res = opts.leadsError
          ? { data: null, error: { message: opts.leadsError } }
          : { data: opts.leads ?? [], error: null }
        return { select: () => ({ in: () => Promise.resolve(res) }) }
      }
      // pflichtdokumente
      const res = opts.pdError
        ? { data: null, error: { message: opts.pdError } }
        : { data: (opts.coveredFallIds ?? []).map((fall_id) => ({ fall_id })), error: null }
      return { select: () => ({ in: () => Promise.resolve(res) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

// Kandidaten mit ECHTER (nicht-interner) Lead-Email -> werden NICHT ausgeschlossen.
function echt(ids: string[]): {
  candidates: Array<{ id: string; lead_id: string }>
  leads: Array<{ id: string; email: string }>
} {
  return {
    candidates: ids.map((id) => ({ id, lead_id: `lead-${id}` })),
    leads: ids.map((id) => ({ id: `lead-${id}`, email: `kunde-${id}@web.de` })),
  }
}

describe('claimsMissingPflichtdokumenteCheck', () => {
  it('hat korrekte id und category', () => {
    expect(claimsMissingPflichtdokumenteCheck.id).toBe('claims-missing-pflichtdokumente')
    expect(claimsMissingPflichtdokumenteCheck.category).toBe('funnel')
  })

  it('ok wenn keine Kandidaten (leeres 14d-Fenster)', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx({ candidates: [] }))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('ok wenn alle Kandidaten Slots haben', async () => {
    const { candidates, leads } = echt(['a', 'b'])
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({ candidates, leads, coveredFallIds: ['a', 'b'] }),
    )
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('warn wenn 1 Kandidat ohne Slots', async () => {
    const { candidates, leads } = echt(['a', 'b'])
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({ candidates, leads, coveredFallIds: ['a'] }),
    )
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.sampleIds).toEqual(['b'])
  })

  it('crit wenn >= 3 Kandidaten ohne Slots', async () => {
    const { candidates, leads } = echt(['a', 'b', 'c', 'd'])
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({ candidates, leads, coveredFallIds: ['a'] }),
    )
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(3)
  })

  it('sampleIds bei > 5 Verletzungen auf 5 begrenzt', async () => {
    const { candidates, leads } = echt(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({ candidates, leads, coveredFallIds: [] }),
    )
    expect(result.metric).toBe(7)
    expect(result.sampleIds).toHaveLength(5)
  })

  it('error bei DB-Fehler in Query 1 (claims)', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({ candidates: [], claimsError: 'timeout' }),
    )
    expect(result.status).toBe('error')
    expect(result.detail).toContain('timeout')
  })

  it('error bei DB-Fehler in Query 2 (pflichtdokumente)', async () => {
    const { candidates, leads } = echt(['a'])
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({ candidates, leads, pdError: 'boom' }),
    )
    expect(result.status).toBe('error')
    expect(result.detail).toContain('boom')
  })

  // ── Test-/interne-Ausschluss (17.07.) ──────────────────────────────────────

  it('schliesst Test-/interne Claims aus (Lead-Email @claimondo.de/.test) -> ok', async () => {
    // 4 Kandidaten ohne Slots -> waere crit; aber alle mit interner Lead-Email -> ausgeschlossen.
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({
        candidates: [
          { id: 'a', lead_id: 'la' },
          { id: 'b', lead_id: 'lb' },
          { id: 'c', lead_id: 'lc' },
          { id: 'd', lead_id: 'ld' },
        ],
        leads: [
          { id: 'la', email: 'test-kunde+c1@claimondo.de' },
          { id: 'lb', email: 'smoke-embed-e2e@claimondo.test' },
          { id: 'lc', email: 'aaron.sprafke@claimondo.de' },
          { id: 'ld', email: 'test@gmail.com' },
        ],
        coveredFallIds: [],
      }),
    )
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('zaehlt echte Kunden-Claims, ignoriert interne (gemischt)', async () => {
    // a = intern (ausgeschlossen), b = echter Kunde ohne Slots -> warn 1, sampleIds ['b'].
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({
        candidates: [
          { id: 'a', lead_id: 'la' },
          { id: 'b', lead_id: 'lb' },
        ],
        leads: [
          { id: 'la', email: 'smoke-kunde@claimondo.de' },
          { id: 'lb', email: 'echte.kundin@gmx.de' },
        ],
        coveredFallIds: [],
      }),
    )
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.sampleIds).toEqual(['b'])
  })

  it('DB-Fehler bei der leads-Query -> konservativ ALLE Kandidaten behalten (nicht verstecken)', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(
      makeCtx({
        candidates: [
          { id: 'a', lead_id: 'la' },
          { id: 'b', lead_id: 'lb' },
        ],
        leadsError: 'leads down',
        coveredFallIds: [],
      }),
    )
    // Kein Ausschluss -> beide ohne Slots -> warn 2.
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(2)
  })
})
