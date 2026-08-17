import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from '../silent-write-scan.mjs'

// Der Ratchet laeuft gegen die ganze Fleet — ein Fehlalarm blockiert JEDEN PR. Die
// Negativ-Faelle unten sind deshalb wichtiger als die Positiv-Faelle.
describe('silent-write-scan', () => {
  it('flaggt einen einzeiligen Write ohne Fehlerpruefung', () => {
    const treffer = scanContent(`await db.from('claims').update({ a: 1 }).eq('id', x)`)
    expect(treffer).toHaveLength(1)
    expect(treffer[0]).toMatchObject({ table: 'claims', methode: 'update', line: 1 })
  })

  it('flaggt die mehrzeilige Kette (das Projekt schreibt ohne Semikolons)', () => {
    const treffer = scanContent(`
      await admin
        .from('tasks')
        .insert({ titel: 'x' })
    `)
    expect(treffer).toHaveLength(1)
    expect(treffer[0]).toMatchObject({ table: 'tasks', methode: 'insert' })
  })

  it('flaggt NICHT, wenn das Ergebnis destrukturiert wird', () => {
    expect(scanContent(`const { error } = await db.from('claims').update({ a: 1 })`)).toEqual([])
    expect(scanContent(`const res = await db.from('leads').delete().eq('id', x)`)).toEqual([])
  })

  it('flaggt NICHT bei return — der Aufrufer bekommt das Ergebnis', () => {
    expect(scanContent(`return await db.from('tasks').insert({ a: 1 })`)).toEqual([])
  })

  it('flaggt NICHT bei unkritischen Tabellen', () => {
    expect(scanContent(`await db.from('audit_log').insert({ a: 1 })`)).toEqual([])
  })

  it('flaggt NICHT bei reinen Reads', () => {
    expect(scanContent(`await db.from('claims').select('id').eq('id', x)`)).toEqual([])
  })

  it('respektiert den Skip-Marker', () => {
    const src = `// silent-write-skip: bewusst fire-and-forget\nawait db.from('claims').update({ a: 1 })`
    expect(scanContent(src)).toEqual([])
  })

  it('ignoriert auskommentierten Code', () => {
    expect(scanContent(`// await db.from('claims').update({ a: 1 })`)).toEqual([])
    expect(scanContent(`/*\nawait db.from('tasks').insert({})\n*/`)).toEqual([])
  })

  it('haelt die Zeilennummer trotz gestrippter Kommentare', () => {
    const src = `// Zeile 1\n/* Zeile 2 */\nawait db.from('leads').update({ a: 1 })`
    expect(scanContent(src)[0].line).toBe(3)
  })

  it('flaggt NICHT, wenn die Kette mehrere .from() enthaelt (Zuordnung unklar)', () => {
    // Konstruiert, aber die Regel schuetzt vor Fehlzuordnung: lieber nichts melden als falsch.
    const src = `await helper(db.from('claims'), db.from('tasks').insert({ a: 1 }))`
    expect(scanContent(src)).toEqual([])
  })

  it('trennt zwei aufeinanderfolgende Statements sauber', () => {
    const treffer = scanContent(
      `await db.from('claims').update({ a: 1 })\nawait db.from('tasks').insert({ b: 2 })`,
    )
    expect(treffer).toHaveLength(2)
    expect(treffer.map((t) => t.table)).toEqual(['claims', 'tasks'])
  })

  it('laeuft nicht ueber das Statement-Ende hinaus in den naechsten Block', () => {
    // Das `await` steht allein; das `.from('claims').update()` gehoert zu einem SPAETEREN
    // Statement innerhalb desselben Blocks und darf ihm nicht zugerechnet werden.
    const src = `if (x) {\n  await warte()\n}\nconst { error } = await db.from('claims').update({ a: 1 })`
    expect(scanContent(src)).toEqual([])
  })

  it('diffBaseline meldet neu und behoben getrennt', () => {
    const d = diffBaseline(['b.ts', 'c.ts'], ['a.ts', 'b.ts'])
    expect(d.neu).toEqual(['c.ts'])
    expect(d.behoben).toEqual(['a.ts'])
  })
})
