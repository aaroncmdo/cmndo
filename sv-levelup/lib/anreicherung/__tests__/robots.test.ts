import { describe, expect, it } from 'vitest'
import { istAgentErlaubt, istErlaubt, parseRobots } from '../robots'

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

// Gruppentreue Auswertung je Agent — Grundlage des Moduls `ki`.
describe('istAgentErlaubt', () => {
  // Die haeufigste Sperrform ueberhaupt: alles offen, EIN Dienst ausgesperrt.
  const GESPERRT = 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /'

  it('erkennt die Sperre eines einzelnen Dienstes', () => {
    expect(istAgentErlaubt(GESPERRT, 'GPTBot')).toBe(false)
  })

  it('laesst andere Dienste dabei unberuehrt', () => {
    expect(istAgentErlaubt(GESPERRT, 'PerplexityBot')).toBe(true)
  })

  // ⚠ Der eigentliche Grund, warum es diese Funktion gibt. parseRobots fuehrt
  // die `*`-Gruppe mit der Agenten-Gruppe zusammen und kehrt die Aussage damit
  // um. Der Test haelt die Abweichung fest, damit niemand die eine Funktion
  // spaeter fuer die andere haelt.
  it('weicht hier bewusst von parseRobots ab', () => {
    expect(istErlaubt(parseRobots(GESPERRT, 'GPTBot'), '/')).toBe(true)  // falsch
    expect(istAgentErlaubt(GESPERRT, 'GPTBot')).toBe(false)              // richtig
  })

  it('laesst die eigene Gruppe auch dann gelten, wenn sie GROSSZUEGIGER ist', () => {
    const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /'
    expect(istAgentErlaubt(txt, 'ClaudeBot')).toBe(true)
    expect(istAgentErlaubt(txt, 'GPTBot')).toBe(false)
  })

  it('faellt auf die Sternchen-Gruppe zurueck, wenn es keine eigene gibt', () => {
    expect(istAgentErlaubt('User-agent: *\nDisallow: /', 'GPTBot')).toBe(false)
  })

  it('erlaubt alles, wenn keine Gruppe zutrifft', () => {
    expect(istAgentErlaubt('User-agent: Googlebot\nDisallow: /', 'GPTBot')).toBe(true)
    expect(istAgentErlaubt('', 'GPTBot')).toBe(true)
  })

  it('teilt aufeinanderfolgende User-agent-Zeilen dieselben Regeln zu', () => {
    const txt = 'User-agent: GPTBot\nUser-agent: ChatGPT-User\nDisallow: /'
    expect(istAgentErlaubt(txt, 'GPTBot')).toBe(false)
    expect(istAgentErlaubt(txt, 'ChatGPT-User')).toBe(false)
  })

  it('vergleicht Agentennamen ohne Ruecksicht auf Gross-/Kleinschreibung', () => {
    expect(istAgentErlaubt('User-agent: gptbot\nDisallow: /', 'GPTBot')).toBe(false)
  })

  it('wertet ein leeres Disallow als „alles erlaubt"', () => {
    expect(istAgentErlaubt('User-agent: GPTBot\nDisallow:', 'GPTBot')).toBe(true)
  })

  it('beachtet Pfad-Ausnahmen innerhalb der Agenten-Gruppe', () => {
    const txt = 'User-agent: GPTBot\nDisallow: /\nAllow: /leistungen'
    expect(istAgentErlaubt(txt, 'GPTBot', '/leistungen')).toBe(true)
    expect(istAgentErlaubt(txt, 'GPTBot', '/preise')).toBe(false)
  })
})
