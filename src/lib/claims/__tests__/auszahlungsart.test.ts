import { describe, it, expect } from 'vitest'
import { setzeAuszahlungsart, istAuszahlungsart, AUSZAHLUNGSARTEN } from '../auszahlungsart'

/**
 * Handgeschriebener Doppelgaenger statt Mock-Harness: so laesst sich pruefen, ob ueberhaupt
 * ein UPDATE abgesetzt wurde — das ist bei einer Sperre die eigentliche Aussage.
 */
function fakeDb(opts: {
  gutachtenFertigAm?: string | null
  gutachtenLeseFehler?: string
  updateFehler?: string
  getroffeneZeilen?: number
}) {
  const updates: Record<string, unknown>[] = []
  const db = {
    from: (tabelle: string) => {
      if (tabelle === 'gutachten') {
        const kette = {
          select: () => kette,
          eq: () => kette,
          not: () => kette,
          order: () => kette,
          limit: () => kette,
          maybeSingle: () =>
            Promise.resolve(
              opts.gutachtenLeseFehler
                ? { data: null, error: { message: opts.gutachtenLeseFehler } }
                : { data: opts.gutachtenFertigAm ? { fertiggestellt_am: opts.gutachtenFertigAm } : null, error: null },
            ),
        }
        return kette
      }
      // claims
      return {
        update: (patch: Record<string, unknown>) => {
          updates.push(patch)
          return {
            eq: () => ({
              select: () =>
                Promise.resolve(
                  opts.updateFehler
                    ? { data: null, error: { message: opts.updateFehler } }
                    : { data: Array.from({ length: opts.getroffeneZeilen ?? 1 }, () => ({ id: 'c1' })), error: null },
                ),
            }),
          }
        },
      }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, updates }
}

describe('istAuszahlungsart', () => {
  it('akzeptiert genau die drei CHECK-Werte', () => {
    expect(AUSZAHLUNGSARTEN).toEqual(['reparatur', 'fiktiv', 'unentschieden'])
    for (const w of AUSZAHLUNGSARTEN) expect(istAuszahlungsart(w)).toBe(true)
  })
  it('lehnt alles andere ab', () => {
    for (const w of ['Reparatur', 'FIKTIV', '', null, undefined, 42, 'reparatur ']) {
      expect(istAuszahlungsart(w)).toBe(false)
    }
  })
})

describe('setzeAuszahlungsart', () => {
  it('setzt den Wert, solange kein fertiges Gutachten vorliegt', async () => {
    const { db, updates } = fakeDb({ gutachtenFertigAm: null })
    const res = await setzeAuszahlungsart(db, 'c1', 'fiktiv')
    expect(res).toEqual({ ok: true, wert: 'fiktiv' })
    expect(updates).toEqual([{ reparaturwunsch: 'fiktiv' }])
  })

  it('SPERRT, sobald das Gutachten fertiggestellt ist — und setzt gar kein UPDATE ab', async () => {
    // Die zentrale Zusage (Aaron 30.08.): „danach soll es nicht mehr aenderbar sein."
    const { db, updates } = fakeDb({ gutachtenFertigAm: '2026-08-30T10:00:00Z' })
    const res = await setzeAuszahlungsart(db, 'c1', 'reparatur')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.gesperrt).toBe(true)
    expect(updates).toEqual([]) // kein Schreibversuch
  })

  it('sperrt AUCH, wenn der Gutachten-Status nicht lesbar ist (fail-safe)', async () => {
    // Wer nicht weiss, ob ein Gutachten vorliegt, darf den Wert nicht ueberschreiben.
    const { db, updates } = fakeDb({ gutachtenLeseFehler: 'timeout' })
    const res = await setzeAuszahlungsart(db, 'c1', 'reparatur')
    expect(res.ok).toBe(false)
    expect(updates).toEqual([])
  })

  it('weist einen ungueltigen Wert ab, ohne die DB anzufassen', async () => {
    const { db, updates } = fakeDb({ gutachtenFertigAm: null })
    const res = await setzeAuszahlungsart(db, 'c1', 'irgendwas')
    expect(res.ok).toBe(false)
    expect(updates).toEqual([])
  })

  it('meldet einen 0-Zeilen-Treffer als Fehler statt Erfolg', async () => {
    // Ein UPDATE ohne Treffer liefert error=null — ohne .select()-Zaehlung saehe das aus wie Erfolg.
    const { db } = fakeDb({ gutachtenFertigAm: null, getroffeneZeilen: 0 })
    const res = await setzeAuszahlungsart(db, 'unbekannt', 'reparatur')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/nicht gefunden/i)
  })

  it('reicht einen Schreibfehler durch', async () => {
    const { db } = fakeDb({ gutachtenFertigAm: null, updateFehler: 'RLS' })
    const res = await setzeAuszahlungsart(db, 'c1', 'reparatur')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('RLS')
  })
})
