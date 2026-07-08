import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifyAutoQuality, checkAndRevertAutoQuality } from './quality-regression'
import { GRADUATION } from './types'

// Mock-Infrastruktur fuer den checkAndRevertAutoQuality-DB-Loader (quelle-Filter-Test).
// Muster gespiegelt von stats.test.ts. vi.hoisted, damit eqCalls in der gehoisteten
// vi.mock-Factory sichtbar ist. Der Builder resolvt leer → checkAndRevertAutoQuality
// kehrt frueh zurueck; die .eq()-Aufrufe werden dennoch aufgezeichnet.
const { eqCalls } = vi.hoisted(() => ({ eqCalls: [] as Array<[string, unknown]> }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const builder = {
      select: () => builder,
      in: () => builder,
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val])
        return builder
      },
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
    }
    return { from: () => builder }
  },
}))

// Sanity: Konstanten aus types.ts sind korrekt (Regression-Trigger = 0.30, Fenster = 20)
describe('GRADUATION-Konstanten (Sanity)', () => {
  it('revertBadRate === 0.30', () => {
    expect(GRADUATION.revertBadRate).toBe(0.3)
  })
  it('revertFenster === 20', () => {
    expect(GRADUATION.revertFenster).toBe(20)
  })
})

// ── classifyAutoQuality (pure) ────────────────────────────────────────────────
//
// Mindest-Sample: 5 Auto-Tasks (verhindert Revert auf duenner Datenbasis)
// Revert-Trigger: badRate > GRADUATION.revertBadRate (0.30)
//
// "Schlechter Auto-Task" — verifizierte Endzustaende:
//   - Task-Row NICHT gefunden (hard-deleted via admin/tasks/actions.ts:deleteTask)
//   - status === 'blockiert'   (stuck — haette nicht sein sollen)
// (Endzustaende 'erledigt' = legitim erfuellt;
//  'offen'/'in-bearbeitung' = noch aktiv — weder gut noch schlecht fuer diese Metrik)

describe('classifyAutoQuality', () => {
  // (a) 20 Tasks, 7 schlecht (0.35) → revert=true (> 0.30 + >= 5 Sample)
  it('(a) 20 Tasks, 7 schlecht → badRate=0.35, revert=true', () => {
    const result = classifyAutoQuality({ autoTasksImFenster: 20, schlechte: 7 })
    expect(result.badRate).toBeCloseTo(0.35)
    expect(result.revert).toBe(true)
  })

  // (b) 20 Tasks, 5 schlecht (0.25) → revert=false (≤ 0.30)
  it('(b) 20 Tasks, 5 schlecht → badRate=0.25, revert=false', () => {
    const result = classifyAutoQuality({ autoTasksImFenster: 20, schlechte: 5 })
    expect(result.badRate).toBeCloseTo(0.25)
    expect(result.revert).toBe(false)
  })

  // (c) 3 Tasks, 3 schlecht (1.0) → revert=false (unter Mindest-Sample von 5)
  it('(c) 3 Tasks, 3 schlecht (1.0) → revert=false — unter Mindest-Sample', () => {
    const result = classifyAutoQuality({ autoTasksImFenster: 3, schlechte: 3 })
    expect(result.badRate).toBeCloseTo(1.0)
    expect(result.revert).toBe(false)
  })

  // (d) 0 Tasks → badRate=0, revert=false
  it('(d) 0 Tasks → badRate=0, revert=false', () => {
    const result = classifyAutoQuality({ autoTasksImFenster: 0, schlechte: 0 })
    expect(result.badRate).toBe(0)
    expect(result.revert).toBe(false)
  })

  // Grenzfall: genau 5 Tasks, 2 schlecht (0.40) → revert=true (Sample ok + badRate > 0.30)
  it('(e) 5 Tasks, 2 schlecht (0.40) → revert=true — Mindest-Sample genau erreicht', () => {
    const result = classifyAutoQuality({ autoTasksImFenster: 5, schlechte: 2 })
    expect(result.badRate).toBeCloseTo(0.40)
    expect(result.revert).toBe(true)
  })

  // Grenzfall: genau 4 Tasks, 2 schlecht (0.50) → revert=false (unter Mindest-Sample)
  it('(f) 4 Tasks, 2 schlecht (0.50) → revert=false — Mindest-Sample nicht erreicht', () => {
    const result = classifyAutoQuality({ autoTasksImFenster: 4, schlechte: 2 })
    expect(result.badRate).toBeCloseTo(0.50)
    expect(result.revert).toBe(false)
  })

  // Grenzfall: badRate exakt 0.30 → revert=false (> 0.30 nicht >= 0.30)
  it('(g) badRate genau 0.30 → revert=false (Trigger ist >, nicht >=)', () => {
    // 10 Tasks, 3 schlecht = genau 0.30
    const result = classifyAutoQuality({ autoTasksImFenster: 10, schlechte: 3 })
    expect(result.badRate).toBeCloseTo(0.30)
    expect(result.revert).toBe(false)
  })
})

// ── checkAndRevertAutoQuality quelle-Filter ───────────────────────────────────
// orchestrator_auto_policy governt NUR die Orchestrator-Auto-Ausfuehrung. Auf dem
// geteilten Spine (quelle orchestrator|copilot|aufsicht) darf der Regressions-Monitor
// daher ausschliesslich orchestrator-Vorschlaege bewerten. (Heute setzt nur der
// Orchestrator auto_ausgefuehrt=true — der Filter haelt die Invariante fuer die
// kommende P1c-Executor-Konvergenz, wenn Auto-Ausfuehrung quelle-uebergreifend wird.)
describe('checkAndRevertAutoQuality quelle-Filter', () => {
  beforeEach(() => {
    eqCalls.length = 0
  })

  it('filtert quelle=orchestrator beim Laden der auto-ausgefuehrten Vorschlaege', async () => {
    await checkAndRevertAutoQuality()
    expect(eqCalls).toContainEqual(['quelle', 'orchestrator'])
  })
})
