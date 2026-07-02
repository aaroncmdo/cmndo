import { describe, it, expect, beforeEach } from 'vitest'
import { istGueltigerGutschein } from '../gutschein'

describe('istGueltigerGutschein', () => {
  beforeEach(() => {
    // Deterministisch gegen den Default-Code testen.
    delete process.env.SV_ONBOARDING_GUTSCHEIN_CODES
  })

  it('akzeptiert den Default-Code', () => {
    expect(istGueltigerGutschein('neuerclaimondogutachter2026!')).toBe(true)
  })

  it('trimmt fuehrenden/abschliessenden Whitespace', () => {
    expect(istGueltigerGutschein('  neuerclaimondogutachter2026!  ')).toBe(true)
  })

  it('lehnt einen falschen Code ab', () => {
    expect(istGueltigerGutschein('falscher-code')).toBe(false)
  })

  it('lehnt leere / nullish Eingaben ab', () => {
    expect(istGueltigerGutschein('')).toBe(false)
    expect(istGueltigerGutschein('   ')).toBe(false)
    expect(istGueltigerGutschein(null)).toBe(false)
    expect(istGueltigerGutschein(undefined)).toBe(false)
  })

  it('ist case-sensitive (Codes sind Geheimnisse)', () => {
    expect(istGueltigerGutschein('NEUERCLAIMONDOGUTACHTER2026!')).toBe(false)
  })

  it('respektiert die ENV-Override-Liste (komma-separiert, getrimmt)', () => {
    process.env.SV_ONBOARDING_GUTSCHEIN_CODES = 'alpha, beta '
    expect(istGueltigerGutschein('alpha')).toBe(true)
    expect(istGueltigerGutschein('beta')).toBe(true)
    // Default gilt dann NICHT mehr:
    expect(istGueltigerGutschein('neuerclaimondogutachter2026!')).toBe(false)
  })
})
