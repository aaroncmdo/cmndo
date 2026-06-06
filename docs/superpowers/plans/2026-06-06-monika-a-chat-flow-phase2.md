# Monika A-Flow — Phase 2: Proaktiver Teaser + Übergreifender Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Phase-1-Chat-Widget um (a) einen **proaktiven Scroll-Teaser** (2-Beat-Drip, page-length-relativ, einmal/Session + 2-Tage-Ruhe nach Dismiss) und (b) einen **übergreifenden Chat-Resume** (sessionStorage, pro Besuch, Desktop auto-open / Mobile Resume-Peek) erweitern.

**Architecture:** Zwei neue PURE-Module — `store.ts` (Serialisierung + Storage-Wrapper mit Dependency-Injection → vitest-testbar) und `teaser.ts` (Scroll-Tiefe + Beat-State-Machine, PURE). `app.tsx` integriert: Persistenz-Effekt (speichert State bei Änderung), Resume-Rehydrierung beim Mount, Teaser-Peek-Render + Scroll-Listener. Pure Logik → vitest (`node` env); DOM/Preact → `build:embed` + `typecheck:embed` + Browser-Smoke.

**Tech Stack:** Preact + `@preact/signals` (inkl. `effect()` für Persistenz), `sessionStorage` (Resume, pro Besuch) + `localStorage` (Dismiss-Stempel), rAF-gedrosselter Scroll-Listener. esbuild-IIFE (Budget < 30 KB).

---

## Scope & Phasen

