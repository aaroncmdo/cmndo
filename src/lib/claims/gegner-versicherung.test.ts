import { describe, it, expect, vi } from 'vitest'
import { resolveGegnerVersicherung } from './gegner-versicherung'

// Post-CMM-49 SSoT: die Gegner-Versicherung liegt kanonisch als
// claims/leads.gegner_versicherung_id -> versicherungen.name (+ Freitext-Fallback
// leads.gegner_versicherung), aufgeloest in v_claim_full.gegner_versicherung_name /
// .gegner_versicherung / .gegner_versicherungsnummer. Der alte Read
// (parteien where rolle='gegner') war doppelt tot: parteien ist leer + 'gegner'
// ist kein gueltiger partei_rolle-Enum-Wert -> lieferte immer '—'.

type Row = Record<string, unknown> | null
function makeDb(row: Row) {
  const spy: { table?: string; cols?: string; eqs: Array<[string, unknown]> } = { eqs: [] }
  const chain = {
    select: (cols: string) => {
      spy.cols = cols
      return chain
    },
    eq: (col: string, val: unknown) => {
      spy.eqs.push([col, val])
      return chain
    },
    maybeSingle: async () => ({ data: row, error: null }),
  }
  const db = {
    from: (t: string) => {
      spy.table = t
      return chain
    },
  }
  return { db: db as unknown as Parameters<typeof resolveGegnerVersicherung>[0], spy }
}

describe('resolveGegnerVersicherung', () => {
  it('bevorzugt den aufgeloesten Namen (gegner_versicherung_name)', async () => {
    const { db, spy } = makeDb({
      gegner_versicherung_name: 'Allianz Versicherungs-AG',
      gegner_versicherung: 'allianz (Freitext)',
      gegner_versicherungsnummer: 'AZ-4711',
    })
    const gv = await resolveGegnerVersicherung(db, { fallId: 'f1' })
    expect(gv).toEqual({ name: 'Allianz Versicherungs-AG', nummer: 'AZ-4711' })
    // liest die kanonische View per fall_id
    expect(spy.table).toBe('v_claim_full')
    expect(spy.eqs).toContainEqual(['fall_id', 'f1'])
  })

  it('faellt auf den Freitext zurueck wenn kein aufgeloester Name existiert', async () => {
    const { db } = makeDb({
      gegner_versicherung_name: null,
      gegner_versicherung: 'HUK-Coburg',
      gegner_versicherungsnummer: null,
    })
    const gv = await resolveGegnerVersicherung(db, { fallId: 'f1' })
    expect(gv).toEqual({ name: 'HUK-Coburg', nummer: null })
  })

  it('liefert {name:null,nummer:null} wenn nichts erfasst ist', async () => {
    const { db } = makeDb({ gegner_versicherung_name: null, gegner_versicherung: '  ', gegner_versicherungsnummer: null })
    expect(await resolveGegnerVersicherung(db, { fallId: 'f1' })).toEqual({ name: null, nummer: null })
  })

  it('liefert leer wenn kein Claim gefunden wird (data null)', async () => {
    const { db } = makeDb(null)
    expect(await resolveGegnerVersicherung(db, { fallId: 'f1' })).toEqual({ name: null, nummer: null })
  })

  it('unterstuetzt claimId (liest per id) wenn keine fallId', async () => {
    const { db, spy } = makeDb({ gegner_versicherung_name: 'VHV', gegner_versicherung: null, gegner_versicherungsnummer: '9' })
    const gv = await resolveGegnerVersicherung(db, { claimId: 'c1' })
    expect(gv).toEqual({ name: 'VHV', nummer: '9' })
    expect(spy.eqs).toContainEqual(['id', 'c1'])
  })

  it('macht KEINE Query ohne Key', async () => {
    const { db, spy } = makeDb({ gegner_versicherung_name: 'X' })
    const gv = await resolveGegnerVersicherung(db, {})
    expect(gv).toEqual({ name: null, nummer: null })
    expect(spy.table).toBeUndefined()
  })
})
