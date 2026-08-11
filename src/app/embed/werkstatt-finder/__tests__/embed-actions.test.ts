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

// ─── Mock: klassifiziereSchadenbeschreibung (Text-KI, Phase 1) ───────────────
vi.mock('@/lib/werkstatt/bedarf/schadenbeschreibung-gewerke', () => ({
  klassifiziereSchadenbeschreibung: vi.fn(),
}))

// ─── Mock: ladeWerkstattVorschlaege (gerankte Matching-Engine, #4359) ────────
vi.mock('@/lib/werkstatt/matching/lade-vorschlaege', () => ({
  ladeWerkstattVorschlaege: vi.fn(),
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

// ─── Mock: createCase (C2b — die Action ruft jetzt das Intake-Modul statt createLead) ──
// Das Mocken ist hier doppelt noetig: (a) die Action ruft createCase, (b) create-case.ts
// importiert 'server-only' — ohne Mock wuerde der Import in der vitest-Node-Umgebung brechen.
vi.mock('@/lib/intake/create-case', () => ({
  createCase: vi.fn(),
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

// ─── Mock: resolvePromoCodeToId (E1.1 Promo-Attribution) ────────────────────
vi.mock('@/lib/makler/resolve-promo-code', () => ({
  resolvePromoCodeToId: vi.fn(async () => null),
}))

// ─── Mock: getStorageUrl ─────────────────────────────────────────────────────
vi.mock('@/lib/storage/url', () => ({
  getStorageUrl: vi.fn(),
}))

import { klassifiziereSchadenbildBase64 } from '@/lib/werkstatt/bedarf/schadenbild-gewerke'
import { klassifiziereSchadenbeschreibung } from '@/lib/werkstatt/bedarf/schadenbeschreibung-gewerke'
import { ladeWerkstattVorschlaege } from '@/lib/werkstatt/matching/lade-vorschlaege'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { createCase } from '@/lib/intake/create-case'
import { buildWerkstattFinderLeadExtra } from '@/lib/werkstatt/embed-finder-core'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { resolvePromoCodeToId } from '@/lib/makler/resolve-promo-code'
import { getStorageUrl } from '@/lib/storage/url'
import {
  klassifiziereSchadenfotoEmbed,
  klassifiziereSchadenbeschreibungEmbed,
  sucheEchteWerkstaetten,
  sucheWerkstaettenNachOrt,
  erstelleWerkstattFinderLead,
} from '../actions'

const mockKlassifiziere = vi.mocked(klassifiziereSchadenbildBase64)
const mockKlassBeschreibung = vi.mocked(klassifiziereSchadenbeschreibung)
const mockLadeWerkstattVorschlaege = vi.mocked(ladeWerkstattVorschlaege)
const mockGeocodeAdresse = vi.mocked(geocodeAdresse)
const mockCreateCase = vi.mocked(createCase)
const mockBuildExtra = vi.mocked(buildWerkstattFinderLeadExtra)
const mockEnsureFlowLink = vi.mocked(ensureCanonicalFlowLinkForLead)
const mockResolvePromo = vi.mocked(resolvePromoCodeToId)
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
// T4 (Phase 1 Task 4): sucheEchteWerkstaetten auf die gerankte Engine umgestellt
// ─────────────────────────────────────────────────────────────────────────────

describe('sucheEchteWerkstaetten — gerankte Engine', () => {
  it('ruft ladeWerkstattVorschlaege mit anker aus lat/lng, nurEchte=true', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([
      { id: 'w1', name: 'A', passt: true, gruende: [], gewerkeFit: 'passt' },
    ] as never)

    const r = await sucheEchteWerkstaetten({
      lat: 50.9,
      lng: 6.9,
      bedarf: { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 70 },
    })

    expect(mockLadeWerkstattVorschlaege).toHaveBeenCalledWith(
      expect.objectContaining({
        anker: { lat: 50.9, lng: 6.9 },
        bedarf: ['karosserie'],
        bedarfConfidence: 70,
        nurEchte: true,
      }),
    )
    expect(r.werkstaetten[0].id).toBe('w1')
  })

  it('ruft die Engine mit fahrzeugklasse:null und marke:null (Phase 1 — Wizard liefert sie erst Phase 2)', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([])

    await sucheEchteWerkstaetten({ lat: 51.0, lng: 7.0 })

    expect(mockLadeWerkstattVorschlaege).toHaveBeenCalledWith(
      expect.objectContaining({ fahrzeugklasse: null, marke: null, limit: 5 }),
    )
  })

  it('ohne lat/lng (nur plz) → anker:null, bedarf/bedarfConfidence leer (Regress, kein Crash)', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([])

    const result = await sucheEchteWerkstaetten({ plz: '50667' })

    expect(mockLadeWerkstattVorschlaege).toHaveBeenCalledWith(
      expect.objectContaining({ anker: null, bedarf: [], bedarfConfidence: 0 }),
    )
    expect(result.keineSpezialisierte).toBe(false)
  })

  it('ohne bedarf → keineSpezialisierte:false, unabhaengig vom Engine-Ergebnis (Regress)', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([
      { id: '1', name: 'Werkstatt A', gewerkeFit: 'passt_nicht' },
      { id: '2', name: 'Werkstatt B', gewerkeFit: 'passt_nicht' },
    ] as never)

    const result = await sucheEchteWerkstaetten({ lat: 51.0, lng: 7.0 })

    expect(result.werkstaetten).toHaveLength(2)
    expect(result.keineSpezialisierte).toBe(false)
  })

  it('mit bedarf (confidence>=HART_SCHWELLE) + ALLE gewerkeFit passt_nicht → keineSpezialisierte:true, Engine-Fallback-Liste bleibt sichtbar', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([
      { id: '1', name: 'Werkstatt M', gewerkeFit: 'passt_nicht' },
    ] as never)

    const bedarf: Reparaturbedarf = { kategorien: ['glas'], quelle: 'schadenbild', confidence: 90 }
    const result = await sucheEchteWerkstaetten({ lat: 51.0, lng: 7.0, bedarf })

    // glas passt bei keiner Werkstatt → keineSpezialisierte:true; die Engine liefert (Fallback) trotzdem alle.
    expect(result.keineSpezialisierte).toBe(true)
    expect(result.werkstaetten).toHaveLength(1)
  })

  it('mit bedarf (confidence>=HART_SCHWELLE), mindestens eine passt → keineSpezialisierte:false', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([
      { id: '1', name: 'Werkstatt A', gewerkeFit: 'passt' },
      { id: '2', name: 'Werkstatt B', gewerkeFit: 'passt_nicht' },
    ] as never)

    const bedarf: Reparaturbedarf = { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 80 }
    const result = await sucheEchteWerkstaetten({ lat: 51.0, lng: 7.0, bedarf })

    expect(result.keineSpezialisierte).toBe(false)
  })

  it('mit bedarf, aber confidence < HART_SCHWELLE → keineSpezialisierte:false trotz 100% passt_nicht (zu unsicher zum Ausschliessen)', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([
      { id: '1', name: 'Werkstatt M', gewerkeFit: 'passt_nicht' },
    ] as never)

    const bedarf: Reparaturbedarf = { kategorien: ['glas'], quelle: 'manuell', confidence: 40 }
    const result = await sucheEchteWerkstaetten({ lat: 51.0, lng: 7.0, bedarf })

    expect(result.keineSpezialisierte).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 Task 2: sucheEchteWerkstaetten reicht Marke + Fahrzeugklasse an die Engine durch
// ─────────────────────────────────────────────────────────────────────────────

describe('sucheEchteWerkstaetten — Marke + Fahrzeugklasse durchreichen', () => {
  it('reicht marke + fahrzeugklasse an die Engine', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([])

    await sucheEchteWerkstaetten({
      lat: 50.9,
      lng: 6.9,
      marke: 'BMW',
      fahrzeugklasse: 'M1',
      bedarf: { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 80 },
    })

    expect(mockLadeWerkstattVorschlaege).toHaveBeenCalledWith(
      expect.objectContaining({ marke: 'BMW', fahrzeugklasse: 'M1', anker: { lat: 50.9, lng: 6.9 }, nurEchte: true }),
    )
  })

  it('ohne marke/fahrzeugklasse → null (Rückwärtskompatibel)', async () => {
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([])

    await sucheEchteWerkstaetten({ lat: 50.9, lng: 6.9 })

    expect(mockLadeWerkstattVorschlaege).toHaveBeenCalledWith(
      expect.objectContaining({ marke: null, fahrzeugklasse: null }),
    )
  })
})

describe('klassifiziereSchadenbeschreibungEmbed', () => {
  it('mappt Klassifikator-Output auf quelle=schadenbeschreibung', async () => {
    mockKlassBeschreibung.mockReset()
    mockKlassBeschreibung.mockResolvedValue({ kategorien: ['karosserie'], confidence: 75 })
    const r = await klassifiziereSchadenbeschreibungEmbed('Stoßstange eingedrückt')
    expect(r).toEqual({ kategorien: ['karosserie'], quelle: 'schadenbeschreibung', confidence: 75 })
  })
  it('leere Kategorien → unbekannt', async () => {
    mockKlassBeschreibung.mockReset()
    mockKlassBeschreibung.mockResolvedValue({ kategorien: [], confidence: 0 })
    const r = await klassifiziereSchadenbeschreibungEmbed('unklar')
    expect(r).toEqual({ kategorien: [], quelle: 'unbekannt', confidence: 0 })
  })
})

describe('sucheWerkstaettenNachOrt — gerankte Engine', () => {
  it('ohne bedarf → geocodiert, ruft ladeWerkstattVorschlaege mit anker aus dem Geocode-Treffer + nurEchte=true, center gesetzt', async () => {
    mockGeocodeAdresse.mockResolvedValue({ lat: 51.0, lng: 7.0, formatted: 'Berlin', placeId: null })
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([
      { id: '1', name: 'Werkstatt A', gewerkeFit: 'passt' },
    ] as never)

    const result = await sucheWerkstaettenNachOrt('Berlin')

    expect(mockLadeWerkstattVorschlaege).toHaveBeenCalledWith(
      expect.objectContaining({
        fahrzeugklasse: null,
        marke: null,
        anker: { lat: 51.0, lng: 7.0 },
        bedarf: [],
        bedarfConfidence: 0,
        nurEchte: true,
      }),
    )
    expect(result.werkstaetten).toHaveLength(1)
    expect(result.center).toEqual({ lat: 51.0, lng: 7.0 })
    expect(result.keineSpezialisierte).toBe(false)
  })

  it('mit bedarf → bedarf/bedarfConfidence an die Engine durchgereicht, center bleibt der Geocode-Treffer', async () => {
    mockGeocodeAdresse.mockResolvedValue({ lat: 51.0, lng: 7.0, formatted: 'Köln', placeId: null })
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([
      { id: '1', name: 'Werkstatt A', gewerkeFit: 'passt' },
    ] as never)

    const bedarf: Reparaturbedarf = { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 75 }
    const result = await sucheWerkstaettenNachOrt('Köln', bedarf)

    expect(mockLadeWerkstattVorschlaege).toHaveBeenCalledWith(
      expect.objectContaining({ bedarf: ['karosserie'], bedarfConfidence: 75 }),
    )
    expect(result.center).toEqual({ lat: 51.0, lng: 7.0 })
    expect(result.keineSpezialisierte).toBe(false)
  })

  it('mit bedarf, aber keine Werkstatt passt (confidence>=HART_SCHWELLE) → keineSpezialisierte:true', async () => {
    mockGeocodeAdresse.mockResolvedValue({ lat: 51.0, lng: 7.0, formatted: 'Berlin', placeId: null })
    mockLadeWerkstattVorschlaege.mockReset()
    mockLadeWerkstattVorschlaege.mockResolvedValue([
      { id: '1', name: 'Werkstatt M', gewerkeFit: 'passt_nicht' },
    ] as never)

    const bedarf: Reparaturbedarf = { kategorien: ['glas'], quelle: 'schadenbild', confidence: 90 }
    const result = await sucheWerkstaettenNachOrt('Berlin', bedarf)

    expect(result.keineSpezialisierte).toBe(true)
    expect(result.werkstaetten).toHaveLength(1)
  })

  it('Ort nicht gefunden → leere werkstaetten, center:null, keineSpezialisierte:false, Engine NICHT aufgerufen', async () => {
    mockGeocodeAdresse.mockResolvedValue(null)
    mockLadeWerkstattVorschlaege.mockReset()

    const result = await sucheWerkstaettenNachOrt('Unbekannter Ort')

    expect(result.werkstaetten).toEqual([])
    expect(result.center).toBeNull()
    expect(result.keineSpezialisierte).toBe(false)
    expect(mockLadeWerkstattVorschlaege).not.toHaveBeenCalled()
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
      mockCreateCase.mockResolvedValue({ ok: true, leadId, claimId: null, flowLinkToken: token, deduped: false })
    } else {
      mockCreateCase.mockResolvedValue({ ok: false, error: 'DB-Fehler' })
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

  // E1.1 (Entry-Point-Matrix-Audit): Promo-Attribution — ?promo= wird resolved + persistiert.
  it('promoCode gueltig (Resolver liefert id) → promotion_code_id im createCase-extra', async () => {
    setupMocks()
    mockResolvePromo.mockResolvedValue('promo-uuid-1')

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com', promoCode: 'MK-TEST' })

    expect(result.ok).toBe(true)
    expect(mockResolvePromo).toHaveBeenCalledWith('MK-TEST')
    const extraArg = mockCreateCase.mock.calls[0][1].extra as Record<string, unknown>
    expect(extraArg).toMatchObject({ promotion_code_id: 'promo-uuid-1' })
  })

  it('promoCode ungueltig/inaktiv (Resolver null) → KEIN promotion_code_id im extra', async () => {
    setupMocks()
    mockResolvePromo.mockResolvedValue(null)

    const result = await erstelleWerkstattFinderLead({ email: 'test@example.com', promoCode: 'QUATSCH' })

    expect(result.ok).toBe(true)
    const extraArg = mockCreateCase.mock.calls[0][1].extra as Record<string, unknown>
    expect(extraArg).not.toHaveProperty('promotion_code_id')
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

// ─────────────────────────────────────────────────────────────────────────────
// §10 Doppel-Lead-Falle: flowToken -> UPDATE des bestehenden Leads statt INSERT
// (Mirror des Gutachter-Musters: Token = Capability, server-seitig aufgeloest)
// ─────────────────────────────────────────────────────────────────────────────

describe('erstelleWerkstattFinderLead — §10 flowToken (Doppel-Lead-Falle)', () => {
  const token = 'flow-token-bestand'

  function setupTokenMocks(leadIdAusToken: string | null, updates: Array<Record<string, unknown>>) {
    mockEnsureFlowLink.mockResolvedValue({ ok: true, token, wiederverwendet: true })
    mockCreateCase.mockResolvedValue({ ok: true, leadId: 'lead-NEU', claimId: null, flowLinkToken: null, deduped: false })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'flow_links') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: leadIdAusToken ? { lead_id: leadIdAusToken } : null }),
        }
      }
      if (table === 'leads') {
        const chain = {
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(payload)
            return chain
          }),
          eq: vi.fn().mockResolvedValue({ error: null }),
        }
        return { update: chain.update, eq: chain.eq }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) }
    })
  }

  it('gueltiger Token -> UPDATE des bestehenden Leads (kein createCase); null gestrippt, false bleibt', async () => {
    const updates: Array<Record<string, unknown>> = []
    setupTokenMocks('lead-bestand-77', updates)
    mockBuildExtra.mockReturnValueOnce({ fahrzeug_hersteller: 'BMW', fahrzeug_modell: null, gewerbe_flag: false })

    const result = await erstelleWerkstattFinderLead({
      email: 'kunde@example.com',
      vorname: 'Max',
      flowToken: 'tok-77',
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.token).toBe(token)
    expect(mockCreateCase).not.toHaveBeenCalled()
    expect(mockEnsureFlowLink.mock.calls[0][0]).toBe('lead-bestand-77')
    expect(updates[0]).toMatchObject({
      email: 'kunde@example.com',
      vorname: 'Max',
      fahrzeug_hersteller: 'BMW',
      gewerbe_flag: false, // false ist ein WERT (privat) — darf NICHT gestrippt werden
    })
    expect(updates[0]).not.toHaveProperty('fahrzeug_modell') // null -> gestrippt (keine Luecken-Ueberschreibung)
    expect(updates[0]).not.toHaveProperty('nachname') // leer -> nicht angefasst
  })

  it('unbekannter/abgelaufener Token -> Fallback-INSERT (Spec §10: "Entry ohne Lead")', async () => {
    const updates: Array<Record<string, unknown>> = []
    setupTokenMocks(null, updates)
    mockBuildExtra.mockReturnValueOnce({})

    const result = await erstelleWerkstattFinderLead({ email: 'kunde@example.com', flowToken: 'tok-tot' })

    expect(result.ok).toBe(true)
    expect(mockCreateCase).toHaveBeenCalledOnce()
    expect(mockEnsureFlowLink.mock.calls[0][0]).toBe('lead-NEU')
  })
})
