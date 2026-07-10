import { describe, it, expect } from 'vitest'
import { toE164, splitName, buildUserData } from './user-data'

describe('toE164', () => {
  it('normalisiert DE-Varianten auf E.164', () => {
    expect(toE164('0151 1234567')).toBe('+491511234567')
    expect(toE164('0049 151 1234567')).toBe('+491511234567')
    expect(toE164('+49 151 1234567')).toBe('+491511234567')
    expect(toE164('151/1234-567')).toBe('+491511234567')
  })
  it('leer/unbrauchbar → ""', () => {
    expect(toE164('')).toBe('')
    expect(toE164(undefined)).toBe('')
    expect(toE164('+')).toBe('')
  })
})

describe('splitName', () => {
  it('splittet Vor-/Nachname', () => {
    expect(splitName('Max Mustermann')).toEqual({ first_name: 'Max', last_name: 'Mustermann' })
    expect(splitName('Max')).toEqual({ first_name: 'Max' })
    expect(splitName('  Anna Lena  Schmidt ')).toEqual({ first_name: 'Anna', last_name: 'Lena Schmidt' })
    expect(splitName('')).toEqual({})
  })
})

describe('buildUserData', () => {
  it('baut user_data mit normalisierten Werten', () => {
    expect(buildUserData({ name: 'Max Mustermann', phone: '0151 1234567', email: 'Max@Example.DE ' })).toEqual({
      phone_number: '+491511234567',
      email: 'max@example.de',
      address: { first_name: 'Max', last_name: 'Mustermann' },
    })
  })
  it('lässt leere/ungültige Felder weg', () => {
    expect(buildUserData({ name: 'Max', phone: '', email: 'keine-mail' })).toEqual({
      address: { first_name: 'Max' },
    })
  })
  it('komplett leer → null', () => {
    expect(buildUserData({})).toBeNull()
  })
})
