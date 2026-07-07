import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auszahlenProvision, freigebenProvision, storniereProvision } from './provision-status'

// ─── Mocks for downstream modules ────────────────────────────────────────────
vi.mock('./partner-gutschrift', () => ({
  erstellePartnerGutschrift: vi.fn(),
  versendePartnerGutschrift: vi.fn(async () => ({ ok: true })),
  erstelleStornoGutschrift: vi.fn(),
}))
vi.mock('./partner-gutschrift-pdf', () => ({
  generateAndUploadPartnerGutschriftPdf: vi.fn(),
}))

import { erstellePartnerGutschrift, erstelleStornoGutschrift } from './partner-gutschrift'
import { generateAndUploadPartnerGutschriftPdf } from './partner-gutschrift-pdf'

// ─── Legacy simple fakeDb (kept for storno/freigeben tests) ──────────────────
function fakeDb(row: Record<string, unknown>) {
  const upd = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  return {
    _upd: upd,
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }),
      update: (patch: unknown) => { upd(patch); return { eq: () => Promise.resolve({ error: null }) } },
    }),
  } as any
}

// ─── Storno-wiring fakeDb: chainable select (.eq/.neq→self, maybeSingle) ──────
// 1st maybeSingle = original-precheck, 2nd = storno-row refetch.
function stornoFakeDb(opts: { origData: Record<string, unknown> | null; stornoRowData?: Record<string, unknown> | null }) {
  const ledgerUpdates: Record<string, unknown>[] = []
  const gutschriftUpdates: Record<string, unknown>[] = []
  let maybeSingleCall = 0
  const makeChain = () => {
    const c: any = {
      eq: () => c,
      neq: () => c,
      maybeSingle: () => {
        maybeSingleCall += 1
        const data = maybeSingleCall === 1 ? opts.origData : (opts.stornoRowData ?? null)
        return Promise.resolve({ data, error: null })
      },
    }
    return c
  }
  return {
    _ledgerUpdates: ledgerUpdates,
    _gutschriftUpdates: gutschriftUpdates,
    from: (table: string) => {
      if (table !== 'partner_gutschriften') {
        return { update: (patch: Record<string, unknown>) => { ledgerUpdates.push(patch); return { eq: () => Promise.resolve({ error: null }) } } }
      }
      return {
        select: () => makeChain(),
        update: (patch: Record<string, unknown>) => { gutschriftUpdates.push(patch); return { eq: () => Promise.resolve({ error: null }) } },
      }
    },
  } as any
}

// ─── Rich fakeDb for auszahlenProvision tests ─────────────────────────────────
// Dispatches by table name.
// - ledger table: from(tabelle).select(...).eq().single() → ledger row
// - ledger table: from(tabelle).update(patch).eq() → { error: null }
// - partner_gutschriften: from('partner_gutschriften').select('*').eq().eq().maybeSingle() → precheck
// - partner_gutschriften: from('partner_gutschriften').select('*').eq().maybeSingle() → refetch after create
// - partner_gutschriften: from('partner_gutschriften').update(patch).eq() → { error: null }
// - partner_gutschriften: from('partner_gutschriften').delete().eq() → tracked

type RichFakeDbOptions = {
  ledgerRow: Record<string, unknown>
  gutschriftenPrecheckData?: Record<string, unknown> | null  // default null
  gutschriftenRefetchData?: Record<string, unknown> | null   // returned after create
}

