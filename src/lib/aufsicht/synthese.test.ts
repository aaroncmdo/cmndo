import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted: alle Spies/Stubs muessen VOR den vi.mock()-Aufrufen existieren.
const h = vi.hoisted(() => {
  const insertSpy = vi.fn(
    async (
      _row: Record<string, unknown>,
    ): Promise<{ error: { code: string; message: string } | null }> => ({ error: null }),
  )
  const deleteEqSpy = vi.fn()
  type DelChain = { eq: (c: string, v: string) => DelChain; then: (r: (v: { error: null }) => void) => void }
  const deleteChain: DelChain = {
    eq: (c, v) => { deleteEqSpy(c, v); return deleteChain },
    then: (r) => r({ error: null }),
  }
  const db = {
    from: (_table: string) => ({
      insert: insertSpy,
      delete: () => deleteChain,
    }),
  }
  const anthropicMessagesSpy = vi.fn()
  const AnthropicConstructorSpy = vi.fn()
  return { insertSpy, deleteEqSpy, db, anthropicMessagesSpy, AnthropicConstructorSpy }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => h.db,
}))

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages: { create: ReturnType<typeof vi.fn> }
    constructor(...args: unknown[]) {
      h.AnthropicConstructorSpy(...args)
      this.messages = { create: h.anthropicMessagesSpy }
    }
  }
  return { default: Anthropic }
})

vi.mock('@/lib/ai/usage-log', () => ({
  logAiUsage: vi.fn(async () => undefined),
}))

import { extractAufsichtDrafts, persistAufsichtRemediation, clearOpenAufsichtProposals } from './synthese'
import type { AufsichtDraft } from './synthese'
import type Anthropic from '@anthropic-ai/sdk'

// --- extractAufsichtDrafts ---

describe('extractAufsichtDrafts', () => {
  it('ignoriert text-Bloecke', () => {
    const content: Record<string, unknown>[] = [
      { type: 'text', text: 'Hier ist meine Analyse der SLA-Lage...' },
    ]
    const result = extractAufsichtDrafts(content as unknown as Anthropic.ContentBlock[])
    expect(result).toHaveLength(0)
  })

  it('ignoriert invalide tool_use-Bloecke (fehlendes claim_id)', () => {
    const content: Record<string, unknown>[] = [
      {
        type: 'tool_use',
        id: 'tu1',
        name: 'propose_sla_task',
        input: {
          // claim_id fehlt -> Zod sollte ablehnen
          ziel_rolle: 'dispatch',
          titel: 'SLA eskalieren',
          begruendung: 'Breach seit 2 Tagen',
        },
      },
    ]
    const result = extractAufsichtDrafts(content as unknown as Anthropic.ContentBlock[])
    expect(result).toHaveLength(0)
  })

  it('ignoriert unbekannte Tool-Namen', () => {
    const content: Record<string, unknown>[] = [
      {
        type: 'tool_use',
        id: 'tu2',
        name: 'unbekannt_tool',
        input: {
          claim_id: 'c1',
          ziel_rolle: 'dispatch',
          titel: 'Test',
          begruendung: 'Grund',
        },
      },
    ]
    const result = extractAufsichtDrafts(content as unknown as Anthropic.ContentBlock[])
    expect(result).toHaveLength(0)
  })

  it('extrahiert valide propose_sla_task-Bloecke', () => {
    const content: Record<string, unknown>[] = [
      {
        type: 'tool_use',
        id: 'tu3',
        name: 'propose_sla_task',
        input: {
          claim_id: 'c1',
          ziel_rolle: 'sachverstaendiger',
          titel: 'Gutachten sofort einreichen',
          begruendung: 'SLA seit 48h ueberschritten',
          prioritaet: 'kritisch',
        },
      },
    ]
    const result = extractAufsichtDrafts(content as unknown as Anthropic.ContentBlock[])
    expect(result).toHaveLength(1)
    expect(result[0].claimId).toBe('c1')
    expect(result[0].zielRolle).toBe('sachverstaendiger')
    expect(result[0].titel).toBe('Gutachten sofort einreichen')
    expect(result[0].begruendung).toBe('SLA seit 48h ueberschritten')
    expect(result[0].prioritaet).toBe('kritisch')
  })

  it('setzt Default-Prioritaet auf normal wenn weggelassen', () => {
    const content: Record<string, unknown>[] = [
      {
        type: 'tool_use',
        id: 'tu4',
        name: 'propose_sla_task',
        input: {
          claim_id: 'c2',
          ziel_rolle: 'kanzlei',
          titel: 'Anschreiben versenden',
          begruendung: 'Kanzlei-SLA abgelaufen',
          // prioritaet weggelassen
        },
      },
    ]
    const result = extractAufsichtDrafts(content as unknown as Anthropic.ContentBlock[])
    expect(result).toHaveLength(1)
    expect(result[0].prioritaet).toBe('normal')
  })

  it('filtert invalide ziel_rolle heraus', () => {
    const content: Record<string, unknown>[] = [
      {
        type: 'tool_use',
        id: 'tu5',
        name: 'propose_sla_task',
        input: {
          claim_id: 'c3',
          ziel_rolle: 'unbekannte_rolle', // nicht im Enum
          titel: 'Task',
          begruendung: 'Grund',
        },
      },
    ]
    const result = extractAufsichtDrafts(content as unknown as Anthropic.ContentBlock[])
    expect(result).toHaveLength(0)
  })

  it('extrahiert mehrere valide Bloecke', () => {
    const content: Record<string, unknown>[] = [
      { type: 'text', text: 'Analyse...' },
      {
        type: 'tool_use',
        id: 'tu6',
        name: 'propose_sla_task',
        input: {
          claim_id: 'c1',
          ziel_rolle: 'dispatch',
          titel: 'SV zuweisen',
          begruendung: 'Kein SV nach 3 Tagen',
          prioritaet: 'dringend',
        },
      },
      {
        type: 'tool_use',
        id: 'tu7',
        name: 'propose_sla_task',
        input: {
          claim_id: 'c2',
          ziel_rolle: 'admin',
          titel: 'QC-Filmcheck ueberpruefen',
          begruendung: 'Filmcheck blockiert seit 7 Tagen',
        },
      },
    ]
    const result = extractAufsichtDrafts(content as unknown as Anthropic.ContentBlock[])
    expect(result).toHaveLength(2)
    expect(result[0].zielRolle).toBe('dispatch')
    expect(result[1].zielRolle).toBe('admin')
  })
})

