import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { buildHashedUserData } from './user-data-mp'

const h = (v: string) => createHash('sha256').update(v).digest('hex')

describe('buildHashedUserData', () => {
  it('hasht normalisierte Werte (SHA-256 hex)', () => {
    const ud = buildHashedUserData({
      email: 'Max@Example.DE ',
      phone: '0151 1234567',
      firstName: 'Max',
      lastName: 'Mustermann',
    })
    expect(ud).toEqual({
      sha256_email_address: h('max@example.de'),
      sha256_phone_number: h('+491511234567'),
      address: { sha256_first_name: h('max'), sha256_last_name: h('mustermann') },
    })
  })
  it('lässt leere/ungültige Felder weg', () => {
    expect(buildHashedUserData({ email: 'keine-mail', phone: '', firstName: 'Max' })).toEqual({
      address: { sha256_first_name: h('max') },
    })
  })
  it('komplett leer → null', () => {
    expect(buildHashedUserData({})).toBeNull()
  })
})
