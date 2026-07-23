import { describe, it, expect, vi, beforeEach } from 'vitest'

// T5.1 (operativer-schaden-flow): FM-Schaden-Fortsetzung Core-Plumbing.

const state = {
  rows: {} as Record<string, unknown>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  geo: null as { lat: number; lng: number; adresse: string } | null,
  flowlink: { ok: true, token: 'flow-token-1', wiederverwendet: false } as
    | { ok: true; token: string; wiederverwendet: boolean }
    | { ok: false; error: string },
  matching: { kind: 'fallback', deadPins: [] } as unknown,
  // FU3
  firma: { id: 'firma-1', name: 'ACME' } as { id: string; name: string } | null,
  createdLead: { ok: true, leadId: 'lead-new' } as { ok: true; leadId: string } | { ok: false; error: string },
  convertResult: { ok: true, claimId: 'claim-new', fallId: 'fall-new' } as
    | { ok: true; claimId: string; fallId: string }
    | { ok: false; error: string },
  createLeadCalls: [] as Array<{ base: Record<string, unknown>; extra: Record<string, unknown> }>,
}

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    eq: () => b,
    is: () => b,
    gt: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: state.rows[table] ?? null, error: null }),
    insert: (row: Record<string, unknown>) => {
      state.inserts.push({ table, row })
      return Promise.resolve({ error: null })
    },
    update: (patch: Record<string, unknown>) => {
      state.updates.push({ table, patch })
      return { eq: async () => ({ error: null }) }
    },
  }
  return b
}

// 'server-only' wirft im vitest-Node-Kontext (kein RSC-Build) — neutralisieren.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('@/lib/termine/engine/geocode', () => ({ geocodeMitFallback: async () => state.geo }))
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: async () => state.flowlink,
}))
vi.mock('@/lib/sv-matching-modul', () => ({ planeTerminMitFallback: async () => state.matching }))
vi.mock('@/lib/flotte/konto-firma', () => ({ getFlottenmanagerFirma: async () => state.firma }))
vi.mock('@/lib/leads/create-lead', () => ({
  createLead: async (_db: unknown, base: Record<string, unknown>, extra: Record<string, unknown>) => {
    state.createLeadCalls.push({ base, extra })
    return state.createdLead
  },
}))
vi.mock('@/lib/leads/convert-lead-to-claim', () => ({ convertLeadToClaim: async () => state.convertResult }))

