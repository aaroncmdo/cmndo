import { describe, it, expect } from 'vitest'
import { isAutoEligible } from './policy'

describe('isAutoEligible — Safety-Guard', () => {
  // (a) task + auto + killSwitch=true → true (einzige true-Kombination)
  it('gibt true fuer task + auto + killSwitch=true', () => {
    expect(isAutoEligible('task', 'auto', true)).toBe(true)
  })

  // (b) escalation ist niemals auto-eligible — Scope-Guard
  it('gibt false fuer escalation + auto + killSwitch=true', () => {
    expect(isAutoEligible('escalation', 'auto', true)).toBe(false)
  })

  // (c) next_step ist niemals auto-eligible — Scope-Guard
  it('gibt false fuer next_step + auto + killSwitch=true', () => {
    expect(isAutoEligible('next_step', 'auto', true)).toBe(false)
  })

  // (d) mode=manual verhindert Auto — auch wenn typ=task und killSwitch=true
  it('gibt false fuer task + manual + killSwitch=true', () => {
    expect(isAutoEligible('task', 'manual', true)).toBe(false)
  })

  // (e) killSwitch=false verhindert jede Auto-Ausfuehrung (globaler Notausschalter)
  it('gibt false fuer task + auto + killSwitch=false', () => {
    expect(isAutoEligible('task', 'auto', false)).toBe(false)
  })
})
