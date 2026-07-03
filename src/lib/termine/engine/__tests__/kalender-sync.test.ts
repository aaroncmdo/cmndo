import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSummary, buildDescription, resolveTerminKontext, type KontextFelder } from '../kalender-kontext'
import { syncTerminToExternalCalendar, entferneTerminAusExternemKalender, type KalenderProvider } from '../kalender-sync'

const LEER: KontextFelder = {
  claimNummer: null, fahrzeugHersteller: null, fahrzeugModell: null, kennzeichen: null,
  kundeName: null, kundeTelefon: null, schadenortAdresse: null, fallId: null,
}

describe('buildSummary', () => {
  it('Fahrzeug + Kennzeichen + Ort + Claim-Nr', () => {
    const s = buildSummary({ ...LEER, fahrzeugHersteller: 'VW', fahrzeugModell: 'Golf', kennzeichen: 'K-AB 123', claimNummer: 'CL-1' }, 'Domkloster 4, Köln')
    expect(s).toBe('VW Golf (K-AB 123) — Domkloster 4, Köln · CL-1')
  })
  it('Fallback Schadenbesichtigung ohne Fahrzeug', () => {
    expect(buildSummary(LEER, null)).toBe('Schadenbesichtigung')
  })
})

describe('buildDescription', () => {
  it('enthält Kunde/Telefon/Adresse + Fallakte-Link nur bei fallId', () => {
    const d = buildDescription({ ...LEER, kundeName: 'Max M', kundeTelefon: '0151', fallId: 'f1' }, 'Köln', 'https://app.test')
    expect(d).toContain('Kunde: Max M')
    expect(d).toContain('Telefon: 0151')
    expect(d).toContain('Adresse: Köln')
    expect(d).toContain('Fallakte: https://app.test/gutachter/fall/f1')
  })
  it('kein Fallakte-Link ohne fallId (Lead-bezug)', () => {
    expect(buildDescription(LEER, null, 'https://app.test')).not.toContain('Fallakte:')
  })
})

describe('buildSummary — Beratungs- vs. Besichtigungs-Framing (typ)', () => {
  it('kb_beratung mit Kunde → "Beratungstermin — {Kunde}" statt Schadenbesichtigung', () => {
    const s = buildSummary({ ...LEER, kundeName: 'Max M', claimNummer: 'CL-1' }, null, 'kb_beratung')
    expect(s).toBe('Beratungstermin — Max M · CL-1')
  })
  it('kb_beratung ohne Kunde → "Beratungstermin"', () => {
    expect(buildSummary(LEER, null, 'kb_beratung')).toBe('Beratungstermin')
  })
  it('kb_beratung haengt keinen Vor-Ort-Ort an (telefonisch/Video)', () => {
    const s = buildSummary({ ...LEER, kundeName: 'Max M' }, 'Domkloster 4, Köln', 'kb_beratung')
    expect(s).toBe('Beratungstermin — Max M')
  })
  it('sv_begutachtung bleibt Fahrzeug-Framing (kein Regress am deployten SV-Sync)', () => {
    const s = buildSummary({ ...LEER, fahrzeugHersteller: 'VW', fahrzeugModell: 'Golf', kennzeichen: 'K-AB 123' }, 'Köln', 'sv_begutachtung')
    expect(s).toBe('VW Golf (K-AB 123) — Köln')
  })
  it('ohne typ (Legacy) unveraendert Schadenbesichtigung', () => {
    expect(buildSummary(LEER, null)).toBe('Schadenbesichtigung')
  })
})

describe('buildDescription — Beratungs-Framing', () => {
  it('kb_beratung → erste Zeile "Claimondo — Beratungstermin", keine Vor-Ort-Adresse', () => {
    const d = buildDescription({ ...LEER, kundeName: 'Max M', kundeTelefon: '0151', schadenortAdresse: 'Köln' }, null, 'https://app.test', 'kb_beratung')
    expect(d).toContain('Claimondo — Beratungstermin')
    expect(d).toContain('Kunde: Max M')
    expect(d).not.toContain('Adresse:')
  })
})

