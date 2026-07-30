// P2-T7 (K11): der anon-Finder-Owner-Seam — imNetzwerk = Freund des INJIZIERTEN Owners UND
// zahlend; ohne Injektion immer false. Owner wird nie session-abgeleitet.
import { describe, it, expect, vi } from 'vitest'

const svRow = (id: string) => ({
  id,
  paket: 'basic',
  profile_id: `prof-${id}`,
  standort_lat: 52.5,
  standort_lng: 13.4,
  standort_adresse: 'Teststr. 1, 10115 Berlin',
  spezifikationen: [],
  isochrone_polygon: { type: 'Polygon', coordinates: [] },
  gutachter_typ: null,
  paket_umkreis_km: null,
  qualifikationen_neu: [],
  schadenarten: [],
  oeffentlich_bestellt: false,
  bvsk_mitgliedsnummer: null,
  ihk_zertifikat_nummer: null,
  oebuv_bestellungsnummer: null,
  dat_nummer: null,
})

let svRows: unknown[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const make = (table: string) => {
      const c: any = {}
      for (const m of ['select', 'eq', 'is', 'not', 'in']) c[m] = () => c
      c.maybeSingle = () => Promise.resolve({ data: null, error: null })
      c.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === 'sachverstaendige' ? svRows : [], error: null }).then(res)
      return c
    }
    return { from: (t: string) => make(t) } as any
  },
}))
vi.mock('@/lib/partner-rang/get', () => ({
  getPartnerRangBatch: vi.fn(async () => new Map()),
}))
vi.mock('@/lib/netzwerk/entitlement', () => ({
  // sv-n zahlt (comped/aktiv), sv-f nicht.
  ladeZahlendeSvSet: vi.fn(async () => new Set(['sv-n'])),
}))
vi.mock('@/lib/netzwerk/freunde', () => ({
  ladeFreundKandidatIds: vi.fn(async () => new Set<string>()),
}))

import { ladeAktiveSVs } from '../gutachter-finder-actions'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'

describe('ladeAktiveSVs — Owner-Injektions-Seam (P2-T7, K11)', () => {
  it('mit injiziertem Owner: Freund UND zahlend -> imNetzwerk=true, sonst false', async () => {
    svRows = [svRow('sv-n'), svRow('sv-f')]
    // Owner ist mit BEIDEN befreundet — aber nur sv-n zahlt (Gate am SV).
    vi.mocked(ladeFreundKandidatIds).mockResolvedValueOnce(new Set(['sv-n', 'sv-f']))

    const res = await ladeAktiveSVs({ ownerProfilId: 'owner-1' })

    if (!res.ok) throw new Error(res.error)
    const byId = new Map(res.data.map((s) => [s.id, s]))
    expect(byId.get('sv-n')?.imNetzwerk).toBe(true)
    expect(byId.get('sv-f')?.imNetzwerk).toBe(false)
    // Global-Badge unabhaengig vom relationalen Flag:
    expect(byId.get('sv-n')?.istNetzwerkpartner).toBe(true)
    expect(byId.get('sv-f')?.istNetzwerkpartner).toBe(false)
    // Loader-Output traegt isochrone_polygon noch (der Trim passiert erst in page.tsx).
    expect(byId.get('sv-n')?.isochrone_polygon).toBeTruthy()
  })

  it('ohne Owner-Injektion: imNetzwerk ueberall false, kein Freund-Read', async () => {
    svRows = [svRow('sv-n'), svRow('sv-f')]
    vi.mocked(ladeFreundKandidatIds).mockClear()

    const res = await ladeAktiveSVs()

    if (!res.ok) throw new Error(res.error)
    expect(res.data.every((s) => s.imNetzwerk === false)).toBe(true)
    expect(ladeFreundKandidatIds).not.toHaveBeenCalled()
  })
})