**Phase 2 (von 3).** Baut auf Phase 1 (`kitta/aar-939-monika-a-chat-flow`, PR #2507). Branch: `kitta/aar-939-monika-a-teaser-resume` (gestackt auf Phase 1). Eigenständig shippbar: nach Phase 2 meldet sich Monika proaktiv + überlebt Seitenwechsel. **Phase 3** (Sound) folgt separat.

**Verbindlich aus dem Spec (Restraint = Make-or-Break):**
- Teaser **stumm** (Phase 3 bringt Sound; Teaser feuert vor erster Geste → Autoplay-Block sowieso).
- **Max 2 Beats / Session.** ✕ → **2 Tage Ruhe**. Nie wenn `engaged`/`completed`.
- Resume **pro Besuch** (`sessionStorage`), Render **1b auto-open viewport-bewusst** (Desktop Panel / Mobile Peek).
- `prefers-reduced-motion` → kein Typing-Tanz (Teaser-Bubble erscheint direkt).

---

## File Structure

**Neu:**
- `src/embed/monika/store.ts` — Persistenz: `PersistedState`, `serializeState`/`deserializeState` (Version + History-Cap), `storageKey`, `isWithinQuietWindow` (PURE) + `StorageLike`-DI-Wrapper (`readJSON`/`writeJSON`) + `safeSession`/`safeLocal`.
- `src/embed/monika/store.test.ts` — vitest (PURE + Fake-Storage).
- `src/embed/monika/teaser.ts` — `scrollDepthRatio`, `isScrollable`, `nextBeat` (Beat-State-Machine), `BEAT_TEXT` (PURE).
- `src/embed/monika/teaser.test.ts` — vitest.

**Geändert:**
- `src/embed/monika/flow-script.ts` — `Bubble`-Typ hierher exportieren (von app.tsx), damit store.ts ihn teilt.
- `src/embed/monika/app.tsx` — Persistenz-Effekt + Resume-Rehydrierung + Teaser-Peek-Render + Scroll-Listener + Dismiss.
- `src/embed/monika/styles.ts` — Teaser-/Resume-Peek-Styles.

---

## Task 1: `Bubble`-Typ teilen + `store.ts` PURE-Kern + Tests

**Files:**
- Modify: `src/embed/monika/flow-script.ts` (Bubble-Typ exportieren)
- Modify: `src/embed/monika/app.tsx` (Bubble importieren statt lokal definieren)
- Create: `src/embed/monika/store.ts`
- Test: `src/embed/monika/store.test.ts`

- [ ] **Step 1: `Bubble` nach flow-script.ts**

In `src/embed/monika/flow-script.ts` ganz unten anhängen:
```ts
export interface Bubble {
  role: 'monika' | 'user'
  text: string
}
```
In `src/embed/monika/app.tsx`: die lokale Zeile `type Bubble = { role: 'monika' | 'user'; text: string }` entfernen und `Bubble` zum bestehenden flow-script-Import hinzufügen:
```ts
import { SCRIPT, START_STEP, type StepId, type Answers, type ChoiceOption, type ActionDef, type Bubble } from './flow-script'
```

- [ ] **Step 2: Failing-Test**

`src/embed/monika/store.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { serializeState, deserializeState, storageKey, isWithinQuietWindow, STATE_VERSION, type PersistedState } from './store'
import type { MonikaConfig } from './types'

const sample: PersistedState = {
  v: STATE_VERSION, open: true, stepId: 'hp_schuld',
  answers: { anliegen: 'haftpflichtgutachten', unfalltyp: 'auffahrunfall' },
  history: [{ role: 'monika', text: 'Hi' }, { role: 'user', text: 'Haftpflichtschaden' }],
  done: false,
}

describe('storageKey', () => {
  it('sv_embed → slug', () => expect(storageKey({ embedSiteSlug: 'sv-x', cluster: null } as MonikaConfig)).toBe('monika:sv-x:state'))
  it('cluster', () => expect(storageKey({ embedSiteSlug: null, cluster: 'kfz_wup' } as MonikaConfig)).toBe('monika:kfz_wup:state'))
  it('fallback', () => expect(storageKey({ embedSiteSlug: null, cluster: null } as MonikaConfig)).toBe('monika:default:state'))
})

describe('serialize/deserialize', () => {
  it('round-trip', () => expect(deserializeState(serializeState(sample))).toEqual(sample))
  it('null/garbage → null', () => { expect(deserializeState(null)).toBe(null); expect(deserializeState('{')).toBe(null) })
  it('falsche Version → null', () => expect(deserializeState(JSON.stringify({ ...sample, v: 999 }))).toBe(null))
  it('History wird auf 40 gedeckelt', () => {
    const big = { ...sample, history: Array.from({ length: 60 }, (_, i) => ({ role: 'monika' as const, text: 'm' + i })) }
    const out = deserializeState(serializeState(big))
    expect(out?.history.length).toBe(40)
    expect(out?.history[0].text).toBe('m20') // die letzten 40
  })
})

describe('isWithinQuietWindow', () => {
  const now = 1_000_000_000_000
  it('null → false', () => expect(isWithinQuietWindow(null, now)).toBe(false))
  it('innerhalb 2 Tagen → true', () => expect(isWithinQuietWindow(now - 1 * 24 * 3600_000, now)).toBe(true))
  it('nach 2 Tagen → false', () => expect(isWithinQuietWindow(now - 3 * 24 * 3600_000, now)).toBe(false))
})
```

- [ ] **Step 3: Test fails** — `npx vitest run --root <wt> store` → FAIL (Modul fehlt).

- [ ] **Step 4: `store.ts` (PURE-Kern)**

```ts
// AAR-939 · Monika-A-Flow · Persistenz. PURE-Kern (serialize/key/quiet-window) +
// DI-Storage-Wrapper (sessionStorage Resume pro Besuch, localStorage Dismiss-Stempel).
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

export function storageKey(cfg: Pick<MonikaConfig, 'embedSiteSlug' | 'cluster'>): string {
  return `monika:${cfg.embedSiteSlug ?? cfg.cluster ?? 'default'}:state`
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
```

- [ ] **Step 5: Test passes** — `npx vitest run --root <wt> store` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/embed/monika/flow-script.ts src/embed/monika/app.tsx src/embed/monika/store.ts src/embed/monika/store.test.ts
git commit -m "feat(AAR-939 P2): store.ts PURE-Kern (serialize/key/quiet-window) + Bubble geteilt"
```

---

## Task 2: `store.ts` Storage-Wrapper (DI) + Tests

**Files:**
- Modify: `src/embed/monika/store.ts`
- Modify: `src/embed/monika/store.test.ts`

DI über ein `StorageLike`-Interface → mit einer Map-Fake im `node`-Env testbar (kein echtes sessionStorage in vitest).

- [ ] **Step 1: Failing-Test ergänzen**

In `store.test.ts` anhängen:
```ts
import { loadState, saveState, clearState, markDismissed, getDismissedAt, type StorageLike } from './store'

function fakeStorage(): StorageLike {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}
const cfg = { embedSiteSlug: 'sv-x', cluster: null } as MonikaConfig

describe('load/save/clear (DI)', () => {
  it('save dann load → gleicher State', () => {
    const s = fakeStorage()
    saveState(cfg, sample, s)
    expect(loadState(cfg, s)).toEqual(sample)
  })
  it('clear → null', () => {
    const s = fakeStorage(); saveState(cfg, sample, s); clearState(cfg, s)
    expect(loadState(cfg, s)).toBe(null)
  })
  it('leer → null', () => expect(loadState(cfg, fakeStorage())).toBe(null))
})

describe('dismiss (DI)', () => {
  it('markDismissed schreibt Timestamp, getDismissedAt liest ihn', () => {
    const s = fakeStorage(); markDismissed(cfg, 1234, s)
    expect(getDismissedAt(cfg, s)).toBe(1234)
  })
  it('kein Stempel → null', () => expect(getDismissedAt(cfg, fakeStorage())).toBe(null))
})
```

- [ ] **Step 2: Test fails** — `npx vitest run --root <wt> store` → FAIL (Funktionen fehlen).

- [ ] **Step 3: Wrapper in `store.ts` ergänzen**

```ts
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** sessionStorage falls verfuegbar (Privatmodus/SSR → null → In-Memory-Degradation im Caller). */
export function safeSession(): StorageLike | null {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null }
}
export function safeLocal(): StorageLike | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export function loadState(cfg: MonikaConfig, storage: StorageLike | null = safeSession()): PersistedState | null {
  if (!storage) return null
  try { return deserializeState(storage.getItem(storageKey(cfg))) } catch { return null }
}
export function saveState(cfg: MonikaConfig, state: PersistedState, storage: StorageLike | null = safeSession()): void {
  if (!storage) return
  try { storage.setItem(storageKey(cfg), serializeState(state)) } catch { /* quota/privat — ign?? */ }
}
export function clearState(cfg: MonikaConfig, storage: StorageLike | null = safeSession()): void {
  if (!storage) return
  try { storage.removeItem(storageKey(cfg)) } catch { /* noop */ }
}

