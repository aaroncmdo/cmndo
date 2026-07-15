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
  it('storniert = true', () => {
    expect(istClaimStorniert('storniert')).toBe(true)
  })

  // B4-slice-1b: frueher hielt dieser Test `istClaimStorniert('abgelehnt') === true` fest
  // ("storniert + abgelehnt = einheitlich"). Der Zweig war jedoch TOT — 'abgelehnt' ist ein
  // claims.status-Wert und stand nie in operative_status, das diese Funktion liest. Mit dem
  // endzustand-Write-Flip wuerde er LIVE und waere dann falsch: eine EINFACHE Ablehnung ist
  // nicht terminal (nachforderbar/eskalierbar, der Fall laeuft weiter). Der Release-Runner haette
  // die Partner-Provision auf 'storniert' gesetzt und dem Partner "Der vermittelte Fall wurde
  // storniert" gemailt — fuer einen laufenden Fall. Die FINALE Ablehnung heisst 'abgelehnt_final'.
  it('abgelehnt (einfach, nicht-terminal) = false — Provision NICHT stornieren', () => {
    expect(istClaimStorniert('abgelehnt')).toBe(false)
  })

  it('aktive/null = false', () => {
    expect(istClaimStorniert('sv-termin')).toBe(false)
    expect(istClaimStorniert('abgeschlossen')).toBe(false)
    expect(istClaimStorniert('in_kommunikation_vs')).toBe(false)
    expect(istClaimStorniert(null)).toBe(false)
  })
})

describe('deriveCompletionTs', () => {
  it('nur_gutachter: termin durchgefuehrt = completion', () => {
    expect(deriveCompletionTs({ serviceTyp: 'nur_gutachter', operativeStatus: 'sv-termin', abgeschlossenAm: null, terminDurchgefuehrtAm: vorTagen(3) })).toBe(vorTagen(3))
  })
  it('nur_gutachter ohne durchgefuehrten Termin = null (HOLD)', () => {
    expect(deriveCompletionTs({ serviceTyp: 'nur_gutachter', operativeStatus: 'sv-termin', abgeschlossenAm: null, terminDurchgefuehrtAm: null })).toBeNull()
  })
  it('Voll-Claim abgeschlossen = abgeschlossen_am', () => {
    expect(deriveCompletionTs({ serviceTyp: 'komplett', operativeStatus: 'abgeschlossen', abgeschlossenAm: vorTagen(10), terminDurchgefuehrtAm: null })).toBe(vorTagen(10))
  })
  it('Voll-Claim reguliert_vollstaendig = abgeschlossen_am', () => {
    expect(deriveCompletionTs({ serviceTyp: 'komplett', operativeStatus: 'reguliert_vollstaendig', abgeschlossenAm: vorTagen(10), terminDurchgefuehrtAm: null })).toBe(vorTagen(10))
  })
  it('Voll-Claim NICHT abgeschlossen (sv-termin) = null (HOLD — der Prod-Bug)', () => {
    expect(deriveCompletionTs({ serviceTyp: 'komplett', operativeStatus: 'sv-termin', abgeschlossenAm: null, terminDurchgefuehrtAm: null })).toBeNull()
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