// --- persistAufsichtRemediation ---

describe('persistAufsichtRemediation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.insertSpy.mockResolvedValue({ error: null })
  })

  it('inserted mit quelle=aufsicht fuer jeden Draft', async () => {
    const drafts: AufsichtDraft[] = [
      {
        claimId: 'claim-1',
        zielRolle: 'sachverstaendiger',
        titel: 'Gutachten einreichen',
        begruendung: 'SLA verletzt',
        prioritaet: 'kritisch',
      },
    ]

    const ids = await persistAufsichtRemediation('claude-sonnet-5', drafts)

    expect(h.insertSpy).toHaveBeenCalledTimes(1)

    const insertArg = h.insertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.claim_id).toBe('claim-1')
    expect(insertArg.quelle).toBe('aufsicht')
    expect(insertArg.vorschlag_typ).toBe('task')
    expect(insertArg.ziel_rolle).toBe('sachverstaendiger')
    expect(insertArg.modell).toBe('claude-sonnet-5')
    expect((insertArg.payload as Record<string, unknown>).titel).toBe('Gutachten einreichen')
    expect((insertArg.payload as Record<string, unknown>).prioritaet).toBe('kritisch')
    expect(insertArg.begruendung).toBe('SLA verletzt')
    expect(typeof insertArg.dedupe_key).toBe('string')
    expect((insertArg.dedupe_key as string).length).toBeGreaterThan(0)

    expect(ids).toHaveLength(1)
    expect(typeof ids[0]).toBe('string')
  })

  it('inserted mehrere Drafts unabhaengig', async () => {
    const drafts: AufsichtDraft[] = [
      { claimId: 'c1', zielRolle: 'dispatch', titel: 'SV suchen', begruendung: 'Grund 1', prioritaet: 'normal' },
      { claimId: 'c2', zielRolle: 'kanzlei', titel: 'AS versenden', begruendung: 'Grund 2', prioritaet: 'dringend' },
    ]

    const ids = await persistAufsichtRemediation('claude-sonnet-5', drafts)

    expect(h.insertSpy).toHaveBeenCalledTimes(2)
    expect(ids).toHaveLength(2)

    // Pruefe beide haben quelle=aufsicht
    for (let i = 0; i < 2; i++) {
      const arg = h.insertSpy.mock.calls[i][0] as Record<string, unknown>
      expect(arg.quelle).toBe('aufsicht')
    }
  })

  it('gibt leeres Array zurueck bei 0 Drafts', async () => {
    const ids = await persistAufsichtRemediation('claude-sonnet-5', [])
    expect(ids).toHaveLength(0)
    expect(h.insertSpy).not.toHaveBeenCalled()
  })

  it('ueberspringt still bei DB-Fehler (23505 Dedup)', async () => {
    h.insertSpy.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } })

    const drafts: AufsichtDraft[] = [
      { claimId: 'c1', zielRolle: 'dispatch', titel: 'Doppelter Task', begruendung: 'Grund', prioritaet: 'normal' },
    ]

    // Soll nicht werfen, nur stilles Ueberspringen
    await expect(persistAufsichtRemediation('claude-sonnet-5', drafts)).resolves.not.toThrow()
  })

  it('mappt Aufsicht-Rollen auf gueltige DB-ziel_rolle (dispatch/kanzlei -> kundenbetreuer)', async () => {
    // ai_claim_proposals.ziel_rolle_check erlaubt NUR sachverstaendiger/kundenbetreuer/admin.
    // dispatch/kanzlei sind keine Empfaenger-Rollen -> muessen gemappt werden (sonst 23514).
    const drafts: AufsichtDraft[] = [
      { claimId: 'c1', zielRolle: 'dispatch', titel: 'T', begruendung: 'G', prioritaet: 'normal' },
      { claimId: 'c2', zielRolle: 'kanzlei', titel: 'T', begruendung: 'G', prioritaet: 'normal' },
      { claimId: 'c3', zielRolle: 'sachverstaendiger', titel: 'T', begruendung: 'G', prioritaet: 'normal' },
      { claimId: 'c4', zielRolle: 'admin', titel: 'T', begruendung: 'G', prioritaet: 'normal' },
    ]
    await persistAufsichtRemediation('m', drafts)
    const rollen = h.insertSpy.mock.calls.map((c) => (c[0] as Record<string, unknown>).ziel_rolle)
    expect(rollen).toEqual(['kundenbetreuer', 'kundenbetreuer', 'sachverstaendiger', 'admin'])
  })
})

describe('clearOpenAufsichtProposals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loescht quelle=aufsicht + status=offen (Replace-Strategie), wirft nie', async () => {
    await expect(clearOpenAufsichtProposals()).resolves.toBeUndefined()
    expect(h.deleteEqSpy).toHaveBeenCalledWith('quelle', 'aufsicht')
    expect(h.deleteEqSpy).toHaveBeenCalledWith('status', 'offen')
  })
})
