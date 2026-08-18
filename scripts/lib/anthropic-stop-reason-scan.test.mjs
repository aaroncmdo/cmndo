import { describe, expect, it } from 'vitest'
import {
  pruefeDatei,
  scanneDateien,
  strippeKommentare,
  vergleicheMitBaseline,
} from './anthropic-stop-reason-scan.mjs'

/** Minimaler Aufruf mit erzwungenem Tool — die gefaehrliche Form. */
const MIT_TOOL = `
const res = await anthropic.messages.create({
  model: M,
  max_tokens: 700,
  tools: [TOOL],
  tool_choice: { type: 'tool', name: 'erfasse' },
  messages,
})
const block = res.content.find((b) => b.type === 'tool_use')
return { ok: true, deltas: block.input.deltas ?? {} }
`

describe('pruefeDatei — die stille Klasse', () => {
  it('flaggt erzwungenes Tool ohne stop_reason-Pruefung', () => {
    const r = pruefeDatei(MIT_TOOL)
    expect(r.verletzt).toBe(true)
    expect(r.zeile).toBeGreaterThan(0)
  })

  it('flaggt NICHT, wenn stop_reason geprueft wird', () => {
    const geprueft = MIT_TOOL.replace(
      'const block =',
      "if (res.stop_reason === 'max_tokens') return { ok: false, error: 'abgeschnitten' }\nconst block =",
    )
    expect(pruefeDatei(geprueft).verletzt).toBe(false)
  })

  it('flaggt Freitext-Antworten NICHT', () => {
    // Bewusste Grenze: ohne `tool_choice` bricht die Antwort sichtbar mitten im
    // Satz ab. Wuerde der Scan das mitflaggen, waere die Baseline zwei Dutzend
    // Dateien gross und niemand naehme ihn mehr ernst.
    const freitext = `
const res = await anthropic.messages.create({ model: M, max_tokens: 1000, messages })
return res.content[0].type === 'text' ? res.content[0].text : ''
`
    expect(pruefeDatei(freitext).verletzt).toBe(false)
  })

  it('flaggt Dateien ohne API-Aufruf NICHT', () => {
    // Eine Typ-/Konstanten-Datei darf `tool_choice` erwaehnen, ohne zu rufen.
    const nurTyp = `export type Aufruf = { tool_choice: { type: 'tool'; name: string } }`
    expect(pruefeDatei(nurTyp).verletzt).toBe(false)
  })
})

describe('Kommentare', () => {
  it('rettet eine Datei NICHT durch das blosse Wort im Kommentar', () => {
    // Sonst genuegte "// stop_reason pruefen wir spaeter", um das Gate zu blenden —
    // genau die Falle, die beim fixed-overlay-Scanner schon einmal zuschlug.
    const mitAusrede = MIT_TOOL.replace(
      'const block =',
      '// TODO: stop_reason spaeter pruefen\nconst block =',
    )
    expect(pruefeDatei(mitAusrede).verletzt).toBe(true)
  })

  it('erzeugt keinen Treffer aus einem erwaehnten tool_choice im Kommentar', () => {
    const nurErwaehnt = `
// wir setzen bewusst kein tool_choice, weil Freitext gewuenscht ist
const res = await anthropic.messages.create({ model: M, max_tokens: 500, messages })
`
    expect(pruefeDatei(nurErwaehnt).verletzt).toBe(false)
  })

  it('entfernt Block- und Zeilenkommentare, laesst URLs stehen', () => {
    const s = strippeKommentare('const u = "https://x.de" // weg\n/* auch weg */\nconst y = 1')
    expect(s).toContain('https://x.de')
    expect(s).not.toContain('weg')
  })
})

describe('scanneDateien + Baseline', () => {
  it('sortiert die Funde stabil', () => {
    const f = scanneDateien([
      { pfad: 'src/z.ts', quelle: MIT_TOOL },
      { pfad: 'src/a.ts', quelle: MIT_TOOL },
    ])
    expect(f.map((x) => x.datei)).toEqual(['src/a.ts', 'src/z.ts'])
  })

  it('trennt neu / bekannt / behoben', () => {
    const funde = [
      { datei: 'src/a.ts', zeile: 5 },
      { datei: 'src/neu.ts', zeile: 7 },
    ]
    const r = vergleicheMitBaseline(funde, ['src/a.ts', 'src/weg.ts'])
    expect(r.neu.map((x) => x.datei)).toEqual(['src/neu.ts'])
    expect(r.bekannt.map((x) => x.datei)).toEqual(['src/a.ts'])
    expect(r.behoben).toEqual(['src/weg.ts'])
  })

  it('meldet nichts bei leerer Eingabe', () => {
    expect(scanneDateien([])).toEqual([])
    const r = vergleicheMitBaseline([], [])
    expect(r.neu).toEqual([])
    expect(r.behoben).toEqual([])
  })
})
