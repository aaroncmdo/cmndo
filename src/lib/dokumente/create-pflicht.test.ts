// Tests fuer createPflichtdokumenteFromKatalog (Task 6 Kanonisierung)
// Stellt sicher, dass Rows aus dem dokument_katalog (SSoT) angelegt werden,
// nicht mehr aus dem Supplementaer-Block.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DokumentKatalogRow } from './katalog'
import { invalidateKatalogCache } from './katalog'
import { createPflichtdokumenteFromKatalog } from './create-pflicht'

// ─── Katalog-Fixture ────────────────────────────────────────────────────────

const SLOT_FREIGABE_BANK: DokumentKatalogRow = {
  slot_id: 'freigabe_bank',
  label: 'Freigabe Bank',
  beschreibung: null,
  kategorie: 'kosten',
  freigeschaltet_wenn: { op: 'in', field: 'lead.finanzierung_leasing', value: ['leasing', 'finanzierung'] },
  pflicht_wenn:        { op: 'in', field: 'lead.finanzierung_leasing', value: ['leasing', 'finanzierung'] },
  sichtbar_fuer: ['admin'],
  anforderbar_von: ['kundenbetreuer'],
  uploadbar_von: ['kunde'],
  multi_file: false,
  akzeptierte_mime_types: ['application/pdf'],
  max_mb: 10,
  sort_order: 50,
  aktiv: true,
  maps_to_qualifikation: null,
  steuert_kundensichtbarkeit: false,
}

const SLOT_FAHRZEUGSCHEIN: DokumentKatalogRow = {
  slot_id: 'fahrzeugschein',
  label: 'Fahrzeugschein',
  beschreibung: null,
  kategorie: 'stammdaten',
  freigeschaltet_wenn: null,
  pflicht_wenn:        { op: 'neq', field: 'lead.zb1_status', value: 'bestaetigt' },
  sichtbar_fuer: ['admin'],
  anforderbar_von: ['admin'],
  uploadbar_von: ['kunde'],
  multi_file: false,
  akzeptierte_mime_types: ['application/pdf'],
  max_mb: 10,
  sort_order: 1,
  aktiv: true,
  maps_to_qualifikation: null,
  steuert_kundensichtbarkeit: false,
}

// ─── Mock-Supabase-Builder ───────────────────────────────────────────────────
// Baut eine Supabase-Mock-Chain, die:
//   from('dokument_katalog').select(...).eq('aktiv', true).order(...) → katalogRows
//   from('pflichtdokumente').select('dokument_typ').eq('fall_id', ...) → existingRows
//   from('pflichtdokumente').insert(...)                              → ok
//   from('pflichtdokumente').select('dokument_typ').eq(...)          → existingRows

