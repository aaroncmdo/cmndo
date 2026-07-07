// src/lib/orchestrator/hygiene.test.ts
import { describe, it, expect } from 'vitest'
import { istSeedFixture, istTestOderSeedFall, hatAktiveOffeneTasks } from './hygiene'

const leer = { testSvIds: new Set<string>(), testUserIds: new Set<string>() }
const echterClaim = {
  id: '091eb2eb-d894-45bd-a555-bb7331973c4b',
  sv_id: null, geschaedigter_user_id: 'u-real', created_by_user_id: 'u-real',
}

describe('istSeedFixture', () => {
  it('erkennt das Seed-Fixture-UUID-Muster', () => {
    expect(istSeedFixture('bbbb4444-0000-4000-8000-000000000042')).toBe(true)
    expect(istSeedFixture('cccc5555-0000-4000-8000-000000000050')).toBe(true)
  })
  it('lässt echte v4-UUIDs durch', () => {
    expect(istSeedFixture('091eb2eb-d894-45bd-a555-bb7331973c4b')).toBe(false)
  })
})

describe('istTestOderSeedFall', () => {
  it('false für echten Fall ohne Test-Signal', () => {
    expect(istTestOderSeedFall(echterClaim, leer)).toBe(false)
  })
  it('true bei Seed-UUID', () => {
    expect(istTestOderSeedFall({ ...echterClaim, id: 'bbbb4444-0000-4000-8000-000000000042' }, leer)).toBe(true)
  })
  it('true bei Test-SV', () => {
    const sets = { testSvIds: new Set(['sv-test']), testUserIds: new Set<string>() }
    expect(istTestOderSeedFall({ ...echterClaim, sv_id: 'sv-test' }, sets)).toBe(true)
  })
  it('true bei Test-Kunde (geschaedigter oder creator)', () => {
    const sets = { testSvIds: new Set<string>(), testUserIds: new Set(['u-test']) }
    expect(istTestOderSeedFall({ ...echterClaim, geschaedigter_user_id: 'u-test' }, sets)).toBe(true)
    expect(istTestOderSeedFall({ ...echterClaim, created_by_user_id: 'u-test' }, sets)).toBe(true)
  })
})

describe('hatAktiveOffeneTasks', () => {
  it('≥1 offener Task → true (überspringen)', () => {
    expect(hatAktiveOffeneTasks(1)).toBe(true)
    expect(hatAktiveOffeneTasks(5)).toBe(true)
  })
  it('0 offene Tasks → false (reviewen)', () => {
    expect(hatAktiveOffeneTasks(0)).toBe(false)
  })
})
