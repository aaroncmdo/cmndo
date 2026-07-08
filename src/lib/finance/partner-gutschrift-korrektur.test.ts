import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./provision-status', () => ({ resolveLedgerKontext: vi.fn() }))
vi.mock('./partner-gutschrift', () => ({
  erstelleStornoGutschrift: vi.fn(),
  erstellePartnerGutschrift: vi.fn(),
  versendePartnerGutschrift: vi.fn(async () => {}),
}))
vi.mock('./partner-gutschrift-pdf', () => ({
  generateAndUploadPartnerGutschriftPdf: vi.fn(async () => ({ ok: false as const })),
}))

import { computeKorrekturBetraege, korrigierePartnerGutschrift } from './partner-gutschrift-korrektur'
import { resolveLedgerKontext } from './provision-status'
import { erstelleStornoGutschrift, erstellePartnerGutschrift } from './partner-gutschrift'

describe('computeKorrekturBetraege', () => {
  it('recompute default (regelbesteuert 19%)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: false })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 19, ustBetragCent: 1900, bruttoCent: 11900 } })
  })

  it('recompute default (Kleinunternehmer §19 -> 0%)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: true })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 0, ustBetragCent: 0, bruttoCent: 10000 } })
  })

  it('blockt wenn USt-Status unbekannt und kein ust_satz-Override', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: null })
    expect(r.ok).toBe(false)
  })

  it('Override netto -> USt neu abgeleitet', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: false, override: { nettoCent: 20000 } })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 20000, ustSatz: 19, ustBetragCent: 3800, bruttoCent: 23800 } })
  })

  it('Override ust_satz gewinnt (auch wenn Status unbekannt)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: null, override: { ustSatz: 7 } })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 7, ustBetragCent: 700, bruttoCent: 10700 } })
  })

  it('Rundung: netto 33,33 * 19% = 6,33', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 33.33, istKleinunternehmer: false })
    expect(r.ok && r.betraege).toEqual({ nettoCent: 3333, ustSatz: 19, ustBetragCent: 633, bruttoCent: 3966 })
  })

  it('negativer netto-Override wird abgelehnt', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: false, override: { nettoCent: -1 } })
    expect(r.ok).toBe(false)
  })
})

// Minimaler chainbarer fakeDb fuer die DIREKTEN db-Calls in korrigierePartnerGutschrift
// (find-active, Steuerdaten-Read, Kompensation delete/update, PDF-Row-Select). Storno/Reissue/PDF
// sind gemockt (s.o.) -> hier wird nur die Orchestrierung getestet.
function makeDb(cfg: { activeOriginal: Record<string, any> | null; partner?: Record<string, any> | null }) {
  const calls = { deletes: [] as any[], updates: [] as Array<{ id: any; patch: any }> }
  function builder(table: string) {
    const state: { op: string; filters: Record<string, any>; neqStorniert: boolean; patch?: any } = {
      op: 'select',
      filters: {},
      neqStorniert: false,
    }
    function terminal() {
      if (state.op === 'delete') {
        calls.deletes.push(state.filters.id)
        return { data: null, error: null }
      }
      if (state.op === 'update') {
        calls.updates.push({ id: state.filters.id, patch: state.patch })
        return { data: null, error: null }
      }
      if (table === 'partner_gutschriften') {
        return { data: state.neqStorniert ? cfg.activeOriginal : null, error: null }
      }
      return cfg.partner ? { data: cfg.partner, error: null } : { data: null, error: { message: 'not found' } }
    }
    const b: any = {
      select() { return b },
      update(patch: any) { state.op = 'update'; state.patch = patch; return b },
      delete() { state.op = 'delete'; return b },
      eq(col: string, val: any) { state.filters[col] = val; return b },
      neq(col: string, val: any) { if (col === 'status' && val === 'storniert') state.neqStorniert = true; return b },
      maybeSingle() { return Promise.resolve(terminal()) },
      single() { return Promise.resolve(terminal()) },
      then(resolve: (v: unknown) => unknown) { return resolve(terminal()) },
    }
    return b
  }
  return { db: { from: (t: string) => builder(t) } as any, calls }
}

