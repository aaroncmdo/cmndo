import { describe, it, expect } from 'vitest'
import { rolleForSla, aggregiereSlaLage, summarizeSlaRollenLage } from './sla-rollen'

const NOW = new Date('2026-07-08T12:00:00Z')

describe('rolleForSla', () => {
  it('mappt SV-Typen', () => {
    expect(rolleForSla({ sla_typ: 'gutachten_upload', target_rolle: null })).toBe(
      'sachverstaendiger'
    )
  })
  it('mappt gutachter_zuweisung -> dispatch', () => {
    expect(rolleForSla({ sla_typ: 'gutachter_zuweisung', target_rolle: null })).toBe('dispatch')
  })
  it('nutzt target_rolle bei kanzlei', () => {
    expect(rolleForSla({ sla_typ: 'kanzlei_as_versand', target_rolle: 'kanzlei' })).toBe('kanzlei')
  })
  it('bekannter Typ gewinnt ueber generisches target_rolle=sv (Prod-Daten)', () => {
    // Prod setzt target_rolle='sv' auf allen aktiven Zeilen — gutachter_zuweisung
    // gehoert trotzdem zu Dispatch, termin_bestaetigung zu SV.
    expect(rolleForSla({ sla_typ: 'gutachter_zuweisung', target_rolle: 'sv' })).toBe('dispatch')
    expect(rolleForSla({ sla_typ: 'termin_bestaetigung', target_rolle: 'sv' })).toBe(
      'sachverstaendiger'
    )
  })
  it('kanonisiert target_rolle-Kurzform sv -> sachverstaendiger bei unbekanntem Typ', () => {
    expect(rolleForSla({ sla_typ: 'kanzlei_kuerzung_antwort', target_rolle: 'sv' })).toBe(
      'sachverstaendiger'
    )
  })
  it('unbekannte target_rolle bei unbekanntem Typ -> unbekannt', () => {
    expect(rolleForSla({ sla_typ: 'irgendwas', target_rolle: 'xyz' })).toBe('unbekannt')
  })
})

describe('aggregiereSlaLage', () => {
  const rows = [
    {
      id: '1',
      claim_id: 'c1',
      claim_nummer: 'CLM-1',
      sla_typ: 'gutachten_upload',
      status: 'breached',
      breach_at: '2026-07-06T12:00:00Z',
      target_rolle: null,
    },
    {
      id: '2',
      claim_id: 'c2',
      claim_nummer: 'CLM-2',
      sla_typ: 'gutachten_upload',
      status: 'pending',
      breach_at: '2026-07-08T15:00:00Z',
      target_rolle: null,
    }, // impending (<6h)
    {
      id: '3',
      claim_id: 'c3',
      claim_nummer: 'CLM-3',
      sla_typ: 'gutachten_upload',
      status: 'pending',
      breach_at: '2026-07-10T12:00:00Z',
      target_rolle: null,
    }, // pending
    {
      id: '4',
      claim_id: 'c4',
      claim_nummer: 'CLM-4',
      sla_typ: 'kanzlei_as_versand',
      status: 'breached',
      breach_at: '2026-07-05T12:00:00Z',
      target_rolle: 'kanzlei',
    },
  ]

  it('zaehlt pro Rolle breached/impending/pending', () => {
    const lage = aggregiereSlaLage(rows as never, NOW)
    const sv = lage.proRolle.find((r) => r.rolle === 'sachverstaendiger')!
    expect(sv.breached).toBe(1)
    expect(sv.impending).toBe(1)
    expect(sv.pending).toBe(1)
    const kanzlei = lage.proRolle.find((r) => r.rolle === 'kanzlei')!
    expect(kanzlei.breached).toBe(1)
    expect(lage.gesamt.breached).toBe(2)
  })

  it('kritischste enthaelt ueberfaellig_std absteigend', () => {
    const lage = aggregiereSlaLage(rows as never, NOW)
    const sv = lage.proRolle.find((r) => r.rolle === 'sachverstaendiger')!
    expect(sv.kritischste[0].claim_nummer).toBe('CLM-1')
    expect(sv.kritischste[0].ueberfaellig_std).toBeGreaterThan(40)
  })
})

it('summarize enthaelt Rollen + Zahlen', () => {
  const lage = aggregiereSlaLage(
    [
      {
        id: '1',
        claim_id: 'c1',
        claim_nummer: 'CLM-1',
        sla_typ: 'gutachten_upload',
        status: 'breached',
        breach_at: '2026-07-06T12:00:00Z',
        target_rolle: null,
      },
    ] as never,
    NOW
  )
  const s = summarizeSlaRollenLage(lage)
  expect(s).toContain('sachverstaendiger')
  expect(s).toContain('CLM-1')
})