function buildMockSupabase(
  katalogRows: DokumentKatalogRow[],
  existingDokRows: Array<{ dokument_typ: string }> = [],
) {
  // Pflichtdokumente-Chain: select -> eq -> Promise
  const pflichdokChain = {
    select: vi.fn(() => pflichdokChain),
    eq: vi.fn(() => Promise.resolve({ data: existingDokRows, error: null })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }

  // Katalog-Chain: select -> eq -> order -> Promise
  const katalogChain = {
    select: vi.fn(() => katalogChain),
    eq: vi.fn(() => katalogChain),
    order: vi.fn(() => Promise.resolve({ data: katalogRows, error: null })),
  }

  const fromFn = vi.fn((table: string) => {
    if (table === 'dokument_katalog') return katalogChain
    if (table === 'pflichtdokumente') return pflichdokChain
    return pflichdokChain // Fallback
  })

  return {
    from: fromFn,
    _pflichdokChain: pflichdokChain,
  } as unknown as SupabaseClient & { _pflichdokChain: typeof pflichdokChain }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createPflichtdokumenteFromKatalog', () => {
  beforeEach(() => {
    invalidateKatalogCache()
    vi.clearAllMocks()
  })

  it('(a) Lead mit finanzierung_leasing=leasing -> freigabe_bank-Row wird angelegt', async () => {
    const mock = buildMockSupabase(
      [SLOT_FREIGABE_BANK, SLOT_FAHRZEUGSCHEIN],
      [], // keine existing Rows
    )

    const lead = { finanzierung_leasing: 'leasing', zb1_status: 'bestaetigt' }
    await createPflichtdokumenteFromKatalog(mock as unknown as SupabaseClient, 'fall-1', lead)

    // insert muss aufgerufen worden sein
    const insertCalls = (mock as unknown as { _pflichdokChain: { insert: ReturnType<typeof vi.fn> } })
      ._pflichdokChain.insert.mock.calls
    expect(insertCalls).toHaveLength(1)

    const insertedDocs = insertCalls[0][0] as Array<{ dokument_typ: string }>
    const slotIds = insertedDocs.map((d) => d.dokument_typ)
    expect(slotIds).toContain('freigabe_bank')
  })

  it('(a) Lead mit finanzierung_leasing=leasing -> eingefuegte Row hat korrektes Schema', async () => {
    const mock = buildMockSupabase([SLOT_FREIGABE_BANK], [])

    const lead = { finanzierung_leasing: 'leasing' }
    await createPflichtdokumenteFromKatalog(mock as unknown as SupabaseClient, 'fall-abc', lead)

    const insertCalls = (mock as unknown as { _pflichdokChain: { insert: ReturnType<typeof vi.fn> } })
      ._pflichdokChain.insert.mock.calls
    const row = (insertCalls[0][0] as Array<{ fall_id: string; dokument_typ: string; pflicht: boolean; status: string; quelle: string }>)[0]
    expect(row).toMatchObject({
      fall_id: 'fall-abc',
      dokument_typ: 'freigabe_bank',
      pflicht: true,
      status: 'ausstehend',
      quelle: 'system',
    })
  })

  it('(b) Idempotenz: wenn freigabe_bank bereits existiert, wird sie NICHT erneut angelegt', async () => {
    const mock = buildMockSupabase(
      [SLOT_FREIGABE_BANK],
      [{ dokument_typ: 'freigabe_bank' }], // already exists
    )

    const lead = { finanzierung_leasing: 'leasing' }
    await createPflichtdokumenteFromKatalog(mock as unknown as SupabaseClient, 'fall-2', lead)

    // Kein insert, da keine neuen Docs
    const insertCalls = (mock as unknown as { _pflichdokChain: { insert: ReturnType<typeof vi.fn> } })
      ._pflichdokChain.insert.mock.calls
    expect(insertCalls).toHaveLength(0)
  })

  it('kein Katalog-Pflicht-Slot trifft -> kein insert', async () => {
    // lead ohne leasing -> freigabe_bank NICHT Pflicht
    const mock = buildMockSupabase([SLOT_FREIGABE_BANK], [])

    const lead = { finanzierung_leasing: 'keine' }
    await createPflichtdokumenteFromKatalog(mock as unknown as SupabaseClient, 'fall-3', lead)

    const insertCalls = (mock as unknown as { _pflichdokChain: { insert: ReturnType<typeof vi.fn> } })
      ._pflichdokChain.insert.mock.calls
    expect(insertCalls).toHaveLength(0)
  })

  it('null lead -> kein insert (keine Pflicht-Slots evaluierbar)', async () => {
    const mock = buildMockSupabase([SLOT_FREIGABE_BANK], [])

    await createPflichtdokumenteFromKatalog(mock as unknown as SupabaseClient, 'fall-4', null)

    const insertCalls = (mock as unknown as { _pflichdokChain: { insert: ReturnType<typeof vi.fn> } })
      ._pflichdokChain.insert.mock.calls
    expect(insertCalls).toHaveLength(0)
  })

  it('Insert-Fehler -> loggt console.error, wirft nicht (stiller Slot-Init-Fehler sichtbar)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // eigener Mock: pflichtdokumente.insert liefert einen DB-Fehler
    const pflichdokChain = {
      select: vi.fn(() => pflichdokChain),
      eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: { message: 'permission denied' } })),
    }
    const katalogChain = {
      select: vi.fn(() => katalogChain),
      eq: vi.fn(() => katalogChain),
      order: vi.fn(() => Promise.resolve({ data: [SLOT_FREIGABE_BANK], error: null })),
    }
    const mock = {
      from: vi.fn((table: string) => (table === 'dokument_katalog' ? katalogChain : pflichdokChain)),
    } as unknown as SupabaseClient

    // Lead mit leasing -> freigabe_bank ist Pflicht -> 1 Slot -> insert wird versucht
    const lead = { finanzierung_leasing: 'leasing' }

    // Wirft NICHT (best-effort) trotz Insert-Fehler
    await expect(
      createPflichtdokumenteFromKatalog(mock, 'fall-err', lead),
    ).resolves.toBeUndefined()

    expect(pflichdokChain.insert).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('pflichtdokumente-insert fehlgeschlagen fuer fall fall-err'),
    )
    errorSpy.mockRestore()
  })
})

