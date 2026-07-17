import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from './termin-bezug-scan.mjs'

// P3.3: naive Legacy-Achsen-Filter auf gutachter_termine — .eq/.neq/.in('fall_id'|'lead_id'|
// 'claim_id') uebersehen bezug-native Termine (bezug_typ+bezug_id, Legacy-Spalte NULL). Fix =
// .or(bezugOrExpr(achse,id)). Der Scanner faengt die naiven Filter (Boy-Scout-Retire), 0 FP.
describe('scanContent (termin-bezug: naive Legacy-Filter auf gutachter_termine)', () => {
  it('flaggt .eq("fall_id") auf gutachter_termine', () => {
    const v = scanContent(`db.from('gutachter_termine').select('id').eq('fall_id', fallId)`)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ table: 'gutachter_termine', achse: 'fall', kind: 'eq' })
  })

  it('flaggt lead_id und claim_id (alle drei Legacy-Achsen)', () => {
    expect(scanContent(`x.from('gutachter_termine').eq('lead_id', l)`)[0].achse).toBe('lead')
    expect(scanContent(`x.from('gutachter_termine').eq('claim_id', c)`)[0].achse).toBe('claim')
  })

  it('flaggt .in("lead_id", [...]) als kind "in"', () => {
    const v = scanContent(`db.from('gutachter_termine').select('id').in('lead_id', ids)`)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ achse: 'lead', kind: 'in' })
  })

  it('flaggt .neq("fall_id") als kind "neq"', () => {
    expect(scanContent(`db.from('gutachter_termine').neq('fall_id', x)`)[0].kind).toBe('neq')
  })

  it('flaggt einen Filter auch bei update/delete (WHERE uebersieht bezug-native)', () => {
    // .update({status}).eq('fall_id') -> updatet NUR Legacy-Termine, verfehlt bezug-native.
    expect(scanContent(`db.from('gutachter_termine').update({ status: 's' }).eq('fall_id', y)`)).toHaveLength(1)
    expect(scanContent(`db.from('gutachter_termine').delete().eq('claim_id', c)`)).toHaveLength(1)
  })

  it('flaggt NICHT die migrierte Form .or(bezugOrExpr(...))', () => {
    expect(
      scanContent(`db.from('gutachter_termine').select('id').or(bezugOrExpr('fall', fallId))`),
    ).toHaveLength(0)
  })

  it('flaggt NICHT .eq("fall_id") auf einer ANDEREN Tabelle', () => {
    expect(scanContent(`db.from('faelle').select('*').eq('fall_id', x)`)).toHaveLength(0)
  })

  it('flaggt NICHT die kanonische Achse (bezug_id / bezug_typ)', () => {
    expect(
      scanContent(`db.from('gutachter_termine').eq('bezug_id', x).eq('bezug_typ', 'fall')`),
    ).toHaveLength(0)
  })

  it('flaggt NICHT andere id-Spalten (assignee_id / vehicle_id / id)', () => {
    expect(
      scanContent(`db.from('gutachter_termine').eq('assignee_id', a).eq('id', b).eq('vehicle_id', c)`),
    ).toHaveLength(0)
  })

  it('flaggt NICHT einen WRITE der Legacy-Spalte (.insert/.update-Objektliteral)', () => {
    // Legacy-Spalten SCHREIBEN ist legitim, solange die Spalten existieren — nur FILTER uebersehen.
    expect(scanContent(`db.from('gutachter_termine').insert({ fall_id: x, start_zeit: t })`)).toHaveLength(0)
    expect(scanContent(`db.from('gutachter_termine').update({ fall_id: x }).eq('id', y)`)).toHaveLength(0)
  })

  it('flaggt KEIN Literal in einem Kommentar', () => {
    const src = `// db.from('gutachter_termine').eq('fall_id', x)\nconst y = 1`
    expect(scanContent(src)).toHaveLength(0)
  })

  it('Multiline-Kette: from und eq auf verschiedenen Zeilen', () => {
    const src = `db\n  .from('gutachter_termine')\n  .select('id')\n  .eq('fall_id', fallId)`
    const v = scanContent(src)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(4)
  })

  it('zwei Ketten im File: nur die gutachter_termine-Kette zaehlt', () => {
    const src = `db.from('faelle').eq('fall_id', a); db.from('gutachter_termine').eq('fall_id', b)`
    const v = scanContent(src)
    expect(v).toHaveLength(1)
    expect(v[0].achse).toBe('fall')
  })
})

describe('diffBaseline', () => {
  it('added = neue Verletzer, removed = behobene', () => {
    const d = diffBaseline(['a.ts', 'c.ts'], ['a.ts', 'b.ts'])
    expect(d.added).toEqual(['c.ts'])
    expect(d.removed).toEqual(['b.ts'])
  })
})
