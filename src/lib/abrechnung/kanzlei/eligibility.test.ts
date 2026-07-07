import { describe, it, expect } from 'vitest'
import {
  istAbrechenbarerKanzleiClaim,
  hatZahlungseingang,
  kanzleiFallVon,
  type AbrechnungsClaim,
} from './eligibility'

const KANZLEI = 'kanzlei-A'

function claim(overrides: Partial<AbrechnungsClaim> = {}): AbrechnungsClaim {
  return {
    id: 'c1',
    claim_nummer: 'CLM-1',
    vollmacht_signiert_am: '2026-04-01T00:00:00Z',
    kanzlei_abrechnung_id: null,
    kanzlei_honorar: 150,
    kanzlei_faelle: { fall_id: 'f1', kanzlei_id: KANZLEI, mandatsnummer: 'M-123' },
    claim_payments: [{ zahlungseingang_am: '2026-06-15T00:00:00Z', status: 'erhalten' }],
    ...overrides,
  }
}

describe('istAbrechenbarerKanzleiClaim', () => {
  it('ist abrechenbar: Mandat erteilt + Zahlung eingegangen + nicht abgerechnet + Kanzlei passt', () => {
    expect(istAbrechenbarerKanzleiClaim(claim(), KANZLEI)).toBe(true)
  })

  it('false bei falscher Kanzlei', () => {
    expect(istAbrechenbarerKanzleiClaim(claim(), 'kanzlei-B')).toBe(false)
  })

  it('false ohne Mandatsnummer (kein echtes Mandat)', () => {
    expect(
      istAbrechenbarerKanzleiClaim(
        claim({ kanzlei_faelle: { fall_id: 'f1', kanzlei_id: KANZLEI, mandatsnummer: null } }),
        KANZLEI,
      ),
    ).toBe(false)
  })

  it('false wenn bereits abgerechnet (kanzlei_abrechnung_id gesetzt)', () => {
    expect(istAbrechenbarerKanzleiClaim(claim({ kanzlei_abrechnung_id: 'abr-1' }), KANZLEI)).toBe(false)
  })

  it('false ohne Zahlungseingang', () => {
    expect(
      istAbrechenbarerKanzleiClaim(claim({ claim_payments: [{ zahlungseingang_am: null, status: 'offen' }] }), KANZLEI),
    ).toBe(false)
  })

  it('false wenn claim_payments leer/null', () => {
    expect(istAbrechenbarerKanzleiClaim(claim({ claim_payments: null }), KANZLEI)).toBe(false)
    expect(istAbrechenbarerKanzleiClaim(claim({ claim_payments: [] }), KANZLEI)).toBe(false)
  })

  it('false wenn kanzlei_faelle null (kein Mandat-Embed)', () => {
    expect(istAbrechenbarerKanzleiClaim(claim({ kanzlei_faelle: null }), KANZLEI)).toBe(false)
  })

  it('normalisiert kanzlei_faelle als Array (Nested-FK)', () => {
    expect(
      istAbrechenbarerKanzleiClaim(
        claim({ kanzlei_faelle: [{ fall_id: 'f1', kanzlei_id: KANZLEI, mandatsnummer: 'M-1' }] }),
        KANZLEI,
      ),
    ).toBe(true)
  })

  it('normalisiert claim_payments als Einzel-Objekt', () => {
    expect(
      istAbrechenbarerKanzleiClaim(
        claim({ claim_payments: { zahlungseingang_am: '2026-06-15T00:00:00Z', status: 'erhalten' } }),
        KANZLEI,
      ),
    ).toBe(true)
  })
})

describe('hatZahlungseingang', () => {
  it('true wenn mind. eine Zahlung zahlungseingang_am hat', () => {
    expect(hatZahlungseingang(claim())).toBe(true)
  })
  it('false bei null/leer/nur-offen', () => {
    expect(hatZahlungseingang(claim({ claim_payments: null }))).toBe(false)
    expect(hatZahlungseingang(claim({ claim_payments: [] }))).toBe(false)
    expect(hatZahlungseingang(claim({ claim_payments: [{ zahlungseingang_am: null }] }))).toBe(false)
  })
  it('false wenn nur eine KUNDE-/SV-Auszahlung eingegangen ist (kein VS-Zahlungseingang)', () => {
    // Payment-Ledger: partei=kunde/sv sind AUSzahlungen, keine VS-Regulierung -> nicht abrechenbar.
    expect(
      hatZahlungseingang(claim({ claim_payments: [{ partei: 'kunde', zahlungseingang_am: '2026-06-15T00:00:00Z' }] })),
    ).toBe(false)
    expect(
      hatZahlungseingang(claim({ claim_payments: [{ partei: 'sv', zahlungseingang_am: '2026-06-15T00:00:00Z' }] })),
    ).toBe(false)
  })
  it('true bei VS-Zahlungseingang neben einer Kunde-Auszahlung', () => {
    expect(
      hatZahlungseingang(
        claim({
          claim_payments: [
            { partei: 'kunde', zahlungseingang_am: '2026-06-20T00:00:00Z' },
            { partei: 'vs', zahlungseingang_am: '2026-06-15T00:00:00Z' },
          ],
        }),
      ),
    ).toBe(true)
  })
})

describe('kanzleiFallVon', () => {
  it('normalisiert Objekt und Array gleich', () => {
    const kf = { fall_id: 'f1', kanzlei_id: KANZLEI, mandatsnummer: 'M-1' }
    expect(kanzleiFallVon(claim({ kanzlei_faelle: kf }))).toEqual(kf)
    expect(kanzleiFallVon(claim({ kanzlei_faelle: [kf] }))).toEqual(kf)
    expect(kanzleiFallVon(claim({ kanzlei_faelle: null }))).toBeNull()
  })
})
