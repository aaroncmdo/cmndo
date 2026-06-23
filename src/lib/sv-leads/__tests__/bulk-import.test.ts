import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseSvLeadCsv } from '../bulk-import'

// We test importSvLeads by mocking the two I/O dependencies.
// The mock modules must be declared before the dynamic import below.
vi.mock('@/lib/mapbox/geocode', () => ({
  geocodeAdresse: vi.fn(),
}))
vi.mock('@/lib/sv-leads/upsert', () => ({
  upsertSvLead: vi.fn(),
}))

// Lazy-import so the mocks are in place when the module is loaded.
const getImportSvLeads = async () => {
  const mod = await import('../bulk-import')
  return mod.importSvLeads
}

// ─── parseSvLeadCsv ───────────────────────────────────────────────────────────

describe('parseSvLeadCsv', () => {
  const HEADER = 'name,firma,adresse,plz,ort,telefon,email,dat_id,dat_expert_nr,qualifikationen,paket_umkreis_km'

  it('parst eine valide 2-Zeilen-CSV korrekt', () => {
    const csv = [
      HEADER,
      'Max Mustermann,Muster GmbH,Hauptstr. 1,50667,Köln,0221123456,max@example.de,,123,kfz,25',
      'Erika Muster,,Nebenstr. 2,50668,Köln,,,,,',
    ].join('\n')

    const result = parseSvLeadCsv(csv)

    expect(result.fehler).toHaveLength(0)
    expect(result.rows).toHaveLength(2)

    expect(result.rows[0]).toMatchObject({
      name: 'Max Mustermann',
      firma: 'Muster GmbH',
      adresse: 'Hauptstr. 1',
      plz: '50667',
      ort: 'Köln',
      telefon: '0221123456',
      email: 'max@example.de',
      dat_expert_nr: '123',
      qualifikationen: ['kfz'],
      paket_umkreis_km: 25,
    })

    expect(result.rows[1]).toMatchObject({
      name: 'Erika Muster',
      firma: null,
      adresse: 'Nebenstr. 2',
    })
  })

  it('schreibt eine Zeile ohne name in fehler (nicht rows)', () => {
    const csv = [
      HEADER,
      ',Firma ohne Name,Irgendwo 1,12345,Berlin,,,,,,',
    ].join('\n')

    const result = parseSvLeadCsv(csv)

    expect(result.rows).toHaveLength(0)
    expect(result.fehler).toHaveLength(1)
    expect(result.fehler[0]).toMatch(/name/i)
  })

  it('schreibt eine Zeile ohne adresse in fehler', () => {
    const csv = [
      HEADER,
      'Kein Ort SV,,,50667,Köln,,,,,,',
    ].join('\n')

    const result = parseSvLeadCsv(csv)

    expect(result.rows).toHaveLength(0)
    expect(result.fehler).toHaveLength(1)
    expect(result.fehler[0]).toMatch(/adresse/i)
  })

  it('parst qualifikationen mit Semikolon', () => {
    const csv = [
      HEADER,
      'Hans Meier,,Bahnhofstr. 5,50667,Köln,,,,,kfz;oldtimer,30',
    ].join('\n')

    const result = parseSvLeadCsv(csv)

    expect(result.rows[0].qualifikationen).toEqual(['kfz', 'oldtimer'])
  })

  it('parst qualifikationen mit Pipe', () => {
    const csv = [
      HEADER,
      'Hans Meier,,Bahnhofstr. 5,50667,Köln,,,,,kfz|oldtimer,30',
    ].join('\n')

    const result = parseSvLeadCsv(csv)

    expect(result.rows[0].qualifikationen).toEqual(['kfz', 'oldtimer'])
  })

  it('ueberspringt leere Zeilen', () => {
    const csv = [HEADER, '', 'Max Mustermann,,Hauptstr. 1,50667,Köln,,,,,kfz,', ''].join('\n')

    const result = parseSvLeadCsv(csv)
    expect(result.rows).toHaveLength(1)
  })
})

// ─── importSvLeads ────────────────────────────────────────────────────────────

