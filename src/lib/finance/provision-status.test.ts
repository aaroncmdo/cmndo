import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auszahlenProvision, freigebenProvision, storniereProvision } from './provision-status'

// ─── Mocks for downstream modules ────────────────────────────────────────────
vi.mock('./partner-gutschrift', () => ({
  erstellePartnerGutschrift: vi.fn(),
}))
vi.mock('./partner-gutschrift-pdf', () => ({
  generateAndUploadPartnerGutschriftPdf: vi.fn(),
}))

import { erstellePartnerGutschrift } from './partner-gutschrift'
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
  leistung_text: 'Vermittlungsprovision',
  betrag_netto: 100,
  ust_satz: 19,
  ust_betrag: 19,
  betrag_brutto: 119,
  empfaenger_snapshot: { name: 'Test Makler', adresse_strasse: 'Str. 1', adresse_plz: '10115', adresse_ort: 'Berlin', ust_id: 'DE123456789', ist_kleinunternehmer: false },
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
