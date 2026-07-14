import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentMaklerMock = vi.fn()
const getPromoMock = vi.fn()
const pickDispatcherMock = vi.fn()
const createLeadMock = vi.fn()
const sendCoreMock = vi.fn()
const rueckrufMock = vi.fn()
const timelineInsertMock = vi.fn()
const mitteilungInsertMock = vi.fn()
const adminTerminInsertMock = vi.fn()
const leadsUpdateMock = vi.fn()

vi.mock('@/lib/makler/queries', () => ({ getCurrentMakler: () => getCurrentMaklerMock() }))
vi.mock('@/lib/makler/promo-code', () => ({ getOrCreateMaklerPromoCode: (...a: unknown[]) => getPromoMock(...a) }))
vi.mock('@/lib/start-link/pick-dispatcher', () => ({ pickRoundRobinDispatcher: () => pickDispatcherMock() }))
vi.mock('@/lib/leads/create-lead', () => ({ createLead: (...a: unknown[]) => createLeadMock(...a) }))
vi.mock('@/lib/start-link/send-flowlink-multichannel', () => ({ sendFlowLinkMultiChannelCore: (...a: unknown[]) => sendCoreMock(...a) }))
vi.mock('@/lib/actions/public-rueckruf', () => ({ erstelleOeffentlichenRueckruf: (i: unknown) => rueckrufMock(i) }))
vi.mock('@/lib/leads/notify-new-lead', () => ({ notifyNewLead: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/i18n/locale-cookie', () => ({ getLocaleCookie: vi.fn().mockResolvedValue('de') }))
let leadsDedupResult: unknown[] = []
const adminMock = {
  from: vi.fn((table: string) => {
    if (table === 'timeline') return { insert: timelineInsertMock }
    if (table === 'mitteilungen') return { insert: mitteilungInsertMock }
    if (table === 'admin_termine') return { insert: adminTerminInsertMock }
    if (table === 'leads') {
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: leadsDedupResult }) }) }) }),
        update: () => ({ eq: () => leadsUpdateMock() }),
      }
    }
    return { insert: vi.fn().mockResolvedValue({ error: null }) }
  }),
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { erstelleMaklerAnfrage } from '../erstelle-anfrage'

const MAKLER = { id: 'mk-1', user_id: 'user-1', firma: 'Muster Makler', ansprechpartner_vorname: 'Max', status: 'aktiv', erstellt_am: '2026-01-01' }
const baseInput = { vorname: 'Erika', nachname: 'Beispiel', telefon: '+4915112345678', kundeEinwilligung: true }

beforeEach(() => {
  getCurrentMaklerMock.mockReset().mockResolvedValue(MAKLER)
  getPromoMock.mockReset().mockResolvedValue({ id: 'promo-1', code: 'MK-TEST' })
  pickDispatcherMock.mockReset().mockResolvedValue('disp-1')
  createLeadMock.mockReset().mockResolvedValue({ ok: true, leadId: 'lead-1' })
  sendCoreMock.mockReset().mockResolvedValue({ success: true, token: 'tok-1' })
  rueckrufMock.mockReset().mockResolvedValue({ ok: true, leadId: 'lead-r', terminId: 'termin-1' })
  timelineInsertMock.mockReset().mockResolvedValue({ error: null })
  mitteilungInsertMock.mockReset().mockResolvedValue({ error: null })
  adminTerminInsertMock.mockReset().mockResolvedValue({ error: null })
  leadsUpdateMock.mockReset().mockResolvedValue({ error: null })
  leadsDedupResult = []
})

