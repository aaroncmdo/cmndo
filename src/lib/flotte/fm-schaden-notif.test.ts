import { describe, it, expect, vi, beforeEach } from 'vitest'

// T4 (operativer-schaden-flow): FM-WhatsApp bei Karten-Schadenmeldung.

const nummern = { value: [] as string[] }
const waResult = { value: { ok: true } as { ok: boolean; error?: string } }
const waCalls: Array<{ phone: string; text: string }> = []

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('./konto-firma', () => ({
  getFlottenmanagerWhatsappNummern: async () => nummern.value,
}))
vi.mock('@/lib/whatsapp/baileys-client', () => ({
  sendWhatsAppText: async (phone: string, text: string) => {
    waCalls.push({ phone, text })
    return waResult.value
  },
}))

beforeEach(() => {
  nummern.value = []
  waResult.value = { ok: true }
  waCalls.length = 0
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de'
})

describe('buildFmSchadenNotifText', () => {
  it('vollstaendige Daten: Kennzeichen + Fahrzeug + Gegner + Link', async () => {
    const { buildFmSchadenNotifText } = await import('./fm-schaden-notif')
    const txt = buildFmSchadenNotifText({
      kennzeichen: 'B-XY-123',
      fahrzeug: 'VW Golf',
      gegnerName: 'Max Mustermann',
      gegnerKennzeichen: 'M-AB-99',
      vehicleUrl: 'https://app.claimondo.de/flotte/fahrzeug/veh-1',
    })
    expect(txt).toContain('B-XY-123 (VW Golf)')
    expect(txt).toContain('Max Mustermann · M-AB-99')
    expect(txt).toContain('https://app.claimondo.de/flotte/fahrzeug/veh-1')
  })

  it('null-Felder: faellt sauber auf "unbekannt" zurueck', async () => {
    const { buildFmSchadenNotifText } = await import('./fm-schaden-notif')
    const txt = buildFmSchadenNotifText({
      kennzeichen: null,
      fahrzeug: null,
      gegnerName: null,
      gegnerKennzeichen: null,
      vehicleUrl: 'https://app.claimondo.de/flotte/fahrzeug/veh-1',
    })
    expect(txt).toContain('Fahrzeug: unbekannt')
    expect(txt).toContain('Unfallgegner: unbekannt')
  })

  it('nur Kennzeichen (kein Fahrzeugtyp): kein leeres Klammernpaar', async () => {
    const { buildFmSchadenNotifText } = await import('./fm-schaden-notif')
    const txt = buildFmSchadenNotifText({
      kennzeichen: 'B-XY-123',
      fahrzeug: null,
      gegnerName: 'Max',
      gegnerKennzeichen: null,
      vehicleUrl: 'u',
    })
    expect(txt).toContain('Fahrzeug: B-XY-123')
    expect(txt).not.toContain('(')
    expect(txt).toContain('Unfallgegner: Max')
  })
})

describe('notifyFlottenmanagerSchadenGemeldet', () => {
  const base = {
    firmaId: 'firma-1',
    vehicleId: 'veh-1',
    kennzeichen: 'B-XY-123',
    fahrzeug: 'VW Golf',
    gegnerName: 'Max',
    gegnerKennzeichen: 'M-AB-99',
  }

  it('sendet an alle aktiven FM-Nummern (Link + Fahrzeug im Text)', async () => {
    nummern.value = ['+491111111111', '+492222222222']
    const { notifyFlottenmanagerSchadenGemeldet } = await import('./fm-schaden-notif')
    const res = await notifyFlottenmanagerSchadenGemeldet(base)

    expect(res).toEqual({ sent: 2, total: 2 })
    expect(waCalls).toHaveLength(2)
    expect(waCalls[0].phone).toBe('+491111111111')
    expect(waCalls[0].text).toContain('/flotte/fahrzeug/veh-1')
    expect(waCalls[0].text).toContain('B-XY-123')
  })

  it('keine WA-Nummer hinterlegt -> kein Send (sent 0, total 0)', async () => {
    nummern.value = []
    const { notifyFlottenmanagerSchadenGemeldet } = await import('./fm-schaden-notif')
    const res = await notifyFlottenmanagerSchadenGemeldet(base)

    expect(res).toEqual({ sent: 0, total: 0 })
    expect(waCalls).toHaveLength(0)
  })

  it('WA-Send-Fehler ist fail-soft (zaehlt nur Erfolge)', async () => {
    nummern.value = ['+491111111111']
    waResult.value = { ok: false, error: 'baileys down' }
    const { notifyFlottenmanagerSchadenGemeldet } = await import('./fm-schaden-notif')
    const res = await notifyFlottenmanagerSchadenGemeldet(base)

    expect(res).toEqual({ sent: 0, total: 1 })
  })
})
