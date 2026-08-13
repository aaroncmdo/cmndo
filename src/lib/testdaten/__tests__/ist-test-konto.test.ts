import { describe, it, expect } from 'vitest'
import { istTestKonto } from '../ist-test-konto'

describe('istTestKonto', () => {
  // Genau die Konten, die auf prod das Dispatch-Round-Robin verwaessert haben.
  it.each([
    'test-dispatch@claimondo.de',
    'smoke-enroll@claimondo.de',
    'bkat-smoke-dispatch-1784066233652@claimondo.de',
    'bkat-smoke-dispatch-1784066504164@claimondo.de',
    'smoke-kunde@claimondo.de',
  ])('erkennt %s als Test-Konto', (email) => {
    expect(istTestKonto(null, email)).toBe(true)
  })

  it('erkennt das echte Dispatch-Konto NICHT als Test', () => {
    expect(istTestKonto('Dispatch Team', 'dispatch@claimondo.de')).toBe(false)
  })

  it.each([
    ['Contest Sieger', 'contest@web.de'],
    ['Demonstrator GmbH', 'info@demonstration.de'],
    ['Anna Testorf', 'a.testorf@example.de'],
  ])('kein Fehltreffer bei %s', (name, email) => {
    expect(istTestKonto(name, email)).toBe(false)
  })

  it('greift auch ueber den Namen', () => {
    expect(istTestKonto('Smoke Runner', 'irgendwer@claimondo.de')).toBe(true)
  })

  it('leere Eingaben sind kein Test-Konto', () => {
    expect(istTestKonto(null, null)).toBe(false)
    expect(istTestKonto('', '')).toBe(false)
  })
})