describe('importSvLeads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const HEADER = 'name,firma,adresse,plz,ort,telefon,email,dat_id,dat_expert_nr,qualifikationen,paket_umkreis_km'

  it('ruft geocodeAdresse auf und uebergibt die Koordinaten an upsertSvLead', async () => {
    const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')

    vi.mocked(geocodeAdresse).mockResolvedValue({
      lat: 50.9333,
      lng: 6.9500,
      formatted: 'Hauptstr. 1, 50667 Köln',
      placeId: null,
    })
    vi.mocked(upsertSvLead).mockResolvedValue({ ok: true, id: 'abc-123' })

    const importSvLeads = await getImportSvLeads()
    const csv = [HEADER, 'Max Mustermann,,Hauptstr. 1,50667,Köln,,,,,kfz,25'].join('\n')

    const result = await importSvLeads(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.importiert).toBe(1)
    expect(result.fehler).toHaveLength(0)

    expect(geocodeAdresse).toHaveBeenCalledOnce()
    // Adress-Query: "adresse plz ort" (space-joined, filter(Boolean))
    expect(geocodeAdresse).toHaveBeenCalledWith('Hauptstr. 1 50667 Köln')

    expect(upsertSvLead).toHaveBeenCalledOnce()
    expect(upsertSvLead).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 50.9333,
        lng: 6.9500,
        quelle: 'admin_bulk',
      }),
    )
  })

  it('schreibt Zeile in fehler wenn geocode null zurueckgibt — kein upsertSvLead-Aufruf', async () => {
    const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')

    vi.mocked(geocodeAdresse).mockResolvedValue(null)

    const importSvLeads = await getImportSvLeads()
    const csv = [
      HEADER,
      'SV ohne Geo,,Unbekannte Gasse 99,99999,Nirgendwo,,,,,',
    ].join('\n')

    const result = await importSvLeads(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.importiert).toBe(0)
    expect(result.fehler).toHaveLength(1)
    expect(result.fehler[0]).toMatch(/SV ohne Geo/)

    expect(upsertSvLead).not.toHaveBeenCalled()
  })

  it('setzt den Batch fort wenn eine Zeile fehlschlaegt (kein Abbruch)', async () => {
    const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')

    vi.mocked(geocodeAdresse)
      .mockResolvedValueOnce(null) // Zeile 1 schlaegt fehl
      .mockResolvedValueOnce({ lat: 51.0, lng: 7.0, formatted: 'ok', placeId: null }) // Zeile 2 ok
    vi.mocked(upsertSvLead).mockResolvedValue({ ok: true, id: 'xyz' })

    const importSvLeads = await getImportSvLeads()
    const csv = [
      HEADER,
      'Fehlschlag SV,,Falsche Str. 1,11111,Nirgendwo,,,,,',
      'Erfolg SV,,Gute Str. 2,50667,Köln,,,,,',
    ].join('\n')

    const result = await importSvLeads(csv)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.importiert).toBe(1)
    expect(result.fehler).toHaveLength(1)
    expect(upsertSvLead).toHaveBeenCalledOnce()
  })

  // Idempotenz-Hinweis: upsertSvLead ist selbst idempotent (DB-RPC mit Dedup
  // via dat_id ODER (normalized_name, plz)) — zweimal dieselbe Zeile importieren
  // fuehrt zu einem Update, nicht zu einem Duplikat. Das ist die Invariante von
  // upsertSvLead, kein Job von importSvLeads selbst.
  it('Idempotenz liegt in upsertSvLead — mehrfacher Import derselben Zeile kein Duplikat', async () => {
    const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
    const { upsertSvLead } = await import('@/lib/sv-leads/upsert')

    vi.mocked(geocodeAdresse).mockResolvedValue({
      lat: 50.9,
      lng: 6.9,
      formatted: 'Hauptstr. 1, 50667 Köln',
      placeId: null,
    })
    // Erster Aufruf → neu anlegen; zweiter → Update (beide geben ok:true zurueck)
    vi.mocked(upsertSvLead).mockResolvedValue({ ok: true, id: 'abc' })

    const importSvLeads = await getImportSvLeads()
    const csv = [HEADER, 'Idempotenz Test,,Hauptstr. 1,50667,Köln,,,,,'].join('\n')

    await importSvLeads(csv)
    const result2 = await importSvLeads(csv)

    expect(result2.ok).toBe(true)
    // upsertSvLead wurde bei beiden Durchlaeufen aufgerufen (je 1x) — Dedup im RPC
    expect(upsertSvLead).toHaveBeenCalledTimes(2)
  })
})