const DISMISS_KEY = (cfg: MonikaConfig) => `monika:${cfg.embedSiteSlug ?? cfg.cluster ?? 'default'}:dismissed`
export function markDismissed(cfg: MonikaConfig, now: number, storage: StorageLike | null = safeLocal()): void {
  if (!storage) return
  try { storage.setItem(DISMISS_KEY(cfg), String(now)) } catch { /* noop */ }
}
export function getDismissedAt(cfg: MonikaConfig, storage: StorageLike | null = safeLocal()): number | null {
  if (!storage) return null
  try { const v = storage.getItem(DISMISS_KEY(cfg)); return v ? Number(v) : null } catch { return null }
}
```
> Default-Parameter `= safeSession()` wird nur bei Aufruf-ohne-arg evaluiert (im Browser); Tests übergeben die Fake → kein `sessionStorage`-Zugriff im `node`-Env.

- [ ] **Step 4: Test passes** — `npx vitest run --root <wt> store` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/embed/monika/store.ts src/embed/monika/store.test.ts
git commit -m "feat(AAR-939 P2): store-Wrapper (DI StorageLike, session/local, dismiss)"
```

---

## Task 3: `teaser.ts` PURE + Tests

**Files:**
- Create: `src/embed/monika/teaser.ts`
- Test: `src/embed/monika/teaser.test.ts`

- [ ] **Step 1: Failing-Test**

