import { describe, it, expect } from 'vitest'
import { saveOnboardingFields } from './save-onboarding-fields'
import type { OnboardingTableHandler } from './table-handlers/types'
import type { OnboardingWriteContext } from './write-context'
import type { OnboardingFeld } from '@/components/onboarding/types'

// Test-Helper: minimaler OnboardingFeld (Router liest nur feld_key / typ / db_target).
function feld(feld_key: string, tabelle: string, spalte: string, typ: OnboardingFeld['typ'] = 'text'): OnboardingFeld {
  return { id: feld_key, phase_id: 'p', reihenfolge: 0, feld_key, typ, label: '', pflicht: false, db_target: { tabelle, spalte } }
}

const ctx: OnboardingWriteContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: {} as any,
  user: { id: 'u1' },
  audience: 'kunde',
  fallId: 'f1',
}

type Recording = OnboardingTableHandler & { calls: Array<{ felder: OnboardingFeld[]; values: Record<string, unknown> }> }
function recordingHandler(tabelle: string, id = `${tabelle}-id`): Recording {
  const calls: Recording['calls'] = []
  return {
    tabelle,
    calls,
    async apply(_c, felder, values) {
      calls.push({ felder: felder as OnboardingFeld[], values })
      return { ok: true, id }
    },
  }
}

describe('saveOnboardingFields (Router)', () => {
  it('gruppiert felder nach tabelle und dispatcht an den jeweiligen Handler', async () => {
    const claims = recordingHandler('claims')
    const parties = recordingHandler('claim_parties')
    const felder = [feld('a', 'claims', 'col_a'), feld('b', 'claims', 'col_b'), feld('g', 'claim_parties', 'kennzeichen')]
    const r = await saveOnboardingFields(ctx, felder, { a: '1', b: '2', g: 'XX' }, { claims, claim_parties: parties })
    expect(r.ok).toBe(true)
    expect(claims.calls).toHaveLength(1)
    expect(claims.calls[0].felder.map((f) => f.feld_key)).toEqual(['a', 'b'])
    expect(parties.calls).toHaveLength(1)
    expect(parties.calls[0].felder.map((f) => f.feld_key)).toEqual(['g'])
  })

  it('skippt _-prefixed Sentinel-Targets (_finalize/_termin/_self) ohne Handler-Dispatch', async () => {
    const claims = recordingHandler('claims')
    const felder = [
      feld('a', 'claims', 'col_a'),
      feld('s', '_finalize', 'unterschrift'),
      feld('t', '_termin', 'termin_id'),
      feld('u', '_self', 'kalender_connected'),
    ]
    const r = await saveOnboardingFields(ctx, felder, { a: '1', s: 'x', t: 'y', u: 'z' }, { claims })
    expect(r.ok).toBe(true)
    expect(claims.calls[0].felder.map((f) => f.feld_key)).toEqual(['a'])
  })

  it('unbekannte tabelle (kein Handler) -> harter Fehler statt stillem continue', async () => {
    const r = await saveOnboardingFields(ctx, [feld('x', 'verboten', 'spalte_x')], { x: 'y' }, { claims: recordingHandler('claims') })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('verboten')
  })

  it('Handler-Fehler propagiert (erste Fehler-Gruppe bricht ab)', async () => {
    const failing: OnboardingTableHandler = { tabelle: 'claims', apply: async () => ({ ok: false, error: 'boom' }) }
    const r = await saveOnboardingFields(ctx, [feld('a', 'claims', 'col_a')], { a: '1' }, { claims: failing })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('boom')
  })

  it('gfa-Handler-id wird als anfrageId zurueckgegeben (Shell-Insert-Kontinuitaet)', async () => {
    const gfa = recordingHandler('gutachter_finder_anfragen', 'new-anfrage-id')
    const anonCtx: OnboardingWriteContext = { ...ctx, audience: 'anon', fallId: null, anfrageId: null }
    const r = await saveOnboardingFields(anonCtx, [feld('e', 'gutachter_finder_anfragen', 'email')], { e: 'a@b.de' }, { gutachter_finder_anfragen: gfa })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.anfrageId).toBe('new-anfrage-id')
  })

  it('ohne gfa: anfrageId faellt auf den ctx-Kontext (fallId) zurueck, NICHT auf die Handler-id', async () => {
    const r = await saveOnboardingFields(ctx, [feld('a', 'claims', 'col_a')], { a: '1' }, { claims: recordingHandler('claims', 'claim-99') })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.anfrageId).toBe('f1')
  })
})
