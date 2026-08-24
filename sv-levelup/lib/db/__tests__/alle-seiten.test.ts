import { describe, expect, it, vi } from 'vitest'
import { alleSeiten, inBloecken } from '../alle-seiten'

/** Ein Bestand mit `n` Zeilen, der sich wie PostgREST verhaelt. */
function bestand(n: number) {
  const zeilen = Array.from({ length: n }, (_, i) => ({ id: `z${i}` }))
  const bereiche: Array<[number, number]> = []
  return {
    bereiche,
    hole: async (von: number, bis: number) => {
      bereiche.push([von, bis])
      return { data: zeilen.slice(von, bis + 1), error: null }
    },
  }
}

describe('alleSeiten', () => {
  it('holt einen Bestand, der GRÖSSER als eine Seite ist — vollstaendig', async () => {
    // ⭐ Der reale Fall: 6.988 Leads, ein einfaches `.select()` lieferte 1.000.
    // Kein Fehler, keine Warnung — die Antwort war nur kuerzer als die Wahrheit.
    const b = bestand(6988)
    const r = await alleSeiten(b.hole)

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unerwartet')
    expect(r.zeilen).toHaveLength(6988)
    expect(b.bereiche[0]).toEqual([0, 999])
    expect(b.bereiche[1]).toEqual([1000, 1999])
  })

  it('hoert auf, sobald eine Seite nicht mehr voll ist', async () => {
    const b = bestand(1500)
    await alleSeiten(b.hole)
    expect(b.bereiche).toHaveLength(2)
  })

  it('macht bei GENAU einer vollen Seite einen zweiten Abruf', async () => {
    // ⚠ Bei exakt 1000 Zeilen ist nicht unterscheidbar, ob mehr folgen. Wer
    // hier aufhoert, verliert bei 1001 Zeilen genau eine — still.
    const b = bestand(1000)
    const r = await alleSeiten(b.hole)
    expect(b.bereiche).toHaveLength(2)
    expect(r.ok && r.zeilen).toHaveLength(1000)
  })

  it('kommt mit einem leeren Bestand zurecht', async () => {
    const r = await alleSeiten(bestand(0).hole)
    expect(r.ok && r.zeilen).toEqual([])
  })

  it('MELDET EINEN FEHLER, statt eine halbe Menge auszugeben', async () => {
    // ⭐ Ein Fehler auf Seite 7 ist kein Teilerfolg. Die bisher geholten Zeilen
    // zurueckzugeben hiesse, eine unvollstaendige Menge als vollstaendige
    // auszugeben — genau der Fehler, den diese Funktion verhindern soll.
    let aufruf = 0
    const r = await alleSeiten(async (von, bis) => {
      aufruf++
      if (aufruf === 3) return { data: null, error: { message: 'Verbindung weg' } }
      return { data: Array.from({ length: 1000 }, (_, i) => ({ id: `${von + i}-${bis}` })), error: null }
    })

    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unerwartet')
    expect(r.error).toBe('Verbindung weg')
  })

  it('bricht ab, statt endlos zu laufen', async () => {
    // Eine Abfrage, die entgegen der Erwartung immer volle Seiten liefert,
    // darf den Lauf nicht aufhaengen.
    const hole = vi.fn(async () => ({ data: Array.from({ length: 10 }, () => ({ id: 'x' })), error: null }))
    const r = await alleSeiten(hole, 10, 100)

    expect(r.ok).toBe(false)
    expect(hole).toHaveBeenCalledTimes(10)
  })
})

describe('inBloecken', () => {
  it('zerlegt eine grosse Kennungsmenge in Bloecke', async () => {
    const ids = Array.from({ length: 750 }, (_, i) => `id-${i}`)
    const bloecke: number[] = []

    const r = await inBloecken(ids, async (block) => {
      bloecke.push(block.length)
      return { data: block.map((id) => ({ id })), error: null }
    }, 300)

    expect(bloecke).toEqual([300, 300, 150])
    expect(r.ok && r.zeilen).toHaveLength(750)
  })

  it('gibt JEDE Kennung zurueck — keine faellt hinten runter', async () => {
    // ⭐ Der Schaden ist hier kein Truncation, sondern ein falsches SCHREIBEN:
    // fehlt ein Lead in der Ist-Menge, gilt jedes seiner Felder als leer, und
    // der Rueckwaertsgang raeumt Begleitspalten ab, die ein FREMDER Lauf
    // gesetzt hat.
    const ids = Array.from({ length: 1001 }, (_, i) => `id-${i}`)
    const r = await inBloecken(ids, async (block) => ({
      data: block.map((id) => ({ id })), error: null,
    }), 300)

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unerwartet')
    const zurueck = new Set(r.zeilen.map((z) => (z as { id: string }).id))
    expect(zurueck.size).toBe(1001)
    for (const id of ids) expect(zurueck.has(id)).toBe(true)
  })

  it('holt auch INNERHALB eines Blocks seitenweise', async () => {
    // 300 Kennungen koennen mehr als 1.000 Zeilen ergeben, sobald die Abfrage
    // nicht auf dem Primaerschluessel filtert.
    const bereiche: Array<[number, number]> = []
    const r = await inBloecken(['a'], async (_block, von, bis) => {
      bereiche.push([von, bis])
      const alle = Array.from({ length: 1500 }, (_, i) => ({ id: `z${i}` }))
      return { data: alle.slice(von, bis + 1), error: null }
    }, 300)

    expect(bereiche).toHaveLength(2)
    expect(r.ok && r.zeilen).toHaveLength(1500)
  })

  it('reicht einen Fehler durch, statt eine Teilmenge zu liefern', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `id-${i}`)
    let n = 0
    const r = await inBloecken(ids, async () => {
      n++
      return n === 2 ? { data: null, error: { message: 'weg' } } : { data: [], error: null }
    }, 300)

    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unerwartet')
    expect(r.error).toBe('weg')
  })

  it('kommt mit einer leeren Kennungsmenge zurecht', async () => {
    const hole = vi.fn()
    const r = await inBloecken([], hole)
    expect(r.ok && r.zeilen).toEqual([])
    expect(hole).not.toHaveBeenCalled()
  })
})
