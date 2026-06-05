import { describe, it, expect } from 'vitest'
import { normalizeName } from '@/lib/entities/normalize'

describe('normalizeName', () => {
  it('lowercased + trimmed + Whitespace kollabiert', () => {
    expect(normalizeName('  HUK   Coburg ')).toBe('huk coburg')
  })
  it('Separatoren (-_/.,) werden zu Space normalisiert', () => {
    expect(normalizeName('HUK-Coburg')).toBe('huk coburg')
    expect(normalizeName('Müller, K.G.')).toBe('müller k g')
  })
  it('verschiedene Firmen bleiben verschieden (kein Suffix-Stripping)', () => {
    expect(normalizeName('HUK')).not.toBe(normalizeName('HUK Coburg'))
    expect(normalizeName('Meier GmbH')).not.toBe(normalizeName('Meier AG'))
  })
  it('leer/nullish -> null', () => {
    expect(normalizeName('   ')).toBeNull()
    expect(normalizeName(null)).toBeNull()
    expect(normalizeName(undefined)).toBeNull()
  })
})