`src/embed/monika/teaser.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { scrollDepthRatio, isScrollable, nextBeat, BEAT_TEXT, type TeaserSession } from './teaser'

describe('scrollDepthRatio', () => {
  it('25%', () => expect(scrollDepthRatio(300, 2000, 800)).toBeCloseTo(0.25))
  it('100% am Ende', () => expect(scrollDepthRatio(1200, 2000, 800)).toBe(1))
  it('nicht scrollbar → 1', () => expect(scrollDepthRatio(0, 500, 800)).toBe(1))
})

describe('isScrollable', () => {
  it('scrollbar', () => expect(isScrollable(2000, 800)).toBe(true))
  it('nicht scrollbar', () => expect(isScrollable(500, 800)).toBe(false))
})

describe('nextBeat', () => {
  const base: TeaserSession = { beatsShown: 0, dismissed: false, engaged: false, completed: false }
  it('cold → Beat 1', () => expect(nextBeat(base)).toBe(1))
  it('Beat 1 gezeigt → Beat 2', () => expect(nextBeat({ ...base, beatsShown: 1 })).toBe(2))
  it('2 gezeigt → null', () => expect(nextBeat({ ...base, beatsShown: 2 })).toBe(null))
  it('dismissed → null', () => expect(nextBeat({ ...base, dismissed: true })).toBe(null))
  it('engaged → null', () => expect(nextBeat({ ...base, engaged: true })).toBe(null))
  it('completed → null', () => expect(nextBeat({ ...base, completed: true })).toBe(null))
})

describe('BEAT_TEXT', () => {
  it('Beat 1 = Begruessung', () => expect(BEAT_TEXT[1]).toContain('grüße'))
  it('Beat 2 = sanfter Nachfasser', () => expect(BEAT_TEXT[2]).toContain('Stress'))
})
```

- [ ] **Step 2: Test fails** — `npx vitest run --root <wt> teaser` → FAIL.

- [ ] **Step 3: `teaser.ts`**

```ts
// AAR-939 · Monika-A-Flow · PURE Teaser-Logik (Scroll-Tiefe + Beat-State-Machine).
export function scrollDepthRatio(scrollY: number, scrollHeight: number, innerHeight: number): number {
  const denom = scrollHeight - innerHeight
  if (denom <= 0) return 1 // nicht scrollbar → gilt als „tief" (Caller nutzt Zeit-Fallback)
  return Math.min(1, Math.max(0, scrollY / denom))
}

export function isScrollable(scrollHeight: number, innerHeight: number): boolean {
  return scrollHeight - innerHeight > 0
}

export interface TeaserSession {
  beatsShown: number
  dismissed: boolean
  engaged: boolean
  completed: boolean
}

/** Welcher Beat als naechstes? null = keiner. Schwellen/Timing/Seiten-Logik liegt im Caller (DOM). */
export function nextBeat(s: TeaserSession): 1 | 2 | null {
  if (s.dismissed || s.engaged || s.completed) return null
  if (s.beatsShown === 0) return 1
  if (s.beatsShown === 1) return 2
  return null
}

export const BEAT_TEXT: Record<1 | 2, string> = {
  1: 'Hi, grüße Sie! 👋',
  2: 'Kein Stress, lassen Sie sich Zeit. 😊 Ich helfe bei Unfall, Gutachten oder Wertgutachten — tippen Sie einfach an.',
}
```

- [ ] **Step 4: Test passes** — `npx vitest run --root <wt> teaser` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/embed/monika/teaser.ts src/embed/monika/teaser.test.ts
git commit -m "feat(AAR-939 P2): teaser.ts PURE (scrollDepthRatio + nextBeat + BEAT_TEXT)"
```

---

## Task 4: `app.tsx` — Persistenz + Resume-Rehydrierung

**Files:**
- Modify: `src/embed/monika/app.tsx`

DOM/Preact → kein vitest; Verifikation `typecheck:embed` + Smoke (Task 7).

- [ ] **Step 1: Imports + Persistenz-Effekt**

In `app.tsx` Imports ergänzen:
```ts
import { effect } from '@preact/signals'
import { loadState, saveState, clearState, markDismissed, getDismissedAt, type PersistedState } from './store'
import { scrollDepthRatio, isScrollable, nextBeat, BEAT_TEXT, type TeaserSession } from './teaser'
```

In `MonikaApp`, nach den bestehenden Signals + vor `playStep`, die Resume-/Teaser-Signals + Persistenz einsetzen:
```ts
  const teaserBeat = useSignal<0 | 1 | 2>(0) // 0 = kein Teaser sichtbar
  const beatsShown = useSignal(0)
  const bootDone = useSignal(false)

  // Persistenz: bei jeder relevanten Aenderung den State in sessionStorage spiegeln.
  effect(() => {
    if (!bootDone.value) return // nicht waehrend der Rehydrierung speichern
    const state: PersistedState = {
      v: 1, open: open.value, stepId: stepId.value, answers: answers.value, history: log.value, done: done.value,
    }
    if (log.value.length > 0) saveState(cfg, state)
  })