beforeEach(() => {
  state.rows = {}
  state.inserts = []
  state.updates = []
  state.geo = { lat: 52.5, lng: 13.4, adresse: 'Weg 1, 10000 Berlin' }
  state.flowlink = { ok: true, token: 'flow-token-1', wiederverwendet: false }
  state.matching = { kind: 'fallback', deadPins: [] }
  state.firma = { id: 'firma-1', name: 'ACME' }
  state.createdLead = { ok: true, leadId: 'lead-new' }
  state.convertResult = { ok: true, claimId: 'claim-new', fallId: 'fall-new' }
  state.createLeadCalls = []
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeSv = (over: Record<string, unknown> = {}): any => ({
  svId: 'sv-9',
  vorname: 'Max',
  profilbild: null,
  profilbeschreibung: 'Bio',
  bewertungDurchschnitt: 4.7,
  bewertungAnzahl: 12,
  distanzGerundet: 'ca. 10 km',
  istWunschterminFrei: true,
  istTopPartner: true,
  rang: 'gold',
  rangSinnsatz: 'Top-Partner',
  slots: [{ start: 's', end: 'e', matchType: 'nahe' }],
  ...over,
})

function seedHappyPath() {
  state.rows.claims = { id: 'claim-1', lead_id: 'lead-1', vehicle_id: 'veh-1' }
  state.rows.flotten_fahrzeuge = { firma_id: 'firma-1' }
  state.rows.firmen_flotten_konten = { id: 'konto-1' }
  state.rows.vehicles = { kennzeichen_aktuell: 'B-XY-1' }
  state.rows.firmen = { adresse_strasse: 'Weg 1', adresse_plz: '10000', adresse_ort: 'Berlin' }
  state.rows.leads = { firma_name: 'ACME', vorname: null, nachname: null, email: null, gegner_email: null, schadentyp: null }
  state.rows.gutachter_finder_anfragen = null
}

describe('projiziereKandidat', () => {
  it('projiziert die Picker-Felder (ohne Slots)', async () => {
    const { projiziereKandidat } = await import('./schaden-fortsetzung')
    const k = projiziereKandidat(fakeSv())
    expect(k).toEqual({
      svId: 'sv-9',
      vorname: 'Max',
      profilbild: null,
      profilbeschreibung: 'Bio',
      bewertungDurchschnitt: 4.7,
      bewertungAnzahl: 12,
      distanzGerundet: 'ca. 10 km',
      istTopPartner: true,
      rang: 'gold',
      rangSinnsatz: 'Top-Partner',
    })
    expect(k).not.toHaveProperty('slots')
  })
})

describe('ladeGutachterKandidaten', () => {
  it('partner: projiziert die zuständigen SVs', async () => {
    state.matching = { kind: 'partner', svs: [fakeSv(), fakeSv({ svId: 'sv-2' })] }
    const { ladeGutachterKandidaten } = await import('./schaden-fortsetzung')
    const res = await ladeGutachterKandidaten(52.5, 13.4)
    expect(res.kind).toBe('partner')
    expect(res.kandidaten.map((k) => k.svId)).toEqual(['sv-9', 'sv-2'])
  })
  it('fallback: keine Kandidaten', async () => {
    state.matching = { kind: 'fallback', deadPins: [{ deadPinId: 'd1' }] }
    const { ladeGutachterKandidaten } = await import('./schaden-fortsetzung')
    const res = await ladeGutachterKandidaten(52.5, 13.4)
    expect(res).toEqual({ kind: 'fallback', kandidaten: [] })
  })
})

describe('resolveSchadenFortsetzung — Auth-Guard', () => {
  it('kein Claim -> null', async () => {
    const { resolveSchadenFortsetzung } = await import('./schaden-fortsetzung')
    expect(await resolveSchadenFortsetzung('claim-x', 'user-1')).toBeNull()
  })
  it('kein aktives FM-Konto der Firma -> null', async () => {
    seedHappyPath()
    state.rows.firmen_flotten_konten = null // Auth faellt durch
    const { resolveSchadenFortsetzung } = await import('./schaden-fortsetzung')
    expect(await resolveSchadenFortsetzung('claim-1', 'fremder')).toBeNull()
  })
  it('berechtigt -> Kontext mit Default-Adresse', async () => {
    seedHappyPath()
    const { resolveSchadenFortsetzung } = await import('./schaden-fortsetzung')
    const ctx = await resolveSchadenFortsetzung('claim-1', 'user-1')
    expect(ctx).toMatchObject({ claimId: 'claim-1', leadId: 'lead-1', firmaId: 'firma-1', kennzeichen: 'B-XY-1' })
    expect(ctx?.defaultAdresse).toBe('Weg 1, 10000 Berlin')
  })
})

describe('findeErsterfassungClaim', () => {
  it('liefert die Claim-ID wenn ein ersterfassung-Claim existiert', async () => {
    state.rows.claims = { id: 'claim-77' }
    const { findeErsterfassungClaim } = await import('./schaden-fortsetzung')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createAdminClient } = (await import('@/lib/supabase/admin')) as any
    expect(await findeErsterfassungClaim(createAdminClient(), 'veh-1')).toBe('claim-77')
  })
  it('null wenn keiner existiert', async () => {
    state.rows.claims = null
    const { findeErsterfassungClaim } = await import('./schaden-fortsetzung')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createAdminClient } = (await import('@/lib/supabase/admin')) as any
    expect(await findeErsterfassungClaim(createAdminClient(), 'veh-1')).toBeNull()
  })
})

