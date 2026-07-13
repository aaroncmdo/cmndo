import { describe, it, expect, afterEach } from 'vitest'
import { studioEnabled, maxClipsPerWeek, checkGuardrails } from './guardrails'

afterEach(() => {
  delete process.env.MARKETING_STUDIO_ENABLED
  delete process.env.MARKETING_MAX_CLIPS_PER_WEEK
})

describe('studioEnabled', () => {
  it('default true, false nur bei explizitem "false"', () => {
    expect(studioEnabled()).toBe(true)
    process.env.MARKETING_STUDIO_ENABLED = 'false'
    expect(studioEnabled()).toBe(false)
    process.env.MARKETING_STUDIO_ENABLED = 'true'
    expect(studioEnabled()).toBe(true)
  })
})

describe('maxClipsPerWeek', () => {
  it('default 20, env-Override', () => {
    expect(maxClipsPerWeek()).toBe(20)
    process.env.MARKETING_MAX_CLIPS_PER_WEEK = '35'
    expect(maxClipsPerWeek()).toBe(35)
    process.env.MARKETING_MAX_CLIPS_PER_WEEK = 'quatsch'
    expect(maxClipsPerWeek()).toBe(20)
  })
})

describe('checkGuardrails', () => {
  it('blockt bei deaktiviertem Studio', () => {
    process.env.MARKETING_STUDIO_ENABLED = 'false'
    expect(checkGuardrails(0).ok).toBe(false)
  })
  it('blockt bei erreichtem Wochen-Cap', () => {
    process.env.MARKETING_MAX_CLIPS_PER_WEEK = '5'
    expect(checkGuardrails(5).ok).toBe(false)
    expect(checkGuardrails(4).ok).toBe(true)
  })
  it('erlaubt unter dem Cap', () => {
    expect(checkGuardrails(3)).toEqual({ ok: true })
  })
})