```

- [ ] **Step 2: Rehydrierung beim Mount (Resume) + Teaser-Init**

Direkt nach der `effect(...)` aus Step 1 die einmalige Boot-Logik (kein useEffect-Import noetig — wir nutzen ein Guard-Flag + Inline-IIFE im Body, das nur beim ersten Render laeuft):
```ts
  if (!bootDone.value) {
    bootDone.value = true
    const persisted = loadState(cfg)
    if (persisted && persisted.history.length > 0) {
      // ENGAGED/COMPLETED — Resume: History instant + stumm rendern, aktueller Schritt live.
      stepId.value = persisted.stepId
      answers.value = persisted.answers
      log.value = persisted.history
      done.value = persisted.done
      const isMobile = typeof matchMedia === 'function' && matchMedia('(max-width: 480px)').matches
      if (persisted.done) {
        open.value = false // completed → FAB zu (Oeffnen zeigt Danke-Log)
      } else if (isMobile) {
        teaserBeat.value = 1 // Mobile: Resume-Peek statt Vollbild-Takeover
        open.value = false
      } else {
        open.value = true // Desktop: Panel auto-open
        awaiting.value = true // aktueller Schritt zeigt seine then-UI
      }
    } else {
      // COLD — Teaser-Scroll-Listener aufsetzen (Step in Task 5).
      initTeaser()
    }
  }
```
> `effect()` aus `@preact/signals` läuft synchron bei Signal-Änderung; das `bootDone`-Guard verhindert ein Speichern der leeren Initial-Signals und ein Speichern während der Rehydrierung. `initTeaser` wird in Task 5 definiert (Funktion im Komponenten-Body, vor diesem Block deklarieren).

- [ ] **Step 3: `engaged`-Flag bei Resume → kein kalter Teaser**

Die Resume-Rehydrierung setzt `teaserBeat`/`open` direkt; der Teaser-Listener wird im Resume-Zweig gar nicht erst aufgesetzt (`initTeaser` nur im COLD-else). Damit ist „engaged → kein kalter Teaser" strukturell erfüllt.

- [ ] **Step 4: Verifizieren** — `npm run typecheck:embed` (nachdem Task 5 `initTeaser` ergänzt hat) → PASS. (Dieser Task allein hinterlässt `initTeaser` undefiniert; Task 4+5 zusammen committen.)

---

## Task 5: `app.tsx` — Teaser-Peek-Render + Scroll-Listener + Dismiss

**Files:**
- Modify: `src/embed/monika/app.tsx`

- [ ] **Step 1: `initTeaser` + Scroll-Handler (im Komponenten-Body, vor dem Boot-Block aus Task 4)**

```ts
  function session(): TeaserSession {
    return { beatsShown: beatsShown.value, dismissed: isDismissed(), engaged: log.value.length > 0, completed: done.value }
  }
  function isDismissed(): boolean {
    const at = getDismissedAt(cfg)
    return at !== null && Date.now() - at < 2 * 24 * 3600_000
  }
  function fireBeat() {
    const b = nextBeat(session())
    if (!b) return
    teaserBeat.value = b
    beatsShown.value = b
  }
  function initTeaser() {
    if (isDismissed()) return
    let fired30 = false
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const ratio = scrollDepthRatio(window.scrollY, document.documentElement.scrollHeight, window.innerHeight)
        // Beat 1 ab 30% (Min-Dwell via setTimeout unten); Beat 2 ab 70% (selbe Seite).
        if (!fired30 && ratio >= 0.3 && beatsShown.value === 0) { fired30 = true; fireBeat() }
        if (ratio >= 0.7 && beatsShown.value === 1) { fireBeat(); window.removeEventListener('scroll', onScroll) }
      })
    }
    // Fresh-Page mit beatsShown===1 (Cross-Page): Beat 2 schon ab 30%.
    if (beatsShown.value === 1) fired30 = true
    // Nicht scrollbar / 30% ueber dem Fold → Zeit-Fallback ~8s.
    if (!isScrollable(document.documentElement.scrollHeight, window.innerHeight)) {
      setTimeout(() => fireBeat(), 8000)
    } else {
      // Min-Dwell ~3s, danach Listener aktiv.
      setTimeout(() => window.addEventListener('scroll', onScroll, { passive: true }), 3000)
    }
  }
  function dismissTeaser() {
    teaserBeat.value = 0
    markDismissed(cfg, Date.now())
  }
