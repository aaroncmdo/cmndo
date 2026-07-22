import { describe, it, expect } from 'vitest'
import { extractUnionValues, extractConstArray, resolvePath, findMissing, diffBaseline } from './i18n-coverage-scan.mjs'

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

const CONST_SRC = `const QUALI_VALUES = ['gegner', 'unklar', 'eigenverantwortung'] as const

function x() {}
`

describe('extractConstArray', () => {
  it('liest ein const-Array (single-quoted)', () => {
    expect(extractConstArray(CONST_SRC, 'QUALI_VALUES')).toEqual([
      'gegner', 'unklar', 'eigenverantwortung',
    ])
  })

  it('liest ein mehrzeiliges Array mit double-quotes + Kommentar', () => {
    const src = `const KNOWN_STATUS = [\n  "reserviert", // gebucht\n  'bestaetigt',\n]\n`
    expect(extractConstArray(src, 'KNOWN_STATUS')).toEqual(['reserviert', 'bestaetigt'])
  })

  it('ist CRLF-sicher', () => {
    expect(extractConstArray(CONST_SRC.replace(/\n/g, '\r\n'), 'QUALI_VALUES')).toEqual([
      'gegner', 'unklar', 'eigenverantwortung',
    ])
  })

  it('vertraegt eine Typ-Annotation vor dem =', () => {
    const src = `const XS: readonly string[] = ['a', 'b'] as const\n`
    expect(extractConstArray(src, 'XS')).toEqual(['a', 'b'])
  })

  it('null bei unbekannter Konstante', () => {
    expect(extractConstArray(CONST_SRC, 'GIBTS_NICHT')).toBeNull()
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

  describe('mit subKeys (verschachtelte label/hint-Objekte)', () => {
    const nested = {
      selfService: {
        quali: {
          optionen: {
            gegner: { label: 'Gegner', hint: 'Hinweis' },
            unklar: { label: 'Unklar' }, // hint fehlt
            // eigenverantwortung fehlt ganz
          },
        },
      },
    }
    const path = 'selfService.quali.optionen'

    it('meldet fehlenden Sub-Key als "<wert>.<subKey>"', () => {
      const r = findMissing(['gegner', 'unklar'], nested, path, ['label', 'hint'])
      expect(r.error).toBeNull()
      expect(r.missing).toEqual(['unklar.hint'])
    })

    it('meldet einen komplett fehlenden Wert als "<wert>" (nicht pro subKey)', () => {
      const r = findMissing(['eigenverantwortung'], nested, path, ['label', 'hint'])
      expect(r.missing).toEqual(['eigenverantwortung'])
    })

    it('leer wenn alle Werte alle subKeys tragen', () => {
      expect(findMissing(['gegner'], nested, path, ['label', 'hint']).missing).toEqual([])
    })
  })
})

describe('diffBaseline', () => {
  it('added = neue, removed = behobene', () => {
    const d = diffBaseline(['b', 'c'], ['a', 'b'])
    expect(d.added).toEqual(['c'])
    expect(d.removed).toEqual(['a'])
  })
})
