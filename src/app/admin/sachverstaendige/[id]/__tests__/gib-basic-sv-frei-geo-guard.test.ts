import { describe, it, expect, vi, beforeEach } from 'vitest'

// Gutachter-Onboarding-Audit (Befund #3): gibBasicSvFrei setzt ist_aktiv +
// portal_zugang + verifiziert -> map-sichtbar + dispatchbar. ABER die Karten-RLS
// (isochrone_polygon + lat/lng NOT NULL) und das Dispatch-Matching (Isochrone
// deckt Schadenort) filtern geo-lose SVs STILL raus. Ohne Guard wurde ein
// Basic-SV "freigeschaltet" und traf trotzdem 0 Leads. Self-Reg geocodet lat/lng
// nur best-effort und berechnet NIE eine Isochrone -> genau dieser Halbzustand.
//
// Guard: fehlen lat/lng -> blocken (kein Live). Fehlt nur die Isochrone ->
// aus den Koordinaten nachberechnen (heilen); schlaegt das fehl -> blocken.

type SvRow = {
  standort_lat: number | null
  standort_lng: number | null
  paket_umkreis_km: number | null
  isochrone_polygon: unknown
  standort_plz?: string | null
}

let cfg: {
  svRow: SvRow | null
  svReadError: { message: string } | null
  calc: () => Array<{ lat: number; lng: number }>
  // Referenzzeile aus plz_geo. null = PLZ unbekannt -> der Plausibilitaets-Guard
  // muss fail-open durchlassen (Luecke in der Referenztabelle darf nicht blocken).
  plzGeoRow: { lat: number; lng: number; ort: string } | null
}
let updateCapture: { sachverstaendige: Record<string, unknown> | null; tasks: Record<string, unknown> | null }
const calcSpy = vi.fn()

function makeUpdateChain(table: 'sachverstaendige' | 'tasks') {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
  }
  void table
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: 'sachverstaendige' | 'tasks' | 'pflichtdokumente' | 'plz_geo') => {
      // Tier-2-Doc-Query (sindTier2DocsGeprueft): select().eq().eq().in() → { data }.
      // Leer = keine gepruaeften Tier-2-Docs → Freischaltung setzt ausstehend+Frist.
      if (table === 'pflichtdokumente') {
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.eq = () => chain
        chain.in = () => Promise.resolve({ data: [] })
        return chain
      }
      // ⚠ EIGENER Zweig noetig: der generische Zweig unten liefert fuer JEDE Tabelle
      // cfg.svRow. Der Plausibilitaets-Guard bekaeme dann eine Zeile ohne .lat/.lng,
      // liefe ins Fail-open und waere ungetestet — der Lauf saehe trotzdem gruen aus.
      if (table === 'plz_geo') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cfg.plzGeoRow, error: null }) }) }),
        }
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cfg.svRow, error: cfg.svReadError }) }) }),
        update: (vals: Record<string, unknown>) => {
          updateCapture[table] = vals
          return makeUpdateChain(table)
        },
      }
    },
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: 'admin' } }) }) }),
    }),
  })),
}))

