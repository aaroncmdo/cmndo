import { describe, it, expect, vi } from 'vitest'
import { notifyWerkstattKundenreaktion } from '../notify-werkstatt-kundenreaktion'

function fakeSvc(userId: string | null) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: userId ? { user_id: userId } : null }) }) }) }),
  } as never
}

describe('notifyWerkstattKundenreaktion', () => {
  it('schickt In-App an die Werkstatt bei bestaetigt', async () => {
    const createNotification = vi.fn(async () => {})
    const res = await notifyWerkstattKundenreaktion(
      { werkstattId: 'ws-1', ereignis: 'bestaetigt', svc: fakeSvc('user-ws') },
      { createNotification },
    )
    expect(res.inApp).toBe(true)
    expect(createNotification).toHaveBeenCalledOnce()
  })
  it('kein user_id → kein Notify, kein Fehler', async () => {
    const createNotification = vi.fn(async () => {})
    const res = await notifyWerkstattKundenreaktion(
      { werkstattId: 'ws-x', ereignis: 'rueckruf_erbeten', rueckrufWunschzeit: '2026-07-15T09:00:00Z', svc: fakeSvc(null) },
      { createNotification },
    )
    expect(res.inApp).toBe(false)
    expect(createNotification).not.toHaveBeenCalled()
  })
})
