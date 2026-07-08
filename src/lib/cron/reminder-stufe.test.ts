import { describe, it, expect } from 'vitest'
import { reminderStufeNachAlter } from './reminder-stufe'

describe('reminderStufeNachAlter — Nachhol-Fenster gegen verpasste Reminder', () => {
  // sa-reminder: Stufe 2 ab Tag 3, Stufe 3 ab Tag 5
  it('< Tag 1 → null (noch nichts faellig)', () => expect(reminderStufeNachAlter(0.5, 3, 5)).toBeNull())
  it('Tag 1 → stufe1', () => expect(reminderStufeNachAlter(1, 3, 5)).toBe('stufe1'))
  it('Tag 2.5 (frueher tote Zone [2,3)) → stufe1 NACHHOL', () => expect(reminderStufeNachAlter(2.5, 3, 5)).toBe('stufe1'))
  it('Tag 3 → stufe2', () => expect(reminderStufeNachAlter(3, 3, 5)).toBe('stufe2'))
  it('Tag 4.5 (frueher tote Zone [4,5)) → stufe2 NACHHOL', () => expect(reminderStufeNachAlter(4.5, 3, 5)).toBe('stufe2'))
  it('Tag 5 → stufe3', () => expect(reminderStufeNachAlter(5, 3, 5)).toBe('stufe3'))
  it('Tag 10 → stufe3 (offene Obergrenze)', () => expect(reminderStufeNachAlter(10, 3, 5)).toBe('stufe3'))

  // vollmacht-reminder: Stufe 3 ab Tag 7
  it('vollmacht Tag 6 (frueher tote Zone [4,7)) → stufe2 NACHHOL', () => expect(reminderStufeNachAlter(6, 3, 7)).toBe('stufe2'))
  it('vollmacht Tag 7 → stufe3', () => expect(reminderStufeNachAlter(7, 3, 7)).toBe('stufe3'))
})
