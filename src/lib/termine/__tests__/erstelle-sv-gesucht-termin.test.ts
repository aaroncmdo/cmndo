import { describe, it, expect } from 'vitest'
import { erstelleSvGesuchtTermin } from '../erstelle-sv-gesucht-termin'

// Thenable-Recorder-Stub: jeder awaited Builder (nach select/or/eq/not/limit ODER insert/select)
// konsumiert die naechste programmierte Antwort in Aufruf-Reihenfolge; insert-Payload gecaptured.
type Resp = { data?: unknown; error?: { message: string } | null }
function makeDb(script: Resp[]) {
  let i = 0
  const calls: Array<Record<string, unknown>> = []
  const next = (): Resp => script[i++] ?? { data: null, error: null }
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    calls,
    from(t: string) { calls.push({ from: t }); return b },
    select() { return b },
    insert(p: unknown) { calls.push({ insert: p }); return b },
    or() { return b },
    eq() { return b },
    not() { return b },
    limit() { return b },
    then(res: (v: Resp) => void) { res(next()) },
  })
  return b
}

describe('erstelleSvGesuchtTermin (T4)', () => {
  it('offener Termin existiert -> kein Insert, created:false', async () => {
    const db = makeDb([{ data: [{ id: 'bestehend', status: 'sv_gesucht' }], error: null }])
    const r = await erstelleSvGesuchtTermin(db as never, { claimId: 'c1', startIso: '2026-08-20T08:00:00Z' })
    expect(r.ok).toBe(true)
    expect(r.created).toBe(false)
    expect(r.terminId).toBe('bestehend')
    expect((db as { calls: Array<Record<string, unknown>> }).calls.some((c) => 'insert' in c)).toBe(false)
  })

  it('kein offener Termin -> Insert sv_gesucht/fall/kein-Assignee, created:true', async () => {
    const db = makeDb([
      { data: [], error: null }, // Idempotenz-Read: kein offener Termin
      { data: [{ id: 'neu' }], error: null }, // Insert
    ])
    const r = await erstelleSvGesuchtTermin(db as never, {
      claimId: 'c1',
      startIso: '2026-08-20T08:00:00Z',
      besichtigungsort: { adresse: 'Teststr. 1', lat: 52.5, lng: 13.4 },
    })
    expect(r.ok).toBe(true)
    expect(r.created).toBe(true)
    expect(r.terminId).toBe('neu')
    const ins = (db as { calls: Array<Record<string, unknown>> }).calls.find((c) => 'insert' in c)!.insert as Record<string, unknown>
    expect(ins.status).toBe('sv_gesucht')
    expect(ins.bezug_typ).toBe('fall')
    expect(ins.bezug_id).toBe('c1')
    expect(ins.typ).toBe('sv_begutachtung')
    expect(ins.start_zeit).toBe('2026-08-20T08:00:00Z')
    // end_zeit ist NOT NULL in der DB (Prod-Smoke-Fix 09.08.) — start + TERMIN_DAUER_MIN (40).
    expect(ins.end_zeit).toBe('2026-08-20T08:40:00.000Z')
    expect(ins.besichtigungsort_adresse).toBe('Teststr. 1')
    // kein Assignee — der wird erst bei der Dispatch-Zuweisung gesetzt.
    expect('assignee_typ' in ins).toBe(false)
    expect('assignee_id' in ins).toBe(false)
  })

  it('Insert-Fehler -> ok:false', async () => {
    const db = makeDb([
      { data: [], error: null },
      { data: null, error: { message: 'insert kaputt' } },
    ])
    const r = await erstelleSvGesuchtTermin(db as never, { claimId: 'c1', startIso: '2026-08-20T08:00:00Z' })
    expect(r.ok).toBe(false)
    expect(r.created).toBe(false)
  })
})
