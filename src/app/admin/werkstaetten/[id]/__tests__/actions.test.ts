import { describe, it, expect, vi, beforeEach } from 'vitest'

type State = { rolle: string | null; updateError: { message: string } | null; authError: { message: string } | null }
let state: State
let lastPatch: Record<string, unknown> | null = null
let lastAuthArgs: Record<string, unknown> | null = null

const getUserMock = vi.fn()
const profileSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => getUserMock() },
    from: () => ({ select: () => ({ eq: () => ({ single: () => profileSingle() }) }) }),
  })),
}))
vi.mock('@/lib/isochrone/calculate-isochrone', () => ({
  calculateIsochrone: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: (_id: string, args: Record<string, unknown>) => {
          lastAuthArgs = args
          return Promise.resolve({ error: state.authError })
        },
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { user_id: 'u-1' }, error: null }) }) }),
      update: (p: Record<string, unknown>) => {
        lastPatch = p
        return { eq: () => Promise.resolve({ error: state.updateError }) }
      },
      insert: (p: Record<string, unknown>) => {
        lastPatch = p
        return Promise.resolve({ error: state.updateError })
      },
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: state.updateError }) }) }),
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  aktualisiereWerkstattStammdaten,
  setzeWerkstattStatus,
  aktualisiereWerkstattEmail,
  aktualisiereWerkstattAdresse,
} from '../actions'

const basePatch = {
  name: 'Auto Müller',
  telefon: ' 0231 1 ',
  ansprechpartner_name: null,
  website: null,
  provision_betrag_netto: 150,
  provision_aktiv: true,
  bank_iban: null,
  bank_bic: null,
  bank_kontoinhaber: null,
}
const baseAdresse = { adresse_strasse: 'Musterstr. 1', adresse_plz: '44135', adresse_ort: 'Dortmund', lat: 51.5, lng: 7.0 }

beforeEach(() => {
  state = { rolle: 'admin', updateError: null, authError: null }
  lastPatch = null
  lastAuthArgs = null
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockReset().mockImplementation(() => Promise.resolve({ data: { rolle: state.rolle }, error: null }))
})

describe('aktualisiereWerkstattStammdaten', () => {
  it('Nicht-Admin -> ok:false', async () => {
    state.rolle = 'dispatch'
    expect((await aktualisiereWerkstattStammdaten('w-1', basePatch)).ok).toBe(false)
  })
  it('leerer Name -> ok:false', async () => {
    const res = await aktualisiereWerkstattStammdaten('w-1', { ...basePatch, name: '  ' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('Pflichtfeld')
  })
  it('negative Provision -> ok:false', async () => {
    expect((await aktualisiereWerkstattStammdaten('w-1', { ...basePatch, provision_betrag_netto: -5 })).ok).toBe(false)
  })
  it('Happy: trimmt + setzt normalized_name', async () => {
    const res = await aktualisiereWerkstattStammdaten('w-1', basePatch)
    expect(res.ok).toBe(true)
    expect(lastPatch?.name).toBe('Auto Müller')
    expect(lastPatch?.normalized_name).toBe('auto müller')
    expect(lastPatch?.telefon).toBe('0231 1')
  })
})

describe('setzeWerkstattStatus', () => {
  it('Nicht-Admin -> ok:false', async () => {
    state.rolle = 'kunde'
    expect((await setzeWerkstattStatus('w-1', 'gesperrt', 'Grund')).ok).toBe(false)
  })
  it('ungültiger Status -> ok:false', async () => {
    expect((await setzeWerkstattStatus('w-1', 'quatsch' as 'aktiv')).ok).toBe(false)
  })
  it('gesperrt ohne Grund -> ok:false', async () => {
    const res = await setzeWerkstattStatus('w-1', 'gesperrt', '  ')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('Grund')
  })
  it('gesperrt mit Grund -> setzt gesperrt_am + gesperrt_grund', async () => {
    const res = await setzeWerkstattStatus('w-1', 'gesperrt', 'Betrug')
    expect(res.ok).toBe(true)
    expect(lastPatch?.status).toBe('gesperrt')
    expect(lastPatch?.gesperrt_grund).toBe('Betrug')
    expect(lastPatch?.gesperrt_am).toBeTruthy()
  })
  it('aktiv -> nullt gesperrt_am + gesperrt_grund', async () => {
    const res = await setzeWerkstattStatus('w-1', 'aktiv')
    expect(res.ok).toBe(true)
    expect(lastPatch?.status).toBe('aktiv')
    expect(lastPatch?.gesperrt_am).toBeNull()
    expect(lastPatch?.gesperrt_grund).toBeNull()
  })
})

describe('aktualisiereWerkstattEmail', () => {
  it('Nicht-Admin -> ok:false', async () => {
    state.rolle = 'dispatch'
    expect((await aktualisiereWerkstattEmail('w-1', 'neu@x.de')).ok).toBe(false)
  })
  it('ungültige E-Mail -> ok:false', async () => {
    expect((await aktualisiereWerkstattEmail('w-1', 'keine-email')).ok).toBe(false)
  })
  it('Auth-Fehler (z.B. Unique-Kollision) -> ok:false (fail-closed)', async () => {
    state.authError = { message: 'email already registered' }
    const res = await aktualisiereWerkstattEmail('w-1', 'neu@x.de')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('geändert')
  })
  it('Happy: Auth-Email lowercased + email_confirm=true', async () => {
    const res = await aktualisiereWerkstattEmail('w-1', '  NEU@X.de ')
    expect(res.ok).toBe(true)
    expect(lastAuthArgs?.email).toBe('neu@x.de')
    expect(lastAuthArgs?.email_confirm).toBe(true)
  })
})

describe('aktualisiereWerkstattAdresse', () => {
  it('Nicht-Admin -> ok:false', async () => {
    state.rolle = 'kunde'
    expect((await aktualisiereWerkstattAdresse('w-1', baseAdresse)).ok).toBe(false)
  })
  it('nicht-finite Koordinaten -> ok:false', async () => {
    expect((await aktualisiereWerkstattAdresse('w-1', { ...baseAdresse, lat: NaN })).ok).toBe(false)
  })
  it('Happy: speichert Adresse + Koordinaten', async () => {
    const res = await aktualisiereWerkstattAdresse('w-1', baseAdresse)
    expect(res.ok).toBe(true)
    expect(lastPatch?.lat).toBe(51.5)
    expect(lastPatch?.adresse_ort).toBe('Dortmund')
  })
})
