import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Der interne-Empfaenger-Guard am zentralen Chokepoint sendWhatsAppText (2026-09-19).
// istInternesTelefon wird gemockt, damit der Test keinen DB-Lookup braucht; global fetch
// wird gemockt, damit wir sehen ob der HTTP-Send wirklich unterbleibt.
vi.mock('@/lib/testdaten/test-sv-guard', () => ({
  istInternesTelefon: vi.fn(),
  istDummyTelefon: vi.fn(),
}))

import { sendWhatsAppText } from '../baileys-client'
import { istInternesTelefon, istDummyTelefon } from '@/lib/testdaten/test-sv-guard'

const mockedGuard = vi.mocked(istInternesTelefon)
const mockedDummy = vi.mocked(istDummyTelefon)

// Aaron 21.09.2026: keine erfundenen Platzhalter-Nummern als "externes" Beispiel.
// Hier stand +4915112345678 als "externe Nummer" — und das ist laut istDummyTelefon ein
// PLATZHALTER (enthaelt 1234567). Genau die Verwechslung, gegen die die Regel geschrieben ist.
const ECHTE_EXTERNE_NUMMER = '+4915209384756'

function okResponse() {
  return new Response(
    JSON.stringify({ ok: true, message_id: 'm1', jid: 'j', timestamp: 't' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('sendWhatsAppText — interner-Empfaenger-Guard am Chokepoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedDummy.mockReturnValue(false)
    process.env.BAILEYS_AUTH_TOKEN = 'test-token'
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.BAILEYS_AUTH_TOKEN
  })

  it('unterdrueckt den Send an eine interne/Test-Nummer — kein HTTP-Call', async () => {
    mockedGuard.mockResolvedValue(true)
    const fetchMock = vi.mocked(fetch)

    const result = await sendWhatsAppText('+491231234567', 'hi')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      messageId: 'internal-recipient-suppressed',
      jid: '',
      timestamp: expect.any(String),
    })
  })

  it('sendet trotzdem, wenn skipInternalGuard=true (Team-Alarm)', async () => {
    mockedGuard.mockResolvedValue(true)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(okResponse())

    const result = await sendWhatsAppText('+491231234567', 'hi', { skipInternalGuard: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockedGuard).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('sendet an eine externe Nummer (Guard liefert false)', async () => {
    mockedGuard.mockResolvedValue(false)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(okResponse())

    const result = await sendWhatsAppText(ECHTE_EXTERNE_NUMMER, 'hi')

    expect(mockedGuard).toHaveBeenCalledWith(ECHTE_EXTERNE_NUMMER)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('faellt bei Guard-Fehler auf senden zurueck (istInternesTelefon liefert false)', async () => {
    // istInternesTelefon ist selbst fail-open; hier: liefert false -> Send laeuft.
    mockedGuard.mockResolvedValue(false)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(okResponse())

    const result = await sendWhatsAppText(ECHTE_EXTERNE_NUMMER, 'hi')

    expect(result.ok).toBe(true)
  })
})

// Aaron-Regel 21.09.2026 + Befund: istDummyTelefon hatte NULL Aufrufer, der Chokepoint
// prueft(e) nur istInternesTelefon. Ein Test-Lead mit Platzhalter-Nummer OHNE interne
// E-Mail fiel komplett durch und bekam echte, zugestellte WhatsApps.
describe('sendWhatsAppText — Dummy-/Platzhalter-Nummern-Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedDummy.mockReturnValue(false)
    mockedGuard.mockResolvedValue(false)
    process.env.BAILEYS_AUTH_TOKEN = 'test-token'
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.BAILEYS_AUTH_TOKEN
  })

  it('unterdrueckt den Send an eine Platzhalter-Nummer — kein HTTP-Call', async () => {
    mockedDummy.mockReturnValue(true)
    const fetchMock = vi.mocked(fetch)

    const result = await sendWhatsAppText('+4915112345678', 'hi')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      messageId: 'dummy-recipient-suppressed',
      jid: '',
      timestamp: expect.any(String),
    })
  })

  it('unterdrueckt AUCH mit skipInternalGuard — eine erfundene Nummer ist nie ein Ziel', async () => {
    mockedDummy.mockReturnValue(true)
    const fetchMock = vi.mocked(fetch)

    const result = await sendWhatsAppText('+4915112345678', 'hi', { skipInternalGuard: true })

    expect(fetchMock).not.toHaveBeenCalled()
    // SendResult ist eine diskriminierte Union ueber `ok` — ein direkter Zugriff auf
    // result.messageId typecheckt nicht. Ganzes Objekt vergleichen, wie im Test darueber.
    expect(result).toEqual({
      ok: true,
      messageId: 'dummy-recipient-suppressed',
      jid: '',
      timestamp: expect.any(String),
    })
  })

  it('laesst eine echte Nummer durch (Dummy-Pruefung liefert false)', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(okResponse())

    const result = await sendWhatsAppText(ECHTE_EXTERNE_NUMMER, 'hi')

    expect(mockedDummy).toHaveBeenCalledWith(ECHTE_EXTERNE_NUMMER)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })
})