describe('createPflichtdokumenteFromKatalog — Domaenengrenze SV-Verifizierung', () => {
  // Spiegelt die echten Prod-Katalog-Zeilen: die 4 sv_*-Slots tragen
  // freigeschaltet_wenn={} + pflicht_wenn={} (ruleEvaluator: leeres Objekt = "immer
  // wahr"), wodurch sie sonst als perpetuell-ausstehende Karteileichen auf JEDEN
  // Claim/Fall geschrieben wuerden (uploadbar nur vom SV, nie kunde/claim). Sie
  // gehoeren in die SV-Verifizierung (eigener, sv_id-gekeyter Pfad), nicht auf den Claim.
  const SLOT_SV_BERUFSHAFTPFLICHT: DokumentKatalogRow = {
    slot_id: 'sv_berufshaftpflicht',
    label: 'SV Berufshaftpflicht',
    beschreibung: null,
    kategorie: 'gutachter_verifizierung',
    freigeschaltet_wenn: {} as unknown as DokumentKatalogRow['freigeschaltet_wenn'],
    pflicht_wenn: {} as unknown as DokumentKatalogRow['pflicht_wenn'],
    sichtbar_fuer: ['sachverstaendiger', 'admin'],
    anforderbar_von: ['admin'],
    uploadbar_von: ['sachverstaendiger'],
    multi_file: false,
    akzeptierte_mime_types: ['application/pdf'],
    max_mb: 10,
    sort_order: 90,
    aktiv: true,
    maps_to_qualifikation: null,
    steuert_kundensichtbarkeit: false,
  }

  beforeEach(() => {
    invalidateKatalogCache()
    vi.clearAllMocks()
  })

  it('schliesst gutachter_verifizierung-Slots aus, laesst Claim-Slots durch', async () => {
    const mock = buildMockSupabase([SLOT_SV_BERUFSHAFTPFLICHT, SLOT_FAHRZEUGSCHEIN], [])
    // zb1_status != bestaetigt -> fahrzeugschein ist Pflicht (Claim-Slot)
    await createPflichtdokumenteFromKatalog(mock as unknown as SupabaseClient, 'fall-sv', { zb1_status: 'offen' })

    const insertCalls = (mock as unknown as { _pflichdokChain: { insert: ReturnType<typeof vi.fn> } })
      ._pflichdokChain.insert.mock.calls
    expect(insertCalls).toHaveLength(1)
    const slotIds = (insertCalls[0][0] as Array<{ dokument_typ: string }>).map((d) => d.dokument_typ)
    expect(slotIds).toContain('fahrzeugschein')
    expect(slotIds).not.toContain('sv_berufshaftpflicht')
  })

  it('reiner SV-Verifizierungs-Katalog -> gar kein Claim-Insert', async () => {
    const mock = buildMockSupabase([SLOT_SV_BERUFSHAFTPFLICHT], [])
    await createPflichtdokumenteFromKatalog(mock as unknown as SupabaseClient, 'fall-sv2', { zb1_status: 'offen' })

    const insertCalls = (mock as unknown as { _pflichdokChain: { insert: ReturnType<typeof vi.fn> } })
      ._pflichdokChain.insert.mock.calls
    expect(insertCalls).toHaveLength(0)
  })
})
