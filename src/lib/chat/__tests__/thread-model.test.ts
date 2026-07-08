import { describe, it, expect } from 'vitest'
import { sortiereDirektPaar, leiteGruppenTeilnehmer, threadLabel, leiteDmKandidaten, type ClaimZuweisung } from '../thread-model'

describe('leiteDmKandidaten', () => {
  it('gibt alle Beteiligten ausser mir zurueck (non-null)', () => {
    const r = leiteDmKandidaten({ geschaedigter_user_id: 'kunde', kundenbetreuer_id: 'me', sv_id: 'sv', makler_id: null }, 'me')
    expect(r).toEqual([
      { userId: 'kunde', rolle: 'kunde' },
      { userId: 'sv', rolle: 'sachverstaendiger' },
    ])
  })
  it('dedupliziert doppelte user-ids', () => {
    const r = leiteDmKandidaten({ geschaedigter_user_id: 'x', kundenbetreuer_id: 'x', sv_id: 'y', makler_id: 'y' }, 'me')
    expect(r.map((k) => k.userId)).toEqual(['x', 'y'])
  })
})

describe('threadLabel', () => {
  it('labelt Gruppe/Team-intern fix', () => {
    expect(threadLabel('kunde_gruppe')).toBe('Gruppe')
    expect(threadLabel('team_intern')).toBe('Team-intern')
  })
  it('labelt direkt aus den Teilnehmer-Rollen', () => {
    expect(threadLabel('direkt', ['kunde', 'werkstatt'])).toBe('Privat: Kunde · Werkstatt')
    expect(threadLabel('direkt', [])).toBe('Privater Chat')
  })
})

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
