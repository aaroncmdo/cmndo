import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Der interne-Empfaenger-Guard am zentralen Chokepoint sendWhatsAppText (2026-09-19).
// istInternesTelefon wird gemockt, damit der Test keinen DB-Lookup braucht; global fetch
// wird gemockt, damit wir sehen ob der HTTP-Send wirklich unterbleibt.
vi.mock('@/lib/testdaten/test-sv-guard', () => ({
  istInternesTelefon: vi.fn(),
}))

import { sendWhatsAppText } from '../baileys-client'
import { istInternesTelefon } from '@/lib/testdaten/test-sv-guard'

const mockedGuard = vi.mocked(istInternesTelefon)

function okResponse() {
  return new Response(
    JSON.stringify({ ok: true, message_id: 'm1', jid: 'j', timestamp: 't' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('sendWhatsAppText — interner-Empfaenger-Guard am Chokepoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    const result = await sendWhatsAppText('+491633628571', 'hi')

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

    const result = await sendWhatsAppText('+491633628571', 'hi', { skipInternalGuard: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockedGuard).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('sendet an eine externe Nummer (Guard liefert false)', async () => {
    mockedGuard.mockResolvedValue(false)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(okResponse())

    const result = await sendWhatsAppText('+4915112345678', 'hi')

    expect(mockedGuard).toHaveBeenCalledWith('+4915112345678')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('faellt bei Guard-Fehler auf senden zurueck (istInternesTelefon liefert false)', async () => {
    // istInternesTelefon ist selbst fail-open; hier: liefert false -> Send laeuft.
    mockedGuard.mockResolvedValue(false)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(okResponse())

    const result = await sendWhatsAppText('+4915112345678', 'hi')

    expect(result.ok).toBe(true)
  })
})
