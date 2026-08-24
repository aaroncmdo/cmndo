import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock('@/lib/whatsapp/send', () => ({ sendNachricht: sendMock }))

const offene = { wert: [] as unknown[] }
const updateMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({ limit: async () => ({ data: offene.wert, error: null }) }),
        }),
      }),
      update: (werte: unknown) => {
        updateMock(werte)
        return { eq: () => ({ select: async () => ({ data: [{ id: 'x' }], error: null }) }) }
      },
    }),
  }),
}))

import { sendeWelcomeFuerOffeneTeilnahmen } from '../welcome-nachricht'

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue({ ok: true, channel: 'whatsapp', whatsappVerfuegbar: true })
  updateMock.mockClear()
  offene.wert = [
    { id: 't-1', telefon_normalisiert: '+491751111111', anfrage_id: 'a-1', lead_id: null },
    { id: 't-2', telefon_normalisiert: '+491752222222', anfrage_id: null, lead_id: 'l-2' },
  ]
})

describe('sendeWelcomeFuerOffeneTeilnahmen', () => {
  it('sendet an jede offene Teilnahme genau einmal', async () => {
    const r = await sendeWelcomeFuerOffeneTeilnahmen()
    expect(r.ok).toBe(true)
    expect(r.gesendet).toBe(2)
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('waehlt die entity nach der Quelle der Teilnahme', async () => {
    await sendeWelcomeFuerOffeneTeilnahmen()
    expect(sendMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ entity: 'gfa', entityId: 'a-1' }))
    expect(sendMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ entity: 'lead', entityId: 'l-2' }))
  })

  it('markiert den Sendezeitpunkt', async () => {
    await sendeWelcomeFuerOffeneTeilnahmen()
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp_gesendet_am: expect.any(String) }),
    )
  })

  it('zaehlt einen Sende-Fehler nicht als gesendet', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, channel: 'none', error: 'kein WhatsApp', whatsappVerfuegbar: false })
    const r = await sendeWelcomeFuerOffeneTeilnahmen()
    expect(r.gesendet).toBe(1)
    expect(r.fehlgeschlagen).toBe(1)
  })

  it('markiert bei fehlgeschlagenem Send NICHT (damit ein Retry moeglich bleibt)', async () => {
    sendMock.mockResolvedValue({ ok: false, channel: 'none', error: 'kein WhatsApp', whatsappVerfuegbar: false })
    await sendeWelcomeFuerOffeneTeilnahmen()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('sendet ohne Fallback-Kanaele (WhatsApp ist der Zweck)', async () => {
    await sendeWelcomeFuerOffeneTeilnahmen()
    const arg = sendMock.mock.calls[0][0] as { fallback?: unknown }
    expect(arg.fallback).toBeUndefined()
  })
})
