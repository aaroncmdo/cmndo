import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from './flag-drift-scan.mjs'

// Mini-Constraint-Map (unabhaengig vom echten DB-Snapshot) fuer deterministische Tests.
const COLS = {
  'gutachter_termine.status': ['reserviert', 'bestaetigt', 'abgesagt', 'storniert'],
  'repairs.status': ['geplant', 'in_arbeit', 'abgeschlossen'],
  'claims.status': ['reguliert', 'storniert', 'reguliert_vollstaendig'],
  'gutachten.status': ['final', 'storniert'],
  'gutachten.ocr_status': ['pending', 'done'],
}

describe('scanContent (flag-drift: CHECK-invalide Status-Literale)', () => {
  it('flaggt .update({status:"geplant"}) auf gutachter_termine (der 05.07.-Bug)', () => {
    const v = scanContent(`await admin.from('gutachter_termine').update({ status: 'geplant' }).eq('id', x)`, COLS)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ table: 'gutachter_termine', column: 'status', value: 'geplant', kind: 'assign' })
  })

  it('flaggt .update({status:"kunde_storniert"}) auf gutachter_termine', () => {
    const v = scanContent(`db.from('gutachter_termine').update({ status: 'kunde_storniert', cancelled_at: now })`, COLS)
    expect(v.map((x) => x.value)).toEqual(['kunde_storniert'])
  })

  it('flaggt NICHT einen gueltigen Status', () => {
    expect(scanContent(`admin.from('gutachter_termine').update({ status: 'bestaetigt' })`, COLS)).toHaveLength(0)
  })

  it('Tabellen-Aufloesung: "geplant" ist auf repairs GUELTIG (nicht flaggen)', () => {
    expect(scanContent(`admin.from('repairs').update({ status: 'geplant' })`, COLS)).toHaveLength(0)
  })

  it('flaggt einen Tippfehler auf claims.status', () => {
    const v = scanContent(`admin.from('claims').update({ status: 'reguliert_vollstaending' })`, COLS)
    expect(v).toHaveLength(1)
    expect(v[0].value).toBe('reguliert_vollstaending')
  })

  it('flaggt .eq("status","<invalid>") als Filter', () => {
    const v = scanContent(`admin.from('gutachter_termine').select('*').eq('status', 'durchgefuehrt')`, COLS)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ kind: 'filter', value: 'durchgefuehrt' })
  })

  it('flaggt NICHT einen gueltigen .eq-Filter', () => {
    expect(scanContent(`admin.from('gutachter_termine').select('*').eq('status', 'reserviert')`, COLS)).toHaveLength(0)
  })

  it('flaggt ungueltige Werte in .in("status", [...])', () => {
    const v = scanContent(`admin.from('gutachter_termine').select('*').in('status', ['reserviert', 'geplant'])`, COLS)
    expect(v.map((x) => x.value)).toEqual(['geplant'])
  })

  it('flaggt KEINEN dynamischen Wert (kein Literal)', () => {
    expect(scanContent(`admin.from('gutachter_termine').update({ status: neuerStatus })`, COLS)).toHaveLength(0)
  })

  it('flaggt KEIN Literal in einem Kommentar', () => {
    const src = `// admin.from('gutachter_termine').update({ status: 'geplant' })
    const x = 1`
    expect(scanContent(src, COLS)).toHaveLength(0)
  })

  it('flaggt KEIN unbeteiligtes Objekt (status:"loading" NICHT in einem .update)', () => {
    const src = `admin.from('claims').select('*'); const ui = { status: 'loading' }`
    expect(scanContent(src, COLS)).toHaveLength(0)
  })

  it('unterscheidet status vs ocr_status (Word-Boundary)', () => {
    // ocr_status:'invalid' -> flaggen; status:'final' -> ok; NICHT status faelschlich in ocr_status matchen
    const v = scanContent(`admin.from('gutachten').update({ status: 'final', ocr_status: 'invalid' })`, COLS)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ column: 'ocr_status', value: 'invalid' })
  })

  it('flaggt NICHT wenn Tabelle keine CHECK-Spalte im Map hat', () => {
    expect(scanContent(`admin.from('unbekannte_tabelle').update({ status: 'irgendwas' })`, COLS)).toHaveLength(0)
  })

  it('nested object im update-literal bricht das brace-matching nicht', () => {
    const src = `admin.from('gutachter_termine').update({ status: 'geplant', meta: { a: 1, b: { c: 2 } } })`
    const v = scanContent(src, COLS)
    expect(v.map((x) => x.value)).toEqual(['geplant'])
  })
})

describe('diffBaseline', () => {
  it('added = neue Verletzer, removed = behobene', () => {
    const d = diffBaseline(['a.ts', 'c.ts'], ['a.ts', 'b.ts'])
    expect(d.added).toEqual(['c.ts'])
    expect(d.removed).toEqual(['b.ts'])
  })
})
