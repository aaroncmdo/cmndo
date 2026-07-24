import { describe, it, expect, vi } from 'vitest'
import type { SvKontakt } from '@/lib/kunde/get-kontakt'
import {
  buildSvReviewUrl,
  buildSvBewertungWaText,
  notifyKundeSvBewerten,
  type NotifyKundeSvBewertenDeps,
} from '../notify-kunde-sv-bewerten'

const DUMMY_SVC = {} as never

// Vollstaendiger, getypter SvKontakt (nur googlePlaceId/name variieren die Tests).
function svk(over: Partial<SvKontakt> = {}): SvKontakt {
  return {
    svId: 'sv1',
    profileId: 'p1',
    name: 'Max Mustermann',
    vorname: 'Max',
    nachname: 'Mustermann',
    anzeigename: null,
    telefon: null,
    avatarUrl: null,
    verifizierungStatus: 'geprueft',
    verifiziert: true,
    googlePlaceId: 'ChIJabc123',
    profilbeschreibung: null,
    ...over,
  }
}

function makeDeps(over: Partial<Record<keyof NotifyKundeSvBewertenDeps, unknown>> = {}) {
  const sendNachricht = vi.fn().mockResolvedValue({ ok: true, channel: 'whatsapp', whatsappVerfuegbar: true })
  const createNotification = vi.fn().mockResolvedValue(undefined)
  const getSvKontakt = vi.fn().mockResolvedValue(svk())
  const resolveKundeReviewKontakt = vi
    .fn()
    .mockResolvedValue({ userId: 'u1', vorname: 'Anna', telefon: '+49 170 1234567', leadId: 'l1' })
  const deps = {
    getSvKontakt,
    resolveKundeReviewKontakt,
    sendNachricht,
    createNotification,
    ...over,
  } as unknown as NotifyKundeSvBewertenDeps
  return { deps, sendNachricht, createNotification, getSvKontakt, resolveKundeReviewKontakt }
}

describe('buildSvReviewUrl', () => {
  it('baut den writereview-Deep-Link mit encodetem place_id', () => {
    expect(buildSvReviewUrl('ChIJ abc/123')).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJ%20abc%2F123',
    )
  })
})

describe('buildSvBewertungWaText', () => {
  it('enthaelt Anrede, SV-Name und Review-URL', () => {
    const t = buildSvBewertungWaText({ kundeVorname: 'Anna', svName: 'Max Mustermann', reviewUrl: 'https://x/y' })
    expect(t).toContain('Hallo Anna')
    expect(t).toContain('Max Mustermann')
    expect(t).toContain('https://x/y')
  })
  it('faellt ohne Vorname auf "Hallo," zurueck', () => {
    expect(buildSvBewertungWaText({ kundeVorname: null, svName: 'SV', reviewUrl: 'u' })).toContain('Hallo,')
  })
})

describe('notifyKundeSvBewerten', () => {
  it('skippt mit no_place_id wenn der SV keine google_place_id hat (Gate)', async () => {
    const { deps, sendNachricht, createNotification } = makeDeps({
      getSvKontakt: vi.fn().mockResolvedValue(svk({ googlePlaceId: null })),
    })
    const r = await notifyKundeSvBewerten({ svId: 'sv1', fallId: 'f1', svc: DUMMY_SVC }, deps)
    expect(r.skipped).toBe('no_place_id')
    expect(sendNachricht).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('skippt mit no_sv wenn kein SV gefunden', async () => {
    const { deps } = makeDeps({ getSvKontakt: vi.fn().mockResolvedValue(null) })
    const r = await notifyKundeSvBewerten({ svId: 'sv1', fallId: 'f1', svc: DUMMY_SVC }, deps)
    expect(r.skipped).toBe('no_sv')
  })

  it('skippt mit no_kontakt wenn kein Kunde-Kontakt aufloesbar', async () => {
    const { deps } = makeDeps({ resolveKundeReviewKontakt: vi.fn().mockResolvedValue(null) })
    const r = await notifyKundeSvBewerten({ svId: 'sv1', fallId: 'f1', svc: DUMMY_SVC }, deps)
    expect(r.skipped).toBe('no_kontakt')
  })

  it('sendet WhatsApp (mit Review-URL) + In-App im Happy Path', async () => {
    const { deps, sendNachricht, createNotification } = makeDeps()
    const r = await notifyKundeSvBewerten({ svId: 'sv1', fallId: 'f1', svc: DUMMY_SVC }, deps)
    expect(r.wa).toBe(true)
    expect(r.inApp).toBe(true)
    expect(sendNachricht).toHaveBeenCalledTimes(1)
    const waArg = sendNachricht.mock.calls[0][0]
    expect(waArg.empfaengerRolle).toBe('kunde')
    expect(waArg.templateKey).toBe('sv_bewertung_kunde')
    expect(waArg.entity).toBe('lead')
    expect(waArg.text).toContain('writereview?placeid=ChIJabc123')
    expect(waArg.text).toContain('Max Mustermann')
    expect(createNotification).toHaveBeenCalledTimes(1)
    const naArgs = createNotification.mock.calls[0]
    expect(naArgs[1]).toBe('sv_bewertung') // typ
    expect(naArgs[4]).toBe('/kunde/faelle/f1') // link
  })

  it('ohne Telefon: kein WhatsApp, aber In-App', async () => {
    const { deps, sendNachricht, createNotification } = makeDeps({
      resolveKundeReviewKontakt: vi.fn().mockResolvedValue({ userId: 'u1', vorname: 'Anna', telefon: null, leadId: 'l1' }),
    })
    const r = await notifyKundeSvBewerten({ svId: 'sv1', fallId: 'f1', svc: DUMMY_SVC }, deps)
    expect(r.wa).toBe(false)
    expect(sendNachricht).not.toHaveBeenCalled()
    expect(r.inApp).toBe(true)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('accountloser Lead (kein userId): WhatsApp ja, In-App nein', async () => {
    const { deps, sendNachricht, createNotification } = makeDeps({
      resolveKundeReviewKontakt: vi.fn().mockResolvedValue({ userId: null, vorname: 'Anna', telefon: '+49 170 1', leadId: 'l1' }),
    })
    const r = await notifyKundeSvBewerten({ svId: 'sv1', fallId: 'f1', svc: DUMMY_SVC }, deps)
    expect(r.wa).toBe(true)
    expect(sendNachricht).toHaveBeenCalledTimes(1)
    expect(r.inApp).toBe(false)
    expect(createNotification).not.toHaveBeenCalled()
  })
})