describe('resolveTerminKontext', () => {
  function stubDb(rows: Record<string, unknown>): SupabaseClient {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: function () { return this },
          maybeSingle: async () => ({ data: rows[table] ?? null }),
        }),
      }),
    } as unknown as SupabaseClient
  }

  it('lead-bezug → Felder + Location aus termin.besichtigungsort_adresse', async () => {
    const db = stubDb({ leads: { vorname: 'Max', nachname: 'M', telefon: '0151', kennzeichen: 'K-AB 1', fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf', besichtigungsort_adresse: 'Lead-Ort' } })
    const k = await resolveTerminKontext({ bezug_typ: 'lead', bezug_id: 'l1', besichtigungsort_adresse: 'Termin-Ort' }, db)
    expect(k.location).toBe('Termin-Ort')
    expect(k.summary).toContain('VW Golf')
    expect(k.description).toContain('Kunde: Max M')
  })

  it('kein bezug → generische Schadenbesichtigung', async () => {
    const db = stubDb({})
    const k = await resolveTerminKontext({ bezug_typ: null, bezug_id: null, besichtigungsort_adresse: null }, db)
    expect(k.summary).toBe('Schadenbesichtigung')
    expect(k.location).toBeUndefined()
  })

  it('kb_beratung-Termin (typ) → Beratungstermin-Summary mit Kunde', async () => {
    const db = stubDb({ leads: { vorname: 'Max', nachname: 'M', telefon: '0151' } })
    const k = await resolveTerminKontext({ bezug_typ: 'lead', bezug_id: 'l1', besichtigungsort_adresse: null, typ: 'kb_beratung' }, db)
    expect(k.summary).toContain('Beratungstermin')
    expect(k.summary).toContain('Max M')
  })
})

describe('syncTerminToExternalCalendar — Orchestrierung (Fake-Provider, kein I/O)', () => {
  function stubDbMitTermin(termin: Record<string, unknown> | null): SupabaseClient {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: function () { return this },
          maybeSingle: async () => ({ data: table === 'gutachter_termine' ? termin : null }),
        }),
      }),
    } as unknown as SupabaseClient
  }
  const fakeProvider = (status: 'created' | 'updated' | 'skip'): KalenderProvider => ({
    name: 'fake',
    upsert: async () => status,
    remove: async () => 'updated',
  })
  const aktiverTermin = {
    id: 't1', assignee_typ: 'sachverstaendiger', assignee_id: 'sv1', start_zeit: '2026-06-10T08:00:00Z',
    end_zeit: '2026-06-10T08:45:00Z', status: 'reserviert', bezug_typ: null, bezug_id: null,
    besichtigungsort_adresse: null, google_event_id: null, google_calendar_id: null,
    caldav_object_url: null, caldav_event_uid: null,
  }

  it('aktiver SV-Termin → Provider-Ergebnis durchgereicht', async () => {
    const r = await syncTerminToExternalCalendar('t1', { db: stubDbMitTermin(aktiverTermin), providers: [fakeProvider('created')] })
    expect(r.ok).toBe(true)
    expect(r.results.fake).toBe('created')
  })

  it('assignee-generisch: kundenbetreuer-Termin wird NICHT am Orchestrator geskippt (Provider entscheidet via Resolver)', async () => {
    let called = false
    const spy: KalenderProvider = { name: 'fake', upsert: async () => { called = true; return 'created' }, remove: async () => 'updated' }
    const r = await syncTerminToExternalCalendar('t1', { db: stubDbMitTermin({ ...aktiverTermin, assignee_typ: 'kundenbetreuer', assignee_id: 'p-kb' }), providers: [spy] })
    expect(called).toBe(true)
    expect(r.results.fake).toBe('created')
  })

  it('nicht-aktiver Status → skip', async () => {
    const r = await syncTerminToExternalCalendar('t1', { db: stubDbMitTermin({ ...aktiverTermin, status: 'abgesagt' }), providers: [fakeProvider('created')] })
    expect(r.results.fake).toBe('skip')
  })

  it('Termin nicht gefunden → ok:false', async () => {
    const r = await syncTerminToExternalCalendar('t1', { db: stubDbMitTermin(null), providers: [fakeProvider('created')] })
    expect(r.ok).toBe(false)
  })

  it('entfernen ruft provider.remove', async () => {
    const r = await entferneTerminAusExternemKalender('t1', { db: stubDbMitTermin(aktiverTermin), providers: [fakeProvider('skip')] })
    expect(r.results.fake).toBe('updated')
  })
})
