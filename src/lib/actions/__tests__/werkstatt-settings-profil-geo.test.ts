// D3 (Spec 2026-07-27-werkstatt-finder-followups): Geo-Selbstheilung beim Portal-Profil-Save.
// Mit dem D1-Umkreis-Cap ist eine geo-lose Werkstatt im Kunden-Finder unsichtbar — der
// Profil-Save re-geocodiert deshalb best-effort, sobald die Adresse vollstaendig ist.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const geocodeMock = vi.fn()
vi.mock('@/lib/mapbox/geocode', () => ({
  geocodeAdresse: (...a: unknown[]) => geocodeMock(...a),
}))

const eqMock = vi.fn()
const updateMock = vi.fn()
const fromServerMock = vi.fn()
const userMock = { id: 'user-123' }
const serverClient = {
  auth: { getUser: vi.fn() },
  from: fromServerMock,
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(serverClient)),
}))

import { updateWerkstattProfil } from '../werkstatt-settings'

function profilInput(over: Record<string, unknown> = {}) {
  return {
    name: 'KFZ Muster GmbH',
    ansprechpartner_name: 'Max Muster',
    adresse_strasse: 'Musterstraße 12',
    adresse_plz: '50667',
    adresse_ort: 'Köln',
    telefon: '0221 12345',
    email: 'info@kfz-muster.de',
    website: '',
    ust_id: '',
    ist_kleinunternehmer: false,
    ...over,
  } as Parameters<typeof updateWerkstattProfil>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  serverClient.auth.getUser.mockResolvedValue({ data: { user: userMock }, error: null })
  eqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: eqMock })
  fromServerMock.mockReturnValue({ update: updateMock })
  geocodeMock.mockResolvedValue({ lat: 50.94, lng: 6.96 })
})

describe('updateWerkstattProfil — Geo-Selbstheilung', () => {
  it('vollstaendige Adresse -> re-geocodiert und schreibt lat/lng mit', async () => {
    const res = await updateWerkstattProfil(profilInput())
    expect(res.ok).toBe(true)
    expect(geocodeMock).toHaveBeenCalledWith('Musterstraße 12, 50667 Köln')
    const update = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(update.lat).toBe(50.94)
    expect(update.lng).toBe(6.96)
  })

  it('Geocode-Fehler blockiert den Save nicht (lat/lng bleiben unangetastet)', async () => {
    geocodeMock.mockRejectedValue(new Error('mapbox down'))
    const res = await updateWerkstattProfil(profilInput())
    expect(res.ok).toBe(true)
    const update = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect('lat' in update).toBe(false)
  })

  it('Geocode ohne Treffer -> Save ok, kein lat/lng-Write', async () => {
    geocodeMock.mockResolvedValue(null)
    const res = await updateWerkstattProfil(profilInput())
    expect(res.ok).toBe(true)
    const update = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect('lat' in update).toBe(false)
  })

  it('unvollstaendige Adresse -> kein Geocode-Call (kein sinnloser API-Traffic)', async () => {
    const res = await updateWerkstattProfil(profilInput({ adresse_strasse: '' }))
    expect(res.ok).toBe(true)
    expect(geocodeMock).not.toHaveBeenCalled()
  })
})
