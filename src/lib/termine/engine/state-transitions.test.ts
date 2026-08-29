import { describe, it, expect } from 'vitest'
import { sageAb, verlege, entscheideVerlegung, reassigniereDeadPin, weiseSvGesuchtZu } from './state-transitions'

// Schlanker thenable-Recorder-Stub fuer den supabase-Query-Builder: jeder Terminal
// (maybeSingle/single ODER ein awaited Builder nach select/eq) konsumiert die naechste
// programmierte Antwort in Aufruf-Reihenfolge. update/insert-Payloads werden gecaptured.
// Die DB-Transition-Ops sind ansonsten live verifiziert (verify-engine-p2-3c-transitions.mts).
type Resp = { data?: unknown; error?: { code?: string; message: string } | null }
function makeDb(script: Resp[]) {
  let i = 0
  const calls: Array<Record<string, unknown>> = []
  const next = (): Resp => script[i++] ?? { data: null, error: null }
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    calls,
    from(t: string) { calls.push({ from: t }); return b },
    select() { return b },
    update(p: unknown) { calls.push({ update: p }); return b },
    insert(p: unknown) { calls.push({ insert: p }); return b },
    eq() { return b },
    in() { return b },
    maybeSingle() { return Promise.resolve(next()) },
    single() { return Promise.resolve(next()) },
    then(res: (v: Resp) => void) { res(next()) }, // Builder ist awaitable -> Terminal
  })
  return b
}

