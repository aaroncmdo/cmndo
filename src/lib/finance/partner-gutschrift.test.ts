import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- module mocks (own admin-client dependencies) ---
vi.mock('@/lib/billing/generate-rechnungs-nr', () => ({
  nextRechnungsNrRaw: vi.fn(),
}))
vi.mock('@/lib/billing/get-rechnungs-konfig', () => ({
  getAktuelleRechnungsKonfig: vi.fn(),
}))

// --- mocks for versendePartnerGutschrift ---
vi.mock('@react-email/render', () => ({ render: vi.fn(async () => '<html>') }))
// Mock the template module so the test never loads @react-email/components (whose nested
// @react-email/render pulls prettier/plugins/html at import-time) -> hermetic, no transitive-dep coupling.
vi.mock('@/lib/email/google/templates/PartnerGutschrift', () => ({
  PartnerGutschriftEmail: () => null,
  subject: () => 'Ihre Gutschrift TEST',
}))
vi.mock('@/lib/email/google/client', () => ({ sendEmail: vi.fn() }))

import { nextRechnungsNrRaw } from '@/lib/billing/generate-rechnungs-nr'
import { getAktuelleRechnungsKonfig } from '@/lib/billing/get-rechnungs-konfig'
import { erstellePartnerGutschrift, versendePartnerGutschrift } from './partner-gutschrift'

const mockNextNr = vi.mocked(nextRechnungsNrRaw)
const mockKonfig = vi.mocked(getAktuelleRechnungsKonfig)

// --- helpers ---

function makeKonfig() {
  return {
    id: 'k-1',
    firmenname: 'Claimondo GmbH i.G.R.',
    strasse: 'Musterstr. 1',
    plz: '10115',
    ort: 'Berlin',
    steuernummer: '27/123/12345',
    ust_id: 'DE123456789',
    hrb: null,
    geschaeftsfuehrer: null,
    zahlungsempfaenger_name: 'Claimondo GmbH',
    zahlungsempfaenger_iban: 'DE89370400440532013000',
    zahlungsempfaenger_bic: 'COBADEFFXXX',
    zahlungsempfaenger_bank: 'Commerzbank',
    zahlungsempfaenger_hinweis: null,
    gueltig_ab: '2026-01-01',
    gueltig_bis: null,
    rechnungssteller: 'claimondo_gmbh_igr' as const,
    version: 1,
  }
}

/** Minimal fake db: partner-load returns partnerData, insert records what was passed */
function makeDb(opts: {
  partnerData: Record<string, unknown> | null
  partnerError?: { message: string } | null
  insertResult?: { data: { id: string } | null; error: { code?: string; message: string } | null }
}) {
  const insertedRows: unknown[] = []

  const insertResult = opts.insertResult ?? { data: { id: 'gs-uuid-1' }, error: null }

  const db = {
    _insertedRows: insertedRows,
    from: (table: string) => {
      if (table === 'partner_gutschriften') {
        return {
          insert: (row: unknown) => {
            insertedRows.push(row)
            return {
              select: (_cols: string) => ({
                single: () => Promise.resolve(insertResult),
              }),
            }
          },
        }
      }
      // partner table (makler / werkstaetten / marketing_partner)
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            single: () =>
              Promise.resolve({
                data: opts.partnerData,
                error: opts.partnerError ?? null,
              }),
          }),
        }),
      }
    },
  }
  return db as any
}

const BASE_PARAMS = {
  tabelle: 'provisionen',
  ledgerId: 'prov-123',
  partnerTyp: 'makler' as const,
  partnerId: 'makler-1',
  betraege: {
    nettoCent: 15000,
    ustSatz: 19 as number | null,
    ustBetrag: 2850 as number | null,
    bruttoCent: 17850,
  },
  leistungText: 'Provision Lead #123',
}

// ─────────────────────────────────────────────────────────────────────────────

