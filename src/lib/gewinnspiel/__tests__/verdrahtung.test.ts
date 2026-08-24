import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// vi.hoisted, weil vi.mock nach oben gezogen wird — eine normale const waere
// zum Zeitpunkt der Factory noch nicht initialisiert.
const { registriereMock } = vi.hoisted(() => ({ registriereMock: vi.fn() }))
vi.mock('@/lib/gewinnspiel/registriere-teilnahme', () => ({
  registriereTeilnahme: registriereMock,
}))
vi.mock('@/lib/leads/create-lead', () => ({
  createLead: vi.fn().mockResolvedValue({ ok: true, leadId: 'lead-1' }),
}))
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: vi.fn().mockResolvedValue({ ok: true, token: 'tok' }),
}))
vi.mock('@/lib/leads/convert-lead-to-fall', () => ({ convertLeadToFall: vi.fn() }))
vi.mock('@/lib/intake/recent-intake-lead', () => ({
  findRecentIntakeLead: vi.fn().mockResolvedValue(null),
}))

import { createCase } from '@/lib/intake/create-case'

beforeEach(() => {
  registriereMock.mockClear()
  registriereMock.mockResolvedValue({ ok: true, teilnahmeId: 't-1' })
})

describe('createCase -> Gewinnspiel', () => {
  it('registriert eine Teilnahme mit Telefon und Schuldfrage', async () => {
    const r = await createCase({} as never, {
      mode: 'lead-first',
      base: { source_channel: 'test', status: 'neu', telefon: '0175 1234567' },
      extra: { schuldfrage: 'gegner' },
    })
    expect(r.ok).toBe(true)
    expect(registriereMock).toHaveBeenCalledWith({
      quelle: { leadId: 'lead-1' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
    })
  })

  it('bricht den Intake NICHT ab, wenn die Registrierung wirft', async () => {
    // Der eigentliche Zweck des try/catch: eine Schadenmeldung darf nie an
    // einem Gewinnspiel-Fehler scheitern.
    registriereMock.mockRejectedValueOnce(new Error('DB weg'))
    const r = await createCase({} as never, {
      mode: 'lead-first',
      base: { source_channel: 'test', status: 'neu', telefon: '0175 1234567' },
      extra: { schuldfrage: 'gegner' },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.leadId).toBe('lead-1')
  })

  it('reicht auch Leads ohne Schuldfrage durch (Filterung liegt in der Regel)', async () => {
    await createCase({} as never, {
      mode: 'lead-first',
      base: { source_channel: 'test', status: 'neu', telefon: '0175 1234567' },
    })
    expect(registriereMock).toHaveBeenCalledWith(
      expect.objectContaining({ schuldfrage: null }),
    )
  })
})
