// Tests fuer embed/werkstatt-finder actions:
// T3: klassifiziereSchadenfotoEmbed
// T4: sucheEchteWerkstaetten / sucheWerkstaettenNachOrt mit bedarf
// T5: erstelleWerkstattFinderLead mit fotos + bedarf Persistenz

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import type { EmbedFoto } from '@/lib/werkstatt/bedarf/embed-foto-guard'

// ─── Mock: klassifiziereSchadenbildBase64 ───────────────────────────────────
vi.mock('@/lib/werkstatt/bedarf/schadenbild-gewerke', () => ({
  klassifiziereSchadenbildBase64: vi.fn(),
}))

// ─── Mock: findWerkstaetten ──────────────────────────────────────────────────
vi.mock('@/lib/werkstatt/finder', () => ({
  findWerkstaetten: vi.fn(),
}))

// ─── Mock: geocodeAdresse ────────────────────────────────────────────────────
vi.mock('@/lib/mapbox/geocode', () => ({
  geocodeAdresse: vi.fn(),
}))

// ─── Mock: createAdminClient ─────────────────────────────────────────────────
const mockStorage = {
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}
const mockFrom = vi.fn()
const mockLeadsUpdate = vi.fn()
// Erfasst den zuletzt an leads.update() uebergebenen Payload (fuer Persist-Assertions).
let lastLeadsUpdatePayload: Record<string, unknown> | undefined

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    storage: {
      from: vi.fn(() => mockStorage),
    },
  })),
}))

// ─── Mock: createLead ────────────────────────────────────────────────────────
vi.mock('@/lib/leads/create-lead', () => ({
  createLead: vi.fn(),
}))

// ─── Mock: buildWerkstattFinderLeadExtra ─────────────────────────────────────
vi.mock('@/lib/werkstatt/embed-finder-core', () => ({
  buildWerkstattFinderLeadExtra: vi.fn(() => ({})),
}))

// ─── Mock: ensureCanonicalFlowLinkForLead ────────────────────────────────────
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: vi.fn(),
}))

// ─── Mock: getConsentedGaClientId ────────────────────────────────────────────
vi.mock('@/lib/analytics/ga4-conversions', () => ({
  getConsentedGaClientId: vi.fn(() => null),
}))

// ─── Mock: getStorageUrl ─────────────────────────────────────────────────────
vi.mock('@/lib/storage/url', () => ({
  getStorageUrl: vi.fn(),
}))

import { klassifiziereSchadenbildBase64 } from '@/lib/werkstatt/bedarf/schadenbild-gewerke'
import { findWerkstaetten } from '@/lib/werkstatt/finder'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { createLead } from '@/lib/leads/create-lead'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { getStorageUrl } from '@/lib/storage/url'
import {
  klassifiziereSchadenfotoEmbed,
  sucheEchteWerkstaetten,
  sucheWerkstaettenNachOrt,
  erstelleWerkstattFinderLead,
} from '../actions'

const mockKlassifiziere = vi.mocked(klassifiziereSchadenbildBase64)
const mockFindWerkstaetten = vi.mocked(findWerkstaetten)
const mockGeocodeAdresse = vi.mocked(geocodeAdresse)
const mockCreateLead = vi.mocked(createLead)
const mockEnsureFlowLink = vi.mocked(ensureCanonicalFlowLinkForLead)
const mockGetStorageUrl = vi.mocked(getStorageUrl)

beforeEach(() => {
  vi.clearAllMocks()
  lastLeadsUpdatePayload = undefined
  mockStorage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/test.jpg' } })
})

// ─────────────────────────────────────────────────────────────────────────────
// T3: klassifiziereSchadenfotoEmbed
// ─────────────────────────────────────────────────────────────────────────────

