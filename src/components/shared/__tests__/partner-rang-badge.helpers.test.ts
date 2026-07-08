import { describe, it, expect } from 'vitest'
import { tierLabel, tierDescriptors } from '../partner-rang-badge.helpers'

describe('tierLabel', () => {
  it('mappt Tier auf deutsches Label', () => {
    expect(tierLabel('gold')).toBe('Gold-Partner')
    expect(tierLabel('silber')).toBe('Silber-Partner')
    expect(tierLabel('bronze')).toBe('Bronze-Partner')
  })
})

describe('tierDescriptors', () => {
  it('strippt das fuehrende Label und joined den Rest', () => {
    expect(tierDescriptors('Gold-Partner · vielfach begutachtet · öffentlich bestellt & vereidigt · verifiziert'))
      .toBe('vielfach begutachtet · öffentlich bestellt & vereidigt · verifiziert')
  })
  it('null / leer -> leerer String', () => {
    expect(tierDescriptors(null)).toBe('')
    expect(tierDescriptors(undefined)).toBe('')
    expect(tierDescriptors('')).toBe('')
  })
  it('nur Label ohne Descriptors -> leer', () => {
    expect(tierDescriptors('Bronze-Partner')).toBe('')
  })
})
