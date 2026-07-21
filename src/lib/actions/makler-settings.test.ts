import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fokus: die USt-Stammdaten-Erweiterung von updateMaklerProfil (rechtsform +
// ist_kleinunternehmer). "Nudge, kein Gate" = leere Rechtsform ist erlaubt,
// ein gesetzter Wert muss aus der Whitelist stammen. Der Boolean darf nicht
// durch den ''->null-String-Loop laufen.

const updateMock = vi.fn()
const eqMock = vi.fn()
const getCurrentMaklerMock = vi.fn()

vi.mock('@/lib/makler/queries', () => ({
  getCurrentMakler: () => getCurrentMaklerMock(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ update: updateMock }),
  }),
}))
// nur importiert, in updateMaklerProfil nicht genutzt — Mock haelt das echte
// (env-abhaengige) Admin-Modul aus dem Test raus.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateMaklerProfil } from './makler-settings'

// Der captured Update-Payload (erstes Argument von .update()).
function payload(): Record<string, unknown> {
  return updateMock.mock.calls[0]?.[0] as Record<string, unknown>
}

function baseInput(over: Record<string, unknown> = {}) {
  return {
    firma: 'Muster GmbH',
    ansprechpartner_vorname: 'Max',
    ansprechpartner_nachname: 'Muster',
    ...over,
  } as Parameters<typeof updateMaklerProfil>[0]
}

beforeEach(() => {
  updateMock.mockReset().mockReturnValue({ eq: eqMock })
  eqMock.mockReset().mockResolvedValue({ error: null })
  getCurrentMaklerMock.mockReset().mockResolvedValue({ id: 'm1', firma: 'Muster GmbH' })
})

describe('updateMaklerProfil — Rechtsform + Kleinunternehmer', () => {
  it('gueltige Rechtsform -> im Update-Payload', async () => {
    const res = await updateMaklerProfil(baseInput({ rechtsform: 'GmbH' }))
    expect(res.success).toBe(true)
    expect(payload().rechtsform).toBe('GmbH')
  })

  it('ungueltige Rechtsform -> Fehler, KEIN Update', async () => {
    const res = await updateMaklerProfil(baseInput({ rechtsform: 'Piratenschiff' }))
    expect(res.success).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('leere Rechtsform -> erlaubt (Nudge, kein Gate), Payload null', async () => {
    const res = await updateMaklerProfil(baseInput({ rechtsform: '' }))
    expect(res.success).toBe(true)
    expect(payload().rechtsform).toBeNull()
  })

  it('Kleinunternehmer true/false landen als Boolean im Payload', async () => {
    await updateMaklerProfil(baseInput({ ist_kleinunternehmer: true }))
    expect(payload().ist_kleinunternehmer).toBe(true)

    updateMock.mockReset().mockReturnValue({ eq: eqMock })
    await updateMaklerProfil(baseInput({ ist_kleinunternehmer: false }))
    expect(payload().ist_kleinunternehmer).toBe(false)
  })

  it('ist_kleinunternehmer nicht mitgeschickt -> Feld bleibt unberuehrt (nicht im Payload)', async () => {
    await updateMaklerProfil(baseInput())
    expect('ist_kleinunternehmer' in payload()).toBe(false)
  })
})
