import { describe, it, expect, vi, beforeEach } from 'vitest'

// FM-Schaden lead-first Core-Plumbing (Aaron 23.07.). Der FM-Gutachter-Picker ist retired (§3) —
// getestet werden findeErsterfassungClaim, erstelleFlottenSchadenLead (bar + Dedup) und die
// Claim-Fortsetzung (flowLinkFuerClaimFortsetzung).

const state = {
  rows: {} as Record<string, unknown>,
  flowlink: { ok: true, token: 'flow-token-1', wiederverwendet: false } as
    | { ok: true; token: string; wiederverwendet: boolean }
    | { ok: false; error: string },
  firma: { id: 'firma-1', name: 'ACME' } as { id: string; name: string } | null,
  createdLead: { ok: true, leadId: 'lead-new' } as { ok: true; leadId: string } | { ok: false; error: string },
  createLeadCalls: [] as Array<{ base: Record<string, unknown>; extra: Record<string, unknown> }>,
}

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    eq: () => b,
    gt: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: state.rows[table] ?? null, error: null }),
  }
  return b
}

// 'server-only' wirft im vitest-Node-Kontext (kein RSC-Build) — neutralisieren.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: async () => state.flowlink,
}))
vi.mock('@/lib/flotte/konto-firma', () => ({ getFlottenmanagerFirma: async () => state.firma }))
vi.mock('@/lib/leads/create-lead', () => ({
  createLead: async (_db: unknown, base: Record<string, unknown>, extra: Record<string, unknown>) => {
    state.createLeadCalls.push({ base, extra })
    return state.createdLead
  },
}))

beforeEach(() => {
  state.rows = {}
  state.flowlink = { ok: true, token: 'flow-token-1', wiederverwendet: false }
  state.firma = { id: 'firma-1', name: 'ACME' }
  state.createdLead = { ok: true, leadId: 'lead-new' }
  state.createLeadCalls = []
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

  it('barer Lead (KEIN schuldfrage) + Fahrzeug-Prefill + FlowLink-Token, kein Upfront-Claim', async () => {
    state.rows.flotten_fahrzeuge = { id: 'ff-1' }
    state.rows.leads = null // §0-Dedup: kein frischer Lead
    // Fahrzeug-Stammdaten, die auf den Lead gemappt werden sollen.
    state.rows.vehicles = {
      kennzeichen_aktuell: 'B-XX-123',
      hersteller: 'BMW',
      modell_haupttyp: '320d',
      fin: 'WBA12345678901234',
      hsn: '0005',
      tsn: 'ABC',
      farbe_klartext: 'schwarz',
    }
    const { erstelleFlottenSchadenLead } = await import('./schaden-fortsetzung')
    const res = await erstelleFlottenSchadenLead({ vehicleId: 'veh-1', userId: 'u' })
    expect(res).toEqual({ ok: true, token: 'flow-token-1' })
    // Basis + Fahrzeug-Prefill (Stammdaten aus vehicles auf die lead.fahrzeug_*-Spalten gemappt).
    expect(state.createLeadCalls[0].extra).toMatchObject({
      vehicle_id: 'veh-1',
      firma_name: 'ACME',
      gewerbe_flag: true,
      kennzeichen: 'B-XX-123',
      fahrzeug_hersteller: 'BMW',
      fahrzeug_modell: '320d',
      fin: 'WBA12345678901234',
      hsn: '0005',
      tsn: 'ABC',
      fahrzeug_farbe: 'schwarz',
    })
    // Spec §2a: KEIN schaden-spezifisches Feld vorgesetzt (schuldfrage bleibt bar → /flow-Quali).
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

describe('flowLinkFuerClaimFortsetzung (§2d Resume)', () => {
  it('kein Claim / kein lead_id -> Fehler', async () => {
    state.rows.claims = null
    const { flowLinkFuerClaimFortsetzung } = await import('./schaden-fortsetzung')
    expect(await flowLinkFuerClaimFortsetzung('claim-x', 'u')).toEqual({ ok: false, error: 'Kein Zugriff auf diesen Schaden.' })
  })

  it('kein aktives FM-Konto der Firma -> Fehler', async () => {
    state.rows.claims = { lead_id: 'lead-1', vehicle_id: 'veh-1' }
    state.rows.flotten_fahrzeuge = { firma_id: 'firma-1' }
    state.rows.firmen_flotten_konten = null // Auth faellt durch
    const { flowLinkFuerClaimFortsetzung } = await import('./schaden-fortsetzung')
    const res = await flowLinkFuerClaimFortsetzung('claim-1', 'fremder')
    expect(res.ok).toBe(false)
  })

  it('berechtigt -> FlowLink-Token', async () => {
    state.rows.claims = { lead_id: 'lead-1', vehicle_id: 'veh-1' }
    state.rows.flotten_fahrzeuge = { firma_id: 'firma-1' }
    state.rows.firmen_flotten_konten = { id: 'konto-1' }
    const { flowLinkFuerClaimFortsetzung } = await import('./schaden-fortsetzung')
    expect(await flowLinkFuerClaimFortsetzung('claim-1', 'user-1')).toEqual({ ok: true, token: 'flow-token-1' })
  })
})
