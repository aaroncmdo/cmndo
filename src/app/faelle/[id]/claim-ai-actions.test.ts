import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted: declare spies BEFORE vi.mock factories (hoisting workaround)
const { decideSpy, taskSpy, logSpy, sendChatSpy } = vi.hoisted(() => ({
  decideSpy: vi.fn(async () => ({ ok: true })),
  taskSpy: vi.fn(async () => ({ task_id: 't1' })),
  logSpy: vi.fn(async () => {}),
  sendChatSpy: vi.fn(async () => ({ success: true })),
}))

let proposalRow: Record<string, unknown> = {
  id: 'p1',
  claim_id: 'c1',
  vorschlag_typ: 'draft_message',
  ziel_rolle: null,
  payload: { kanal: 'email', text: '…' },
  begruendung: 'Test-Begruendung',
  status: 'offen',
}

vi.mock('@/lib/orchestrator/proposals', () => ({ decideProposal: decideSpy }))
vi.mock('@/lib/orchestrator/task-from-proposal', () => ({ buildTaskFromProposal: taskSpy }))
vi.mock('@/lib/fall/log-event', () => ({ logFallEvent: logSpy }))
vi.mock('@/lib/communications/send-chat', () => ({ sendChatMessage: sendChatSpy }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { rolle: 'admin' } }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: proposalRow }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }),
}))

import { freigebenClaimAiVorschlag, sendeClaimAiEntwurf } from './claim-ai-actions'

beforeEach(() => {
  decideSpy.mockClear()
  sendChatSpy.mockClear()
  logSpy.mockClear()
  taskSpy.mockClear()
})

describe('freigebenClaimAiVorschlag', () => {
  it('draft_message: Freigabe sendet NICHT, markiert angenommen', async () => {
    proposalRow = {
      id: 'p1',
      claim_id: 'c1',
      vorschlag_typ: 'draft_message',
      ziel_rolle: null,
      payload: { kanal: 'email', text: '…' },
      begruendung: 'Test-Begruendung',
      status: 'offen',
    }
    const r = await freigebenClaimAiVorschlag('p1', 'fall-1')
    expect(r.ok).toBe(true)
    expect(sendChatSpy).not.toHaveBeenCalled()
    expect(decideSpy).toHaveBeenCalledWith('p1', 'angenommen', 'admin-1')
  })

  it('Idempotenz: bereits bearbeiteter Vorschlag wird abgelehnt', async () => {
    proposalRow = {
      id: 'p1',
      claim_id: 'c1',
      vorschlag_typ: 'draft_message',
      ziel_rolle: null,
      payload: { kanal: 'email', text: '…' },
      begruendung: 'Test-Begruendung',
      status: 'angenommen',
    }
    const r = await freigebenClaimAiVorschlag('p1', 'fall-1')
    expect(r.ok).toBe(false)
  })

  it('add_note: ruft logFallEvent mit fallId (nicht claim_id)', async () => {
    proposalRow = {
      id: 'p2',
      claim_id: 'c1',
      vorschlag_typ: 'add_note',
      ziel_rolle: null,
      payload: { titel: 'Test-Notiz', text: 'Inhalt der Notiz' },
      begruendung: 'Doku-Luecke erkannt',
      status: 'offen',
    }
    const r = await freigebenClaimAiVorschlag('p2', 'fall-99')
    expect(r.ok).toBe(true)
    // logFallEvent must be called with fallId='fall-99' (NOT claim_id='c1')
    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fallId: 'fall-99' }),
    )
  })

  it('task: ruft buildTaskFromProposal mit claim_id (nicht fallId)', async () => {
    proposalRow = {
      id: 'p3',
      claim_id: 'c1',
      vorschlag_typ: 'task',
      ziel_rolle: 'kundenbetreuer',
      payload: { titel: 'Kunde anrufen', beschreibung: 'seit 3 Tagen keine Antwort' },
      begruendung: 'Inaktivitaet',
      status: 'offen',
    }
    const r = await freigebenClaimAiVorschlag('p3', 'fall-1')
    expect(r.ok).toBe(true)
    // buildTaskFromProposal must receive claim_id='c1' (NOT fallId='fall-1')
    expect(taskSpy).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Kunde anrufen' }),
      'kundenbetreuer',
      'c1',
      'claim_ai_copilot',
    )
  })
})

describe('sendeClaimAiEntwurf', () => {
  it('sendet freigegebenen Entwurf ueber sendChatMessage (Free-Text-Pfad)', async () => {
    proposalRow = {
      id: 'p1',
      claim_id: 'c1',
      vorschlag_typ: 'draft_message',
      ziel_rolle: null,
      payload: { kanal: 'whatsapp', text: 'Sehr geehrter Kunde …' },
      begruendung: 'Nachfrage Unterlagen',
      status: 'angenommen',
      ausfuehrung_ergebnis: { kind: 'draft' },
    }
    const r = await sendeClaimAiEntwurf('p1', 'fall-1')
    expect(r.ok).toBe(true)
    // Free-Text-Send mit fallId (Route-Param), Kanal + Text aus payload
    expect(sendChatSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fallId: 'fall-1', kanal: 'whatsapp', nachricht: 'Sehr geehrter Kunde …' }),
    )
  })

  it('Doppel-Send-Guard: bereits gesendeter Entwurf wird abgelehnt (kein 2. Send)', async () => {
    proposalRow = {
      id: 'p1',
      claim_id: 'c1',
      vorschlag_typ: 'draft_message',
      ziel_rolle: null,
      payload: { kanal: 'email', text: 'Sehr geehrter Kunde …' },
      begruendung: 'Nachfrage Unterlagen',
      status: 'angenommen',
      ausfuehrung_ergebnis: { kind: 'draft', sent_at: '2026-07-07T10:00:00Z' },
    }
    const r = await sendeClaimAiEntwurf('p1', 'fall-1')
    expect(r.ok).toBe(false)
    expect(sendChatSpy).not.toHaveBeenCalled()
  })
})
