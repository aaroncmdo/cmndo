import { describe, it, expect } from 'vitest'
import {
  classifyLocaleSource,
  extractTokenFromPath,
  normalizeToLocale,
} from '../locale-source'

describe('classifyLocaleSource', () => {
  it('klassifiziert Magic-Link-Routen mit Token-Segment als token', () => {
    expect(classifyLocaleSource('/flow/abc123def456ghi7')).toBe('token')
    expect(classifyLocaleSource('/upload/dokumente/tok')).toBe('token')
    expect(classifyLocaleSource('/upload/zb1/tok')).toBe('token')
    expect(classifyLocaleSource('/ablehnen/tok')).toBe('token')
  })

  it('lässt Token-Routen Vorrang vor /kunde haben', () => {
    expect(classifyLocaleSource('/kunde/re-termin/abc')).toBe('token')
    expect(classifyLocaleSource('/kunde/termin')).toBe('token')
    expect(classifyLocaleSource('/kunde/termin/slot')).toBe('token')
    expect(classifyLocaleSource('/kunde-termin')).toBe('token')
    expect(classifyLocaleSource('/sv')).toBe('token')
  })

  it('klassifiziert das authentifizierte Kunde-Portal als profile', () => {
    expect(classifyLocaleSource('/kunde')).toBe('profile')
    expect(classifyLocaleSource('/kunde/dashboard')).toBe('profile')
    expect(classifyLocaleSource('/kunde/fall/123')).toBe('profile')
  })

  it('klassifiziert Marketing/login/sonstiges als cookie', () => {
    expect(classifyLocaleSource('/')).toBe('cookie')
    expect(classifyLocaleSource('/login')).toBe('cookie')
    expect(classifyLocaleSource('/faq')).toBe('cookie')
    expect(classifyLocaleSource('/gutachter/heute')).toBe('cookie')
    expect(classifyLocaleSource(null)).toBe('cookie')
    expect(classifyLocaleSource(undefined)).toBe('cookie')
  })
})

describe('extractTokenFromPath', () => {
  it('extrahiert Token + Art aus Magic-Link-Pfaden', () => {
    expect(extractTokenFromPath('/flow/abc')).toEqual({ kind: 'flow', token: 'abc' })
    expect(extractTokenFromPath('/upload/dokumente/xyz')).toEqual({
      kind: 'upload-dokumente',
      token: 'xyz',
    })
    expect(extractTokenFromPath('/upload/zb1/zzz')).toEqual({ kind: 'upload-zb1', token: 'zzz' })
    expect(extractTokenFromPath('/kunde/re-termin/rt')).toEqual({ kind: 're-termin', token: 'rt' })
    expect(extractTokenFromPath('/ablehnen/ab')).toEqual({ kind: 'ablehnen', token: 'ab' })
  })

  it('nimmt nur das erste Pfad-Segment als Token', () => {
    expect(extractTokenFromPath('/flow/tok/extra')).toEqual({ kind: 'flow', token: 'tok' })
  })

  it('liefert null ohne Token-Segment', () => {
    expect(extractTokenFromPath('/flow/')).toBeNull()
    expect(extractTokenFromPath('/kunde/dashboard')).toBeNull()
    expect(extractTokenFromPath('/')).toBeNull()
    expect(extractTokenFromPath(null)).toBeNull()
  })
})

describe('normalizeToLocale', () => {
  it('akzeptiert gültige ISO-Codes (case-insensitiv)', () => {
    expect(normalizeToLocale('de')).toBe('de')
    expect(normalizeToLocale('EN')).toBe('en')
    expect(normalizeToLocale(' tr ')).toBe('tr')
    expect(normalizeToLocale('ar')).toBe('ar')
  })

  it('mappt Klartext-Aliase als Sicherheitsnetz', () => {
    expect(normalizeToLocale('Deutsch')).toBe('de')
    expect(normalizeToLocale('Türkisch')).toBe('tr')
    expect(normalizeToLocale('Polish')).toBe('pl')
  })

  it('liefert null für Unbekanntes/Leeres (Fallback, nie raten)', () => {
    expect(normalizeToLocale('klingonisch')).toBeNull()
    expect(normalizeToLocale('xx')).toBeNull()
    expect(normalizeToLocale('')).toBeNull()
    expect(normalizeToLocale(null)).toBeNull()
    expect(normalizeToLocale(undefined)).toBeNull()
  })
})
