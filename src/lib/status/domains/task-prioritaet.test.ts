import { describe, expect, test } from 'vitest'
import { TASK_PRIORITAET_DEFS } from './task-prioritaet'

// Paritaet mit dem DB-CHECK auf tasks.prioritaet:
//   CHECK (prioritaet = ANY (ARRAY['normal', 'dringend', 'kritisch']))
const DB_CHECK_WERTE = ['normal', 'dringend', 'kritisch'] as const

describe('TASK_PRIORITAET_DEFS', () => {
  test('deckt alle DB-CHECK-Werte ab', () => {
    for (const wert of DB_CHECK_WERTE) {
      expect(TASK_PRIORITAET_DEFS[wert], `Def fuer '${wert}' fehlt`).toBeDefined()
      expect(TASK_PRIORITAET_DEFS[wert].label.length).toBeGreaterThan(0)
    }
  })

  test('enthaelt keine Werte, die der CHECK verbietet', () => {
    // Ein Key, den die DB nicht kennt, wuerde nie gerendert und taeuschte Abdeckung vor.
    expect(Object.keys(TASK_PRIORITAET_DEFS).sort()).toEqual([...DB_CHECK_WERTE].sort())
  })

  test('die Dringlichkeit steigt sichtbar an', () => {
    // Der Sinn der Domain: „normal" darf NICHT alarmieren, sonst ist das Feld wieder
    // wertlos — genau der Zustand vor #5273, als alle 347 offenen Aufgaben 'dringend'
    // trugen und die 20 echten Eskalationen darin untergingen.
    expect(TASK_PRIORITAET_DEFS.normal.slot).toBe('neutral')
    expect(TASK_PRIORITAET_DEFS.dringend.slot).toBe('warning')
    expect(TASK_PRIORITAET_DEFS.kritisch.slot).toBe('danger')
  })
})
