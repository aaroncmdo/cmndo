import { describe, it, expect } from 'vitest'
import { computePartnerStrength, deriveTier, tierOrdinal } from '../compute'
import { DEFAULT_RANG_CONFIG } from '../config'
import type { PartnerSignals } from '../types'

const base: PartnerSignals = {
  typ: 'sachverstaendiger',
  volumen: 0, oeffentlichBestellt: false, zertifikate: 0, partnerSeitJahre: 0,
  ratingDurchschnitt: null, ratingAnzahl: 0,
  aktiv: true, offeneReklamationen: 0, noShowQuote: 0, ablehnungen30d: 0,
}

describe('deriveTier', () => {
  it('schwellen', () => {
    expect(deriveTier(0)).toBe('bronze')
    expect(deriveTier(34)).toBe('bronze')
    expect(deriveTier(35)).toBe('silber')
    expect(deriveTier(60)).toBe('gold')
  })
})

describe('computePartnerStrength', () => {
  it('neuer verifizierter SV ohne alles -> bronze', () => {
    expect(computePartnerStrength(base).tier).toBe('bronze')
  })

  it('nicht aktiv -> kein Rang (tier null, gateOk false)', () => {
    const r = computePartnerStrength({ ...base, aktiv: false })
    expect(r.tier).toBeNull()
    expect(r.gateOk).toBe(false)
  })

  it('COLD-START: etabliert + top-bewertet -> gold OHNE Volumen', () => {
    const r = computePartnerStrength({
      ...base, oeffentlichBestellt: true, zertifikate: 2, partnerSeitJahre: 3,
      ratingDurchschnitt: 4.9, ratingAnzahl: 40,
    })
    // 20 + min(12,12) + min(9,8)=8  = 40 credentials; rating (4.9-3)/2=0.95*30=28.5 -> ~68.5
    expect(r.tier).toBe('gold')
  })

  it('reines Volumen treibt hoch (100 Faelle -> gold)', () => {
    expect(computePartnerStrength({ ...base, volumen: 100 }).tier).toBe('gold')
  })

  it('offene Reklamation deckelt auf bronze trotz hohem Score', () => {
    const r = computePartnerStrength({ ...base, volumen: 100, offeneReklamationen: 1 })
    expect(r.tier).toBe('bronze')
    expect(r.gateCap).toBe('bronze')
  })

  it('hohe No-Show-Quote deckelt auf silber', () => {
    const r = computePartnerStrength({ ...base, volumen: 100, noShowQuote: 0.12 })
    expect(r.tier).toBe('silber')
  })

  it('Credentials sind gedeckelt (viele Zertifikate ueberschreiten Cap nicht)', () => {
    const r = computePartnerStrength({ ...base, zertifikate: 9 })
    expect(r.credentialScore).toBe(12) // credZertifikatCap
  })

  it('DAT-Partner: dedizierter credDatPartner-Bonus ON TOP (nicht gedeckelt vom Zertifikat-Cap)', () => {
    const ohne = computePartnerStrength(base)
    const mit = computePartnerStrength({ ...base, hatDat: true })
    expect(mit.credentialScore).toBe(ohne.credentialScore + DEFAULT_RANG_CONFIG.credDatPartner)
    expect(mit.score).toBeGreaterThan(ohne.score)
  })

  it('DAT kippt einen mittelmaessig bewerteten SV von bronze auf silber (DAT bevorzugt)', () => {
    const sig = { ratingDurchschnitt: 4.0, ratingAnzahl: 10 } // rating ~15, < schwelleSilber(35)
    expect(computePartnerStrength({ ...base, ...sig }).tier).toBe('bronze')
    expect(computePartnerStrength({ ...base, ...sig, hatDat: true }).tier).toBe('silber') // +25 → 40 ≥ 35
  })

  it('DAT bleibt gate-limitiert: DAT + offene Reklamation → trotzdem bronze', () => {
    const r = computePartnerStrength({ ...base, hatDat: true, volumen: 100, offeneReklamationen: 1 })
    expect(r.tier).toBe('bronze')
  })

  it('Rating unter Mindest-Bewertungszahl wird ignoriert', () => {
    const r = computePartnerStrength({ ...base, ratingDurchschnitt: 5, ratingAnzahl: 2 })
    expect(r.ratingScore).toBe(0)
  })

  it('Sinnsatz enthaelt NIE eine nackte Zahl', () => {
    const r = computePartnerStrength({ ...base, volumen: 100, oeffentlichBestellt: true, ratingDurchschnitt: 4.7, ratingAnzahl: 30 })
    expect(r.sinnsatz).not.toMatch(/[0-9]/)
    expect(r.sinnsatz.toLowerCase()).toContain('begutachtet')
  })

  it('hohe ablehnungen30d deckelt auf bronze', () => {
    const r = computePartnerStrength({ ...base, volumen: 100, ablehnungen30d: 9 })
    expect(r.tier).toBe('bronze')
    expect(r.gateCap).toBe('bronze')
  })

  it('Config-Injektion: hohes Volumen mit schwelleGold=999 -> NICHT gold', () => {
    const highThresholdConfig = { ...DEFAULT_RANG_CONFIG, schwelleGold: 999 }
    const r = computePartnerStrength({ ...base, volumen: 100 }, highThresholdConfig)
    expect(r.tier).not.toBe('gold')
  })
})

describe('tierOrdinal', () => {
  it('bronze<silber<gold', () => {
    expect(tierOrdinal('bronze')).toBeLessThan(tierOrdinal('silber'))
    expect(tierOrdinal('silber')).toBeLessThan(tierOrdinal('gold'))
  })
})