```
> `beatsShown` wird beim Boot aus dem persistierten Session-State gelesen — Cross-Page-Drip. Ergänze in der Resume/Teaser-Init (Task 4 Boot-Block, COLD-Zweig) VOR `initTeaser()`: `beatsShown.value = loadBeats(cfg)` … einfacher: Beats in sessionStorage über denselben Key-Prefix. **Implementierungs-Detail:** speichere `beatsShown` mit in `saveState` (PersistedState erweitern? Nein — Teaser läuft im COLD-Zustand ohne history). Stattdessen eigener Mini-Key:

In `store.ts` ergänzen (+ Test in store.test.ts spiegeln, analog dismiss):
```ts
const BEATS_KEY = (cfg: MonikaConfig) => `monika:${cfg.embedSiteSlug ?? cfg.cluster ?? 'default'}:beats`
export function getBeatsShown(cfg: MonikaConfig, storage: StorageLike | null = safeSession()): number {
  if (!storage) return 0
  try { return Number(storage.getItem(BEATS_KEY(cfg)) ?? '0') || 0 } catch { return 0 }
}
export function setBeatsShown(cfg: MonikaConfig, n: number, storage: StorageLike | null = safeSession()): void {
  if (!storage) return
  try { storage.setItem(BEATS_KEY(cfg), String(n)) } catch { /* noop */ }
}
```
und in `app.tsx`: `fireBeat()` ruft nach `beatsShown.value = b` zusätzlich `setBeatsShown(cfg, b)`; im COLD-Boot vor `initTeaser()`: `beatsShown.value = getBeatsShown(cfg)`.

- [ ] **Step 2: Teaser-Peek-Render (ersetzt den nackten FAB-Branch)**

Den `if (!open.value)`-Block in `app.tsx` ersetzen:
```tsx
  if (!open.value) {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const peekText = log.value.length > 0
      ? (log.value.filter((b) => b.role === 'monika').slice(-1)[0]?.text ?? BEAT_TEXT[1]) // Resume-Peek: letzte Monika-Zeile
      : BEAT_TEXT[teaserBeat.value === 2 ? 2 : 1]
    return (
      <div class="mk-launch">
        {teaserBeat.value > 0 && (
          <div class={`mk-teaser${reduce ? '' : ' mk-teaser-in'}`} role="button" tabIndex={0}
            onClick={openWidget} onKeyDown={(e) => e.key === 'Enter' && openWidget()}>
            {cfg.isClaimondoBranded && <img class="mk-mini" src={photo} alt="" />}
            <span class="mk-teaser-txt">{peekText}{log.value.length > 0 ? ' — weiter ↑' : ''}</span>
            <button class="mk-teaser-x" type="button" aria-label="Schließen"
              onClick={(e) => { e.stopPropagation(); dismissTeaser() }}>×</button>
          </div>
        )}
        <button class="mk-fab" type="button" aria-label="Hilfe bei Kfz-Schaden — Monika" onClick={openWidget}>
          {cfg.isClaimondoBranded
            ? <span class="mk-seal" dangerouslySetInnerHTML={{ __html: SIEGEL_SVG }} />
            : <img src={cfg.theme.logoUrl} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />}
        </button>
      </div>
    )
  }
