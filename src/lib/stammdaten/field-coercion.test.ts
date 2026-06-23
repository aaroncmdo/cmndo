import { describe, it, expect } from 'vitest'
import { coerceJaNein, splitPersonName } from './field-coercion'

describe('coerceJaNein', () => {
  it('Ja-Varianten -> true', () => {
    for (const v of ['Ja', 'ja', 'JA', ' ja ', 'true', 'wahr', '1', 'yes', 'y', 'j']) {
      expect(coerceJaNein(v)).toEqual({ ok: true, value: true })
    }
  })
  it('Nein-Varianten -> false', () => {
    for (const v of ['Nein', 'nein', 'NEIN', ' nein ', 'false', 'falsch', '0', 'no', 'n']) {
      expect(coerceJaNein(v)).toEqual({ ok: true, value: false })
    }
  })
  it('leer/null/undefined -> null (explizites Loeschen)', () => {
    expect(coerceJaNein(null)).toEqual({ ok: true, value: null })
    expect(coerceJaNein(undefined)).toEqual({ ok: true, value: null })
    expect(coerceJaNein('')).toEqual({ ok: true, value: null })
    expect(coerceJaNein('   ')).toEqual({ ok: true, value: null })
  })
  it('boolean passthrough', () => {
    expect(coerceJaNein(true)).toEqual({ ok: true, value: true })
    expect(coerceJaNein(false)).toEqual({ ok: true, value: false })
  })
  it('unbekannter String -> Fehler (nicht still null)', () => {
    const r = coerceJaNein('vielleicht')
    expect(r.ok).toBe(false)
  })
  it('Nicht-String/Nicht-Boolean -> Fehler', () => {
    expect(coerceJaNein(42).ok).toBe(false)
    expect(coerceJaNein({}).ok).toBe(false)
  })
})

describe('splitPersonName', () => {
  it('zwei Token -> vorname/nachname', () => {
    expect(splitPersonName('Hans Mueller')).toEqual({ vorname: 'Hans', nachname: 'Mueller' })
  })
  it('drei Token -> vorname = erste zwei', () => {
    expect(splitPersonName('Hans Peter Mueller')).toEqual({ vorname: 'Hans Peter', nachname: 'Mueller' })
  })
  it('Einzeltoken -> nur nachname', () => {
    expect(splitPersonName('Mueller')).toEqual({ vorname: null, nachname: 'Mueller' })
  })
  it('leer/null/undefined -> beide null', () => {
    expect(splitPersonName('')).toEqual({ vorname: null, nachname: null })
    expect(splitPersonName(null)).toEqual({ vorname: null, nachname: null })
    expect(splitPersonName(undefined)).toEqual({ vorname: null, nachname: null })
    expect(splitPersonName('   ')).toEqual({ vorname: null, nachname: null })
  })
  it('extra whitespace normalisiert', () => {
    expect(splitPersonName('  Hans   Mueller  ')).toEqual({ vorname: 'Hans', nachname: 'Mueller' })
  })
  it('Display-Roundtrip bei >=2 Token', () => {
    const { vorname, nachname } = splitPersonName('Anna Maria Schmidt')
    expect([vorname, nachname].filter(Boolean).join(' ')).toBe('Anna Maria Schmidt')
  })
})