describe('erstellePartnerGutschrift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNextNr.mockResolvedValue(42)
    mockKonfig.mockResolvedValue(makeKonfig())
  })

  // (a) Regelbesteuert without ust_id → completeness block
  it('(a) blocks when regelbesteuert partner has no ust_id', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'Test Makler GmbH',
        adresse_strasse: 'Hauptstr. 5',
        adresse_plz: '80331',
        adresse_ort: 'München',
        ust_id: null,
        ist_kleinunternehmer: false,
      },
    })

    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toMatch(/Steuerdaten unvollst/i)
    // insert must NOT have been called
    expect(db._insertedRows).toHaveLength(0)
  })

  // (a2) Missing address → completeness block
  it('(a2) blocks when kleinunternehmer has missing adresse_ort', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'Test Makler GmbH',
        adresse_strasse: 'Hauptstr. 5',
        adresse_plz: '80331',
        adresse_ort: null,
        ust_id: null,
        ist_kleinunternehmer: true,
      },
    })

    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toMatch(/Steuerdaten unvollst/i)
    expect(db._insertedRows).toHaveLength(0)
  })

  // (b) Complete regelbesteuert → success with number, snapshot, cent→euro conversion
  it('(b) inserts complete regelbesteuert gutschrift with correct number and snapshot', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'Regelbesteuert Makler GmbH',
        adresse_strasse: 'Bahnhofstr. 10',
        adresse_plz: '10243',
        adresse_ort: 'Berlin',
        ust_id: 'DE987654321',
        ist_kleinunternehmer: false,
      },
    })

    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected success')
    expect(result.gutschriftId).toBe('gs-uuid-1')
    // Number format: CMNDO-GS-{year}-00042
    expect(result.nummer).toMatch(/^CMNDO-GS-\d{4}-00042$/)

    // Verify what was actually inserted
    expect(db._insertedRows).toHaveLength(1)
    const row = db._insertedRows[0] as Record<string, unknown>

    // Gutschrift number stored
    expect(row.gutschrift_nr).toMatch(/^CMNDO-GS-\d{4}-00042$/)

    // Cent→Euro conversion
    expect(row.betrag_netto).toBe(150)     // 15000 / 100
    expect(row.ust_satz).toBe(19)
    expect(row.ust_betrag).toBe(28.5)      // 2850 / 100
    expect(row.betrag_brutto).toBe(178.5)  // 17850 / 100

    // Empfaenger snapshot fields
    const snap = row.empfaenger_snapshot as Record<string, unknown>
    expect(snap.name).toBe('Regelbesteuert Makler GmbH')
    expect(snap.adresse_strasse).toBe('Bahnhofstr. 10')
    expect(snap.adresse_plz).toBe('10243')
    expect(snap.adresse_ort).toBe('Berlin')
    expect(snap.ust_id).toBe('DE987654321')
    expect(snap.ist_kleinunternehmer).toBe(false)

    // Status
    expect(row.status).toBe('erstellt')
    expect(row.partner_typ).toBe('makler')
    expect(row.partner_id).toBe('makler-1')
    expect(row.ledger_tabelle).toBe('provisionen')
    expect(row.ledger_id).toBe('prov-123')
  })

  // (c) Kleinunternehmer without ust_id → success (no ust_id required)
  it('(c) allows kleinunternehmer without ust_id, passes betraege.ustSatz/ustBetrag through', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'Kleinunternehmer Makler',
        adresse_strasse: 'Lindenstr. 3',
        adresse_plz: '50667',
        adresse_ort: 'Köln',
        ust_id: null,
        ist_kleinunternehmer: true,
      },
    })
    const params = {
      ...BASE_PARAMS,
      betraege: {
        nettoCent: 10000,
        ustSatz: 0 as number | null,
        ustBetrag: 0 as number | null,
        bruttoCent: 10000,
      },
    }

    const result = await erstellePartnerGutschrift(db, params)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected success')

    const row = db._insertedRows[0] as Record<string, unknown>
    expect(row.ust_satz).toBe(0)
    expect(row.ust_betrag).toBe(0)
    expect(row.betrag_netto).toBe(100)
    expect(row.betrag_brutto).toBe(100)

    const snap = row.empfaenger_snapshot as Record<string, unknown>
    expect(snap.ist_kleinunternehmer).toBe(true)
    expect(snap.ust_id).toBeNull()
  })

  // (c2) Kleinunternehmer with null ustBetrag → null in row
  it('(c2) stores null ust_betrag when betraege.ustBetrag is null', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'KU ohne USt',
        adresse_strasse: 'Elm St. 1',
        adresse_plz: '12345',
        adresse_ort: 'Hamburg',
        ust_id: null,
        ist_kleinunternehmer: true,
      },
    })
    const params = {
      ...BASE_PARAMS,
      betraege: {
        nettoCent: 5000,
        ustSatz: null,
        ustBetrag: null,
        bruttoCent: 5000,
      },
    }

    const result = await erstellePartnerGutschrift(db, params)

    expect(result.ok).toBe(true)
    const row = db._insertedRows[0] as Record<string, unknown>
    expect(row.ust_betrag).toBeNull()
    expect(row.ust_satz).toBeNull()
  })

  // (d) Duplicate insert → unique violation → special error message
  it('(d) returns "Gutschrift existiert bereits" on unique violation (code 23505)', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'Duplikat Makler',
        adresse_strasse: 'Teststr. 1',
        adresse_plz: '10115',
        adresse_ort: 'Berlin',
        ust_id: 'DE111222333',
        ist_kleinunternehmer: false,
      },
      insertResult: {
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      },
    })

    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('Gutschrift existiert bereits')
  })

  // makler uses firma, werkstatt uses name — name-source test
  it('werkstatt partner uses name field (not firma) for snapshot', async () => {
    const db = makeDb({
      partnerData: {
        name: 'Karosserie Müller GmbH',
        firma: 'should-be-ignored',
        adresse_strasse: 'Werkstattweg 2',
        adresse_plz: '70173',
        adresse_ort: 'Stuttgart',
        ust_id: 'DE555666777',
        ist_kleinunternehmer: false,
      },
    })
    const params = {
      ...BASE_PARAMS,
      partnerTyp: 'werkstatt' as const,
    }

    const result = await erstellePartnerGutschrift(db, params)

    expect(result.ok).toBe(true)
    const row = db._insertedRows[0] as Record<string, unknown>
    const snap = row.empfaenger_snapshot as Record<string, unknown>
    expect(snap.name).toBe('Karosserie Müller GmbH')
  })

  // Partner not found → early return
  it('returns Partner nicht gefunden when db lookup fails', async () => {
    const db = makeDb({
      partnerData: null,
      partnerError: { message: 'PGRST116' },
    })

    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('Partner nicht gefunden')
    expect(db._insertedRows).toHaveLength(0)
  })

  // nextRechnungsNrRaw throws → caught, result-object
  it('returns error result when nextRechnungsNrRaw throws', async () => {
    mockNextNr.mockRejectedValue(new Error('DB sequence error'))
    const db = makeDb({
      partnerData: {
        firma: 'Test Makler',
        adresse_strasse: 'Str. 1',
        adresse_plz: '10115',
        adresse_ort: 'Berlin',
        ust_id: 'DE123456789',
        ist_kleinunternehmer: false,
      },
    })

    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('DB sequence error')
    expect(db._insertedRows).toHaveLength(0)
  })

  // getAktuelleRechnungsKonfig throws → caught, result-object
  it('returns error result when getAktuelleRechnungsKonfig throws', async () => {
    mockKonfig.mockRejectedValue(new Error('Keine Konfig gefunden'))
    const db = makeDb({
      partnerData: {
        firma: 'Test Makler',
        adresse_strasse: 'Str. 1',
        adresse_plz: '10115',
        adresse_ort: 'Berlin',
        ust_id: 'DE123456789',
        ist_kleinunternehmer: false,
      },
    })

    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('Keine Konfig gefunden')
    expect(db._insertedRows).toHaveLength(0)
  })

  // ── Task 2: bank_iban + leistung_datum ──────────────────────────────────────

  // (bank_iban-a) partner with bank_iban → empfaenger_snapshot.bank_iban stored
  it('(bank_iban-a) stores bank_iban in empfaenger_snapshot when partner has one', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'IBAN Makler GmbH',
        adresse_strasse: 'Ibanstr. 1',
        adresse_plz: '10115',
        adresse_ort: 'Berlin',
        ust_id: 'DE123456789',
        ist_kleinunternehmer: false,
        bank_iban: 'DE12345678901234567890',
      },
    })
    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)
    expect(result.ok).toBe(true)
    const row = db._insertedRows[0] as Record<string, unknown>
    const snap = row.empfaenger_snapshot as Record<string, unknown>
    expect(snap.bank_iban).toBe('DE12345678901234567890')
  })

  // (bank_iban-b) marketing partner without bank_iban → empfaenger_snapshot.bank_iban is null
  it('(bank_iban-b) empfaenger_snapshot.bank_iban is null for partner without bank_iban', async () => {
    const db = makeDb({
      partnerData: {
        name: 'Marketing Partner ohne IBAN',
        adresse_strasse: 'Str. 2',
        adresse_plz: '10115',
        adresse_ort: 'Berlin',
        ust_id: 'DE999999999',
        ist_kleinunternehmer: false,
        // no bank_iban field
      },
    })
    const result = await erstellePartnerGutschrift(db, { ...BASE_PARAMS, partnerTyp: 'marketing' })
    expect(result.ok).toBe(true)
    const row = db._insertedRows[0] as Record<string, unknown>
    const snap = row.empfaenger_snapshot as Record<string, unknown>
    expect(snap.bank_iban).toBeNull()
  })

  // (leistung_datum-a) leistungsDatum ISO → insert row leistung_datum === date part
  it('(leistung_datum-a) leistungsDatum ISO timestamp → row.leistung_datum === date string YYYY-MM-DD', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'Datum Makler GmbH',
        adresse_strasse: 'Datumstr. 1',
        adresse_plz: '10115',
        adresse_ort: 'Berlin',
        ust_id: 'DE111222333',
        ist_kleinunternehmer: false,
      },
    })
    const result = await erstellePartnerGutschrift(db, {
      ...BASE_PARAMS,
      leistungsDatum: '2026-07-15T10:00:00.000Z',
    })
    expect(result.ok).toBe(true)
    const row = db._insertedRows[0] as Record<string, unknown>
    expect(row.leistung_datum).toBe('2026-07-15')
  })

  // (leistung_datum-b) no leistungsDatum → row.leistung_datum === null
  it('(leistung_datum-b) without leistungsDatum param → row.leistung_datum is null', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'Kein Datum Makler GmbH',
        adresse_strasse: 'Str. 3',
        adresse_plz: '10115',
        adresse_ort: 'Berlin',
        ust_id: 'DE444555666',
        ist_kleinunternehmer: false,
      },
    })
    const result = await erstellePartnerGutschrift(db, BASE_PARAMS)
    expect(result.ok).toBe(true)
    const row = db._insertedRows[0] as Record<string, unknown>
    expect(row.leistung_datum).toBeNull()
  })

  // Aussteller snapshot populated correctly from konfig (full RechnungsKonfig after step 0)
  it('populates aussteller_snapshot from RechnungsKonfig (full konfig including geschaeftsfuehrer/hrb)', async () => {
    const db = makeDb({
      partnerData: {
        firma: 'Snap Test Makler',
        adresse_strasse: 'Str. 1',
        adresse_plz: '10115',
        adresse_ort: 'Berlin',
        ust_id: 'DE123456789',
        ist_kleinunternehmer: false,
      },
    })

    await erstellePartnerGutschrift(db, BASE_PARAMS)

    const row = db._insertedRows[0] as Record<string, unknown>
    const aussteller = row.aussteller_snapshot as Record<string, unknown>
    const konfig = makeKonfig()
    // Core billing fields
    expect(aussteller.firmenname).toBe(konfig.firmenname)
    expect(aussteller.zahlungsempfaenger_iban).toBe(konfig.zahlungsempfaenger_iban)
    // Full konfig now includes geschaeftsfuehrer and hrb (may be null in mock, but key must exist)
    expect('geschaeftsfuehrer' in aussteller).toBe(true)
    expect('hrb' in aussteller).toBe(true)
    // Other key fields still present
    expect(aussteller.strasse).toBe(konfig.strasse)
    expect(aussteller.plz).toBe(konfig.plz)
    expect(aussteller.ort).toBe(konfig.ort)
    expect(aussteller.steuernummer).toBe(konfig.steuernummer)
    expect(aussteller.ust_id).toBe(konfig.ust_id)
    expect(aussteller.zahlungsempfaenger_name).toBe(konfig.zahlungsempfaenger_name)
    expect(aussteller.zahlungsempfaenger_bic).toBe(konfig.zahlungsempfaenger_bic)
    expect(aussteller.zahlungsempfaenger_bank).toBe(konfig.zahlungsempfaenger_bank)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// versendePartnerGutschrift
// ─────────────────────────────────────────────────────────────────────────────

const GUTSCHRIFT_NR = 'CMNDO-GS-2026-00042'

/** Builds a fake db that handles all paths needed by versendePartnerGutschrift. */
function makeVersendDb(opts: {
  gutschriftRow: Record<string, unknown> | null
  partnerEmail?: string | null
  downloadData?: { arrayBuffer: () => Promise<ArrayBuffer> } | null
  statusUpdateError?: { message: string } | null
}) {
  const statusUpdates: Record<string, unknown>[] = []

  const db = {
    _statusUpdates: statusUpdates,
    from: (table: string) => {
      if (table === 'partner_gutschriften') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: () =>
                Promise.resolve({ data: opts.gutschriftRow, error: opts.gutschriftRow ? null : { message: 'not found' } }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            statusUpdates.push(patch)
            return {
              eq: () => Promise.resolve({ error: opts.statusUpdateError ?? null }),
            }
          },
        }
      }
      // Partner tables (makler / werkstaetten / marketing_partner)
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            single: () =>
              Promise.resolve({
                data: opts.partnerEmail !== undefined ? { email: opts.partnerEmail } : null,
                error: opts.partnerEmail !== undefined ? null : { message: 'not found' },
              }),
          }),
        }),
      }
    },
    storage: {
      from: (_bucket: string) => ({
        download: (_path: string) =>
          Promise.resolve({
            data: opts.downloadData !== undefined
              ? opts.downloadData
              : { arrayBuffer: async () => new ArrayBuffer(8) },
            error: null,
          }),
      }),
    },
  }
  return db as any
}

