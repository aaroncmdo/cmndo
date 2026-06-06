import { describe, it, expect } from 'vitest'
import {
  serializeState, deserializeState, storageKey, isWithinQuietWindow, STATE_VERSION,
  loadState, saveState, clearState, markDismissed, getDismissedAt, getBeatsShown, setBeatsShown,
  getMuted, setMuted,
  type PersistedState, type StorageLike,
} from './store'
import type { MonikaConfig } from './types'

const sample: PersistedState = {
  v: STATE_VERSION,
  open: true,
  stepId: 'hp_schuld',
  answers: { anliegen: 'haftpflichtgutachten', unfalltyp: 'auffahrunfall' },
  history: [
    { role: 'monika', text: 'Hi' },
    { role: 'user', text: 'Haftpflichtschaden' },
  ],
  done: false,
}
const cfg = { embedSiteSlug: 'sv-x', cluster: null } as MonikaConfig

function fakeStorage(): StorageLike {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}

describe('storageKey', () => {
  it('sv_embed → slug', () => expect(storageKey({ embedSiteSlug: 'sv-x', cluster: null } as MonikaConfig)).toBe('monika:sv-x:state'))
  it('cluster', () => expect(storageKey({ embedSiteSlug: null, cluster: 'kfz_wup' } as MonikaConfig)).toBe('monika:kfz_wup:state'))
  it('fallback', () => expect(storageKey({ embedSiteSlug: null, cluster: null } as MonikaConfig)).toBe('monika:default:state'))
})

describe('serialize/deserialize', () => {
  it('round-trip', () => expect(deserializeState(serializeState(sample))).toEqual(sample))
  it('null/garbage → null', () => {
    expect(deserializeState(null)).toBe(null)
    expect(deserializeState('{')).toBe(null)
  })
  it('falsche Version → null', () => expect(deserializeState(JSON.stringify({ ...sample, v: 999 }))).toBe(null))
  it('History wird auf 40 gedeckelt', () => {
    const big = { ...sample, history: Array.from({ length: 60 }, (_, i) => ({ role: 'monika' as const, text: 'm' + i })) }
    const out = deserializeState(serializeState(big))
    expect(out?.history.length).toBe(40)
    expect(out?.history[0].text).toBe('m20')
  })
})

describe('isWithinQuietWindow', () => {
  const now = 1_000_000_000_000
  it('null → false', () => expect(isWithinQuietWindow(null, now)).toBe(false))
  it('innerhalb 2 Tagen → true', () => expect(isWithinQuietWindow(now - 1 * 24 * 3600_000, now)).toBe(true))
  it('nach 2 Tagen → false', () => expect(isWithinQuietWindow(now - 3 * 24 * 3600_000, now)).toBe(false))
})

describe('load/save/clear (DI)', () => {
  it('save dann load → gleicher State', () => {
    const s = fakeStorage()
    saveState(cfg, sample, s)
    expect(loadState(cfg, s)).toEqual(sample)
  })
  it('clear → null', () => {
    const s = fakeStorage()
    saveState(cfg, sample, s)
    clearState(cfg, s)
    expect(loadState(cfg, s)).toBe(null)
  })
  it('leer → null', () => expect(loadState(cfg, fakeStorage())).toBe(null))
})

describe('dismiss + beats (DI)', () => {
  it('markDismissed/getDismissedAt', () => {
    const s = fakeStorage()
    markDismissed(cfg, 1234, s)
    expect(getDismissedAt(cfg, s)).toBe(1234)
  })
  it('kein Stempel → null', () => expect(getDismissedAt(cfg, fakeStorage())).toBe(null))
  it('beats setzen/lesen', () => {
    const s = fakeStorage()
    setBeatsShown(cfg, 2, s)
    expect(getBeatsShown(cfg, s)).toBe(2)
  })
  it('keine beats → 0', () => expect(getBeatsShown(cfg, fakeStorage())).toBe(0))
})

describe('mute (DI)', () => {
  it('default = false (Sound an)', () => expect(getMuted(cfg, fakeStorage())).toBe(false))
  it('setMuted(true) dann getMuted → true', () => {
    const s = fakeStorage()
    setMuted(cfg, true, s)
    expect(getMuted(cfg, s)).toBe(true)
  })
  it('setMuted(false) → false', () => {
    const s = fakeStorage()
    setMuted(cfg, true, s)
    setMuted(cfg, false, s)
    expect(getMuted(cfg, s)).toBe(false)
  })
})
