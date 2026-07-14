import { describe, it, expect, vi, beforeEach } from 'vitest'

const createdTasks: Array<Record<string, unknown>> = []
const existingTask = { value: null as { id: string } | null }

vi.mock('@/lib/tasks/create-task', () => ({
  createLinkedTask: async (p: Record<string, unknown>) => {
    createdTasks.push(p)
    return { task_id: 'task-1' }
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.in = () => b
      b.maybeSingle = async () => ({ data: existingTask.value, error: null })
      return b
    },
  }),
}))

beforeEach(() => {
  createdTasks.length = 0
  existingTask.value = null
})

describe('erstelleVsDispatchTask', () => {
  it('legt einen Dispatch-Task mit CHECK-konformem entity_type an', async () => {
    const { erstelleVsDispatchTask } = await import('../dispatch-task')
    await erstelleVsDispatchTask({ claimId: 'claim-1', grund: 'keine_versicherung' })

    expect(createdTasks).toHaveLength(1)
    const t = createdTasks[0]
    expect(t.empfaenger_rolle).toBe('dispatch')
    expect(t.claim_id).toBe('claim-1')
    // 'versicherung' steht NICHT im DB-CHECK -> waere ein Silent Fail
    expect(t.entity_type).toBe('fall')
    expect(t.task_code).toBe('vs_meldung_keine_versicherung:claim-1')
    // Der Titel muss dem Dispatcher sagen, WAS fehlt (er sieht ihn im Kanban ohne Kontext)
    expect(String(t.titel)).toContain('Haftpflicht')
    expect(t.prioritaet).toBe('dringend')
  })

  it('dedupliziert: existiert schon ein offener Task mit dem task_code, kein zweiter', async () => {
    existingTask.value = { id: 'task-existing' }
    const { erstelleVsDispatchTask } = await import('../dispatch-task')
    const res = await erstelleVsDispatchTask({ claimId: 'claim-1', grund: 'keine_versicherung' })

    expect(res.ok).toBe(true)
    expect(createdTasks).toHaveLength(0)
  })

  it('jeder Grund bekommt einen eigenen Titel + task_code', async () => {
    const { erstelleVsDispatchTask } = await import('../dispatch-task')
    for (const grund of ['kein_telefon', 'keine_schaden_email', 'nicht_bestaetigt', 'send_fehler'] as const) {
      await erstelleVsDispatchTask({ claimId: 'c', grund })
    }
    const codes = createdTasks.map((t) => t.task_code)
    expect(new Set(codes).size).toBe(4)
    expect(createdTasks.every((t) => String(t.titel).length > 10)).toBe(true)
  })

  it('detail wird an die Beschreibung angehaengt', async () => {
    const { erstelleVsDispatchTask } = await import('../dispatch-task')
    await erstelleVsDispatchTask({ claimId: 'c', grund: 'send_fehler', detail: 'SMTP timeout' })
    expect(String(createdTasks[0].beschreibung)).toContain('SMTP timeout')
  })
})
