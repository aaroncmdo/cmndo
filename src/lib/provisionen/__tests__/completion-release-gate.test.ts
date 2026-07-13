import { describe, it, expect } from 'vitest'
import {
  istClaimStorniert,
  deriveCompletionTs,
  istReleaseBerechtigt,
  RELEASE_HOLD_MS,
} from '../completion-release-gate'

const NOW = '2026-07-13T12:00:00.000Z'
const vorTagen = (n: number) => new Date(new Date(NOW).getTime() - n * 24 * 60 * 60 * 1000).toISOString()

describe('istClaimStorniert', () => {
  it('storniert + abgelehnt = true (einheitlich)', () => {
    expect(istClaimStorniert('storniert')).toBe(true)
    expect(istClaimStorniert('abgelehnt')).toBe(true)
  })
  it('aktive/null = false', () => {
    expect(istClaimStorniert('sv-termin')).toBe(false)
    expect(istClaimStorniert('abgeschlossen')).toBe(false)
    expect(istClaimStorniert(null)).toBe(false)
  })
})

describe('deriveCompletionTs', () => {
  it('nur_gutachter: termin durchgefuehrt = completion', () => {
    expect(deriveCompletionTs({ serviceTyp: 'nur_gutachter', operativeStatus: 'sv-termin', claimStatus: null, abgeschlossenAm: null, terminDurchgefuehrtAm: vorTagen(3) })).toBe(vorTagen(3))
  })
  it('nur_gutachter ohne durchgefuehrten Termin = null (HOLD)', () => {
    expect(deriveCompletionTs({ serviceTyp: 'nur_gutachter', operativeStatus: 'sv-termin', claimStatus: null, abgeschlossenAm: null, terminDurchgefuehrtAm: null })).toBeNull()
  })
  it('Voll-Claim abgeschlossen = abgeschlossen_am', () => {
    expect(deriveCompletionTs({ serviceTyp: 'komplett', operativeStatus: 'abgeschlossen', claimStatus: null, abgeschlossenAm: vorTagen(10), terminDurchgefuehrtAm: null })).toBe(vorTagen(10))
  })
  it('Voll-Claim reguliert_vollstaendig = abgeschlossen_am', () => {
    expect(deriveCompletionTs({ serviceTyp: 'komplett', operativeStatus: null, claimStatus: 'reguliert_vollstaendig', abgeschlossenAm: vorTagen(10), terminDurchgefuehrtAm: null })).toBe(vorTagen(10))
  })
  it('Voll-Claim NICHT abgeschlossen (sv-termin) = null (HOLD — der Prod-Bug)', () => {
    expect(deriveCompletionTs({ serviceTyp: 'komplett', operativeStatus: 'sv-termin', claimStatus: null, abgeschlossenAm: null, terminDurchgefuehrtAm: null })).toBeNull()
  })
})

describe('istReleaseBerechtigt', () => {
  it('completion vor >7 Tagen = frei', () => {
    expect(istReleaseBerechtigt(vorTagen(8), NOW)).toBe(true)
  })
  it('completion vor <7 Tagen = HOLD', () => {
    expect(istReleaseBerechtigt(vorTagen(3), NOW)).toBe(false)
  })
  it('exakt 7 Tage = frei (>=)', () => {
    expect(istReleaseBerechtigt(new Date(new Date(NOW).getTime() - RELEASE_HOLD_MS).toISOString(), NOW)).toBe(true)
  })
  it('keine completion (null) = HOLD', () => {
    expect(istReleaseBerechtigt(null, NOW)).toBe(false)
  })
})
