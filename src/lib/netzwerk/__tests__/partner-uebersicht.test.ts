import { describe, expect, test } from 'vitest'
import { deriveNetzwerkPartnerStatus, type AboRow } from '../partner-uebersicht'

const NOW = new Date('2026-08-09T00:00:00Z')
const row = (status: string, gueltig_bis: string | null = null, stripe: string | null = null): AboRow => ({
  status,
  gueltig_bis,
  stripe_subscription_id: stripe,
})

describe('deriveNetzwerkPartnerStatus', () => {
  test('keine Abo-Row -> kein_abo, inaktiv', () => {
    expect(deriveNetzwerkPartnerStatus([], NOW)).toEqual({
      kind: 'kein_abo',
      istAktiv: false,
      gueltigBis: null,
      stripeSubscriptionId: null,
    })
  })

  test('comped (unbefristet, Bestand) -> comped, aktiv', () => {
    expect(deriveNetzwerkPartnerStatus([row('comped')], NOW)).toMatchObject({
      kind: 'comped',
      istAktiv: true,
    })
  })

  test('aktiv mit gueltig_bis in Zukunft -> aktiv, aktiv', () => {
    const r = deriveNetzwerkPartnerStatus([row('aktiv', '2027-01-01T00:00:00Z', 'sub_123')], NOW)
    expect(r).toMatchObject({ kind: 'aktiv', istAktiv: true, gueltigBis: '2027-01-01T00:00:00Z', stripeSubscriptionId: 'sub_123' })
  })

  test('aktiv aber abgelaufen -> kind aktiv, aber istAktiv false', () => {
    expect(deriveNetzwerkPartnerStatus([row('aktiv', '2020-01-01T00:00:00Z')], NOW))
      .toMatchObject({ kind: 'aktiv', istAktiv: false })
  })

  test('ueberfaellig -> istAktiv false', () => {
    expect(deriveNetzwerkPartnerStatus([row('ueberfaellig', '2027-01-01T00:00:00Z')], NOW).istAktiv).toBe(false)
  })

  test('comped + aktiv gemischt -> comped gewinnt (Anzeige-Prioritaet), aktiv', () => {
    const r = deriveNetzwerkPartnerStatus([row('aktiv', '2027-01-01T00:00:00Z'), row('comped')], NOW)
    expect(r).toMatchObject({ kind: 'comped', istAktiv: true })
  })

  test('nur inaktive Rows -> repraesentative (erste) Row, istAktiv false', () => {
    const r = deriveNetzwerkPartnerStatus([row('gekuendigt'), row('inaktiv')], NOW)
    expect(r.istAktiv).toBe(false)
    expect(r.kind).toBe('gekuendigt')
  })
})
