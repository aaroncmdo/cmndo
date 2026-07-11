import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'

// --- Mock helpers ---

// Fluent Supabase query chain mock that resolves maybeSingle to { data: null }
function makeChain(resolveValue = { data: null }) {
  const chain: Record<string, unknown> = {}
  const methods = ['from', 'select', 'eq', 'maybeSingle', 'update']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  ;(chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(resolveValue)
  ;(chain.update as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null })
  return chain
}

const adminChain = makeChain()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminChain),
}))

// Mock ermittleReparaturbedarf
const mockErmittleImpl = vi.fn()
vi.mock('@/lib/werkstatt/bedarf/ermittle-bedarf', () => ({
  ermittleReparaturbedarf: (...args: unknown[]) => mockErmittleImpl(...args),
}))

// Mock findWerkstaetten — this is what findReparaturWerkstaettenForTarget calls after geo lookup
const mockFindWerkstaettenImpl = vi.fn()
vi.mock('@/lib/werkstatt/finder', () => ({
  findWerkstaetten: (...args: unknown[]) => mockFindWerkstaettenImpl(...args),
}))

// --- Import under test (after mocks) ---
import { findQualifizierteReparaturWerkstaetten } from '@/lib/werkstatt/vermittlung-server'

// --- Helpers ---

function makeRow(id: string, faehigkeiten: string[] | null): WerkstattFinderRow {
  return {
    id,
    name: `Werkstatt ${id}`,
    adresse_strasse: null,
    adresse_plz: null,
    adresse_ort: null,
    telefon: null,
    lat: 51.0,
    lng: 7.0,
    status: 'aktiv',
    faehigkeiten,
    verifiziert: false,
    distanz_km: 5,
    passt: true,
  }
}

function makeBedarf(kategorien: string[], confidence: number): Reparaturbedarf {
  return { kategorien: kategorien as never, quelle: 'gutachten', confidence }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Re-wire the chain methods after clearAllMocks
  const methods = ['from', 'select', 'eq', 'maybeSingle', 'update']
  for (const m of methods) {
    ;(adminChain[m] as ReturnType<typeof vi.fn>).mockImplementation(() => adminChain)
  }
  ;(adminChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null })
  ;(adminChain.update as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null })
})

describe('findQualifizierteReparaturWerkstaetten', () => {
  it('hohe confidence: rows tragen fit, passt_nicht werden rausgefiltert', async () => {
    // Bedarf: karosserie, confidence=100 -> Hart-Modus
    mockErmittleImpl.mockResolvedValue(makeBedarf(['karosserie'], 100))
    // findWerkstaetten returns 3 rows with different faehigkeiten
    mockFindWerkstaettenImpl.mockResolvedValue([
      makeRow('a', ['karosserie']),  // fit=passt
      makeRow('b', ['lackierung']),  // fit=passt_nicht
      makeRow('c', null),            // fit=unbekannt
    ])

    const result = await findQualifizierteReparaturWerkstaetten({ target: 'claim', id: 'claim-1' })

    // passt_nicht ('b') ist rausgefiltert; 'a' (passt) + 'c' (unbekannt) bleiben
    expect(result.keineSpezialisierte).toBe(false)
    expect(result.werkstaetten.map((w) => w.id)).toEqual(['a', 'c'])
    expect(result.werkstaetten.find((w) => w.id === 'a')?.fit).toBe('passt')
    expect(result.werkstaetten.find((w) => w.id === 'c')?.fit).toBe('unbekannt')
    expect(result.bedarf.kategorien).toContain('karosserie')
  })

  it('0 passende Werkstaetten -> keineSpezialisierte=true, alle Rows zurueck', async () => {
    mockErmittleImpl.mockResolvedValue(makeBedarf(['karosserie'], 100))
    // Keine Werkstatt bietet karosserie an
    mockFindWerkstaettenImpl.mockResolvedValue([
      makeRow('x', ['lackierung']),
      makeRow('y', ['mechanik']),
    ])

    const result = await findQualifizierteReparaturWerkstaetten({ target: 'lead', id: 'lead-1' })

    expect(result.keineSpezialisierte).toBe(true)
    // Fallback: alle Rows werden gezeigt (kein Hart-Filter)
    expect(result.werkstaetten).toHaveLength(2)
  })

  it('niedrige confidence -> alle Rows mit fit-Annotation, kein Filtering', async () => {
    mockErmittleImpl.mockResolvedValue(makeBedarf(['glas'], 20))
    mockFindWerkstaettenImpl.mockResolvedValue([
      makeRow('a', ['karosserie']),
      makeRow('b', ['glas']),
    ])

    const result = await findQualifizierteReparaturWerkstaetten({ target: 'claim', id: 'claim-2' })

    expect(result.keineSpezialisierte).toBe(false)
    expect(result.werkstaetten).toHaveLength(2)
    // Alle haben fit annotiert
    expect(result.werkstaetten.every((w) => w.fit !== undefined)).toBe(true)
  })

  it('resolver bekommt claimId/leadId je nach target', async () => {
    mockErmittleImpl.mockResolvedValue(makeBedarf([], 0))
    mockFindWerkstaettenImpl.mockResolvedValue([])

    await findQualifizierteReparaturWerkstaetten({ target: 'claim', id: 'claim-99' })
    expect(mockErmittleImpl).toHaveBeenCalledWith(
      expect.anything(),
      { claimId: 'claim-99', leadId: undefined },
    )

    await findQualifizierteReparaturWerkstaetten({ target: 'lead', id: 'lead-99' })
    expect(mockErmittleImpl).toHaveBeenCalledWith(
      expect.anything(),
      { claimId: undefined, leadId: 'lead-99' },
    )
  })
})