const CANNED_GUTSCHRIFT = {
  id: 'gs-uuid-1',
  status: 'erstellt',
  pdf_storage_path: 'partner-gutschriften/2026/CMNDO-GS-2026-00042.pdf',
  gutschrift_nr: GUTSCHRIFT_NR,
  betrag_brutto: 178.5,
  erstellt_am: '2026-07-05T10:00:00.000Z',
  partner_typ: 'makler',
  partner_id: 'makler-1',
  empfaenger_snapshot: { name: 'Test Makler GmbH' },
}

describe('versendePartnerGutschrift', () => {
  // We need to get the mocked sendEmail reference.
  // Dynamic import mocks: vi.mock('@/lib/email/google/client') is hoisted, so
  // we can grab the mock by static import of the mocked module inside vitest.
  let sendEmailMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const clientMod = await import('@/lib/email/google/client')
    sendEmailMock = vi.mocked(clientMod.sendEmail)
  })

  it('happy: calls sendEmail with PDF attachment and marks status versendet', async () => {
    const db = makeVersendDb({
      gutschriftRow: CANNED_GUTSCHRIFT,
      partnerEmail: 'makler@example.de',
    })

    const result = await versendePartnerGutschrift(db, 'gs-uuid-1')

    expect(result).toEqual({ ok: true })
    // sendEmail must have been called once
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const callArgs = sendEmailMock.mock.calls[0][0] as Record<string, unknown>
    // Attachment must be present with correct filename
    const attachments = callArgs.attachments as Array<{ filename: string }>
    expect(attachments).toHaveLength(1)
    expect(attachments[0].filename).toBe(`Gutschrift-${GUTSCHRIFT_NR}.pdf`)
    // Status update to versendet must have been issued
    expect(db._statusUpdates).toHaveLength(1)
    expect(db._statusUpdates[0]).toMatchObject({ status: 'versendet' })
    expect((db._statusUpdates[0] as Record<string, unknown>).versendet_am).toBeDefined()
  })

  it('already sent: skips sendEmail and returns {ok:true} (idempotent)', async () => {
    const db = makeVersendDb({
      gutschriftRow: { ...CANNED_GUTSCHRIFT, status: 'versendet' },
      partnerEmail: 'makler@example.de',
    })

    const result = await versendePartnerGutschrift(db, 'gs-uuid-1')

    expect(result).toEqual({ ok: true })
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(db._statusUpdates).toHaveLength(0)
  })

  it('missing pdf: returns {ok:false, error: /PDF/} without calling sendEmail', async () => {
    const db = makeVersendDb({
      gutschriftRow: { ...CANNED_GUTSCHRIFT, pdf_storage_path: null },
      partnerEmail: 'makler@example.de',
    })

    const result = await versendePartnerGutschrift(db, 'gs-uuid-1')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toMatch(/PDF/i)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('sendEmail throws: returns {ok:false} without marking versendet, does NOT throw', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP-Verbindungsfehler'))
    const db = makeVersendDb({
      gutschriftRow: CANNED_GUTSCHRIFT,
      partnerEmail: 'makler@example.de',
    })

    // Must not throw — non-fatal
    const result = await versendePartnerGutschrift(db, 'gs-uuid-1')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    // No status→versendet update should have been issued
    const versendetUpdates = db._statusUpdates.filter(
      (p: Record<string, unknown>) => p.status === 'versendet',
    )
    expect(versendetUpdates).toHaveLength(0)
  })
})