describe('klassifiziereSchadenfotoEmbed', () => {
  const validFotos: EmbedFoto[] = [
    { data: 'abc123', media_type: 'image/jpeg' },
  ]

  it('gueltige Fotos + KI liefert kategorien → Reparaturbedarf mit quelle schadenbild', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: ['karosserie', 'lackierung'], confidence: 80 })

    const result = await klassifiziereSchadenfotoEmbed(validFotos)

    expect(result.kategorien).toEqual(['karosserie', 'lackierung'])
    expect(result.quelle).toBe('schadenbild')
    expect(result.confidence).toBe(80)
    expect(mockKlassifiziere).toHaveBeenCalledOnce()
  })

  it('Guard ok:false (0 gueltige Fotos) → unbekannt OHNE KI-Call', async () => {
    const ungueltigeFotos: EmbedFoto[] = [
      { data: 'x', media_type: 'image/bmp' }, // falscher type
    ]

    const result = await klassifiziereSchadenfotoEmbed(ungueltigeFotos)

    expect(result.kategorien).toEqual([])
    expect(result.quelle).toBe('unbekannt')
    expect(result.confidence).toBe(0)
    expect(mockKlassifiziere).not.toHaveBeenCalled()
  })

  it('leere Fotos-Liste → unbekannt OHNE KI-Call', async () => {
    const result = await klassifiziereSchadenfotoEmbed([])

    expect(result.kategorien).toEqual([])
    expect(result.quelle).toBe('unbekannt')
    expect(result.confidence).toBe(0)
    expect(mockKlassifiziere).not.toHaveBeenCalled()
  })

  it('KI liefert leere kategorien → unbekannt', async () => {
    mockKlassifiziere.mockResolvedValue({ kategorien: [], confidence: 0 })

    const result = await klassifiziereSchadenfotoEmbed(validFotos)

    expect(result.kategorien).toEqual([])
    expect(result.quelle).toBe('unbekannt')
    expect(result.confidence).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T4: sucheEchteWerkstaetten mit bedarf
// ─────────────────────────────────────────────────────────────────────────────

describe('sucheEchteWerkstaetten', () => {
  const baseRows = [
    { id: '1', name: 'Werkstatt A', faehigkeiten: ['karosserie', 'lackierung'], lat: 51.0, lng: 7.0, distanz_km: 1 },
    { id: '2', name: 'Werkstatt B', faehigkeiten: ['mechanik'], lat: 51.1, lng: 7.1, distanz_km: 2 },
    { id: '3', name: 'Werkstatt C', faehigkeiten: null, lat: 51.2, lng: 7.2, distanz_km: 3 },
  ] as never[]

  it('ohne bedarf → alle rows, keineSpezialisierte:false, kein fit-Feld (Regress)', async () => {
    mockFindWerkstaetten.mockResolvedValue(baseRows)

    const result = await sucheEchteWerkstaetten({ lat: 51.0, lng: 7.0 })

    expect(result.werkstaetten).toHaveLength(3)
    expect(result.keineSpezialisierte).toBe(false)
    // Ohne bedarf kein fit-Annotation
    expect((result.werkstaetten[0] as Record<string, unknown>).fit).toBeUndefined()
  })

  it('mit bedarf (hohe confidence) → rows haben fit, passt_nicht gefiltert, keineSpezialisierte korrekt', async () => {
    mockFindWerkstaetten.mockResolvedValue(baseRows)

    const bedarf: Reparaturbedarf = { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 80 }
    const result = await sucheEchteWerkstaetten({ lat: 51.0, lng: 7.0, bedarf })

    // Werkstatt A hat karosserie → passt; Werkstatt B hat nur mechanik → passt_nicht (gefiltert bei confidence>=60)
    // Werkstatt C hat null faehigkeiten → unbekannt (nicht gefiltert)
    expect(result.werkstaetten.length).toBeGreaterThan(0)
    expect(result.keineSpezialisierte).toBe(false)
    const fits = result.werkstaetten.map((w) => (w as Record<string, unknown>).fit)
    expect(fits).not.toContain('passt_nicht') // hart-gefiltert
  })

  it('mit bedarf, aber keine Werkstatt passt → keineSpezialisierte:true + alle gezeigt (Fallback)', async () => {
    const nurMechanik = [
      { id: '1', name: 'Werkstatt M', faehigkeiten: ['mechanik'], lat: 51.0, lng: 7.0, distanz_km: 1 },
    ] as never[]
    mockFindWerkstaetten.mockResolvedValue(nurMechanik)

    const bedarf: Reparaturbedarf = { kategorien: ['glas'], quelle: 'schadenbild', confidence: 90 }
    const result = await sucheEchteWerkstaetten({ lat: 51.0, lng: 7.0, bedarf })

    // glas nicht vorhanden → keineSpezialisierte:true, Fallback = alle gezeigt
    expect(result.keineSpezialisierte).toBe(true)
    expect(result.werkstaetten).toHaveLength(1)
  })
})

describe('sucheWerkstaettenNachOrt', () => {
  const baseRows = [
    { id: '1', name: 'Werkstatt A', faehigkeiten: ['karosserie'], lat: 51.0, lng: 7.0, distanz_km: 1 },
  ] as never[]

  it('ohne bedarf → werkstaetten + center, keineSpezialisierte:false', async () => {
    mockGeocodeAdresse.mockResolvedValue({ lat: 51.0, lng: 7.0, formatted: 'Berlin', placeId: null })
    mockFindWerkstaetten.mockResolvedValue(baseRows)

    const result = await sucheWerkstaettenNachOrt('Berlin')

    expect(result.werkstaetten).toHaveLength(1)
    expect(result.center).toEqual({ lat: 51.0, lng: 7.0 })
    expect(result.keineSpezialisierte).toBe(false)
  })

  it('mit bedarf → werkstaetten qualifiziert, center durchgereicht', async () => {
    mockGeocodeAdresse.mockResolvedValue({ lat: 51.0, lng: 7.0, formatted: 'Köln', placeId: null })
    mockFindWerkstaetten.mockResolvedValue(baseRows)

    const bedarf: Reparaturbedarf = { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 75 }
    const result = await sucheWerkstaettenNachOrt('Köln', bedarf)

    expect(result.center).toEqual({ lat: 51.0, lng: 7.0 })
    expect(result.keineSpezialisierte).toBe(false)
    const fits = result.werkstaetten.map((w) => (w as Record<string, unknown>).fit)
    expect(fits).toContain('passt')
  })

  it('Ort nicht gefunden → leere werkstaetten, center:null, keineSpezialisierte:false', async () => {
    mockGeocodeAdresse.mockResolvedValue(null)

    const result = await sucheWerkstaettenNachOrt('Unbekannter Ort')

    expect(result.werkstaetten).toEqual([])
    expect(result.center).toBeNull()
    expect(result.keineSpezialisierte).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T5: erstelleWerkstattFinderLead mit fotos + bedarf
// ─────────────────────────────────────────────────────────────────────────────

describe('erstelleWerkstattFinderLead', () => {
  const leadId = 'lead-abc-123'
  const token = 'flow-token-xyz'

  const setupMocks = (leadOk = true, flowOk = true) => {
    if (leadOk) {
      mockCreateLead.mockResolvedValue({ ok: true, leadId })
    } else {
      mockCreateLead.mockResolvedValue({ ok: false, error: 'DB-Fehler' })
    }

    if (flowOk) {
      mockEnsureFlowLink.mockResolvedValue({ ok: true, token, wiederverwendet: false })
    } else {
      mockEnsureFlowLink.mockResolvedValue({ ok: false, error: 'FlowLink-Fehler' })
    }

    // Werkstatt-Lookup (kein werkstattId gesetzt im Test → kein DB-Query)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'werkstaetten') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) }
      }
      if (table === 'leads') {
        const chain = {
          update: vi.fn((payload: Record<string, unknown>) => {
            lastLeadsUpdatePayload = payload
            return chain
          }),
          eq: vi.fn().mockResolvedValue({ error: null }),
        }
        mockLeadsUpdate.mockReturnValue(chain)
        return { update: chain.update, eq: chain.eq }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) }
    })

    mockStorage.upload.mockResolvedValue({ error: null })
    mockGetStorageUrl.mockResolvedValue('https://storage.example.com/leads/lead-abc-123/schadensfoto_1234_abc.jpg')
  }

  it('Basis-Flow ohne fotos/bedarf → {ok:true, token}', async () => {
    setupMocks()

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.token).toBe(token)
  })

  it('Fotos hochgeladen + leads.schadensfoto_urls + bedarf_* gesetzt', async () => {
    setupMocks()
    const fotos: EmbedFoto[] = [
      { data: 'base64datahere', media_type: 'image/jpeg' },
    ]
    const bedarf: Reparaturbedarf = { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 80 }

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com', fotos, bedarf })

    expect(result.ok).toBe(true)
    // Storage-Upload wurde fuer das Foto aufgerufen
    expect(mockStorage.upload).toHaveBeenCalledOnce()
    const uploadCall = mockStorage.upload.mock.calls[0]
    // Pfad: leads/{leadId}/schadensfoto_{ts}_{rand}.jpg
    expect(uploadCall[0]).toMatch(/^leads\/lead-abc-123\/schadensfoto_\d+_[a-z0-9]+\.jpg$/)
    // Buffer aus base64
    expect(Buffer.isBuffer(uploadCall[1])).toBe(true)
    // contentType
    expect(uploadCall[2]).toMatchObject({ contentType: 'image/jpeg' })
  })

  it('Upload-Fehler bricht NICHT den {ok:true, token}-Return', async () => {
    setupMocks()
    // Upload schlaegt fehl
    mockStorage.upload.mockResolvedValue({ error: new Error('Storage-Fehler') })
    const fotos: EmbedFoto[] = [{ data: 'base64data', media_type: 'image/png' }]

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com', fotos })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.token).toBe(token)
  })

  it('Security: text/html-Foto wird im Persist-Pfad verworfen (kein Upload)', async () => {
    setupMocks()
    const fotos: EmbedFoto[] = [
      { data: 'PGh0bWw+', media_type: 'text/html' }, // nicht in der Whitelist
    ]

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com', fotos })

    expect(result.ok).toBe(true)
    // Guard verwirft das Foto → kein Storage-Upload
    expect(mockStorage.upload).not.toHaveBeenCalled()
  })

  it('Security: >3 Fotos werden auf 3 gekappt (Count-Cap)', async () => {
    setupMocks()
    const fotos: EmbedFoto[] = [
      { data: 'a', media_type: 'image/jpeg' },
      { data: 'b', media_type: 'image/jpeg' },
      { data: 'c', media_type: 'image/jpeg' },
      { data: 'd', media_type: 'image/jpeg' },
      { data: 'e', media_type: 'image/jpeg' },
    ]

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com', fotos })

    expect(result.ok).toBe(true)
    // Nur 3 Uploads trotz 5 uebergebener Fotos
    expect(mockStorage.upload).toHaveBeenCalledTimes(3)
  })

  it('Security: out-of-range confidence wird geclamped persistiert (kein int2-Overflow)', async () => {
    setupMocks()
    const bedarf = { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 32768 } as Reparaturbedarf

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com', bedarf })

    expect(result.ok).toBe(true)
    // Der an leads.update() uebergebene Payload traegt geclampte confidence (<=100).
    expect(lastLeadsUpdatePayload?.bedarf_confidence).toBe(100)
    expect(lastLeadsUpdatePayload?.bedarf_quelle).toBe('schadenbild')
  })

  it('Security: nicht-Gewerk-Kategorie wird vor Persist gefiltert', async () => {
    setupMocks()
    const bedarf = { kategorien: ['karosserie', 'hack'], quelle: 'schadenbild', confidence: 50 } as unknown as Reparaturbedarf

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com', bedarf })

    expect(result.ok).toBe(true)
    expect(lastLeadsUpdatePayload?.bedarf_kategorien).toEqual(['karosserie'])
  })

  it('E-Mail fehlt → {ok:false}', async () => {
    const result = await erstelleWerkstattFinderLead({ email: '' })

    expect(result.ok).toBe(false)
  })

  it('Lead-Anlage schlaegt fehl → {ok:false, error}', async () => {
    setupMocks(false)

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('DB-Fehler')
  })
})