const goodPartner = {
  adresse_strasse: 'Teststr. 1',
  adresse_plz: '10115',
  adresse_ort: 'Berlin',
  ust_id: 'DE1',
  ist_kleinunternehmer: false,
}
const activeOriginal = {
  id: 'g1',
  status: 'versendet',
  gutschrift_nr: 'CMNDO-GS-2026-00001',
  erstellt_am: '2026-07-01T10:00:00Z',
}

describe('korrigierePartnerGutschrift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveLedgerKontext).mockResolvedValue({
      ok: true,
      ctx: {
        nettoEur: 100,
        partnerId: 'p1',
        partnerTyp: 'makler',
        istKleinunternehmer: false,
        leistungsDatum: null,
        leistungText: 'Vermittlungsprovision',
      },
    })
    vi.mocked(erstelleStornoGutschrift).mockResolvedValue({ ok: true, stornoId: 's1', nummer: 'CMNDO-GS-2026-00002' })
    vi.mocked(erstellePartnerGutschrift).mockResolvedValue({ ok: true, gutschriftId: 'k1', nummer: 'CMNDO-GS-2026-00003' })
  })

  it('Happy: Storno + korrigierte Neuausstellung', async () => {
    const { db } = makeDb({ activeOriginal, partner: goodPartner })
    const r = await korrigierePartnerGutschrift(db, 'partner_provisionen', 'led1', 'USt-Korrektur')
    expect(r).toEqual({ ok: true, stornoNummer: 'CMNDO-GS-2026-00002', korrekturNummer: 'CMNDO-GS-2026-00003' })
    expect(erstelleStornoGutschrift).toHaveBeenCalledWith(db, 'g1', 'USt-Korrektur')
  })

  it('Keine aktive Gutschrift -> {ok:false}, kein Storno', async () => {
    const { db } = makeDb({ activeOriginal: null, partner: goodPartner })
    const r = await korrigierePartnerGutschrift(db, 'partner_provisionen', 'led1', 'x')
    expect(r.ok).toBe(false)
    expect(erstelleStornoGutschrift).not.toHaveBeenCalled()
  })

  it('Unvollstaendige Steuerdaten -> {ok:false}, kein Storno (pre-validate)', async () => {
    const { db } = makeDb({ activeOriginal, partner: { ...goodPartner, adresse_strasse: null } })
    const r = await korrigierePartnerGutschrift(db, 'partner_provisionen', 'led1', 'x')
    expect(r.ok).toBe(false)
    expect(erstelleStornoGutschrift).not.toHaveBeenCalled()
  })

  it('Reissue-Fehler -> Kompensation (Storno-Zeile geloescht + Original-Status restauriert)', async () => {
    vi.mocked(erstellePartnerGutschrift).mockResolvedValueOnce({ ok: false, error: 'Steuerdaten unvollständig' })
    const { db, calls } = makeDb({ activeOriginal, partner: goodPartner })
    const r = await korrigierePartnerGutschrift(db, 'partner_provisionen', 'led1', 'x')
    expect(r.ok).toBe(false)
    expect(calls.deletes).toContain('s1')
    expect(calls.updates).toContainEqual({ id: 'g1', patch: { status: 'versendet' } })
  })

  it('Override netto landet in erstellePartnerGutschrift', async () => {
    const { db } = makeDb({ activeOriginal, partner: goodPartner })
    await korrigierePartnerGutschrift(db, 'partner_provisionen', 'led1', 'x', { nettoCent: 20000 })
    expect(erstellePartnerGutschrift).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        betraege: { nettoCent: 20000, ustSatz: 19, ustBetrag: 3800, bruttoCent: 23800 },
      }),
    )
  })
})
