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

  it('reicht promotionCodeId + Standort + Notiz + zugewiesenAn an createLead-extra durch', async () => {
    const res = await erstelleOeffentlichenRueckruf({
      name: 'Max Mustermann', telefon: '+4915112345678', quelle: 'makler-anfrage',
      promotionCodeId: 'promo-1', standortPlz: '50667', standortOrt: 'Koeln',
      notiz: 'Parkschaden', zugewiesenAn: 'disp-9', serviceTyp: 'nur_gutachter',
    })
    expect(res.ok).toBe(true)
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.promotion_code_id).toBe('promo-1')
    expect(extra.fahrzeug_standort_plz).toBe('50667')
    expect(extra.fahrzeug_standort_adresse).toBe('Koeln')
    expect(extra.notiz).toBe('Parkschaden')
    expect(extra.zugewiesen_an).toBe('disp-9')
    expect(extra.service_typ).toBe('nur_gutachter')
  })

  it('ohne promotionCodeId bleibt promotion_code_id unset (Marketing-Caller unveraendert)', async () => {
    await erstelleOeffentlichenRueckruf({ name: 'Erika Frei', telefon: '+4915100000000', quelle: 'rueckruf' })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.promotion_code_id).toBeUndefined()
  })

  it('schreibt fahrzeug_standort_lat/lng/place_id wenn Koordinaten-Paar da ist', async () => {
    await erstelleOeffentlichenRueckruf({
      name: 'Max Mustermann', telefon: '+4915112345678', quelle: 'makler-anfrage-rueckruf',
      standortLat: 50.9384, standortLng: 6.9601, standortPlaceId: 'ChIJ-test',
    })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.fahrzeug_standort_lat).toBe(50.9384)
    expect(extra.fahrzeug_standort_lng).toBe(6.9601)
    expect(extra.fahrzeug_standort_place_id).toBe('ChIJ-test')
  })

  it('ohne Koordinaten: kein lat/lng/place_id', async () => {
    await erstelleOeffentlichenRueckruf({ name: 'Erika Frei', telefon: '+4915100000000', quelle: 'rueckruf', standortOrt: 'Koeln' })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect('fahrzeug_standort_lat' in extra).toBe(false)
    expect('fahrzeug_standort_place_id' in extra).toBe(false)
  })

  it('nur lat ohne lng -> kein Partial-Write (Pair-Guard)', async () => {
    await erstelleOeffentlichenRueckruf({ name: 'Max M', telefon: '+4915112345678', quelle: 'rueckruf', standortLat: 50.9, standortLng: null })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect('fahrzeug_standort_lat' in extra).toBe(false)
    expect('fahrzeug_standort_lng' in extra).toBe(false)
  })

  it('NaN-Koordinate wird verworfen (Number.isFinite-Guard)', async () => {
    await erstelleOeffentlichenRueckruf({ name: 'Max M', telefon: '+4915112345678', quelle: 'rueckruf', standortLat: Number.NaN, standortLng: 6.96 })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect('fahrzeug_standort_lat' in extra).toBe(false)
  })
})
