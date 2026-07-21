import { describe, it, expect } from 'vitest'
import { extractUnionValues, resolvePath, findMissing, diffBaseline } from './i18n-coverage-scan.mjs'

const MULTILINE = `export type ClaimMainPhase = 'erfassung' | 'abschluss'

export type ClaimSubPhase =
  // Lead (erfassung)
  | 'sa_offen'
  | 'termin'
  // CMM-74: operative Sub-States
  | 'filmcheck'
  | 'qc-pruefung'

export type ClaimLifecycle = {
  mainPhase: ClaimMainPhase
}
`

describe('extractUnionValues', () => {
  it('liest eine mehrzeilige Union (Kommentare ignoriert)', () => {
    expect(extractUnionValues(MULTILINE, 'ClaimSubPhase')).toEqual([
      'sa_offen', 'termin', 'filmcheck', 'qc-pruefung',
    ])
  })

  it('liest eine einzeilige Union', () => {
    expect(extractUnionValues(MULTILINE, 'ClaimMainPhase')).toEqual(['erfassung', 'abschluss'])
  })

  it('ist CRLF-sicher (das Repo nutzt CRLF)', () => {
    const crlf = MULTILINE.replace(/\n/g, '\r\n')
    expect(extractUnionValues(crlf, 'ClaimSubPhase')).toEqual([
      'sa_offen', 'termin', 'filmcheck', 'qc-pruefung',
    ])
  })

  it('zaehlt Anfuehrungszeichen IN Kommentaren nicht als Werte', () => {
    const src = `export type X =\n  // hier steht 'kein_wert' im Kommentar\n  | 'echt'\n\nexport type Y = 1\n`
    expect(extractUnionValues(src, 'X')).toEqual(['echt'])
  })

  it('null bei unbekanntem Typ', () => {
    expect(extractUnionValues(MULTILINE, 'GibtsNicht')).toBeNull()
  })
})

describe('resolvePath / findMissing', () => {
  const messages = { phasen: { subIntern: { sa_offen: 'SA offen', termin: 'Termin' } } }

  it('resolvePath navigiert den Punkt-Pfad', () => {
    expect(resolvePath(messages, 'phasen.subIntern').termin).toBe('Termin')
    expect(resolvePath(messages, 'phasen.gibtsNicht')).toBeUndefined()
  })

  it('findet fehlende Union-Werte', () => {
    const r = findMissing(['sa_offen', 'termin', 'filmcheck'], messages, 'phasen.subIntern')
    expect(r.error).toBeNull()
    expect(r.missing).toEqual(['filmcheck'])
  })

  it('leer wenn alles abgedeckt', () => {
    expect(findMissing(['sa_offen', 'termin'], messages, 'phasen.subIntern').missing).toEqual([])
  })

  it('meldet einen fehlenden Namespace als Fehler (nicht als 0 missing)', () => {
    const r = findMissing(['a'], messages, 'phasen.subKunde')
    expect(r.error).toMatch(/fehlt/)
    expect(r.missing).toEqual([])
  })
})

describe('diffBaseline', () => {
  it('added = neue, removed = behobene', () => {
    const d = diffBaseline(['b', 'c'], ['a', 'b'])
    expect(d.added).toEqual(['c'])
    expect(d.removed).toEqual(['a'])
  })
})