vi.mock('@/lib/isochrone/calculate-isochrone', () => ({
  calculateIsochrone: (...args: unknown[]) => {
    calcSpy(...args)
    return Promise.resolve().then(() => cfg.calc())
  },
  IsochroneError: class extends Error {},
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { gibBasicSvFrei } from '../verifizierung-actions'

beforeEach(() => {
  updateCapture = { sachverstaendige: null, tasks: null }
  calcSpy.mockReset()
  cfg = {
    svRow: { standort_lat: 51.25, standort_lng: 7.15, standort_plz: '42287', paket_umkreis_km: 25, isochrone_polygon: [{ lat: 51.2, lng: 7.1 }] },
    svReadError: null,
    calc: () => [{ lat: 51.2, lng: 7.1 }, { lat: 51.3, lng: 7.2 }, { lat: 51.1, lng: 7.0 }],
    // Wuppertal — passt zu 51.25/7.15 (wenige km), also plausibel.
    plzGeoRow: { lat: 51.256, lng: 7.15, ort: 'Wuppertal' },
  }
})

describe('gibBasicSvFrei — Go-Live-Geo-Guard', () => {
  it('blockt wenn Standort-Koordinaten fehlen (kein Flag-Flip)', async () => {
    cfg.svRow = { standort_lat: null, standort_lng: 7.15, paket_umkreis_km: 25, isochrone_polygon: null }
    const res = await gibBasicSvFrei('sv-1')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error?.toLowerCase()).toContain('koordinaten')
    expect(updateCapture.sachverstaendige).toBeNull() // keine Freigabe-Flags gesetzt
  })

  it('heilt fehlende Isochrone aus den Koordinaten und schaltet frei', async () => {
    cfg.svRow = { standort_lat: 51.25, standort_lng: 7.15, paket_umkreis_km: 25, isochrone_polygon: null }
    const res = await gibBasicSvFrei('sv-1')
    expect(res.success).toBe(true)
    expect(calcSpy).toHaveBeenCalledWith(51.25, 7.15, 25)
    const upd = updateCapture.sachverstaendige!
    expect(upd.verifiziert).toBe(true)
    expect(upd.ist_aktiv).toBe(true)
    expect(upd.portal_zugang_freigeschaltet).toBe(true)
    expect(upd.isochrone_polygon).toBeTruthy() // nachberechnet mitgeschrieben
  })

  it('blockt wenn die Isochrone-Nachberechnung fehlschlägt (kein Flag-Flip)', async () => {
    cfg.svRow = { standort_lat: 51.25, standort_lng: 7.15, paket_umkreis_km: 25, isochrone_polygon: null }
    cfg.calc = () => { throw new Error('mapbox down') }
    const res = await gibBasicSvFrei('sv-1')
    expect(res.success).toBe(false)
    expect(updateCapture.sachverstaendige).toBeNull()
  })

  it('Happy Path: Isochrone bereits vorhanden -> keine Neuberechnung, Flags gesetzt', async () => {
    const res = await gibBasicSvFrei('sv-1')
    expect(res.success).toBe(true)
    expect(calcSpy).not.toHaveBeenCalled()
    const upd = updateCapture.sachverstaendige!
    expect(upd.verifiziert).toBe(true)
    expect(upd.ist_aktiv).toBe(true)
    expect(upd.portal_zugang_freigeschaltet).toBe(true)
    expect('isochrone_polygon' in upd).toBe(false) // nicht angefasst
  })
})

describe('gibBasicSvFrei — Standort-Plausibilitaet (Koordinaten vs. PLZ)', () => {
  it('blockt den echten prod-Fall: PLZ Heiligenthal, Koordinaten 563 km weiter in Niederbayern', async () => {
    // Exakt die Werte, die am 20.08. auf prod standen — ein aktiver, verifizierter SV.
    cfg.svRow = { standort_lat: 48.526, standort_lng: 13.358, standort_plz: '21394', paket_umkreis_km: 25, isochrone_polygon: [{ lat: 48.5, lng: 13.3 }] }
    cfg.plzGeoRow = { lat: 53.221, lng: 10.336, ort: 'Heiligenthal' }

    const res = await gibBasicSvFrei('sv-1')

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('21394')
      expect(res.error).toContain('Heiligenthal')
      expect(res.error).toMatch(/\b5\d\d km\b/) // die konkrete Abweichung steht drin
    }
    expect(updateCapture.sachverstaendige).toBeNull() // kein Flag-Flip
  })

  it('laesst durch, wenn plz_geo die PLZ nicht kennt (fail-open, keine Blockade durch Datenluecke)', async () => {
    cfg.svRow = { standort_lat: 48.526, standort_lng: 13.358, standort_plz: '99999', paket_umkreis_km: 25, isochrone_polygon: [{ lat: 48.5, lng: 13.3 }] }
    cfg.plzGeoRow = null

    const res = await gibBasicSvFrei('sv-1')

    expect(res.success).toBe(true)
    expect(updateCapture.sachverstaendige!.ist_aktiv).toBe(true)
  })

  it('laesst normale Streuung durch (~4 km, unter der 25-km-Schwelle)', async () => {
    cfg.svRow = { standort_lat: 51.29, standort_lng: 7.15, standort_plz: '42287', paket_umkreis_km: 25, isochrone_polygon: [{ lat: 51.2, lng: 7.1 }] }
    cfg.plzGeoRow = { lat: 51.256, lng: 7.15, ort: 'Wuppertal' }

    const res = await gibBasicSvFrei('sv-1')

    expect(res.success).toBe(true)
  })

  it('laesst durch, wenn gar keine PLZ hinterlegt ist (Guard greift nur mit Referenz)', async () => {
    cfg.svRow = { standort_lat: 48.526, standort_lng: 13.358, standort_plz: null, paket_umkreis_km: 25, isochrone_polygon: [{ lat: 48.5, lng: 13.3 }] }

    const res = await gibBasicSvFrei('sv-1')

    expect(res.success).toBe(true)
  })
})