```

- [ ] **Step 3: `openWidget` Resume-/Teaser-aware**

`openWidget()` anpassen: beim Öffnen den Teaser ausblenden; History-Replay (Resume) ist instant (kein Re-Typing), nur ein frischer Cold-Start spielt START:
```ts
  function openWidget() {
    if (open.value) return
    open.value = true
    teaserBeat.value = 0
    track(cfg, 'monika_open')
    if (log.value.length === 0) playStep(START_STEP) // nur Cold-Start tippt; Resume hat History
  }
```

- [ ] **Step 4: `typecheck:embed`**

Run: `npm run typecheck:embed`
Expected: PASS. (`effect` aus @preact/signals importiert; alle Teaser/Store-Funktionen referenziert.)

- [ ] **Step 5: Commit (Task 4+5 zusammen)**
```bash
git add src/embed/monika/app.tsx src/embed/monika/store.ts src/embed/monika/store.test.ts
git commit -m "feat(AAR-939 P2): app.tsx Teaser-Peek + Resume-Rehydrierung + Persistenz-Effekt"
```

---

## Task 6: `styles.ts` — Teaser-/Resume-Peek-Styles

**Files:**
- Modify: `src/embed/monika/styles.ts`

- [ ] **Step 1: Styles anhängen** (vor dem schließenden Backtick)

```ts
.mk-launch { position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.mk-launch .mk-fab { position: static; }
.mk-teaser { display: flex; align-items: center; gap: 8px; max-width: 280px; background: #fff; color: var(--monika-text);
  border: 1px solid #e8ecf3; border-radius: 16px; border-bottom-right-radius: 5px; padding: 10px 12px;
  box-shadow: 0 6px 20px rgba(13,27,62,.18); cursor: pointer; }
.mk-teaser:focus-visible { outline: 2px solid var(--monika-accent); outline-offset: 2px; }
.mk-teaser-in { animation: mk-teaser-pop .25s cubic-bezier(.22,1,.36,1); }
@keyframes mk-teaser-pop { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
.mk-teaser .mk-mini { width: 26px; height: 26px; }
.mk-teaser-txt { font-size: 13.5px; line-height: 1.35; flex: 1; }
.mk-teaser-x { background: none; border: none; color: #98a4b8; font-size: 17px; line-height: 1; cursor: pointer; padding: 0 2px; align-self: flex-start; }
.mk-teaser-x:hover { color: var(--monika-text); }
```

- [ ] **Step 2: Commit**
```bash
git add src/embed/monika/styles.ts
git commit -m "feat(AAR-939 P2): Teaser-/Resume-Peek-Styles"
```

---

## Task 7: build:embed + Browser-Smoke (Teaser/Resume)

**Files:** (keine — Verifikation)

- [ ] **Step 1: build:embed (Gzip-Gate)**

Run: `node scripts/build-monika.mjs`
Expected: gzipped < 30 KB, exit 0. (Teaser/Store/Teaser-Logik ist klein; weiterhin gut unter Budget.)

- [ ] **Step 2: Browser-Smoke — Teaser feuert bei 30% Scroll**

Smoke-Skript (analog Phase 1, `scripts/_monika-p2-smoke.mjs`, nicht committen): lange Seite (min-height 2500px), kein Auto-Open. Schritte:
1. Laden → FAB sichtbar, **kein** Teaser (oben).
2. `page.mouse.wheel(0, 900)` (≥30% einer 2500px-Seite) → warte auf `.mk-teaser` → Screenshot `01-teaser-beat1.png`. Prüfe Text enthält „grüße".
3. Klick `.mk-teaser` → `.mk-chip` erscheint (Chat offen, Greeting läuft) → Screenshot `02-open-from-teaser.png`.

- [ ] **Step 3: Browser-Smoke — Resume über „Navigation"**

Im selben Skript, neue Page (gleicher Context = gleiche sessionStorage-Origin): Flow bis zu einer Antwort treiben (z.B. Haftpflicht → Auffahrunfall), dann `page.goto(base + '/smoke.html')` (Reload = simulierter Seitenwechsel). Erwartung Desktop-Viewport (1100px): Panel **auto-öffnet** mit der History (instant) → Screenshot `03-resume-desktop.png`. Prüfe: die zuvor gewählten Bubbles sind da, kein Re-Typing.

- [ ] **Step 4: Browser-Smoke — Dismiss → Ruhe**

Neue Page, scroll → Teaser → Klick `.mk-teaser-x` → Teaser weg. Reload → scroll → **kein** Teaser (2-Tage-localStorage greift). Screenshot `04-dismissed-quiet.png` (FAB ohne Teaser nach Reload+Scroll).

- [ ] **Step 5: Screenshots auswerten + SMOKE.md**

Screenshots im selben Turn ansehen (Pflicht). `docs/06.06.2026/monika-p2-smoke/SMOKE.md` mit Befund. Prüfe: Teaser-Bubble-Style (weiß, Monika-Mini, ✕), Resume-History korrekt, Dismiss-Ruhe greift, keine Page-Errors.

---

## Task 8: Gates + PR

- [ ] **Step 1: Voll-Tests** — `npm run test` (bzw. `npx vitest run --root <wt> store teaser flow-script payload typing anfrage-columns embed-anfrage`) → alle grün.
- [ ] **Step 2: typecheck** — `npm run typecheck:embed` + voller `tsc --noEmit` (npm run typecheck) → grün.
- [ ] **Step 3: token-audit** — `npm run check:token-audit` → grün (Teaser-Styles sind Template-String, keine className-Hex).
- [ ] **Step 4: Branch pushen + PR** — `git push -u origin kitta/aar-939-monika-a-teaser-resume`; `gh pr create --base staging` (bzw. base = Phase-1-Branch falls #2507 noch offen → stacked; sonst staging nach #2507-Merge). Body: 7-Punkte-Audit + Verweis auf Spec §6/§8.

---

## Self-Review (writing-plans)

**Spec-Coverage:** §6 Teaser → Tasks 3 (nextBeat/Schwellen) + 5 (Scroll-Listener, 2-Beat-Drip, Dismiss, Min-Dwell, Zeit-Fallback, reduced-motion) + 6 (Style). §6 Frequenz/Gedächtnis → Task 2 (dismiss + beats in sessionStorage) + 5 (isDismissed, 2-Tage). §8 Resume → Tasks 1+2 (PersistedState + load/save) + 4 (Rehydrierung, Desktop-auto-open / Mobile-Peek, completed-Ruhe) + 5 (Peek-Render). §8 Härtung → Task 2 (safeSession null-Degradation, Version-Mismatch in deserializeState → null = Kaltstart). Teaser stumm → kein Sound-Code in Phase 2 (= Phase 3). Continuity (Teaser-Text = erste Zeile) → BEAT_TEXT[1] == START-Chunk 1; openWidget spielt START (Cold) bzw. zeigt History (Resume).

**Placeholder-Scan:** Task 5 Step 1 enthält einen „Implementierungs-Detail"-Block, der die `beatsShown`-Persistenz (getBeatsShown/setBeatsShown) konkret nachreicht — kein TODO, sondern vollständiger Code. Sonst keine Platzhalter.

**Typ-Konsistenz:** `PersistedState`/`StorageLike`/`Bubble` aus store.ts/flow-script.ts identisch in Tests + app.tsx. `nextBeat(TeaserSession)` Signatur konsistent (Task 3 Def == Task 5 Caller). `teaserBeat: 0|1|2`, `BEAT_TEXT: Record<1|2,string>` — Caller indiziert mit `teaserBeat===2?2:1` (nie 0). `getBeatsShown`/`setBeatsShown` in Task 5 ergänzt + in store-Tests zu spiegeln (Hinweis in Task 5).

**Phasen-Hinweis:** Sound (§7) bewusst raus. Mute-Icon im Header kommt mit Phase 3.
