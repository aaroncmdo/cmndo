// AAR-433: Unit-Tests für getKbPhaseAudit. Je 1 Test pro State (9 States) +
// Priority-Kombinationen (SLA > Task, Task > Phase-Stale etc.).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  getKbPhaseAudit,
  type KbFallContext,
  type KbSlaRecord,
  type KbTask,
} from './phase-audit'
import type { StepperState } from '@/lib/fall/stepper-state'

function makeFall(overrides: Partial<KbFallContext> = {}): KbFallContext {
  return {
    id: 'fall-test-1',
    status: 'sv-zugewiesen',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeStepper(aktiveLabel = 'Besichtigung'): StepperState {
  return {
    vorPhasen: [],
    hauptPhasen: [
      { key: 'besichtigung', label: aktiveLabel, desc: '', status: 'aktiv', subs: [] },
      { key: 'gutachten', label: 'Gutachten', desc: '', status: 'offen', subs: [] },
    ],
    activePhaseIndex: 0,
  }
}

// CMM-36/AAR-433: getKbPhaseAudit nutzt Date.now() intern (Z.137). Ohne festen
// Clock sind die "faellig heute"-Tests flaky — `Date.now() + 2h` kippt nach ~22 Uhr
// über Mitternacht und fällt aus dem Heute-Fenster (Suite lief um 23:00 → rot).
// Fixe Tageszeit macht es deterministisch.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-23T10:00:00'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('getKbPhaseAudit — 9 States', () => {
  it('1. sla-breached: target_rolle=kundenbetreuer + status=breached → kritisch', () => {
    const slas: KbSlaRecord[] = [
      {
        fall_id: 'fall-test-1',
        target_rolle: 'kundenbetreuer',
        status: 'breached',
        blocker_grund: 'Rückruf an Kunde fehlt',
        breach_at: '2026-04-15T10:00:00Z',
        phase: 'kanzlei_uebergabe',
      },
    ]
    const a = getKbPhaseAudit(makeFall(), [], slas, makeStepper())
    expect(a.state).toBe('sla-breached')
    expect(a.prioritaet).toBe('kritisch')
    expect(a.beschreibung).toContain('Rückruf')
    expect(a.deadline_am).toBe('2026-04-15T10:00:00Z')
  })

  it('2. task-ueberfaellig: KB-Task mit faellig_am in Vergangenheit → hoch', () => {
    const gestern = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const tasks: KbTask[] = [
      {
        id: 't1',
        fall_id: 'fall-test-1',
        empfaenger_rolle: 'kundenbetreuer',
        titel: 'Kunde zurückrufen',
        status: 'offen',
        faellig_am: gestern,
      },
    ]
    const a = getKbPhaseAudit(makeFall(), tasks, [], makeStepper())
    expect(a.state).toBe('task-ueberfaellig')
    expect(a.prioritaet).toBe('hoch')
    expect(a.beschreibung).toContain('Kunde zurückrufen')
  })

  it('3. dispatch-blocker: Fall-Status=dispatch-fehlgeschlagen → hoch', () => {
    const a = getKbPhaseAudit(
      makeFall({ status: 'dispatch-fehlgeschlagen' }),
      [],
      [],
      makeStepper(),
    )
    expect(a.state).toBe('dispatch-blocker')
    expect(a.prioritaet).toBe('hoch')
  })

  it('4. vs-antwort-pruefen: Fall-Status=vs-kuerzt → hoch', () => {
    const a = getKbPhaseAudit(makeFall({ status: 'vs-kuerzt' }), [], [], makeStepper())
    expect(a.state).toBe('vs-antwort-pruefen')
    expect(a.prioritaet).toBe('hoch')
    expect(a.cta?.href).toContain('tab=prozess')
  })

  it('5. task-faellig-heute: KB-Task mit faellig_am heute → mittel', () => {
    // In 2 Stunden
    const heute = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
    const tasks: KbTask[] = [
      {
        id: 't1',
        fall_id: 'fall-test-1',
        empfaenger_rolle: 'kundenbetreuer',
        titel: 'Termin bestätigen',
        status: 'offen',
        faellig_am: heute,
      },
    ]
    const a = getKbPhaseAudit(makeFall(), tasks, [], makeStepper())
    expect(a.state).toBe('task-faellig-heute')
    expect(a.prioritaet).toBe('mittel')
  })

  it('6. kunde-wartet: blocker_rolle=kunde seit >2 Tagen → mittel', () => {
    const vor3Tagen = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
    const slas: KbSlaRecord[] = [
      {
        fall_id: 'fall-test-1',
        blocker_rolle: 'kunde',
        status: 'pending',
        blocker_seit: vor3Tagen,
        blocker_grund: 'Bankdaten fehlen',
      },
    ]
    const a = getKbPhaseAudit(makeFall(), [], slas, makeStepper())
    expect(a.state).toBe('kunde-wartet')
    expect(a.prioritaet).toBe('mittel')
    expect(a.beschreibung).toContain('Bankdaten')
  })

  it('7. phase-stale: aktive Phase seit >5 WT ohne updated_at → mittel', () => {
    // 14 Kalender-Tage zurück → garantiert >5 WT
    const alt = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
    const a = getKbPhaseAudit(
      makeFall({ updated_at: alt, status: 'sv-zugewiesen' }),
      [],
      [],
      makeStepper('Besichtigung'),
    )
    expect(a.state).toBe('phase-stale')
    expect(a.beschreibung).toContain('Besichtigung')
    expect(a.warnung).toBeTruthy()
  })

  it('8. routine-check: offene KB-Tasks ohne Deadline → niedrig/mittel', () => {
    const tasks: KbTask[] = [
      {
        id: 't1',
        fall_id: 'fall-test-1',
        empfaenger_rolle: 'kundenbetreuer',
        titel: 'Unterlagen sichten',
        status: 'offen',
        faellig_am: null,
        prioritaet: 'normal',
      },
    ]
    const a = getKbPhaseAudit(makeFall(), tasks, [], makeStepper())
    expect(a.state).toBe('routine-check')
    expect(a.beschreibung).toContain('Unterlagen')
  })

  it('9. alles-ok: keine Tasks, keine SLA, frische Phase → niedrig', () => {
    const a = getKbPhaseAudit(makeFall(), [], [], makeStepper())
    expect(a.state).toBe('alles-ok')
    expect(a.prioritaet).toBe('niedrig')
    expect(a.cta).toBeNull()
  })

  // ─── Priority-Kombinationen ──────────────────────────────────────────────

  it('Priority: SLA-breach schlägt überfällige Task', () => {
    const gestern = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const slas: KbSlaRecord[] = [
      { fall_id: 'fall-test-1', target_rolle: 'kundenbetreuer', status: 'breached' },
    ]
    const tasks: KbTask[] = [
      {
        id: 't1',
        fall_id: 'fall-test-1',
        empfaenger_rolle: 'kundenbetreuer',
        status: 'offen',
        faellig_am: gestern,
      },
    ]
    const a = getKbPhaseAudit(makeFall(), tasks, slas, makeStepper())
    expect(a.state).toBe('sla-breached')
  })

  it('Priority: überfällige Task schlägt VS-Antwort', () => {
    const gestern = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const tasks: KbTask[] = [
      {
        id: 't1',
        fall_id: 'fall-test-1',
        empfaenger_rolle: 'kundenbetreuer',
        status: 'offen',
        faellig_am: gestern,
      },
    ]
    const a = getKbPhaseAudit(
      makeFall({ status: 'vs-kuerzt' }),
      tasks,
      [],
      makeStepper(),
    )
    expect(a.state).toBe('task-ueberfaellig')
  })

  it('Priority: phase-stale wird ignoriert wenn Task heute fällig', () => {
    const heute = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
    const alt = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
    const tasks: KbTask[] = [
      {
        id: 't1',
        fall_id: 'fall-test-1',
        empfaenger_rolle: 'kundenbetreuer',
        status: 'offen',
        faellig_am: heute,
      },
    ]
    const a = getKbPhaseAudit(
      makeFall({ updated_at: alt }),
      tasks,
      [],
      makeStepper(),
    )
    expect(a.state).toBe('task-faellig-heute')
  })

  it('Filter: Tasks anderer Rollen werden ignoriert', () => {
    const gestern = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const tasks: KbTask[] = [
      {
        id: 't1',
        fall_id: 'fall-test-1',
        empfaenger_rolle: 'sachverstaendiger',
        status: 'offen',
        faellig_am: gestern,
      },
    ]
    const a = getKbPhaseAudit(makeFall(), tasks, [], makeStepper())
    expect(a.state).toBe('alles-ok')
  })

  it('Filter: Tasks anderer Fälle werden ignoriert', () => {
    const gestern = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const tasks: KbTask[] = [
      {
        id: 't1',
        fall_id: 'fall-OTHER',
        empfaenger_rolle: 'kundenbetreuer',
        status: 'offen',
        faellig_am: gestern,
      },
    ]
    const a = getKbPhaseAudit(makeFall(), tasks, [], makeStepper())
    expect(a.state).toBe('alles-ok')
  })

  it('kunde-wartet: <2 Tage → wird nicht ausgelöst', () => {
    const vor1Tag = new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString()
    const slas: KbSlaRecord[] = [
      {
        fall_id: 'fall-test-1',
        blocker_rolle: 'kunde',
        status: 'pending',
        blocker_seit: vor1Tag,
      },
    ]
    const a = getKbPhaseAudit(makeFall(), [], slas, makeStepper())
    expect(a.state).not.toBe('kunde-wartet')
  })
})