describe('sageAb', () => {
  it('setzt abgesagt + cancelled_at + grund wenn aktiv', async () => {
    const db = makeDb([{ data: [{ id: 't1' }], error: null }])
    const r = await sageAb('t1', { grund: 'kein Bedarf', db: db as never })
    expect(r.ok).toBe(true)
    const upd = (db as { calls: Array<Record<string, unknown>> }).calls.find((c) => 'update' in c)!.update as Record<string, unknown>
    expect(upd.status).toBe('abgesagt')
    expect(upd.cancelled_at).toBeTypeOf('string')
    expect(upd.ablehnungsgrund).toBe('kein Bedarf')
  })
  it('nicht_aktiv wenn kein Row getroffen', async () => {
    const db = makeDb([{ data: [], error: null }])
    const r = await sageAb('t1', { db: db as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('nicht_aktiv')
  })
  it('status-Option storniert wird durchgereicht', async () => {
    const db = makeDb([{ data: [{ id: 't1' }], error: null }])
    await sageAb('t1', { status: 'storniert', db: db as never })
    const upd = (db as { calls: Array<Record<string, unknown>> }).calls.find((c) => 'update' in c)!.update as Record<string, unknown>
    expect(upd.status).toBe('storniert')
  })
})

describe('verlege', () => {
  it('propose: alt -> verlegt, neuer Slot verlegung_pending', async () => {
    const db = makeDb([
      { data: { id: 'alt', assignee_id: 's', assignee_typ: 'sachverstaendiger', status: 'bestaetigt' }, error: null }, // load alt
      { data: [{ id: 'alt' }], error: null }, // alt update
      { data: { id: 'neu' }, error: null }, // insert single
    ])
    const r = await verlege('alt', { neuVon: '2099-01-01T09:00:00Z', neuBis: '2099-01-01T10:00:00Z', db: db as never })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.neuerTerminId).toBe('neu')
    const calls = (db as { calls: Array<Record<string, unknown>> }).calls
    const altUpd = calls.find((c) => 'update' in c)!.update as Record<string, unknown>
    expect(altUpd.status).toBe('verlegt')
    expect(altUpd.cancelled_at).toBeUndefined() // SV-Propose: alt bleibt blockiert (verlegt), NICHT gecancelt
    const ins = calls.find((c) => 'insert' in c)!.insert as Record<string, unknown>
    expect(ins.status).toBe('verlegung_pending')
    expect(ins.verlegung_quelle_id).toBe('alt')
    // CMM-49: assignee direkt aus alt geschrieben (statt sv_id + Normalize-Trigger)
    expect(ins.assignee_id).toBe('s')
    expect(ins.assignee_typ).toBe('sachverstaendiger')
    expect(ins.sv_id).toBeUndefined()
  })
  it('kunde-koenig: neuerStatus bestaetigt -> alt verschoben', async () => {
    const db = makeDb([
      { data: { id: 'alt', assignee_id: 's', assignee_typ: 'sachverstaendiger', status: 'bestaetigt' }, error: null },
      { data: [{ id: 'alt' }], error: null },
      { data: { id: 'neu' }, error: null },
    ])
    await verlege('alt', { neuVon: 'a', neuBis: 'b', neuerStatus: 'bestaetigt', initiatorKunde: true, db: db as never })
    const calls = (db as { calls: Array<Record<string, unknown>> }).calls
    const altUpd = calls.find((c) => 'update' in c)!.update as Record<string, unknown>
    expect(altUpd.status).toBe('verschoben')
    expect(altUpd.cancelled_at).toBeTypeOf('string') // Geist-Fix: terminales 'verschoben' MUSS cancelled_at setzen (sonst Geist in cancelled_at-gefilterten Listen)
    expect(altUpd.verlegung_initiator_kunde).toBe(true)
  })
  it('alt nicht aktiv -> Fehler', async () => {
    const db = makeDb([{ data: { id: 'alt', status: 'abgesagt' }, error: null }])
    const r = await verlege('alt', { neuVon: 'a', neuBis: 'b', db: db as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('alt_nicht_aktiv')
  })
  it('23P01 beim Insert -> belegt + Rollback alt', async () => {
    const db = makeDb([
      { data: { id: 'alt', assignee_id: 's', assignee_typ: 'sachverstaendiger', status: 'bestaetigt' }, error: null },
      { data: [{ id: 'alt' }], error: null },
      { data: null, error: { code: '23P01', message: 'exclusion' } }, // insert kollidiert
      { data: null, error: null }, // rollback update
    ])
    const r = await verlege('alt', { neuVon: 'a', neuBis: 'b', db: db as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('belegt')
  })
  it('kunde-koenig Rollback nullt cancelled_at bei Insert-Fail', async () => {
    const db = makeDb([
      { data: { id: 'alt', assignee_id: 's', assignee_typ: 'sachverstaendiger', status: 'bestaetigt' }, error: null },
      { data: [{ id: 'alt' }], error: null },
      { data: null, error: { code: '23P01', message: 'exclusion' } }, // insert kollidiert
      { data: null, error: null }, // rollback update
    ])
    const r = await verlege('alt', { neuVon: 'a', neuBis: 'b', neuerStatus: 'bestaetigt', db: db as never })
    expect(r.ok).toBe(false)
    const calls = (db as { calls: Array<Record<string, unknown>> }).calls
    const updates = calls.filter((c) => 'update' in c).map((c) => c.update as Record<string, unknown>)
    // Rollback (2. update) setzt Status zurueck UND nullt das gesetzte cancelled_at -> kein Geist nach Fail
    expect(updates[1].status).toBe('bestaetigt')
    expect(updates[1].cancelled_at).toBe(null)
  })
})

describe('entscheideVerlegung', () => {
  it('bestaetigen: neu -> bestaetigt, alt -> verschoben', async () => {
    const db = makeDb([
      { data: { id: 'neu', status: 'verlegung_pending', verlegung_quelle_id: 'alt' }, error: null }, // load
      { data: [{ id: 'neu' }], error: null }, // neu update
      { data: null, error: null }, // alt update
    ])
    const r = await entscheideVerlegung('neu', 'bestaetigen', { db: db as never })
    expect(r.ok).toBe(true)
    const calls = (db as { calls: Array<Record<string, unknown>> }).calls
    const updates = calls.filter((c) => 'update' in c).map((c) => c.update as Record<string, unknown>)
    expect(updates[0].status).toBe('bestaetigt')
    expect(updates[1].status).toBe('verschoben')
  })
  it('ablehnen: neu -> storniert, alt -> bestaetigt', async () => {
    const db = makeDb([
      { data: { id: 'neu', status: 'verlegung_pending', verlegung_quelle_id: 'alt' }, error: null },
      { data: [{ id: 'neu' }], error: null },
      { data: null, error: null },
    ])
    const r = await entscheideVerlegung('neu', 'ablehnen', { grund: 'passt nicht', db: db as never })
    expect(r.ok).toBe(true)
    const calls = (db as { calls: Array<Record<string, unknown>> }).calls
    const updates = calls.filter((c) => 'update' in c).map((c) => c.update as Record<string, unknown>)
    expect(updates[0].status).toBe('storniert')
    expect(updates[1].status).toBe('bestaetigt')
  })
  it('nicht pending -> Fehler', async () => {
    const db = makeDb([{ data: { id: 'neu', status: 'bestaetigt', verlegung_quelle_id: 'alt' }, error: null }])
    const r = await entscheideVerlegung('neu', 'bestaetigen', { db: db as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('nicht_pending')
  })
})

describe('reassigniereDeadPin', () => {
  it('flippt sv_lead/dispatch_pending -> partner/bestaetigt + nullt sv_lead_id', async () => {
    const db = makeDb([{ data: [{ id: 't1' }], error: null }])
    const r = await reassigniereDeadPin('t1', { partnerId: 'sv-9', db: db as never })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.terminId).toBe('t1')
    const upd = (db as { calls: Array<Record<string, unknown>> }).calls.find((c) => 'update' in c)!.update as Record<string, unknown>
    expect(upd.assignee_typ).toBe('sachverstaendiger')
    expect(upd.assignee_id).toBe('sv-9')
    expect(upd.sv_lead_id).toBe(null) // kein Dead-Pin mehr -> Legacy-FK nullen
    expect(upd.status).toBe('bestaetigt')
  })
  it('neuerStatus reserviert wird durchgereicht', async () => {
    const db = makeDb([{ data: [{ id: 't1' }], error: null }])
    await reassigniereDeadPin('t1', { partnerId: 'sv-9', neuerStatus: 'reserviert', db: db as never })
    const upd = (db as { calls: Array<Record<string, unknown>> }).calls.find((c) => 'update' in c)!.update as Record<string, unknown>
    expect(upd.status).toBe('reserviert')
  })
  it('23P01 (Partner zur Zeit belegt) -> belegt', async () => {
    const db = makeDb([{ data: null, error: { code: '23P01', message: 'exclusion' } }])
    const r = await reassigniereDeadPin('t1', { partnerId: 'sv-9', db: db as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('belegt')
  })
  it('kein Treffer (nicht mehr dispatch_pending) -> nicht_dispatch_pending', async () => {
    const db = makeDb([{ data: [], error: null }])
    const r = await reassigniereDeadPin('t1', { partnerId: 'sv-9', db: db as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('nicht_dispatch_pending')
  })
})

describe('weiseSvGesuchtZu (T4)', () => {
  it('flippt sv_gesucht -> partner/bestaetigt, KEIN sv_lead_id-Touch', async () => {
    const db = makeDb([{ data: [{ id: 't1' }], error: null }])
    const r = await weiseSvGesuchtZu('t1', { partnerId: 'sv-9', db: db as never })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.terminId).toBe('t1')
    const upd = (db as { calls: Array<Record<string, unknown>> }).calls.find((c) => 'update' in c)!.update as Record<string, unknown>
    expect(upd.assignee_typ).toBe('sachverstaendiger')
    expect(upd.assignee_id).toBe('sv-9')
    expect(upd.status).toBe('bestaetigt')
    // sv_gesucht hatte nie einen sv_lead-Assignee -> die Zuweisung fasst sv_lead_id NICHT an.
    expect('sv_lead_id' in upd).toBe(false)
  })
  it('neuerStatus reserviert wird durchgereicht', async () => {
    const db = makeDb([{ data: [{ id: 't1' }], error: null }])
    await weiseSvGesuchtZu('t1', { partnerId: 'sv-9', neuerStatus: 'reserviert', db: db as never })
    const upd = (db as { calls: Array<Record<string, unknown>> }).calls.find((c) => 'update' in c)!.update as Record<string, unknown>
    expect(upd.status).toBe('reserviert')
  })
  it('23P01 (Partner zur Zeit belegt) -> belegt', async () => {
    const db = makeDb([{ data: null, error: { code: '23P01', message: 'exclusion' } }])
    const r = await weiseSvGesuchtZu('t1', { partnerId: 'sv-9', db: db as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('belegt')
  })
  it('kein Treffer (nicht mehr sv_gesucht) -> nicht_sv_gesucht', async () => {
    const db = makeDb([{ data: [], error: null }])
    const r = await weiseSvGesuchtZu('t1', { partnerId: 'sv-9', db: db as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('nicht_sv_gesucht')
  })
})

// ⭐⭐ Regel-4-Smoke 29.08.: Der neue Slot verlor bei einem BEZUG-NATIVEN Quell-Termin
// jeden Fallbezug — `verlege` las nur die Legacy-Spalten (NULL) und kopierte
// `bezug_typ`/`bezug_id` gar nicht. Folge: ein Waisen-Termin, den `bezugOrExpr()` nie
// findet; der Kunde sieht den Vorschlag nicht, der alte bleibt auf `verlegt` blockiert.
describe('verlege — der Fallbezug muss mitwandern', () => {
  const insertVon = (db: unknown) =>
    (db as { calls: Array<Record<string, unknown>> }).calls.find((c) => 'insert' in c)!.insert as Record<string, unknown>

  const skript = (alt: Record<string, unknown>) => makeDb([
    { data: { id: 'alt', assignee_id: 's', assignee_typ: 'sachverstaendiger', status: 'bestaetigt', ...alt }, error: null },
    { data: [{ id: 'alt' }], error: null },
    { data: { id: 'neu' }, error: null },
  ])

  it('bezug-nativer Quell-Termin: bezug_typ/bezug_id wandern mit', async () => {
    const db = skript({ bezug_typ: 'fall', bezug_id: 'f-1', fall_id: null, claim_id: null, lead_id: null })
    await verlege('alt', { neuVon: '2099-01-01T09:00:00Z', neuBis: '2099-01-01T10:00:00Z', db: db as never })
    const ins = insertVon(db)
    expect(ins.bezug_typ).toBe('fall')
    expect(ins.bezug_id).toBe('f-1')
  })

  it('der neue Slot ist NIE ohne jeden Bezug', async () => {
    const db = skript({ bezug_typ: 'fall', bezug_id: 'f-1', fall_id: null, claim_id: null, lead_id: null })
    await verlege('alt', { neuVon: '2099-01-01T09:00:00Z', neuBis: '2099-01-01T10:00:00Z', db: db as never })
    const ins = insertVon(db)
    const hatBezug = [ins.fall_id, ins.claim_id, ins.lead_id, ins.bezug_id].some((v) => v != null)
    expect(hatBezug, 'sonst findet bezugOrExpr() den Termin nie').toBe(true)
  })

  it('Legacy-Quell-Termin: fall_id/claim_id wandern weiterhin mit', async () => {
    const db = skript({ fall_id: 'f-2', claim_id: 'c-2', bezug_typ: null, bezug_id: null })
    await verlege('alt', { neuVon: '2099-01-01T09:00:00Z', neuBis: '2099-01-01T10:00:00Z', db: db as never })
    const ins = insertVon(db)
    expect(ins.fall_id).toBe('f-2')
    expect(ins.claim_id).toBe('c-2')
  })

  it('traegt der Quell-Termin BEIDE Achsen, bleiben auch beide erhalten', async () => {
    const db = skript({ fall_id: 'f-3', claim_id: 'c-3', bezug_typ: 'fall', bezug_id: 'f-3' })
    await verlege('alt', { neuVon: '2099-01-01T09:00:00Z', neuBis: '2099-01-01T10:00:00Z', db: db as never })
    const ins = insertVon(db)
    expect([ins.fall_id, ins.claim_id, ins.bezug_typ, ins.bezug_id]).toEqual(['f-3', 'c-3', 'fall', 'f-3'])
  })
})
