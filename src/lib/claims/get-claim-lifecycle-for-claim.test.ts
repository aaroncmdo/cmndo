// CMM-44 Claim-Phasen-SSoT (P0 Task 2): Loader-Coverage fuer
// getClaimLifecycleForClaim. Der Loader baut den ClaimLifecycleInput aus den drei
// Sub-Entities zusammen und delegiert an die (separat getestete) reine
// getClaimLifecycle. Getestet wird hier die ASSEMBLY-Logik:
//   - MP-8b: Claim via faelle.claim_id aufgeloest; status + lead_id aus dem CLAIM
//   - lead nur wenn claims.lead_id gesetzt UND leads-Row existiert (zwei Guards)
//   - auftraege/kanzleiFall werden durchgereicht + im Bundle zurueckgegeben
//   - Delegation an getClaimLifecycle liefert die korrekte Phase
//
// getAlleAuftraege / getKanzleiFall werden gemockt (kein DB-Zugriff); der
// faelle/claims/leads-Read laeuft ueber einen Fake-SupabaseClient. getClaimLifecycle
// bleibt REAL (Delegation wird echt geprueft).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuftragRow } from '@/lib/auftrag/queries'
import type { KanzleiFallRow } from '@/lib/kanzlei-fall/queries'

vi.mock('@/lib/auftrag/queries', () => ({ getAlleAuftraege: vi.fn() }))
vi.mock('@/lib/kanzlei-fall/queries', () => ({ getKanzleiFall: vi.fn() }))

import { getClaimLifecycleForClaim } from './get-claim-lifecycle-for-claim'
import { getAlleAuftraege } from '@/lib/auftrag/queries'
import { getKanzleiFall } from '@/lib/kanzlei-fall/queries'

const TS = '2026-05-01T10:00:00.000Z'

/** Fake-Client: liefert pro Tabelle eine feste Row (oder null) ueber die
 *  .from().select().eq().maybeSingle()-Kette die der Loader nutzt. */
function fakeAdmin(byTable: Record<string, Record<string, unknown> | null>): SupabaseClient {
  const make = (table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.maybeSingle = async () => ({ data: byTable[table] ?? null, error: null })
    return builder
  }
  return { from: (table: string) => make(table) } as unknown as SupabaseClient
}

const erstgutachtenTermin: AuftragRow = {
  id: 'a1', fall_id: 'fall-1', sv_id: 'sv-1', typ: 'erstgutachten', status: 'termin',
  reihenfolge: 1, vorheriger_auftrag_id: null, gutachten_url: null,
  gutachten_final_freigegeben: false, abgeschlossen_am: null, zurueckweisung_grund: null,
  zurueckgewiesen_am: null, erstellt_am: TS, updated_at: TS,
}
const kanzleiVk: KanzleiFallRow = {
  id: 'kf1', fall_id: 'fall-1', status: 'versicherungskontakt', vs_kontakt_am: TS,
  ausgezahlt_am: null, erstellt_am: TS, updated_at: TS,
  lexdrive_case_id: 'LX-1', // CMM-44 MP-3: triggert regulierung-Eintritt (B-10)
}

beforeEach(() => {
  vi.mocked(getAlleAuftraege).mockReset()
  vi.mocked(getKanzleiFall).mockReset()
  vi.mocked(getAlleAuftraege).mockResolvedValue([])
  vi.mocked(getKanzleiFall).mockResolvedValue(null)
})

describe('getClaimLifecycleForClaim — Input-Assembly (MP-8b: claims-zentrisch)', () => {
  it('baut lead aus leads-Row (via claims.lead_id) und delegiert (erfassung/vollmacht_offen)', async () => {
    const admin = fakeAdmin({
      faelle: { claim_id: 'claim-1' },
      claims: { status: null, lead_id: 'lead-1' },
      leads: { sa_unterschrieben: true, vollmacht_signiert_am: null },
    })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('erfassung')
    expect(r.lifecycle.subPhase).toBe('vollmacht_offen')
  })

  it('lead bleibt null wenn claims.lead_id null ist -> Fallback erfassung/sa_offen', async () => {
    const admin = fakeAdmin({ faelle: { claim_id: 'claim-1' }, claims: { status: null, lead_id: null }, leads: null })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('erfassung')
    expect(r.lifecycle.subPhase).toBe('sa_offen')
  })

  it('lead bleibt null wenn lead_id gesetzt, aber die leads-Row fehlt', async () => {
    const admin = fakeAdmin({ faelle: { claim_id: 'claim-1' }, claims: { status: null, lead_id: 'lead-weg' }, leads: null })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('erfassung')
    expect(r.lifecycle.subPhase).toBe('sa_offen')
  })

  it('delegiert an getClaimLifecycle: aktiver Erstgutachten-Auftrag -> begutachtung/termin', async () => {
    vi.mocked(getAlleAuftraege).mockResolvedValue([erstgutachtenTermin])
    const admin = fakeAdmin({
      faelle: { claim_id: 'claim-1' },
      claims: { status: null, lead_id: 'lead-1' },
      leads: { sa_unterschrieben: true, vollmacht_signiert_am: TS },
    })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('begutachtung')
    expect(r.lifecycle.subPhase).toBe('termin')
  })

  it('Kanzlei-Vorrang: Erstgutachten aktiv + Kanzleifall -> regulierung (Prioritaet)', async () => {
    vi.mocked(getAlleAuftraege).mockResolvedValue([erstgutachtenTermin])
    vi.mocked(getKanzleiFall).mockResolvedValue(kanzleiVk)
    const admin = fakeAdmin({
      faelle: { claim_id: 'claim-1' },
      claims: { status: null, lead_id: 'lead-1' },
      leads: { sa_unterschrieben: true, vollmacht_signiert_am: TS },
    })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('regulierung')
  })

  it('claims.status terminal (storniert) -> abschluss (Loader liest Status aus dem Claim)', async () => {
    const admin = fakeAdmin({
      faelle: { claim_id: 'claim-1' },
      claims: { status: 'storniert', lead_id: 'lead-1' },
      leads: { sa_unterschrieben: true, vollmacht_signiert_am: TS },
    })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('abschluss')
    expect(r.lifecycle.subPhase).toBe('storniert')
  })

  it('AAR-939: reicht claims.service_typ als lifecycle.serviceTyp durch (Stepper-Sicht-Filter)', async () => {
    const admin = fakeAdmin({
      faelle: { claim_id: 'claim-1' },
      claims: { status: null, lead_id: 'lead-1', service_typ: 'nur_gutachter' },
      leads: { sa_unterschrieben: true, vollmacht_signiert_am: null },
    })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.serviceTyp).toBe('nur_gutachter')
  })

  it('AAR-939: serviceTyp = null wenn claims.service_typ fehlt', async () => {
    const admin = fakeAdmin({ faelle: { claim_id: 'claim-1' }, claims: { status: null, lead_id: null }, leads: null })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.serviceTyp).toBeNull()
  })

  it('reicht auftraege + kanzleiFall unveraendert ins Bundle durch (kein Doppel-Load fuer Detail-Pages)', async () => {
    vi.mocked(getAlleAuftraege).mockResolvedValue([erstgutachtenTermin])
    vi.mocked(getKanzleiFall).mockResolvedValue(kanzleiVk)
    const admin = fakeAdmin({ faelle: { claim_id: 'claim-1' }, claims: { status: null, lead_id: null }, leads: null })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.auftraege).toEqual([erstgutachtenTermin])
    expect(r.kanzleiFall).toEqual(kanzleiVk)
  })
})
