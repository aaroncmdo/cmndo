import { describe, it, expect } from 'vitest'
import { setSearchParam, parseKontaktParam, buildKontaktParam } from './url-drawer'

describe('setSearchParam', () => {
  it('setzt einen Param auf leerem search', () => {
    expect(setSearchParam('', 'aktion', 'qrpool')).toBe('?aktion=qrpool')
  })

  it('ergaenzt einen Param neben bestehenden', () => {
    expect(setSearchParam('?typ=lead', 'aktion', 'qrpool')).toBe('?typ=lead&aktion=qrpool')
  })

  it('ueberschreibt einen bestehenden Wert', () => {
    expect(setSearchParam('?aktion=csv', 'aktion', 'qrpool')).toBe('?aktion=qrpool')
  })

  it('entfernt einen Param (value=null)', () => {
    expect(setSearchParam('?typ=lead&kontakt=sv:1', 'kontakt', null)).toBe('?typ=lead')
  })

  it('liefert leeren String wenn alle Params entfernt', () => {
    expect(setSearchParam('?kontakt=sv:1', 'kontakt', null)).toBe('')
  })

  it('akzeptiert search ohne fuehrendes ?', () => {
    expect(setSearchParam('typ=lead', 'aktion', 'x')).toBe('?typ=lead&aktion=x')
  })

  it('entfernt alsoRemove-Params im selben Schritt (kontakt→aktion-Wechsel)', () => {
    expect(setSearchParam('?kontakt=werkstatt:w1&typ=partner', 'aktion', 'qrpool', ['kontakt'])).toBe(
      '?typ=partner&aktion=qrpool',
    )
  })

  it('alsoRemove ohne value-Set funktioniert (nur Aufraeumen)', () => {
    expect(setSearchParam('?a=1&b=2', 'c', null, ['a', 'b'])).toBe('')
  })

  it('encodiert Sonderzeichen im Wert', () => {
    expect(setSearchParam('', 'lead', 'a b')).toBe('?lead=a+b')
  })

  it('no-op-Entfernen eines fehlenden Params laesst Rest intakt', () => {
    expect(setSearchParam('?a=1', 'x', null)).toBe('?a=1')
  })
})

describe('parseKontaktParam', () => {
  it('parst kind:id', () => {
    expect(parseKontaktParam('sv:0469524f-abc')).toEqual({ kind: 'sv', id: '0469524f-abc' })
  })

  it('splittet nur am ERSTEN Doppelpunkt', () => {
    expect(parseKontaktParam('lead:a:b')).toEqual({ kind: 'lead', id: 'a:b' })
  })

  it('null bei fehlendem Wert', () => {
    expect(parseKontaktParam(null)).toBeNull()
  })

  it('null ohne Doppelpunkt', () => {
    expect(parseKontaktParam('nurkind')).toBeNull()
  })

  it('null bei leerem kind oder leerer id', () => {
    expect(parseKontaktParam(':id')).toBeNull()
    expect(parseKontaktParam('kind:')).toBeNull()
  })
})

describe('buildKontaktParam', () => {
  it('ist Gegenstueck zu parseKontaktParam', () => {
    const v = buildKontaktParam('werkstatt', 'w-123')
    expect(parseKontaktParam(v)).toEqual({ kind: 'werkstatt', id: 'w-123' })
  })
})