function richFakeDb(opts: RichFakeDbOptions) {
  const ledgerUpdates: Record<string, unknown>[] = []
  const gutschriftUpdates: Record<string, unknown>[] = []
  let deleteCalledWith: string | null = null

  const precheckData = opts.gutschriftenPrecheckData ?? null
  const refetchData = opts.gutschriftenRefetchData ?? null

  const db = {
    _ledgerUpdates: ledgerUpdates,
    _gutschriftUpdates: gutschriftUpdates,
    _deleteCalledWith: () => deleteCalledWith,
    from: (table: string) => {
      if (table !== 'partner_gutschriften') {
        // Ledger table
        return {
          select: (_str?: string) => ({
            eq: (_col: string, _val: string) => ({
              single: () => Promise.resolve({ data: opts.ledgerRow, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            ledgerUpdates.push(patch)
            return { eq: () => Promise.resolve({ error: null }) }
          },
        }
      } else {
        // partner_gutschriften table
        return {
          select: (_str?: string) => ({
            eq: (_col1: string, _val1: string) => ({
              // For the precheck: .eq().eq().maybeSingle()
              eq: (_col2: string, _val2: string) => ({
                maybeSingle: () => Promise.resolve({ data: precheckData, error: null }),
              }),
              // For the refetch after create: .eq().maybeSingle()
              maybeSingle: () => Promise.resolve({ data: refetchData, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            gutschriftUpdates.push(patch)
            return { eq: () => Promise.resolve({ error: null }) }
          },
          delete: () => ({
            eq: (_col: string, val: string) => {
              deleteCalledWith = val
              return Promise.resolve({ error: null })
            },
          }),
          insert: (_row: unknown) => ({
            select: (_str?: string) => ({
              single: () => Promise.resolve({ data: { id: 'new-gutschrift-id' }, error: null }),
            }),
          }),
        }
      }
    },
  } as any

  return db
}

// ─── Canned gutschrift row for re-fetch ──────────────────────────────────────
const CANNED_GUTSCHRIFT_ROW = {
  id: 'gs-id-1',
  gutschrift_nr: 'CMNDO-GS-2026-00001',
  erstellt_am: '2026-07-05T10:00:00.000Z',
  leistung_datum: '2026-07-15',
  leistung_text: 'Vermittlungsprovision',
  betrag_netto: 100,
  ust_satz: 19,
  ust_betrag: 19,
  betrag_brutto: 119,
  empfaenger_snapshot: { name: 'Test Makler', adresse_strasse: 'Str. 1', adresse_plz: '10115', adresse_ort: 'Berlin', ust_id: 'DE123456789', ist_kleinunternehmer: false, bank_iban: null },
  aussteller_snapshot: { firma: 'Claimondo GmbH' },
  pdf_storage_path: null,
}

const CANNED_GUTSCHRIFT_ROW_WITH_PDF = {
  ...CANNED_GUTSCHRIFT_ROW,
  pdf_storage_path: 'partner-gutschriften/2026/CMNDO-GS-2026-00001.pdf',
}

// ─── auszahlenProvision — extended tests ─────────────────────────────────────
describe('auszahlenProvision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blockt bei unbekanntem USt-Status (kein Gutschrift-Aufruf)', async () => {
    // Use legacy simple db — just needs the ledger read path
    const db = richFakeDb({
      ledgerRow: { betrag_netto_eur: 100, makler_id: 'makler-1', makler: { ist_kleinunternehmer: null } },
    })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/USt-Status/)
    expect(erstellePartnerGutschrift).not.toHaveBeenCalled()
  })

  it('friert USt ein (regelbesteuert) und schreibt status:ausgezahlt via zwei getrennten Ledger-Updates', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({
      ok: true,
      gutschriftId: 'gs-id-1',
      nummer: 'CMNDO-GS-2026-00001',
    })
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'p.pdf' })

    const db = richFakeDb({
      ledgerRow: { betrag_netto_eur: 100, makler_id: 'makler-1', makler: { ist_kleinunternehmer: false } },
      gutschriftenRefetchData: CANNED_GUTSCHRIFT_ROW,
    })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(true)

    // Freeze update: first ledger patch — should NOT contain status
    const freezePatch = db._ledgerUpdates[0] as Record<string, unknown>
    expect(freezePatch.ust_satz).toBe(19)
    expect(freezePatch.ust_betrag).toBe(19)
    expect(freezePatch.betrag_brutto).toBe(119)
    expect(freezePatch.status).toBeUndefined()

    // Status update: second ledger patch — must contain paidStatus
    const statusPatch = db._ledgerUpdates[1] as Record<string, unknown>
    expect(statusPatch.status).toBe('ausgezahlt')
    expect(statusPatch.ust_satz).toBeUndefined()
  })

  it('blockt Auszahlung (Steuerdaten unvollstaendig) — kein status:paid, kein PDF', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({
      ok: false,
      error: 'Empfänger-Steuerdaten unvollständig — Gutschrift nicht erstellbar',
    })

    const db = richFakeDb({
      ledgerRow: { betrag_netto_eur: 100, makler_id: 'makler-1', makler: { ist_kleinunternehmer: false } },
      gutschriftenRefetchData: null,
    })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('unvollständig')

    // No status→paid ledger update should have been issued
    const statusPatches = db._ledgerUpdates.filter(
      (p: Record<string, unknown>) => 'status' in p,
    )
    expect(statusPatches).toHaveLength(0)
    expect(generateAndUploadPartnerGutschriftPdf).not.toHaveBeenCalled()
  })

  it('PDF-Fehler: compensation-delete der Gutschrift, kein status:paid, {ok:false}', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({
      ok: true,
      gutschriftId: 'gs-id-1',
      nummer: 'CMNDO-GS-2026-00001',
    })
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({
      ok: false,
      error: 'Storage upload fehlgeschlagen',
    })

    const db = richFakeDb({
      ledgerRow: { betrag_netto_eur: 100, makler_id: 'makler-1', makler: { ist_kleinunternehmer: false } },
      // Re-fetch returns row with pdf_storage_path: null (just created, no PDF yet)
      gutschriftenRefetchData: CANNED_GUTSCHRIFT_ROW,
    })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(false)

    // Compensation delete must have been issued for the gutschrift row
    expect(db._deleteCalledWith()).toBe('gs-id-1')

    // No status→paid must be in ledger updates
    const statusPatches = db._ledgerUpdates.filter(
      (p: Record<string, unknown>) => 'status' in p,
    )
    expect(statusPatches).toHaveLength(0)
  })

  it('happy path: erstelle OK, pdf OK → status:ausgezahlt + pdf_storage_path gepatcht + {ok:true}', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({
      ok: true,
      gutschriftId: 'gs-id-1',
      nummer: 'CMNDO-GS-2026-00001',
    })
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'partner-gutschriften/2026/CMNDO-GS-2026-00001.pdf' })

    const db = richFakeDb({
      ledgerRow: { betrag_netto_eur: 100, makler_id: 'makler-1', makler: { ist_kleinunternehmer: false } },
      gutschriftenRefetchData: CANNED_GUTSCHRIFT_ROW,
    })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(true)

    // pdf_storage_path must have been patched on partner_gutschriften
    expect(db._gutschriftUpdates).toHaveLength(1)
    expect(db._gutschriftUpdates[0]).toMatchObject({ pdf_storage_path: 'partner-gutschriften/2026/CMNDO-GS-2026-00001.pdf' })

    // status→paid must be in ledger updates
    const statusPatch = db._ledgerUpdates.find(
      (p: Record<string, unknown>) => 'status' in p,
    )
    expect(statusPatch?.status).toBe('ausgezahlt')

    // No delete
    expect(db._deleteCalledWith()).toBeNull()
  })

  it('idempotenter Retry: bestehende Gutschrift mit PDF → erstelle NICHT gerufen, status:paid OK', async () => {
    // Pre-check returns existing row WITH pdf_storage_path already set
    const db = richFakeDb({
      ledgerRow: { betrag_netto_eur: 100, makler_id: 'makler-1', makler: { ist_kleinunternehmer: false } },
      gutschriftenPrecheckData: CANNED_GUTSCHRIFT_ROW_WITH_PDF,
    })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(true)

    // Neither erstelle nor pdf should have been called
    expect(erstellePartnerGutschrift).not.toHaveBeenCalled()
    expect(generateAndUploadPartnerGutschriftPdf).not.toHaveBeenCalled()

    // status→paid must still be issued
    const statusPatch = db._ledgerUpdates.find(
      (p: Record<string, unknown>) => 'status' in p,
    )
    expect(statusPatch?.status).toBe('ausgezahlt')
  })

  // ── Task 4: leistungDatumCol je Ledger + Durchreichen an erstellePartnerGutschrift ──

  it('(Task4-a) makler_provisionen: trigger_at aus Ledger-Row wird als leistungsDatum an erstellePartnerGutschrift uebergeben', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({
      ok: true,
      gutschriftId: 'gs-id-1',
      nummer: 'CMNDO-GS-2026-00001',
    })
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'p.pdf' })

    const db = richFakeDb({
      ledgerRow: {
        betrag_netto_eur: 100,
        makler_id: 'makler-1',
        makler: { ist_kleinunternehmer: false },
        trigger_at: '2026-07-15T10:00:00.000Z',
      },
      gutschriftenRefetchData: CANNED_GUTSCHRIFT_ROW,
    })

    const r = await auszahlenProvision(db, 'makler_provisionen', 'prov-1')
    expect(r.ok).toBe(true)

    // erstellePartnerGutschrift must have been called with leistungsDatum from trigger_at
    expect(erstellePartnerGutschrift).toHaveBeenCalledTimes(1)
    const callArg = vi.mocked(erstellePartnerGutschrift).mock.calls[0][1] as Record<string, unknown>
    expect(callArg.leistungsDatum).toBe('2026-07-15T10:00:00.000Z')
  })

  it('(Task4-b) werkstatt_staffel_bonus: erstellt_am aus Ledger-Row wird als leistungsDatum uebergeben', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({
      ok: true,
      gutschriftId: 'gs-id-2',
      nummer: 'CMNDO-GS-2026-00002',
    })
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'p2.pdf' })

    const db = richFakeDb({
      ledgerRow: {
        bonus_betrag_netto: 50,
        werkstatt_id: 'ws-1',
        werkstaetten: { ist_kleinunternehmer: false },
        erstellt_am: '2026-06-30T08:00:00.000Z',
      },
      gutschriftenRefetchData: CANNED_GUTSCHRIFT_ROW,
    })

    const r = await auszahlenProvision(db, 'werkstatt_staffel_bonus', 'bonus-1')
    expect(r.ok).toBe(true)

    const callArg = vi.mocked(erstellePartnerGutschrift).mock.calls[0][1] as Record<string, unknown>
    expect(callArg.leistungsDatum).toBe('2026-06-30T08:00:00.000Z')
  })

  it('(Task4-c) provisionen_maik: created_at aus Ledger-Row wird als leistungsDatum uebergeben', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({
      ok: true,
      gutschriftId: 'gs-id-3',
      nummer: 'CMNDO-GS-2026-00003',
    })
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'p3.pdf' })

    const db = richFakeDb({
      ledgerRow: {
        netto_provision: 75,
        marketing_partner_id: 'mp-1',
        marketing_partner: { ist_kleinunternehmer: true },
        created_at: '2026-05-10T12:00:00.000Z',
      },
      gutschriftenRefetchData: CANNED_GUTSCHRIFT_ROW,
    })

    const r = await auszahlenProvision(db, 'provisionen_maik', 'maik-1')
    expect(r.ok).toBe(true)

    const callArg = vi.mocked(erstellePartnerGutschrift).mock.calls[0][1] as Record<string, unknown>
    expect(callArg.leistungsDatum).toBe('2026-05-10T12:00:00.000Z')
  })

  it('(Task4-d) PDF-Input-Konstruktion enthaelt leistung_datum aus re-fetchter Gutschrift-Row', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({
      ok: true,
      gutschriftId: 'gs-id-1',
      nummer: 'CMNDO-GS-2026-00001',
    })
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'p.pdf' })

    const db = richFakeDb({
      ledgerRow: {
        betrag_netto_eur: 100,
        makler_id: 'makler-1',
        makler: { ist_kleinunternehmer: false },
        trigger_at: '2026-07-15T10:00:00.000Z',
      },
      gutschriftenRefetchData: { ...CANNED_GUTSCHRIFT_ROW, leistung_datum: '2026-07-15' },
    })

    const r = await auszahlenProvision(db, 'makler_provisionen', 'prov-2')
    expect(r.ok).toBe(true)

    // generateAndUploadPartnerGutschriftPdf must have been called with leistung_datum from row
    expect(generateAndUploadPartnerGutschriftPdf).toHaveBeenCalledTimes(1)
    const pdfArg = vi.mocked(generateAndUploadPartnerGutschriftPdf).mock.calls[0][0] as Record<string, unknown>
    expect(pdfArg.leistung_datum).toBe('2026-07-15')
  })

  it('pre-existing Gutschrift (pdf_storage_path null) + PDF-Fehler: Zeile NICHT geloescht, kein status:paid, {ok:false}', async () => {
    // Pre-check returns an EXISTING row (justCreated stays false) with pdf_storage_path: null
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({
      ok: false,
      error: 'Storage upload fehlgeschlagen',
    })

    const db = richFakeDb({
      ledgerRow: { betrag_netto_eur: 100, makler_id: 'makler-1', makler: { ist_kleinunternehmer: false } },
      // Existing row found by pre-check; pdf_storage_path is null → PDF generation will be attempted
      gutschriftenPrecheckData: CANNED_GUTSCHRIFT_ROW, // pdf_storage_path: null
    })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')

    // erstellePartnerGutschrift must NOT have been called — row already existed
    expect(erstellePartnerGutschrift).not.toHaveBeenCalled()

    // The pre-existing row must NOT be deleted (binding invariant: never delete a pre-existing row)
    expect(db._deleteCalledWith()).toBeNull()

    // No status→paid update must have been issued
    const statusPatches = db._ledgerUpdates.filter(
      (p: Record<string, unknown>) => 'status' in p,
    )
    expect(statusPatches).toHaveLength(0)

    // Overall result must be failure
    expect(r.ok).toBe(false)
  })
})

