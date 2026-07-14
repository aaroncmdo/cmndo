import { describe, it, expect } from 'vitest'
import { extractStaticQueries, stripComments, queryKey } from '../query-parse-scan.mjs'

describe('extractStaticQueries', () => {
  it('findet eine einfache from().select()-Kette', () => {
    const q = extractStaticQueries(`const { data } = await db.from('leads').select('id, status')`)
    expect(q).toEqual([{ table: 'leads', select: 'id, status', line: 1 }])
  })

  it('ignoriert .from() aus Kommentaren (Zeilen- und Block)', () => {
    expect(extractStaticQueries(`// nutzt db.from('faelle').select('x')\nconst x = 1`)).toEqual([])
    expect(extractStaticQueries(`/* db.from('faelle').select('x') */\nconst x = 1`)).toEqual([])
  })

  it('überspringt Template-Literals mit Interpolation (nicht sicher rekonstruierbar)', () => {
    const bt = String.fromCharCode(96) // Backtick — gespalten, damit vite/esbuild nicht stolpert
    const interp = '$' + '{cols}'
    expect(extractStaticQueries(`db.from("t").select(${bt}id, ${interp}${bt})`)).toEqual([])
  })

  it('überspringt konkatenierte selects', () => {
    expect(extractStaticQueries(`db.from('t').select('id, ' + extra)`)).toEqual([])
  })

  it('überspringt Wildcard-selects', () => {
    expect(extractStaticQueries(`db.from('t').select('*')`)).toEqual([])
  })

  it('bindet select NICHT an eine spätere, andere from-Kette', () => {
    // .from('a') hat kein eigenes select; das nächste select gehört zu .from('b').
    const src = `db.from('a').eq('x',1)\ndb.from('b').select('id')`
    const q = extractStaticQueries(src)
    expect(q).toEqual([{ table: 'b', select: 'id', line: 2 }])
  })

  it('erfasst Embeds als Teil der select-Klausel', () => {
    const q = extractStaticQueries(`db.from('faelle_claim_bridge').select('fall_id, claims:claim_id(status)')`)
    expect(q[0]).toMatchObject({ table: 'faelle_claim_bridge', select: 'fall_id, claims:claim_id(status)' })
  })

  it('meldet die korrekte Zeilennummer trotz Kommentar-Stripping', () => {
    const src = `line1\n/* multi\nline comment */\ndb.from('t').select('id')`
    expect(extractStaticQueries(src)[0].line).toBe(4)
  })
})

describe('queryKey', () => {
  it('ist whitespace-stabil (Baseline driftet nicht bei Reformatierung)', () => {
    expect(queryKey('t', 'id,  status')).toBe(queryKey('t', 'id, status'))
  })
  it('trennt nach Tabelle', () => {
    expect(queryKey('a', 'id')).not.toBe(queryKey('b', 'id'))
  })
})

describe('stripComments', () => {
  it('erhält die Zeilenzahl', () => {
    expect(stripComments('a\n// x\nb').split('\n').length).toBe(3)
  })
})
