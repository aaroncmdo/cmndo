import { describe, it, expect } from 'vitest'
import { resolveFlowLocale } from './resolve-flow-locale'

describe('resolveFlowLocale', () => {
  it('nimmt flow_links.sprache wenn es eine bekannte Locale ist', () => {
    expect(resolveFlowLocale('tr', null)).toBe('tr')
    expect(resolveFlowLocale('ar', 'de')).toBe('ar')
    expect(resolveFlowLocale('en', 'tr')).toBe('en')
  })

  it('fällt auf lead.sprache zurück wenn flow-sprache fehlt/unbekannt', () => {
    expect(resolveFlowLocale(null, 'ru')).toBe('ru')
    expect(resolveFlowLocale('other', 'pl')).toBe('pl')
    expect(resolveFlowLocale(undefined, 'ar')).toBe('ar')
  })

  it('liefert de für other/null/unbekannte Codes auf beiden Ebenen', () => {
    expect(resolveFlowLocale('other', 'other')).toBe('de')
    expect(resolveFlowLocale(null, null)).toBe('de')
    expect(resolveFlowLocale('xyz', undefined)).toBe('de')
    expect(resolveFlowLocale(undefined, undefined)).toBe('de')
  })

  it('akzeptiert de explizit', () => {
    expect(resolveFlowLocale('de', null)).toBe('de')
  })
})