describe('storniereProvision', () => {
  it('(a) makler_staffel_bonus schreibt NUR status:storniert — kein storniert_am', async () => {
    const db = fakeDb({})
    const r = await storniereProvision(db, 'makler_staffel_bonus', 'x', 'Testgrund')
    expect(r.ok).toBe(true)
    const patch = db._upd.mock.calls[0][0] as Record<string, unknown>
    expect(patch.status).toBe('storniert')
    expect(patch.storniert_am).toBeUndefined()
    expect(patch.storno_grund).toBeUndefined()
  })

  it('(b) freigebenProvision fuer provisionen_maik schreibt status:confirmed', async () => {
    const db = fakeDb({})
    const r = await freigebenProvision(db, 'provisionen_maik', 'x')
    expect(r.ok).toBe(true)
    expect(db._upd).toHaveBeenCalledWith({ status: 'confirmed' })
  })

  it('(c) storniereProvision fuer provisionen_maik schreibt status:reversed + reversed_grund (kein storniert_am)', async () => {
    const db = fakeDb({})
    const r = await storniereProvision(db, 'provisionen_maik', 'x', 'Rueckbuchung')
    expect(r.ok).toBe(true)
    const patch = db._upd.mock.calls[0][0] as Record<string, unknown>
    expect(patch.status).toBe('reversed')
    expect(patch.reversed_grund).toBe('Rueckbuchung')
    expect(patch.storniert_am).toBeUndefined()
  })
})

