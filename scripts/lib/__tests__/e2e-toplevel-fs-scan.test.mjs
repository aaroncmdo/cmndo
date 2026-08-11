import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from '../e2e-toplevel-fs-scan.mjs'

describe('scanContent (e2e-toplevel-fs)', () => {
  it('top-level readFileSync -> Verletzer (der reale main-e2e-Breaker)', () => {
    const src = [
      "import { readFileSync } from 'node:fs'",
      "const seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.x-seed.json'), 'utf8'))",
    ].join('\n')
    expect(scanContent(src)).toEqual([{ line: 2 }])
  })

  it('try/catch-gekapselt -> sauber (das etablierte Repo-Muster)', () => {
    const src = ['let seed = null', 'try {', "  seed = JSON.parse(readFileSync('x', 'utf8'))", '} catch {}'].join('\n')
    expect(scanContent(src)).toEqual([])
  })

  it('innerhalb einer Funktion -> sauber', () => {
    const src = ['function laden() {', "  return readFileSync('x', 'utf8')", '}'].join('\n')
    expect(scanContent(src)).toEqual([])
  })

  it('innerhalb eines test()-Bodies -> sauber', () => {
    const src = ["test('x', async () => {", "  const s = readFileSync('x', 'utf8')", '})'].join('\n')
    expect(scanContent(src)).toEqual([])
  })

  it('readFileSync nur im Zeilen-Kommentar -> sauber', () => {
    expect(scanContent("// const seed = readFileSync('x')\nconst a = 1")).toEqual([])
  })

  it('readFileSync im Block-Kommentar (mehrzeilig) -> sauber', () => {
    const src = ['/*', "  const seed = readFileSync('x')", '*/', 'const a = 1'].join('\n')
    expect(scanContent(src)).toEqual([])
  })

  it('geschweifte Klammer in einem String verschiebt die Depth NICHT', () => {
    const src = ["const s = '{'", "const seed = readFileSync('x', 'utf8')"].join('\n')
    expect(scanContent(src)).toEqual([{ line: 2 }])
  })

  it('nach schliessender Funktion wieder Modul-Scope -> Verletzer wird erkannt', () => {
    const src = ['function f() {', '  const a = 1', '}', "const seed = readFileSync('x', 'utf8')"].join('\n')
    expect(scanContent(src)).toEqual([{ line: 4 }])
  })

  it('try { … } auf EINER Zeile -> sauber (ist bereits abgesichert)', () => {
    expect(scanContent("try { seed = readFileSync('x', 'utf8') } catch {}")).toEqual([])
  })

  it('skip-Marker -> File komplett uebersprungen', () => {
    const src = ['// e2e-toplevel-fs-skip: Fixture wird garantiert im CI-Step erzeugt', "const s = readFileSync('x')"].join('\n')
    expect(scanContent(src)).toEqual([])
  })

  it('mehrere Verletzer -> alle Zeilen', () => {
    const src = ["const a = readFileSync('x')", 'const b = 2', "const c = readFileSync('y')"].join('\n')
    expect(scanContent(src)).toEqual([{ line: 1 }, { line: 3 }])
  })

  it('CRLF-Zeilenenden werden korrekt behandelt', () => {
    expect(scanContent("const a = 1\r\nconst seed = readFileSync('x')\r\n")).toEqual([{ line: 2 }])
  })
})

describe('diffBaseline', () => {
  it('neue Verletzer -> added', () => {
    expect(diffBaseline(['a.spec.ts', 'b.spec.ts'], ['a.spec.ts'])).toEqual({ added: ['b.spec.ts'], removed: [] })
  })
  it('behobene Verletzer -> removed', () => {
    expect(diffBaseline(['a.spec.ts'], ['a.spec.ts', 'b.spec.ts'])).toEqual({ added: [], removed: ['b.spec.ts'] })
  })
  it('unveraendert -> beides leer', () => {
    expect(diffBaseline(['a.spec.ts'], ['a.spec.ts'])).toEqual({ added: [], removed: [] })
  })
})