describe('waehleGutachterUndStarteFlow', () => {
  it('kein Zugriff -> Fehler', async () => {
    const { waehleGutachterUndStarteFlow } = await import('./schaden-fortsetzung')
    const res = await waehleGutachterUndStarteFlow({ claimId: 'x', userId: 'u', svId: 'sv-9', adresse: 'A', haftungstyp: 'haftpflicht' })
    expect(res).toEqual({ ok: false, error: 'Kein Zugriff auf diesen Schaden.' })
  })

  it('happy path: schreibt fahrzeug_standort, gfa-Back-Ref, liefert Token', async () => {
    seedHappyPath()
    const { waehleGutachterUndStarteFlow } = await import('./schaden-fortsetzung')
    const res = await waehleGutachterUndStarteFlow({
      claimId: 'claim-1',
      userId: 'user-1',
      svId: 'sv-9',
      adresse: 'Depot 1, 10000 Berlin',
      haftungstyp: 'haftpflicht',
    })
    expect(res).toEqual({ ok: true, token: 'flow-token-1' })

    // fahrzeug_standort (Besichtigungsort) auf den Lead geschrieben — NICHT unfallort
    const leadUpd = state.updates.find((u) => u.table === 'leads')
    expect(leadUpd?.patch).toMatchObject({ fahrzeug_standort_lat: 52.5, fahrzeug_standort_lng: 13.4 })
    expect(leadUpd?.patch).not.toHaveProperty('unfallort_lat')
    // FU1: haftpflicht -> schuldfrage 'gegner' (Haftpflicht-Weiche im /flow)
    expect(leadUpd?.patch).toMatchObject({ schuldfrage: 'gegner' })

    // gfa-Back-Reference angelegt (kein bestehender -> insert)
    const gfaIns = state.inserts.find((i) => i.table === 'gutachter_finder_anfragen')
    expect(gfaIns?.row).toMatchObject({
      zugeordneter_sv_id: 'sv-9',
      konvertiert_zu_lead_id: 'lead-1',
      status: 'konvertiert',
      matching_typ: 'partner',
    })
    // Pflichtfelder befuellt (vorname faellt auf firma_name zurueck)
    expect(gfaIns?.row.vorname).toBe('ACME')
    expect(gfaIns?.row.email).toBe('noreply@claimondo.de')
  })

  it('idempotent: bestehende gfa wird aktualisiert statt doppelt angelegt', async () => {
    seedHappyPath()
    state.rows.gutachter_finder_anfragen = { id: 'gfa-existing' }
    const { waehleGutachterUndStarteFlow } = await import('./schaden-fortsetzung')
    const res = await waehleGutachterUndStarteFlow({
      claimId: 'claim-1',
      userId: 'user-1',
      svId: 'sv-2',
      adresse: 'Depot 1',
      haftungstyp: 'haftpflicht',
    })
    expect(res.ok).toBe(true)
    expect(state.inserts.find((i) => i.table === 'gutachter_finder_anfragen')).toBeUndefined()
    const gfaUpd = state.updates.find((u) => u.table === 'gutachter_finder_anfragen')
    expect(gfaUpd?.patch).toMatchObject({ zugeordneter_sv_id: 'sv-2', matching_typ: 'partner' })
  })

  it('svId=null: kein gfa-Write, aber FlowLink (Dispatch weist SV zu)', async () => {
    seedHappyPath()
    const { waehleGutachterUndStarteFlow } = await import('./schaden-fortsetzung')
    const res = await waehleGutachterUndStarteFlow({
      claimId: 'claim-1',
      userId: 'user-1',
      svId: null,
      adresse: 'Depot 1',
      haftungstyp: 'haftpflicht',
    })
    expect(res).toEqual({ ok: true, token: 'flow-token-1' })
    expect(state.inserts.find((i) => i.table === 'gutachter_finder_anfragen')).toBeUndefined()
  })

  it('FU1: selbstverschuldet setzt schuldfrage = eigenverantwortung (Kasko-Weiche)', async () => {
    seedHappyPath()
    const { waehleGutachterUndStarteFlow } = await import('./schaden-fortsetzung')
    await waehleGutachterUndStarteFlow({
      claimId: 'claim-1',
      userId: 'user-1',
      svId: null,
      adresse: 'Depot 1',
      haftungstyp: 'selbstverschuldet',
    })
    const leadUpd = state.updates.find((u) => u.table === 'leads')
    expect(leadUpd?.patch).toMatchObject({ schuldfrage: 'eigenverantwortung' })
  })
})

describe('erstelleFlottenSchadenLead (lead-first)', () => {
  it('kein Flotten-Konto -> Fehler', async () => {
    state.firma = null
    const { erstelleFlottenSchadenLead } = await import('./schaden-fortsetzung')
    const res = await erstelleFlottenSchadenLead({ vehicleId: 'veh-1', userId: 'u' })
    expect(res).toEqual({ ok: false, error: 'Kein Flotten-Konto.' })
  })

  it('Fahrzeug fremd -> Fehler, kein createLead', async () => {
    state.rows.flotten_fahrzeuge = null // Ownership faellt durch
    const { erstelleFlottenSchadenLead } = await import('./schaden-fortsetzung')
    const res = await erstelleFlottenSchadenLead({ vehicleId: 'veh-x', userId: 'u' })
    expect(res.ok).toBe(false)
    expect(state.createLeadCalls).toHaveLength(0)
  })

  it('barer Lead (KEIN schuldfrage) + FlowLink-Token, kein Upfront-Claim', async () => {
    state.rows.flotten_fahrzeuge = { id: 'ff-1' }
    state.rows.leads = null // §0-Dedup: kein frischer Lead
    const { erstelleFlottenSchadenLead } = await import('./schaden-fortsetzung')
    const res = await erstelleFlottenSchadenLead({ vehicleId: 'veh-1', userId: 'u' })
    expect(res).toEqual({ ok: true, token: 'flow-token-1' })
    expect(state.createLeadCalls[0].extra).toMatchObject({ vehicle_id: 'veh-1', firma_name: 'ACME', gewerbe_flag: true })
    expect(state.createLeadCalls[0].extra).not.toHaveProperty('schuldfrage')
  })

  it('§0-Dedup: frischer flotte-manuell-Lead -> reuse, KEIN neuer createLead', async () => {
    state.rows.flotten_fahrzeuge = { id: 'ff-1' }
    state.rows.leads = { id: 'lead-recent' } // findRecentFlottenLead trifft
    const { erstelleFlottenSchadenLead } = await import('./schaden-fortsetzung')
    const res = await erstelleFlottenSchadenLead({ vehicleId: 'veh-1', userId: 'u' })
    expect(res).toEqual({ ok: true, token: 'flow-token-1' })
    expect(state.createLeadCalls).toHaveLength(0)
  })
})
