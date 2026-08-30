import { describe, it, expect, vi } from 'vitest'
import { spiegleQualiAufClaim } from '../spiegle-quali-auf-claim'

/**
 * Minimaler Fake statt des queue-basierten Harness der Nachbar-Tests: der Helper bekommt den
 * Client als Parameter, ein handgeschriebener Doppelgaenger ist hier praeziser — er laesst uns
 * den tatsaechlich abgesetzten UPDATE-Payload pruefen (das ist die eigentliche Zusage).
 */
function fakeDb(opts: {
  claim?: Record<string, unknown> | null
  leseFehler?: string
  schreibFehler?: string
}) {
  const updates: Record<string, unknown>[] = []
  const db = {
    from: (_tabelle: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(
              opts.leseFehler
                ? { data: null, error: { message: opts.leseFehler } }
                : { data: opts.claim ?? null, error: null },
            ),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch)
        return {
          eq: () =>
            Promise.resolve(
              opts.schreibFehler ? { error: { message: opts.schreibFehler } } : { error: null },
            ),
        }
      },
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, updates }
}

describe('spiegleQualiAufClaim', () => {
  it('setzt ein Feld, das am Claim NULL ist', async () => {
    const { db, updates } = fakeDb({ claim: { id: 'c1', schuldfrage: null, reparaturwunsch: null } })
    const res = await spiegleQualiAufClaim(db, 'lead-1', { schuldfrage: 'gegner' })
    expect(res.ok).toBe(true)
    expect(res.gespiegelt).toEqual(['schuldfrage'])
    expect(updates).toEqual([{ schuldfrage: 'gegner' }])
  })

  it('ueberschreibt NIEMALS einen am Claim bereits gesetzten Wert', async () => {
    // Die zentrale Sicherheitszusage: ein Dispatcher/SV kann den Wert bewusst korrigiert haben.
    const { db, updates } = fakeDb({ claim: { id: 'c1', schuldfrage: 'eigenverantwortung' } })
    const res = await spiegleQualiAufClaim(db, 'lead-1', { schuldfrage: 'gegner' })
    expect(res.ok).toBe(true)
    expect(res.gespiegelt).toEqual([])
    expect(updates).toEqual([]) // gar kein UPDATE abgesetzt
  })

  it('patcht nur die leeren Felder eines gemischten Satzes', async () => {
    const { db, updates } = fakeDb({
      claim: { id: 'c1', schuldfrage: 'gegner', reparaturwunsch: null, abrechnungsweg: null },
    })
    const res = await spiegleQualiAufClaim(db, 'lead-1', {
      schuldfrage: 'eigenverantwortung', // steht schon -> bleibt
      reparaturwunsch: 'fiktiv', // leer -> wird gesetzt
      abrechnungsweg: 'haftpflicht', // leer -> wird gesetzt
    })
    expect(res.gespiegelt.sort()).toEqual(['abrechnungsweg', 'reparaturwunsch'])
    expect(updates).toEqual([{ reparaturwunsch: 'fiktiv', abrechnungsweg: 'haftpflicht' }])
  })

  it('ist ein No-op, solange es keinen Claim gibt (lead-first)', async () => {
    const { db, updates } = fakeDb({ claim: null })
    const res = await spiegleQualiAufClaim(db, 'lead-1', { schuldfrage: 'gegner' })
    expect(res).toEqual({ ok: true, gespiegelt: [] })
    expect(updates).toEqual([])
  })

  it('ignoriert Felder, die der Caller nicht erhoben hat', async () => {
    const { db, updates } = fakeDb({ claim: { id: 'c1', schuldfrage: null } })
    const res = await spiegleQualiAufClaim(db, 'lead-1', {
      schuldfrage: undefined,
      reparaturwunsch: null,
    })
    expect(res.gespiegelt).toEqual([])
    expect(updates).toEqual([])
  })

  it('meldet einen Schreibfehler, statt Erfolg vorzutaeuschen', async () => {
    const { db } = fakeDb({ claim: { id: 'c1', schuldfrage: null }, schreibFehler: 'RLS' })
    const res = await spiegleQualiAufClaim(db, 'lead-1', { schuldfrage: 'gegner' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('RLS')
  })

  it('meldet einen Lesefehler', async () => {
    const { db } = fakeDb({ leseFehler: 'timeout' })
    const res = await spiegleQualiAufClaim(db, 'lead-1', { schuldfrage: 'gegner' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('timeout')
  })

  it('faellt bei einem leeren Wertesatz sofort durch, ohne die DB anzufassen', async () => {
    const from = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await spiegleQualiAufClaim({ from } as any, 'lead-1', {})
    expect(res).toEqual({ ok: true, gespiegelt: [] })
    expect(from).not.toHaveBeenCalled()
  })
})
