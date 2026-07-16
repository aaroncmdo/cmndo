import { describe, it, expect } from 'vitest'
import { extractStaticQueries, stripComments, queryKey, extractStaticWrites, validateWrites, writeKey } from '../query-parse-scan.mjs'

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

describe('extractStaticWrites', () => {
  it('findet insert mit Objekt-Literal (Identifier- + Shorthand-Keys)', () => {
    const w = extractStaticWrites(`await db.from('leads').insert({ vorname: 'x', status })`)
    expect(w).toEqual([{ table: 'leads', op: 'insert', keys: ['vorname', 'status'], line: 1 }])
  })

  it('findet update/upsert und quoted Keys', () => {
    const w = extractStaticWrites(`db.from('faelle').update({ 'a-b': 1, c: 2 })`)
    expect(w).toEqual([{ table: 'faelle', op: 'update', keys: ['a-b', 'c'], line: 1 }])
  })

  it('Array-Form: Keys aller Top-Level-Objekte (dedupliziert)', () => {
    const w = extractStaticWrites(`db.from('t').upsert([{ a: 1, b: 2 }, { a: 3, c: 4 }])`)
    expect(w).toEqual([{ table: 't', op: 'upsert', keys: ['a', 'b', 'c'], line: 1 }])
  })

  it('scannt das Options-Argument NICHT mit', () => {
    const w = extractStaticWrites(`db.from('t').upsert({ a: 1 }, { onConflict: 'id' })`)
    expect(w[0].keys).toEqual(['a'])
  })

  it('ignoriert Spread und computed Keys, prüft explizite daneben trotzdem', () => {
    const w = extractStaticWrites(`db.from('t').update({ ...base, [k]: 1, real: 2 })`)
    expect(w).toEqual([{ table: 't', op: 'update', keys: ['real'], line: 1 }])
  })

  it('überspringt Nicht-Literal-Argumente (.update(payload))', () => {
    expect(extractStaticWrites(`db.from('t').update(payload)`)).toEqual([])
  })

  it('nimmt nur Tiefe-1-Keys (verschachtelte Objekt-Werte leaken nicht)', () => {
    const w = extractStaticWrites(`db.from('t').insert({ a: { inner: 1 }, b: fn(x, { deep: 2 }) })`)
    expect(w[0].keys).toEqual(['a', 'b'])
  })

  it('ist string-aware (Kommas/Klammern in String-Werten zählen nicht)', () => {
    const w = extractStaticWrites(`db.from('t').insert({ a: 'x, y }', b: "z{" })`)
    expect(w[0].keys).toEqual(['a', 'b'])
  })

  it('bindet den Write an die eigene from-Kette', () => {
    const src = `db.from('a').select('id')\ndb.from('b').insert({ x: 1 })`
    const w = extractStaticWrites(src)
    expect(w).toEqual([{ table: 'b', op: 'insert', keys: ['x'], line: 2 }])
  })

  it('ignoriert Writes aus Kommentaren', () => {
    expect(extractStaticWrites(`// db.from('t').insert({ tot: 1 })`)).toEqual([])
  })

  it('überspringt Nicht-public-Schema-Ketten (.schema(...))', () => {
    expect(extractStaticWrites(`db.schema('other').from('t').insert({ x: 1 })`)).toEqual([])
  })

  it('meldet die Zeile des Write-Aufrufs', () => {
    const src = `const q = db\n  .from('t')\n  .update({ a: 1 })`
    expect(extractStaticWrites(src)[0].line).toBe(3)
  })

  it('wertet nur die KONTIGUE Methodenkette — googleapis-Style-Writes danach zaehlen nicht', () => {
    const src = [
      `await db.from('admin_termine').update({ status: 'x' }).eq('id', 1)`,
      `await calendar.events.update({ calendarId: 'c', requestBody: {}, sendUpdates: 'all' })`,
    ].join('\n')
    const w = extractStaticWrites(src)
    expect(w).toEqual([{ table: 'admin_termine', op: 'update', keys: ['status'], line: 1 }])
  })

  it('kontigue Kette funktioniert auch multiline mit nachfolgenden Filtern', () => {
    const src = `await db\n  .from('t')\n  .update({ a: 1 })\n  .eq('id', x)\n  .select()`
    expect(extractStaticWrites(src)).toEqual([{ table: 't', op: 'update', keys: ['a'], line: 3 }])
  })

  it('Write auf Builder-Variable (nicht verkettet) wird bewusst NICHT erfasst (fail-safe)', () => {
    const src = `const q = db.from('t')\nawait q.update({ a: 1 })`
    expect(extractStaticWrites(src)).toEqual([])
  })
})

describe('validateWrites', () => {
  const snapshot = {
    tables: {
      leads: { kind: 't', columns: ['id', 'vorname', 'status'] },
      v_leads: { kind: 'v', columns: ['id'] },
    },
  }

  it('flaggt tote Spalten auf Basistabellen', () => {
    const v = validateWrites([{ table: 'leads', op: 'insert', keys: ['vorname', 'typo'], line: 3 }], snapshot)
    expect(v).toEqual([{ table: 'leads', column: 'typo', op: 'insert', line: 3 }])
  })

  it('lässt gültige Keys durch', () => {
    expect(validateWrites([{ table: 'leads', op: 'update', keys: ['id', 'status'], line: 1 }], snapshot)).toEqual([])
  })

  it('skippt Views (updatable-View nicht statisch entscheidbar)', () => {
    expect(validateWrites([{ table: 'v_leads', op: 'update', keys: ['nope'], line: 1 }], snapshot)).toEqual([])
  })

  it('flaggt Writes auf unbekannte Tabellen (eine Meldung pro Write)', () => {
    const v = validateWrites([{ table: 'nope', op: 'insert', keys: ['a', 'b'], line: 2 }], snapshot)
    expect(v).toEqual([{ table: 'nope', column: '(unknown table)', op: 'insert', line: 2 }])
  })
})

describe('writeKey', () => {
  it('ist file-/zeilen-unabhängig stabil', () => {
    expect(writeKey('t', 'col')).toBe('write::t::col')
  })
})
