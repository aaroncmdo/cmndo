import { describe, it, expect } from 'vitest'
import { sortiereDirektPaar, leiteGruppenTeilnehmer, type ClaimZuweisung } from '../thread-model'

describe('sortiereDirektPaar', () => {
  it('sortiert deterministisch (kleinere id zuerst), egal welche Reihenfolge rein', () => {
    expect(sortiereDirektPaar('bbb', 'aaa')).toEqual(['aaa', 'bbb'])
    expect(sortiereDirektPaar('aaa', 'bbb')).toEqual(['aaa', 'bbb'])
  })
})

describe('leiteGruppenTeilnehmer', () => {
  const voll: ClaimZuweisung = {
    geschaedigter_user_id: 'kunde-1',
    kundenbetreuer_id: 'kb-1',
    sv_id: 'sv-1',
  }

  it('kunde_gruppe = Kunde + KB + SV (non-null)', () => {
    const t = leiteGruppenTeilnehmer(voll, 'kunde_gruppe')
    expect(t).toEqual([
      { userId: 'kunde-1', rolle: 'kunde' },
      { userId: 'kb-1', rolle: 'kundenbetreuer' },
      { userId: 'sv-1', rolle: 'sachverstaendiger' },
    ])
  })

  it('team_intern = nur KB + SV (KEIN Kunde)', () => {
    const t = leiteGruppenTeilnehmer(voll, 'team_intern')
    expect(t).toEqual([
      { userId: 'kb-1', rolle: 'kundenbetreuer' },
      { userId: 'sv-1', rolle: 'sachverstaendiger' },
    ])
  })

  it('ueberspringt null-Zuweisungen (z.B. Kunde ohne User, kein SV)', () => {
    const teil: ClaimZuweisung = { geschaedigter_user_id: null, kundenbetreuer_id: 'kb-1', sv_id: null }
    expect(leiteGruppenTeilnehmer(teil, 'kunde_gruppe')).toEqual([{ userId: 'kb-1', rolle: 'kundenbetreuer' }])
    expect(leiteGruppenTeilnehmer(teil, 'team_intern')).toEqual([{ userId: 'kb-1', rolle: 'kundenbetreuer' }])
  })

  it('dedupliziert, falls dieselbe Person zwei Rollen hat (KB == SV)', () => {
    const doppelt: ClaimZuweisung = { geschaedigter_user_id: 'kunde-1', kundenbetreuer_id: 'x', sv_id: 'x' }
    const t = leiteGruppenTeilnehmer(doppelt, 'kunde_gruppe')
    // 'x' nur einmal (erste Rolle gewinnt)
    expect(t.filter((p) => p.userId === 'x')).toHaveLength(1)
  })
})
