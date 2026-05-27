// CMM-44 Claim-Phasen-SSoT (P0 Task 2): Loader-Coverage fuer
// getClaimLifecycleForClaim. Der Loader baut den ClaimLifecycleInput aus den drei
// Sub-Entities zusammen und delegiert an die (separat getestete) reine
// getClaimLifecycle. Getestet wird hier die ASSEMBLY-Logik:
//   - lead nur wenn faelle.lead_id gesetzt UND leads-Row existiert (zwei Guards)
//   - onboarding_complete kommt aus faelle (nicht leads)
//   - auftraege/kanzleiFall werden durchgereicht + im Bundle zurueckgegeben
//   - Delegation an getClaimLifecycle liefert die korrekte Phase
//
// getAlleAuftraege / getKanzleiFall werden gemockt (kein DB-Zugriff); der
// faelle/leads-Read laeuft ueber einen Fake-SupabaseClient. getClaimLifecycle
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

describe('getClaimLifecycleForClaim — Input-Assembly', () => {
  it('baut lead aus leads-Row + faelle.onboarding_complete und delegiert (erfassung/vollmacht_offen)', async () => {
    const admin = fakeAdmin({
      faelle: { lead_id: 'lead-1', onboarding_complete: false },
      leads: { sa_unterschrieben: true, vollmacht_signiert_am: null },
    })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('erfassung')
    expect(r.lifecycle.subPhase).toBe('vollmacht_offen')
  })

  it('lead bleibt null wenn faelle.lead_id null ist -> Fallback erfassung/sa_offen', async () => {
    const admin = fakeAdmin({ faelle: { lead_id: null, onboarding_complete: null }, leads: null })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('erfassung')
    expect(r.lifecycle.subPhase).toBe('sa_offen')
  })

  it('lead bleibt null wenn lead_id gesetzt, aber die leads-Row fehlt', async () => {
    const admin = fakeAdmin({ faelle: { lead_id: 'lead-weg', onboarding_complete: null }, leads: null })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('erfassung')
    expect(r.lifecycle.subPhase).toBe('sa_offen')
  })

  it('delegiert an getClaimLifecycle: aktiver Erstgutachten-Auftrag -> begutachtung/termin', async () => {
    vi.mocked(getAlleAuftraege).mockResolvedValue([erstgutachtenTermin])
    const admin = fakeAdmin({
      faelle: { lead_id: 'lead-1', onboarding_complete: true },
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
      faelle: { lead_id: 'lead-1', onboarding_complete: true },
      leads: { sa_unterschrieben: true, vollmacht_signiert_am: TS },
    })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('regulierung')
  })

  it('CMM-44 MP-3: claims.status terminal (storniert) -> abschluss (Loader liest + reicht claimStatus durch)', async () => {
    const admin = fakeAdmin({
      faelle: { lead_id: 'lead-1', onboarding_complete: true },
      leads: { sa_unterschrieben: true, vollmacht_signiert_am: TS },
      claims: { status: 'storniert' },
    })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.lifecycle.mainPhase).toBe('abschluss')
    expect(r.lifecycle.subPhase).toBe('storniert')
  })

  it('reicht auftraege + kanzleiFall unveraendert ins Bundle durch (kein Doppel-Load fuer Detail-Pages)', async () => {
    vi.mocked(getAlleAuftraege).mockResolvedValue([erstgutachtenTermin])
    vi.mocked(getKanzleiFall).mockResolvedValue(kanzleiVk)
    const admin = fakeAdmin({ faelle: { lead_id: null, onboarding_complete: null }, leads: null })
    const r = await getClaimLifecycleForClaim(admin, 'fall-1')
    expect(r.auftraege).toEqual([erstgutachtenTermin])
    expect(r.kanzleiFall).toEqual(kanzleiVk)
  })
})