describe('erstelleMaklerAnfrage', () => {
  it('flowlink: setzt promotion_code_id (Attribution) + Lifecycle erstkontakt/neu', async () => {
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(res.ok).toBe(true)
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.promotion_code_id).toBe('promo-1')
    expect(extra.qualifizierungs_phase).toBe('erstkontakt')
    const base = createLeadMock.mock.calls[0][1] as Record<string, unknown>
    expect(base.status).toBe('neu')
    expect(base.source_channel).toBe('makler-anfrage-flowlink')
  })

  it('flowlink: Versand-Kaskade startet mit WhatsApp + Makler-Kontext im introText', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(sendCoreMock.mock.calls[0][2]).toBe('whatsapp')
    expect(String(sendCoreMock.mock.calls[0][5])).toContain('Muster Makler')
  })

  it('flowlink: WA-Fail -> SMS -> Email', async () => {
    sendCoreMock.mockReset()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, token: 't' })
    const res = await erstelleMaklerAnfrage({ ...baseInput, email: 'e@x.de', ausgang: 'flowlink' })
    expect(sendCoreMock.mock.calls.map((c) => c[2])).toEqual(['whatsapp', 'sms', 'email'])
    expect(res.ok).toBe(true)
  })

  it('flowlink: alle Kanaele scheitern -> Auto-Rueckruf (admin_termine + Status) + Mitteilung', async () => {
    sendCoreMock.mockReset().mockResolvedValue({ success: false })
    const res = await erstelleMaklerAnfrage({ ...baseInput, email: 'e@x.de', ausgang: 'flowlink' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.warnung).toBeTruthy()
    expect(adminTerminInsertMock).toHaveBeenCalled()
    expect(leadsUpdateMock).toHaveBeenCalled()
    expect(mitteilungInsertMock).toHaveBeenCalled()
  })

  it('flowlink: Makler-Notiz landet auf dem Lead (leads.notiz)', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, notiz: 'Parkschaden, will schnell', ausgang: 'flowlink' })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.notiz).toBe('Parkschaden, will schnell')
  })

  it('flowlink: Standort-Koordinaten -> fahrzeug_standort_lat/lng/place_id + adresse/plz', async () => {
    await erstelleMaklerAnfrage({
      ...baseInput,
      ausgang: 'flowlink',
      standortPlz: '50667',
      standortOrt: 'Hauptstraße 5, 50667 Köln',
      standortLat: 50.9384,
      standortLng: 6.9601,
      standortPlaceId: 'ChIJ-test',
    })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.fahrzeug_standort_plz).toBe('50667')
    expect(extra.fahrzeug_standort_adresse).toBe('Hauptstraße 5, 50667 Köln')
    expect(extra.fahrzeug_standort_lat).toBe(50.9384)
    expect(extra.fahrzeug_standort_lng).toBe(6.9601)
    expect(extra.fahrzeug_standort_place_id).toBe('ChIJ-test')
  })

  it('flowlink: ohne Koordinaten kein lat/lng/place_id (nur Text wie bisher)', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink', standortOrt: 'Köln' })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.fahrzeug_standort_adresse).toBe('Köln')
    expect('fahrzeug_standort_lat' in extra).toBe(false)
    expect('fahrzeug_standort_place_id' in extra).toBe(false)
  })

  it('flowlink: nur lat ohne lng -> keine Koordinaten geschrieben (kein Partial)', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink', standortLat: 50.9, standortLng: null })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect('fahrzeug_standort_lat' in extra).toBe(false)
    expect('fahrzeug_standort_lng' in extra).toBe(false)
  })

  it('service_typ ist immer komplett (Paket-Wahl entfernt; RLS/Provision haengt an der Spalte)', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect((createLeadMock.mock.calls[0][2] as Record<string, unknown>).service_typ).toBe('komplett')
  })

  it('Verschulden gegner -> schuldfrage=gegner auf dem Lead', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink', schuldfrage: 'gegner' })
    expect((createLeadMock.mock.calls[0][2] as Record<string, unknown>).schuldfrage).toBe('gegner')
  })

  it('Eigenverschulden + Kasko -> schuldfrage + eigene_versicherung=ja auf dem Lead', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink', schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'ja' })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.schuldfrage).toBe('eigenverantwortung')
    expect(extra.eigene_versicherung).toBe('ja')
  })

  it('Eigenverschulden OHNE Kasko-Antwort -> Fehler, kein Lead (kein stiller Flow-Disqualify)', async () => {
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink', schuldfrage: 'eigenverantwortung' })
    expect(res.ok).toBe(false)
    expect(createLeadMock).not.toHaveBeenCalled()
  })

  it('Kennzeichen + Polizeibeteiligung landen auf dem Lead', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink', kennzeichen: 'K-AB 1234', polizeiVorOrt: true })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.kennzeichen).toBe('K-AB 1234')
    expect(extra.polizei_vor_ort).toBe(true)
  })

  it('Besichtigungsort schreibt BEIDE Familien (besichtigungsort_* + fahrzeug_standort_*, Prefill-Schutz)', async () => {
    await erstelleMaklerAnfrage({
      ...baseInput,
      ausgang: 'flowlink',
      standortOrt: 'Hauptstraße 5, 50667 Köln',
      standortLat: 50.9384,
      standortLng: 6.9601,
      standortPlaceId: 'ChIJ-test',
    })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.besichtigungsort_adresse).toBe('Hauptstraße 5, 50667 Köln')
    expect(extra.besichtigungsort_lat).toBe(50.9384)
    expect(extra.besichtigungsort_place_id).toBe('ChIJ-test')
    expect(extra.fahrzeug_standort_adresse).toBe('Hauptstraße 5, 50667 Köln')
  })

  it('Dedup: offene Anfrage mit gleicher Nummer (formatierungs-tolerant) -> Fehler, kein Lead', async () => {
    leadsDedupResult = [{ id: 'existing', telefon: '015112345678', status: 'neu' }] // 0151… == +49151…
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(res.ok).toBe(false)
    expect(createLeadMock).not.toHaveBeenCalled()
  })

  it('Dedup: terminaler Bestands-Lead blockt NICHT (neuer Fall erlaubt)', async () => {
    leadsDedupResult = [{ id: 'old', telefon: '+4915112345678', status: 'umgewandelt' }]
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(res.ok).toBe(true)
    expect(createLeadMock).toHaveBeenCalled()
  })

  it('rueckruf: delegiert mit promotionCodeId + Round-Robin-Dispatcher, kein eigener createLead', async () => {
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'rueckruf', rueckrufStartZeit: null })
    expect(rueckrufMock).toHaveBeenCalledTimes(1)
    const arg = rueckrufMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.promotionCodeId).toBe('promo-1')
    expect(arg.zugewiesenAn).toBe('disp-1')
    expect(arg.quelle).toBe('makler-anfrage-rueckruf')
    expect(createLeadMock).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('rueckruf: reicht Standort-Koordinaten (lat/lng/place_id) an erstelleOeffentlichenRueckruf durch', async () => {
    await erstelleMaklerAnfrage({
      ...baseInput,
      ausgang: 'rueckruf',
      standortPlz: '50667',
      standortOrt: 'Hauptstraße 5, 50667 Köln',
      standortLat: 50.9384,
      standortLng: 6.9601,
      standortPlaceId: 'ChIJ-test',
    })
    const arg = rueckrufMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.standortLat).toBe(50.9384)
    expect(arg.standortLng).toBe(6.9601)
    expect(arg.standortPlaceId).toBe('ChIJ-test')
    expect(arg.standortPlz).toBe('50667')
  })

  it('Einwilligungs-Nachweis wird als Timeline-Eintrag protokolliert', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(timelineInsertMock).toHaveBeenCalled()
  })

  it('fehlende Einwilligung -> Fehler, kein Lead', async () => {
    const res = await erstelleMaklerAnfrage({ ...baseInput, kundeEinwilligung: false, ausgang: 'flowlink' })
    expect(res.ok).toBe(false)
    expect(createLeadMock).not.toHaveBeenCalled()
    expect(rueckrufMock).not.toHaveBeenCalled()
  })

  it('Fremd-Attribution unmoeglich: Promo aus makler.id, nicht aus Input', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(getPromoMock.mock.calls[0][1]).toBe('mk-1')
  })

  it('kein Promo-Code (get-or-create scheitert) -> Fehler, kein Lead', async () => {
    getPromoMock.mockResolvedValue(null)
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(res.ok).toBe(false)
    expect(createLeadMock).not.toHaveBeenCalled()
  })

  it('kein eingeloggter Makler -> Fehler', async () => {
    getCurrentMaklerMock.mockResolvedValue(null)
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(res.ok).toBe(false)
  })
})
