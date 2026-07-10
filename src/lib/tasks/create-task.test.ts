import { describe, it, expect, vi, beforeEach } from 'vitest'

// Faengt das insert-Payload ab, das createLinkedTask an tasks schickt.
const { insertSpy } = vi.hoisted(() => ({ insertSpy: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (payload: unknown) => {
        insertSpy(payload)
        return { select: () => ({ single: async () => ({ data: { id: 'task-1' }, error: null }) }) }
      },
    }),
  }),
}))
// Non-critical Side-Effects abklemmen (werden mit Minimal-Params ohnehin nicht getriggert).
vi.mock('@/lib/tasks/reminder-generator', () => ({ generateReminderForTask: vi.fn() }))
vi.mock('@/lib/tasks/auto-assign', () => ({ chooseAssigneeForRolle: vi.fn(async () => null) }))
vi.mock('@/lib/fall/log-event', () => ({ logFallEvent: vi.fn() }))

import { createLinkedTask } from './create-task'

describe('createLinkedTask claim_id-Persistierung', () => {
  beforeEach(() => insertSpy.mockClear())

  it('schreibt claim_id in den tasks-insert wenn angegeben', async () => {
    const { task_id } = await createLinkedTask({ titel: 'X', fall_id: 'fall-1', claim_id: 'claim-1' })
    expect(task_id).toBe('task-1')
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ claim_id: 'claim-1', fall_id: 'fall-1' }))
  })

  it('claim_id optional → null wenn nicht angegeben', async () => {
    await createLinkedTask({ titel: 'Y', fall_id: 'fall-1' })
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ claim_id: null }))
  })
})
