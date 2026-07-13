// src/lib/task-executor/run.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/claim-ai/engine/call', () => ({
  callForProposals: vi.fn(async (input) =>
    input.extract([
      { type: 'tool_use', id: 'a', name: 'sende_kommunikation', input: { trigger: 'dokumente_nachreichen', variablen: {}, begruendung: 'Doks fehlen' } },
      { type: 'tool_use', id: 'b', name: 'task_schliessen', input: { ergebnis: 'Erinnerung raus' } },
    ]),
  ),
}))
vi.mock('@/lib/orchestrator/context', () => ({
  buildClaimContext: vi.fn().mockResolvedValue({ claimId: 'c1', fallId: 'f1', status: 'ersterfassung', phase: 'ersterfassung', letzteAktivitaetAm: null, tageInaktiv: 5, fahrzeug: null, offeneTasks: [], kurzverlauf: [], bereitsVorgeschlagen: [] }),
  summarizeClaimForPrompt: vi.fn().mockReturnValue('KONTEXT'),
}))

import { planTaskExecution } from './run'
import { callForProposals } from '@/lib/claim-ai/engine/call'
import type { TaskRow } from './types'

const task: TaskRow = { id: 't1', typ: 'sa_ausstehend', titel: 'SA ausstehend', beschreibung: 'seit 5 Tagen', status: 'offen', claim_id: 'c1', fall_id: 'f1', empfaenger_rolle: null }

describe('planTaskExecution', () => {
  it('baut aus LLM-tool_use einen consequential-Plan mit schliessen zuletzt', async () => {
    const plan = await planTaskExecution(task)
    expect(plan.hatConsequential).toBe(true)
    expect(plan.steps.map((s) => s.verb)).toEqual(['sende_kommunikation', 'task_schliessen'])
    // ruft die Engine mit dem vollen Belt (4 tools) + task_executor-Endpoint
    const arg = (callForProposals as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.logEndpoint).toBe('task_executor')
    expect(arg.tools).toHaveLength(4)
    expect(arg.userContent).toContain('KONTEXT')
  })
})