// ─── Task 4: Storno-Gutschrift wiring in storniereProvision ───────────────────

describe('storniereProvision — Storno-Gutschrift wiring (Task 4)', () => {
  beforeEach(() => vi.clearAllMocks())

  const ORIG = {
    id: 'orig-1',
    gutschrift_nr: 'CMNDO-GS-2026-00001',
    erstellt_am: '2026-07-05T10:00:00.000Z',
  }
  const STORNO_ROW = {
    gutschrift_nr: 'CMNDO-GS-2026-00002',
    erstellt_am: '2026-07-07T10:00:00.000Z',
    leistung_datum: '2026-07-05',
    leistung_text: 'Vermittlungsprovision',
    betrag_netto: -100,
    ust_satz: 19,
    ust_betrag: -19,
    betrag_brutto: -119,
    empfaenger_snapshot: { name: 'Test' },
    aussteller_snapshot: { firmenname: 'Claimondo' },
  }

  it('(storno-a) original gutschrift exists → erstelleStornoGutschrift called + ledger storniert', async () => {
    vi.mocked(erstelleStornoGutschrift).mockResolvedValue({ ok: true, stornoId: 'storno-1', nummer: 'CMNDO-GS-2026-00002' } as any)
    vi.mocked(generateAndUploadPartnerGutschriftPdf).mockResolvedValue({ ok: true, pdfPath: 'partner-gutschriften/2026/x.pdf' } as any)
    const db = stornoFakeDb({ origData: ORIG, stornoRowData: STORNO_ROW })
    const r = await storniereProvision(db, 'makler_provisionen', 'led-1', 'Rückbuchung')
    expect(r.ok).toBe(true)
    expect(erstelleStornoGutschrift).toHaveBeenCalledWith(db, 'orig-1', 'Rückbuchung')
    expect(db._ledgerUpdates.some((p: any) => p.status === 'storniert')).toBe(true)
  })

  it('(storno-b) no original gutschrift → erstelleStornoGutschrift NOT called, ledger storniert only', async () => {
    const db = stornoFakeDb({ origData: null })
    const r = await storniereProvision(db, 'makler_provisionen', 'led-1', 'Grund')
    expect(r.ok).toBe(true)
    expect(erstelleStornoGutschrift).not.toHaveBeenCalled()
    expect(db._ledgerUpdates.some((p: any) => p.status === 'storniert')).toBe(true)
  })

  it('(storno-c) erstelleStornoGutschrift fails → storniereProvision still ok (non-fatal)', async () => {
    vi.mocked(erstelleStornoGutschrift).mockResolvedValue({ ok: false, error: 'boom' } as any)
    const db = stornoFakeDb({ origData: ORIG })
    const r = await storniereProvision(db, 'makler_provisionen', 'led-1', 'Grund')
    expect(r.ok).toBe(true)
    expect(db._ledgerUpdates.some((p: any) => p.status === 'storniert')).toBe(true)
  })
})
