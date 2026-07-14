import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifications/emit', () => ({ emitEvent: vi.fn(async () => undefined) }))

import { emitEvent } from '@/lib/notifications/emit'
import { notifyMaklerProvisionStatus } from '../notify-makler-provision'
import type { ReleasePendingRow } from '../release-runner'

const row = (over: Partial<ReleasePendingRow> = {}): ReleasePendingRow => ({
  id: 'p1',
  partner_typ: 'makler',
  fall_id: 'f1',
  claim_id: 'c1',
  betrag_netto_eur: '100.00',
  service_typ: 'komplett',
  hold_until: '2026-07-07T00:00:00.000Z',
  partner_id: 'makler-1',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notifyMaklerProvisionStatus', () => {
  it('makler: emittiert makler.provision_status und meldet true', async () => {
    const ok = await notifyMaklerProvisionStatus(row(), 'freigegeben')

    expect(ok).toBe(true)
    expect(emitEvent).toHaveBeenCalledWith(
      'makler.provision_status',
      expect.objectContaining({
        fallId: 'f1',
        provisionId: 'p1',
        maklerId: 'makler-1',
        status: 'freigegeben',
        betragEur: 100,
      }),
    )
  })

  it('werkstatt + firmen_flotte: KEIN makler-Event (die sehen ihre Provisionen im Portal)', async () => {
    expect(await notifyMaklerProvisionStatus(row({ partner_typ: 'werkstatt' }), 'freigegeben')).toBe(false)
    expect(await notifyMaklerProvisionStatus(row({ partner_typ: 'firmen_flotte' }), 'storniert')).toBe(false)

    expect(emitEvent).not.toHaveBeenCalled()
  })

  it('storniert: reicht den Grund durch', async () => {
    await notifyMaklerProvisionStatus(row(), 'storniert', 'Der vermittelte Fall wurde storniert.')

    expect(emitEvent).toHaveBeenCalledWith(
      'makler.provision_status',
      expect.objectContaining({ status: 'storniert', grund: 'Der vermittelte Fall wurde storniert.' }),
    )
  })
})
