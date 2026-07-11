import { describe, it, expect } from 'vitest'
import { computeRecipients } from './fan-out'
import type { NotificationEvent } from './types'

// AAR-826: gast.conversion_reminder ist NICHT claim-basiert — der Reminder geht
// an den Gast-User selbst (payload.userId). Ohne Sonderfall im fan-out liefe er
// in den claim-basierten Standard-Fan-Out, faende keine claim_id und wuerde
// stillschweigend 0 Empfaenger liefern (Event -> completed, keine Mail).

function gastEvent(userId: string | null): NotificationEvent {
  return {
    id: 'evt-1',
    event_type: 'gast.conversion_reminder',
    payload: userId ? { userId } : {},
    fall_id: null,
    claim_id: null,
    triggered_by_user_id: null,
    created_at: '2026-07-11T10:00:00Z',
    processed_at: null,
    status: 'pending',
    error_message: null,
    retry_count: 0,
    next_retry_at: null,
  }
}

describe('computeRecipients — gast.conversion_reminder (AAR-826)', () => {
  it('richtet den Reminder an den Gast selbst (payload.userId, Rolle kunde, Channel email)', async () => {
    const recipients = await computeRecipients(gastEvent('gast-user-1'))
    expect(recipients).toEqual([
      { userId: 'gast-user-1', role: 'kunde', channels: ['email'] },
    ])
  })

  it('ohne userId im Payload: keine Empfaenger (kein claim-basierter Fallback)', async () => {
    const recipients = await computeRecipients(gastEvent(null))
    expect(recipients).toEqual([])
  })
})
