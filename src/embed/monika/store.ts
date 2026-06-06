// AAR-939 · Monika-A-Flow · Persistenz. PURE-Kern (serialize/key/quiet-window) +
// DI-Storage-Wrapper: sessionStorage (Resume + Beats, pro Besuch), localStorage (Dismiss-Stempel).
import type { StepId, Answers, Bubble } from './flow-script'
import type { MonikaConfig } from './types'

export const STATE_VERSION = 1
export const HISTORY_CAP = 40

export interface PersistedState {
  v: number
  open: boolean
  stepId: StepId
  answers: Answers
  history: Bubble[]
  done: boolean
}

type KeyCfg = Pick<MonikaConfig, 'embedSiteSlug' | 'cluster'>
function base(cfg: KeyCfg): string {
  return cfg.embedSiteSlug ?? cfg.cluster ?? 'default'
}
export function storageKey(cfg: KeyCfg): string {
  return `monika:${base(cfg)}:state`
}

export function serializeState(s: PersistedState): string {
  return JSON.stringify({ ...s, history: s.history.slice(-HISTORY_CAP) })
}

export function deserializeState(raw: string | null): PersistedState | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as PersistedState
    if (!o || o.v !== STATE_VERSION || !Array.isArray(o.history)) return null
    return { ...o, history: o.history.slice(-HISTORY_CAP) }
  } catch {
    return null
  }
}

export function isWithinQuietWindow(dismissedAt: number | null, now: number, days = 2): boolean {
  if (!dismissedAt) return false
  return now - dismissedAt < days * 24 * 3600_000
}

// ── Storage (DI-able, im node-Env mit Fake testbar) ──────────────────────────

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function safeSession(): StorageLike | null {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null }
}
export function safeLocal(): StorageLike | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export function loadState(cfg: KeyCfg, storage: StorageLike | null = safeSession()): PersistedState | null {
  if (!storage) return null
  try { return deserializeState(storage.getItem(storageKey(cfg))) } catch { return null }
}
export function saveState(cfg: KeyCfg, state: PersistedState, storage: StorageLike | null = safeSession()): void {
  if (!storage) return
  try { storage.setItem(storageKey(cfg), serializeState(state)) } catch { /* quota/privat */ }
}
export function clearState(cfg: KeyCfg, storage: StorageLike | null = safeSession()): void {
  if (!storage) return
  try { storage.removeItem(storageKey(cfg)) } catch { /* noop */ }
}

const DISMISS_KEY = (cfg: KeyCfg) => `monika:${base(cfg)}:dismissed`
export function markDismissed(cfg: KeyCfg, now: number, storage: StorageLike | null = safeLocal()): void {
  if (!storage) return
  try { storage.setItem(DISMISS_KEY(cfg), String(now)) } catch { /* noop */ }
}
export function getDismissedAt(cfg: KeyCfg, storage: StorageLike | null = safeLocal()): number | null {
  if (!storage) return null
  try { const v = storage.getItem(DISMISS_KEY(cfg)); return v ? Number(v) : null } catch { return null }
}

const BEATS_KEY = (cfg: KeyCfg) => `monika:${base(cfg)}:beats`
export function getBeatsShown(cfg: KeyCfg, storage: StorageLike | null = safeSession()): number {
  if (!storage) return 0
  try { return Number(storage.getItem(BEATS_KEY(cfg)) ?? '0') || 0 } catch { return 0 }
}
export function setBeatsShown(cfg: KeyCfg, n: number, storage: StorageLike | null = safeSession()): void {
  if (!storage) return
  try { storage.setItem(BEATS_KEY(cfg), String(n)) } catch { /* noop */ }
}
