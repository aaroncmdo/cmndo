import { describe, it, expect, vi, beforeEach } from 'vitest'
import { summarizeClaimForPrompt, proposalHaupttext, buildClaimContext } from './context'
import type { ClaimContext } from './types'

// Mock fuer den buildClaimContext-DB-Loader (quelle-Filter-Test). Muster von stats.test.ts.
// vi.hoisted, damit eqCalls in der gehoisteten vi.mock-Factory sichtbar ist. Die claims-Query
// liefert eine non-null Row (sonst return null VOR der Proposals-Query); alle Listen leer.
const { eqCalls } = vi.hoisted(() => ({ eqCalls: [] as Array<[string, unknown]> }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const claimRow = {
        id: 'c1',
        status: 'in_bearbeitung',
        operative_status: null,
        ist_aktiv: true,
        abgeschlossen_am: null,
        updated_at: '2026-07-01T00:00:00Z',
        vehicle_id: null,
        fahrzeugschaden_beschreibung: null,
        hergang_kunde_text: null,
      }
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          eqCalls.push([col, val])
          return builder
        },
        or: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () =>
          Promise.resolve(
            table === 'claims' ? { data: claimRow, error: null } : { data: null, error: null },
          ),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data: [], error: null }),
      }
      return builder
    },
  }),
}))

const ctx: ClaimContext = {
  claimId: 'c1',
  fallId: 'f1',
  status: 'in_bearbeitung',
  phase: 'begutachtung',
  letzteAktivitaetAm: '2026-06-29T00:00:00Z',
  tageInaktiv: 6,
  fahrzeug: 'VW Golf',
  offeneTasks: [{ titel: 'Gutachten prüfen', rolle: 'kundenbetreuer', faelligAm: null }],
  kurzverlauf: ['Fall angelegt', 'SV zugewiesen'],
  bereitsVorgeschlagen: [],
}

describe('summarizeClaimForPrompt', () => {
  it('enthält Phase, Inaktivität, offene Tasks und Verlauf', () => {
    const s = summarizeClaimForPrompt(ctx)
    expect(s).toContain('begutachtung')
    expect(s).toContain('6')
    expect(s).toContain('Gutachten prüfen')
    expect(s).toContain('SV zugewiesen')
  })
  it('kommt mit leeren Tasks/Verlauf klar', () => {
    const s = summarizeClaimForPrompt({ ...ctx, offeneTasks: [], kurzverlauf: [] })
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
  })
  it('rendert die Sektion „Bereits vorgeschlagen" wenn Verlauf existiert', () => {
    const s = summarizeClaimForPrompt({
      ...ctx,
      bereitsVorgeschlagen: [
        { typ: 'task', haupttext: 'Kunde anrufen', status: 'verworfen', feedback: 'schon erledigt' },
      ],
    })
    expect(s).toContain('Bereits vorgeschlagen')
    expect(s).toContain('Kunde anrufen')
    expect(s).toContain('verworfen')
    expect(s).toContain('schon erledigt')
  })
  it('lässt die Sektion weg wenn kein Verlauf', () => {
    const s = summarizeClaimForPrompt({ ...ctx, bereitsVorgeschlagen: [] })
    expect(s).not.toContain('Bereits vorgeschlagen')
  })
})

describe('proposalHaupttext', () => {
  it('nimmt titel, sonst hinweis, sonst grund, sonst —', () => {
    expect(proposalHaupttext({ titel: 'T', hinweis: 'H' })).toBe('T')
    expect(proposalHaupttext({ hinweis: 'H' })).toBe('H')
    expect(proposalHaupttext({ grund: 'G' })).toBe('G')
    expect(proposalHaupttext({})).toBe('—')
  })
})

// ── buildClaimContext quelle-Filter ───────────────────────────────────────────
// Der Stateful-Context („Bereits vorgeschlagen (NICHT wiederholen)") speist den
// Orchestrator-Generierungs-Prompt inkl. status+feedback frueherer Vorschlaege.
// Auf dem geteilten Spine (quelle orchestrator|copilot|aufsicht) darf dieser Self-
// Learning-Loop NUR die eigenen Orchestrator-Vorschlaege sehen — sonst verzerren
// copilot-/aufsicht-Ablehnungen (andere Flaechen-Semantik) das Signal. Konsistent
// mit stats.ts / proposals.ts / quality-regression.ts (alle quelle=orchestrator).
describe('buildClaimContext quelle-Filter', () => {
  beforeEach(() => {
    eqCalls.length = 0
  })

  it('liest frühere Vorschläge quelle-scoped (nur orchestrator, nicht copilot/aufsicht)', async () => {
    await buildClaimContext('c1')
    expect(eqCalls).toContainEqual(['quelle', 'orchestrator'])
  })
})
