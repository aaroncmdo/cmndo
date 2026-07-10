import { describe, it, expect } from 'vitest'
import { zaehleZertifikate, ladeSvKandidaten, ladeMaklerKandidaten, ladeWerkstattKandidaten } from '../signals'

describe('zaehleZertifikate', () => {
  it('zaehlt nur vorhandene Nummern', () => {
    expect(zaehleZertifikate({ bvsk_mitgliedsnummer: 'X', dat_nummer: null, ihk_zertifikat_nummer: '', oebuv_bestellungsnummer: 'Y' })).toBe(2)
  })
})

describe('ladeSvKandidaten', () => {
  it('schliesst Testaccounts aus (Filter-Kette wird angewandt)', async () => {
    const calls: Record<string, unknown> = {}
    const svQuery = {
      select: function () { return this },
      is: function (col: string, val: unknown) { calls[`is:${col}`] = val; return this },
      eq: function (col: string, val: unknown) { calls[`eq:${col}`] = val; return this },
      not: function (col: string) { calls[`not:${col}`] = true; return this },
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    }
    const supabase = { from: () => svQuery } as unknown as Parameters<typeof ladeSvKandidaten>[0]
    const r = await ladeSvKandidaten(supabase)
    expect(r).toEqual([])
    expect(calls['eq:ist_testaccount']).toBe(false)
    expect(calls['is:geloescht_am']).toBeNull()
    expect(calls['is:gesperrt_seit']).toBeNull()
  })

  it('aggregiert volumen/no-show/reklamationen/rating und filtert assignee_typ', async () => {
    const eqCalls: Record<string, unknown> = {}
    const dataByTable: Record<string, unknown[]> = {
      sachverstaendige: [{ id: 'sv1', profile_id: 'p1', verifiziert: true, partner_seit: null, ablehnungen_30_tage: 0, oeffentlich_bestellt: false, bvsk_mitgliedsnummer: null, dat_nummer: null, ihk_zertifikat_nummer: null, oebuv_bestellungsnummer: null }],
      gutachter_termine: [
        { assignee_id: 'sv1', status: 'abgeschlossen', sv_no_show_am: null },
        { assignee_id: 'sv1', status: 'abgeschlossen', sv_no_show_am: null },
        { assignee_id: 'sv1', status: 'storniert', sv_no_show_am: '2026-01-01' },
      ],
      google_bewertungen_cache: [{ profile_id: 'p1', durchschnitt: 4.6, anzahl_bewertungen: 20 }],
      reklamationen: [{ sv_id: 'sv1' }],
    }
    const makeQuery = (table: string) => ({
      select: function () { return this },
      eq: function (col: string, val: unknown) { eqCalls[`${table}:${col}`] = val; return this },
      is: function () { return this },
      in: function () { return this },
      then: (resolve: (r: { data: unknown[]; error: null }) => void) => resolve({ data: dataByTable[table] ?? [], error: null }),
    })
    const supabase = { from: (t: string) => makeQuery(t) } as unknown as Parameters<typeof ladeSvKandidaten>[0]
    const r = await ladeSvKandidaten(supabase)
    expect(r).toHaveLength(1)
    expect(r[0].signals.volumen).toBe(2)                   // 2 abgeschlossen
    expect(r[0].signals.noShowQuote).toBeCloseTo(1 / 3)    // 1 no-show / 3 termine
    expect(r[0].signals.offeneReklamationen).toBe(1)
    expect(r[0].signals.ratingDurchschnitt).toBe(4.6)
    expect(r[0].signals.ratingAnzahl).toBe(20)
    expect(eqCalls['gutachter_termine:assignee_typ']).toBe('sachverstaendiger')
  })
})

describe('ladeMaklerKandidaten', () => {
  it('liest partner_provisionen (typ=makler) und aggregiert volumen', async () => {
    const eqCalls: Record<string, unknown> = {}
    const dataByTable: Record<string, unknown[]> = {
      makler: [{ id: 'm1', status: 'aktiv', aktiviert_am: null, gesperrt_am: null }],
      partner_provisionen: [
        { partner_id: 'm1', status: 'freigegeben' },
        { partner_id: 'm1', status: 'ausgezahlt' },
        { partner_id: 'm1', status: 'pending' },
      ],
    }
    const makeQuery = (table: string) => ({
      select: function () { return this },
      eq: function (col: string, val: unknown) { eqCalls[`${table}:${col}`] = val; return this },
      is: function () { return this },
      in: function () { return this },
      then: (resolve: (r: { data: unknown[]; error: null }) => void) => resolve({ data: dataByTable[table] ?? [], error: null }),
    })
    const supabase = { from: (t: string) => makeQuery(t) } as unknown as Parameters<typeof ladeMaklerKandidaten>[0]
    const r = await ladeMaklerKandidaten(supabase)
    expect(r).toHaveLength(1)
    expect(eqCalls['partner_provisionen:partner_typ']).toBe('makler') // typ-Filter ist Pflicht auf der Union-Tabelle
    expect(r[0].signals.volumen).toBe(2) // freigegeben + ausgezahlt; pending zaehlt nicht
    expect(r[0].signals.typ).toBe('makler')
  })
})

describe('ladeWerkstattKandidaten', () => {
  it('liest partner_provisionen (typ=werkstatt), filtert gesperrt_am und aggregiert volumen', async () => {
    const eqCalls: Record<string, unknown> = {}
    const isCalls: Record<string, unknown> = {}
    const dataByTable: Record<string, unknown[]> = {
      werkstaetten: [{ id: 'w1', status: 'aktiv', aktiviert_am: null, gesperrt_am: null }],
      partner_provisionen: [
        { partner_id: 'w1', status: 'freigegeben' },
        { partner_id: 'w1', status: 'ausgezahlt' },
        { partner_id: 'w1', status: 'pending' },
      ],
    }
    const makeQuery = (table: string) => ({
      select: function () { return this },
      eq: function (col: string, val: unknown) { eqCalls[`${table}:${col}`] = val; return this },
      is: function (col: string, val: unknown) { isCalls[`${table}:${col}`] = val; return this },
      in: function () { return this },
      then: (resolve: (r: { data: unknown[]; error: null }) => void) => resolve({ data: dataByTable[table] ?? [], error: null }),
    })
    const supabase = { from: (t: string) => makeQuery(t) } as unknown as Parameters<typeof ladeWerkstattKandidaten>[0]
    const r = await ladeWerkstattKandidaten(supabase)
    expect(r).toHaveLength(1)
    expect(eqCalls['partner_provisionen:partner_typ']).toBe('werkstatt') // typ-Filter Pflicht auf Union-Tabelle
    expect(isCalls['werkstaetten:gesperrt_am']).toBeNull()               // gesperrte Werkstaetten raus
    expect(r[0].signals.volumen).toBe(2)  // freigegeben + ausgezahlt; pending zaehlt nicht
    expect(r[0].signals.aktiv).toBe(true) // status=aktiv -> gate_ok
    expect(r[0].signals.typ).toBe('werkstatt')
  })
})
