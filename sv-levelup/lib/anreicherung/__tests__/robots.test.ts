import { describe, expect, it } from 'vitest'
import { istErlaubt, parseRobots } from '../robots'

const erlaubt = (txt: string, pfad: string) => istErlaubt(parseRobots(txt), pfad)

describe('robots.txt', () => {
  it('erlaubt alles, wenn die Datei leer ist', () => {
    expect(erlaubt('', '/impressum')).toBe(true)
  })

  it('befolgt ein globales Disallow', () => {
    expect(erlaubt('User-agent: *\nDisallow: /', '/impressum')).toBe(false)
  })

  it('befolgt ein Praefix-Disallow', () => {
    const txt = 'User-agent: *\nDisallow: /intern'
    expect(erlaubt(txt, '/intern/x')).toBe(false)
    expect(erlaubt(txt, '/impressum')).toBe(true)
  })

  it('laesst Allow ein Disallow ueberstimmen (laengere Regel gewinnt)', () => {
    const txt = 'User-agent: *\nDisallow: /\nAllow: /impressum'
    expect(erlaubt(txt, '/impressum')).toBe(true)
    expect(erlaubt(txt, '/kontakt')).toBe(false)
  })

  it('ignoriert Regeln fuer andere Agenten', () => {
    expect(erlaubt('User-agent: Googlebot\nDisallow: /', '/impressum')).toBe(true)
  })

  it('nimmt Regeln fuer den eigenen Agenten an', () => {
    const r = parseRobots('User-agent: SVLevelUp\nDisallow: /', 'SVLevelUp')
    expect(istErlaubt(r, '/impressum')).toBe(false)
  })

  it('ignoriert Kommentare und leere Disallow-Zeilen', () => {
    expect(erlaubt('# nur ein Kommentar\nUser-agent: *\nDisallow:', '/impressum')).toBe(true)
  })

  it('parst eine leere Datei zu null Regeln', () => {
    // parseRobots kennt kein HTTP. Der Lauf behandelt 4xx als "keine Regeln"
    // und 5xx als "unklar, nicht abrufen" — das steht in lauf.ts, nicht hier.
    expect(parseRobots('').regeln).toEqual([])
  })

  it('verarbeitet CRLF-Dateien', () => {
    expect(erlaubt('User-agent: *\r\nDisallow: /\r\n', '/impressum')).toBe(false)
  })
})
