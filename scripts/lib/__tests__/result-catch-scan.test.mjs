import { describe, it, expect } from 'vitest'
import { scanneResultCatch, sammleResultFunktionen, entrausche } from '../result-catch-scan.mjs'

const FNS = new Set(['speichereFeststellungFlow', 'markiereAlsBezahlt'])

describe('sammleResultFunktionen', () => {
  it('erkennt Promise<{ ok …', () => {
    const q = 'export async function fooBar(x: string): Promise<{ ok: boolean; error?: string }> {'
    expect(sammleResultFunktionen([q]).has('fooBar')).toBe(true)
  })

  it('erkennt auch die aeltere success-Variante', () => {
    const q = 'export async function altFn(): Promise<{ success: boolean }> {'
    expect(sammleResultFunktionen([q]).has('altFn')).toBe(true)
  })

  it('nimmt eine Funktion, die etwas anderes liefert, NICHT auf', () => {
    const q = 'export async function ladeDaten(): Promise<string[]> {'
    expect(sammleResultFunktionen([q]).size).toBe(0)
  })
})

describe('der reale Fehler', () => {
  it('flaggt das leere .catch() um eine Result-Action', () => {
    const q = 'void speichereFeststellungFlow(token, values).catch(() => {})'
    const f = scanneResultCatch(q, FNS)
    expect(f).toHaveLength(1)
    expect(f[0].fn).toBe('speichereFeststellungFlow')
  })

  it('auch mit Leerraum im catch', () => {
    expect(scanneResultCatch('void markiereAlsBezahlt(a, b).catch( ( ) => { } )', FNS)).toHaveLength(1)
  })
})

describe('Abgrenzung — was NICHT geflaggt wird', () => {
  it('.catch MIT Logging ist bewusstes fire-and-forget und bleibt erlaubt', () => {
    // Real: 4 Stellen im content-studio, dort im Kommentar begruendet.
    const q = "void speichereFeststellungFlow(a).catch((e) => console.error('failed', e))"
    expect(scanneResultCatch(q, FNS)).toHaveLength(0)
  })

  it('ein leeres catch um eine Funktion, die WIRKLICH wirft, ist erlaubt', () => {
    // enqueueOp/fetch werfen echte Fehler — dort faengt das catch etwas.
    expect(scanneResultCatch('void enqueueOp({...}).catch(() => {})', FNS)).toHaveLength(0)
  })

  it('ein ausgewerteter Aufruf ist kein Fund', () => {
    const q = 'const r = await speichereFeststellungFlow(a); if (!r.ok) setError(r.error)'
    expect(scanneResultCatch(q, FNS)).toHaveLength(0)
  })

  it('ohne bekannte Result-Actions passiert nichts', () => {
    expect(scanneResultCatch('void irgendwas().catch(() => {})', new Set())).toHaveLength(0)
  })
})

describe('Kommentare', () => {
  it('ein Erklaertext flaggt nicht sein eigenes File', () => {
    const q = '// frueher: void speichereFeststellungFlow(t, v).catch(() => {})\nconst x = 1'
    expect(scanneResultCatch(q, FNS)).toHaveLength(0)
  })

  it('auch als Blockkommentar nicht', () => {
    const q = '/* void markiereAlsBezahlt(a).catch(() => {}) */\nconst x = 1'
    expect(scanneResultCatch(q, FNS)).toHaveLength(0)
  })

  it('entrausche laesst echten Code stehen', () => {
    expect(entrausche('const a = 1 // weg\nconst b = 2')).toContain('const b = 2')
  })
})

describe('Zeilennummern', () => {
  it('meldet die richtige Zeile', () => {
    const q = ['const a = 1', 'const b = 2', 'void markiereAlsBezahlt(x).catch(() => {})'].join('\n')
    expect(scanneResultCatch(q, FNS)[0].zeile).toBe(3)
  })
})
