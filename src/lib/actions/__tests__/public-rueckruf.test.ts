import { describe, it, expect, vi, beforeEach } from 'vitest'

const createLeadMock = vi.fn()
vi.mock('@/lib/leads/create-lead', () => ({ createLead: (...a: unknown[]) => createLeadMock(...a) }))
vi.mock('@/lib/leads/notify-new-lead', () => ({ notifyNewLead: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/whatsapp/baileys-client', () => ({ sendWhatsAppText: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('@/lib/i18n/locale-cookie', () => ({ getLocaleCookie: vi.fn().mockResolvedValue('de') }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const adminMock = {
  from: vi.fn((table: string) => {
    if (table === 'profiles') return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'disp-1' }] }) }) }
    if (table === 'admin_termine') return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'termin-1' }, error: null }) }) }) }
    if (table === 'mitteilungen') return { insert: () => Promise.resolve({ error: null }) }
    return {}
  }),
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminMock }))

import { erstelleOeffentlichenRueckruf } from '../public-rueckruf'

describe('erstelleOeffentlichenRueckruf — Makler-Attribution + Standort', () => {
  beforeEach(() => { createLeadMock.mockReset(); createLeadMock.mockResolvedValue({ ok: true, leadId: 'lead-1' }) })

  it('reicht promotionCodeId + Standort an createLead-extra durch', async () => {
    const res = await erstelleOeffentlichenRueckruf({
      name: 'Max Mustermann', telefon: '+4915112345678', quelle: 'makler-anfrage',
      promotionCodeId: 'promo-1', standortPlz: '50667', standortOrt: 'Koeln',
    })
    expect(res.ok).toBe(true)
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.promotion_code_id).toBe('promo-1')
    expect(extra.fahrzeug_standort_plz).toBe('50667')
    expect(extra.fahrzeug_standort_adresse).toBe('Koeln')
  })

  it('ohne promotionCodeId bleibt promotion_code_id unset (Marketing-Caller unveraendert)', async () => {
    await erstelleOeffentlichenRueckruf({ name: 'Erika Frei', telefon: '+4915100000000', quelle: 'rueckruf' })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.promotion_code_id).toBeUndefined()
  })
})
