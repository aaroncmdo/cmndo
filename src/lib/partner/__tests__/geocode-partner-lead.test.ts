import { describe, it, expect, vi, beforeEach } from 'vitest'
import { baueAdresse, geocodePartnerLead } from '../geocode-partner-lead'

vi.mock('@/lib/termine/engine/geocode')

import { geocodeMitFallback } from '@/lib/termine/engine/geocode'

const mockGeocode = vi.mocked(geocodeMitFallback)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('baueAdresse', () => {
  it('joined strasse/plz/ort mit Komma', () => {
    expect(baueAdresse({ strasse: 'Domstr. 1', plz: '50667', ort: 'Köln' })).toBe('Domstr. 1, 50667 Köln')
  })
  it('ohne strasse nur plz+ort', () => {
    expect(baueAdresse({ plz: '50667', ort: 'Köln' })).toBe('50667 Köln')
  })
  it('trimmt Whitespace', () => {
    expect(baueAdresse({ strasse: '  Main St.  ', plz: ' 10115 ', ort: ' Berlin ' })).toBe('Main St., 10115 Berlin')
  })
  it('gibt leeren String zurück wenn alles fehlt', () => {
    expect(baueAdresse({})).toBe('')
  })
})

describe('geocodePartnerLead', () => {
  it('unvollständig wenn plz fehlt → kein Geocode-Call', async () => {
    const r = await geocodePartnerLead({ strasse: 'Domstr. 1', ort: 'Köln' }) // plz fehlt
    expect(r).toEqual({ ok: false, error: expect.stringContaining('unvollständig'), unvollstaendig: true })
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('unvollständig wenn ort fehlt → kein Geocode-Call', async () => {
    const r = await geocodePartnerLead({ strasse: 'Domstr. 1', plz: '50667' }) // ort fehlt
    expect(r).toEqual({ ok: false, error: expect.stringContaining('unvollständig'), unvollstaendig: true })
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('unvollständig wenn beides fehlt → kein Geocode-Call', async () => {
    const r = await geocodePartnerLead({ strasse: 'Domstr. 1' })
    expect(r).toEqual({ ok: false, error: expect.stringContaining('unvollständig'), unvollstaendig: true })
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('ok-Pfad: reicht lat/lng/place_id/formatted durch (gemockt)', async () => {
    mockGeocode.mockResolvedValueOnce({ lat: 50.938, lng: 6.96, adresse: 'Domstr. 1, 50667 Köln, Deutschland', placeId: 'ChIJ123' })
    const r = await geocodePartnerLead({ strasse: 'Domstr. 1', plz: '50667', ort: 'Köln' })
    expect(r).toEqual({ ok: true, lat: 50.938, lng: 6.96, place_id: 'ChIJ123', formatted: 'Domstr. 1, 50667 Köln, Deutschland' })
    expect(mockGeocode).toHaveBeenCalledWith('Domstr. 1, 50667 Köln')
  })

  it('ok-Pfad: place_id null wird durchgereicht', async () => {
    mockGeocode.mockResolvedValueOnce({ lat: 52.52, lng: 13.405, adresse: '10115 Berlin, Deutschland', placeId: null })
    const r = await geocodePartnerLead({ plz: '10115', ort: 'Berlin' })
    expect(r).toEqual({ ok: true, lat: 52.52, lng: 13.405, place_id: null, formatted: '10115 Berlin, Deutschland' })
  })

  it('geocode-Fehler (null) → {ok:false, unvollstaendig:false}', async () => {
    mockGeocode.mockResolvedValueOnce(null)
    const r = await geocodePartnerLead({ strasse: 'Unbekannte Str. 999', plz: '99999', ort: 'Nirgendwo' })
    expect(r).toEqual({ ok: false, error: 'Adresse konnte nicht geokodiert werden.', unvollstaendig: false })
  })

  it('null-Werte für plz/ort werden als fehlend behandelt', async () => {
    const r = await geocodePartnerLead({ strasse: 'Musterstr. 1', plz: null, ort: null })
    expect(r).toEqual({ ok: false, error: expect.stringContaining('unvollständig'), unvollstaendig: true })
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('leere Strings für plz/ort werden als fehlend behandelt', async () => {
    const r = await geocodePartnerLead({ plz: '  ', ort: '' })
    expect(r).toEqual({ ok: false, error: expect.stringContaining('unvollständig'), unvollstaendig: true })
    expect(mockGeocode).not.toHaveBeenCalled()
  })
})
