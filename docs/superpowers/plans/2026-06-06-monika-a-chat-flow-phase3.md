# Monika A-Flow — Phase 3: Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dezenter Chat-Sound — ein Incoming-Blip bei jeder Monika-Nachricht, ein Sent-Blip bei jeder eingereichten Nutzer-Antwort — gesten-entsperrt (Web Audio), mit persistiertem Mute-Schalter im Header.

**Architecture:** Ein neues Modul `sound.ts` mit (a) PURE `shouldThrottle()` (Min-Gap-Logik, vitest-testbar) und (b) `createSoundEngine()` (AudioContext-Wrapper: unlock-on-gesture, fetch+decode beide Buffer, `playIncoming`/`playSent` mit Gain + Throttle + Mute-Gate). Mute-Persistenz kommt in `store.ts` (gleiche DI-Pattern wie dismiss/beats). `app.tsx` verdrahtet: AudioContext-Unlock im FAB-Click, `playIncoming` beim ersten Bubble-Reveal eines Monika-Turns, `playSent` bei Chip/Action/Submit, Mute-Button im Header, History-Replay bleibt stumm.

**Tech Stack:** Web Audio API (`AudioContext` + `decodeAudioData` + `GainNode`), `localStorage` (Mute), Preact-Signal (Mute-State). MP3s als URL-Assets (kein JS-Bundle-Impact → Gzip-Budget unberührt). vitest (`node` env) für PURE-Teile.

---

## Scope & Phasen

**Phase 3 (letzte).** Branch `kitta/aar-939-monika-a-sound` (von P2-Tip `fe15824bb`, enthält P1+P2). Nach #2509-Merge auf staging → stacked-rebase `--onto origin/staging`.

**Verbindlich (Spec §7):**
- **Incoming** (`monika-incoming.mp3`): 1× pro Monika-Turn (erste Bubble), Min-Gap ~1 s.
- **Sent** (`monika-sent.mp3`): bei Chip-Klick + finalem Kontakt-Absenden.
- **Autoplay-Etikette:** Teaser bleibt **stumm**; Sound erst nach FAB-Tap (Tap entsperrt `AudioContext` synchron im Click-Handler).
- **Gain ~0.4** (dezent). **Mute** 🔊/🔇 im Header, `localStorage`-persistiert, **default AN**.
- **History-Replay** beim Resume: **stumm** (kein Ton-Gewitter für den Backlog).
- Kein Web-Audio / alter Browser → still degradieren (no-op), nie Fehler.

---

## File Structure

**Neu:**
- `src/embed/monika/sound.ts` — `shouldThrottle` (PURE) + `createSoundEngine(base, isMuted)` → `{ unlock, playIncoming, playSent }`.
- `src/embed/monika/sound.test.ts` — vitest (`shouldThrottle`).
- `public/embed/sounds/monika-incoming.mp3` — kopiert aus `universfield-new-notification-051-494246.mp3`.
- `public/embed/sounds/monika-sent.mp3` — kopiert aus `son_duquotidient-message-envoye-iphone-apple-391098.mp3`.

**Geändert:**
- `src/embed/monika/store.ts` — `getMuted`/`setMuted` (DI, default unmuted).
- `src/embed/monika/store.test.ts` — Mute-Tests.
- `src/embed/monika/app.tsx` — Sound-Engine-Init, unlock im FAB-Click, `playIncoming` in `playStep`, `playSent` in `choose`/`doAction`/`submitContact`, Mute-Button im Header.
- `src/embed/monika/styles.ts` — Mute-Button-Style.

---

## Task 1: Sound-Assets ins Repo

**Files:**
- Create: `public/embed/sounds/monika-incoming.mp3`
- Create: `public/embed/sounds/monika-sent.mp3`

- [ ] **Step 1: Verzeichnis + Kopieren** (PowerShell)
```powershell
$snd = "<worktree>\public\embed\sounds"
New-Item -ItemType Directory -Force $snd | Out-Null
Copy-Item "C:\Users\Aaron Sprafke\Downloads\universfield-new-notification-051-494246.mp3" "$snd\monika-incoming.mp3" -Force
Copy-Item "C:\Users\Aaron Sprafke\Downloads\son_duquotidient-message-envoye-iphone-apple-391098.mp3" "$snd\monika-sent.mp3" -Force
Get-ChildItem $snd | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}}
```
Expected: 2 Files (~77 KB / ~16 KB).

- [ ] **Step 2: Commit**
```bash
git add public/embed/sounds/monika-incoming.mp3 public/embed/sounds/monika-sent.mp3
git commit -m "feat(AAR-939 P3): Sound-Assets (incoming/sent mp3)"
```

---

## Task 2: `store.ts` — Mute-Persistenz (DI) + Tests

**Files:**
- Modify: `src/embed/monika/store.ts`
- Modify: `src/embed/monika/store.test.ts`

- [ ] **Step 1: Failing-Test ergänzen** (in `store.test.ts`, im `describe('dismiss + beats (DI)')` ein neues describe daneben)
```ts
import { getMuted, setMuted } from './store'

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
```

- [ ] **Step 2: Test fails** — `npx vitest run --root <wt> store` → FAIL (getMuted/setMuted fehlen).

- [ ] **Step 3: In `store.ts` ergänzen** (nach den BEATS-Funktionen)
```ts
const MUTED_KEY = (cfg: KeyCfg) => `monika:${base(cfg)}:muted`
export function getMuted(cfg: KeyCfg, storage: StorageLike | null = safeLocal()): boolean {
  if (!storage) return false
  try { return storage.getItem(MUTED_KEY(cfg)) === '1' } catch { return false }
}
export function setMuted(cfg: KeyCfg, muted: boolean, storage: StorageLike | null = safeLocal()): void {
  if (!storage) return
  try { storage.setItem(MUTED_KEY(cfg), muted ? '1' : '0') } catch { /* noop */ }
}
```

- [ ] **Step 4: Test passes** — `npx vitest run --root <wt> store` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/embed/monika/store.ts src/embed/monika/store.test.ts
git commit -m "feat(AAR-939 P3): Mute-Persistenz in store (DI, default unmuted)"
```

---

## Task 3: `sound.ts` — `shouldThrottle` PURE + Tests

**Files:**
- Create: `src/embed/monika/sound.ts`
- Test: `src/embed/monika/sound.test.ts`

- [ ] **Step 1: Failing-Test**

`src/embed/monika/sound.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { shouldThrottle } from './sound'

describe('shouldThrottle', () => {
  it('erster Play (lastAt null) → nicht gedrosselt', () => expect(shouldThrottle(null, 1000)).toBe(false))
  it('innerhalb 1s → gedrosselt', () => expect(shouldThrottle(1000, 1500)).toBe(true))
  it('nach 1s → nicht gedrosselt', () => expect(shouldThrottle(1000, 2100)).toBe(false))
  it('exakt 1s → nicht gedrosselt (>=)', () => expect(shouldThrottle(1000, 2000)).toBe(false))
})
```

- [ ] **Step 2: Test fails** — `npx vitest run --root <wt> sound` → FAIL.

- [ ] **Step 3: `sound.ts` (PURE-Teil zuerst)**
```ts
// AAR-939 · Monika-A-Flow · Sound. shouldThrottle = PURE (vitest). createSoundEngine =
// AudioContext-Wrapper (gesten-entsperrt, fetch+decode, Gain+Mute+Throttle).

const MIN_GAP_MS = 1000

/** true = zu kurz seit letztem Play (Min-Gap), also unterdruecken. */
export function shouldThrottle(lastAt: number | null, now: number, minGapMs = MIN_GAP_MS): boolean {
  if (lastAt === null) return false
  return now - lastAt < minGapMs
}
```

- [ ] **Step 4: Test passes** — `npx vitest run --root <wt> sound` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/embed/monika/sound.ts src/embed/monika/sound.test.ts
git commit -m "feat(AAR-939 P3): sound.ts shouldThrottle PURE + Test"
```

---

## Task 4: `sound.ts` — `createSoundEngine` (AudioContext-Wrapper)

**Files:**
- Modify: `src/embed/monika/sound.ts`

Nicht vitest-testbar (kein AudioContext im node) → `typecheck:embed` + Smoke (Task 7).

- [ ] **Step 1: Engine ergänzen** (in `sound.ts`)
```ts
type Win = Window & { webkitAudioContext?: typeof AudioContext }

export interface SoundEngine {
  unlock(): void
  playIncoming(): void
  playSent(): void
}

/** isMuted: Getter (liest das Mute-Signal des Widgets). base = claimondo-Origin fuer die MP3-URLs. */
export function createSoundEngine(base: string, isMuted: () => boolean): SoundEngine {
  let ctx: AudioContext | null = null
  let incoming: AudioBuffer | null = null
  let sent: AudioBuffer | null = null
  let lastIncomingAt: number | null = null
  let loading = false

  function ensureCtx(): AudioContext | null {
    if (ctx) return ctx
    try {
      const Ctor = window.AudioContext || (window as Win).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      return ctx
    } catch {
      return null
    }
  }

  async function loadBuffers(c: AudioContext): Promise<void> {
    if (loading || (incoming && sent)) return
    loading = true
    try {
      const [a, b] = await Promise.all([
        fetch(`${base}/embed/sounds/monika-incoming.mp3`).then((r) => r.arrayBuffer()),
        fetch(`${base}/embed/sounds/monika-sent.mp3`).then((r) => r.arrayBuffer()),
      ])
      incoming = await c.decodeAudioData(a)
      sent = await c.decodeAudioData(b)
    } catch {
      /* Asset/Decode-Fehler → Engine bleibt still */
    } finally {
      loading = false
    }
  }

  function play(buf: AudioBuffer | null): void {
    if (!ctx || !buf || isMuted()) return
    try {
      const src = ctx.createBufferSource()
      src.buffer = buf
      const gain = ctx.createGain()
      gain.gain.value = 0.4
      src.connect(gain).connect(ctx.destination)
      src.start(0)
    } catch {
      /* nie werfen */
    }
  }

  return {
    // Im FAB-Click-Handler synchron aufrufen: entsperrt Autoplay (Geste) + laedt Buffer.
    unlock() {
      const c = ensureCtx()
      if (!c) return
      if (c.state === 'suspended') void c.resume()
      void loadBuffers(c)
    },
    playIncoming() {
      const now = Date.now()
      if (shouldThrottle(lastIncomingAt, now)) return
      lastIncomingAt = now
      play(incoming)
    },
    playSent() {
      play(sent)
    },
  }
}
```

- [ ] **Step 2: typecheck:embed** — `npm run typecheck:embed` → PASS.

- [ ] **Step 3: Commit**
```bash
git add src/embed/monika/sound.ts
git commit -m "feat(AAR-939 P3): createSoundEngine (AudioContext unlock/decode/play, Gain 0.4)"
```

---

## Task 5: `app.tsx` — Sound verdrahten + Mute-Button

**Files:**
- Modify: `src/embed/monika/app.tsx`

- [ ] **Step 1: Imports + Engine + Mute-Signal**

Imports ergänzen:
```ts
import { createSoundEngine } from './sound'
import { getMuted, setMuted } from './store'
```
(`getMuted`/`setMuted` zum bestehenden `./store`-Import hinzufügen statt zweiter Zeile, falls schon importiert.)

In `MonikaApp`, bei den Signals:
```ts
  const muted = useSignal(getMuted(cfg))
```
Nach `const photo = ...`, die Engine einmalig (useRef, damit sie über Re-Renders stabil ist):
```ts
  const soundRef = useRef<ReturnType<typeof createSoundEngine> | null>(null)
  if (!soundRef.current) soundRef.current = createSoundEngine(cfg.base, () => muted.value)
```

- [ ] **Step 2: Unlock im FAB-Click**

In `openWidget()` ganz am Anfang (synchron, vor `open.value = true`):
```ts
  function openWidget() {
    if (open.value) return
    soundRef.current?.unlock() // Geste → Autoplay entsperren + Buffer laden
    open.value = true
    teaserBeat.value = 0
    track(cfg, 'monika_open')
    if (log.value.length === 0) playStep(START_STEP)
  }
```

- [ ] **Step 3: `playIncoming` beim ersten Bubble-Reveal eines Steps**

In `playStep(id)`, die Reveal-Stellen ergänzen. Beim ERSTEN Chunk (`i === 0` vor Increment) `playIncoming` feuern — sowohl im reduced-motion-Zweig als auch im Typing-Zweig, jeweils im Moment des Bubble-Hinzufügens:
```ts
    const playNext = () => {
      if (i >= s.messages.length) { awaiting.value = true; scrollDown(); return }
      const isFirst = i === 0
      const text = s.messages[i++]
      if (reduce) {
        if (isFirst) soundRef.current?.playIncoming()
        log.value = [...log.value, { role: 'monika', text }]
        scrollDown(); playNext(); return
      }
      typing.value = true; scrollDown()
      setTimeout(() => {
        typing.value = false
        if (isFirst) soundRef.current?.playIncoming()
        log.value = [...log.value, { role: 'monika', text }]
        scrollDown()
        setTimeout(playNext, 250)
      }, typingDurationMs(text))
    }
```

- [ ] **Step 4: `playSent` bei Chip / Action-Callback / Submit**

In `choose()` direkt nach dem User-Bubble-Push:
```ts
    log.value = [...log.value, { role: 'user', text: opt.label }]
    soundRef.current?.playSent()
```
In `doAction()` im `callback`-Zweig nach dem User-Bubble-Push:
```ts
    if (a.kind === 'callback' && a.next) {
      log.value = [...log.value, { role: 'user', text: a.label }]
      soundRef.current?.playSent()
      stepId.value = a.next
      playStep(a.next)
    }
```
In `submitContact()` im Erfolgszweig, direkt nach `if (result.ok) {`:
```ts
      soundRef.current?.playSent()
```

- [ ] **Step 5: Mute-Button im Header** (zwischen `.mk-head-meta` und `.mk-close`)
```tsx
        <button
          class="mk-mute"
          type="button"
          aria-label={muted.value ? 'Ton einschalten' : 'Ton ausschalten'}
          onClick={() => {
            muted.value = !muted.value
            setMuted(cfg, muted.value)
          }}
        >
          {muted.value ? '🔇' : '🔊'}
        </button>
```

- [ ] **Step 6: History-Replay bleibt stumm — verifizieren (kein Code)**

Der Resume-Pfad rendert History via `log.value = persisted.history` (direkte Zuweisung, KEIN `playStep`) → kein `playIncoming`. Der `awaiting`-Live-Schritt nach Resume ruft `playStep` NICHT auf (nur `awaiting.value = true`) → der erste Live-Sound kommt erst beim nächsten `choose`/`playStep`. Bestätigt: kein Backlog-Ton. (Nur lesen, kein Edit.)

- [ ] **Step 7: typecheck:embed** — `npm run typecheck:embed` → PASS.

- [ ] **Step 8: Commit**
```bash
git add src/embed/monika/app.tsx
git commit -m "feat(AAR-939 P3): Sound verdrahtet (unlock/incoming/sent) + Mute-Button im Header"
```

---

## Task 6: `styles.ts` — Mute-Button-Style

**Files:**
- Modify: `src/embed/monika/styles.ts`

- [ ] **Step 1: Style ergänzen** (bei den `.mk-head`-Regeln)
```ts
.mk-mute { background: none; border: none; color: #fff; cursor: pointer; font-size: 15px; line-height: 1; padding: 4px; border-radius: 6px; opacity: .85; }
.mk-mute:hover { opacity: 1; }
.mk-mute:focus-visible { outline: 2px solid var(--monika-accent); }
```

- [ ] **Step 2: Commit**
```bash
git add src/embed/monika/styles.ts
git commit -m "feat(AAR-939 P3): Mute-Button-Style"
```

---

## Task 7: build:embed + Browser-Smoke

**Files:** (keine — Verifikation)

- [ ] **Step 1: build:embed** — `node scripts/build-monika.mjs` → gz < 30 KB, exit 0. (MP3s sind URL-Assets, kein Bundle-Impact; nur ~1 KB JS für die Engine.)

- [ ] **Step 2: Browser-Smoke** (`scripts/_monika-p3-smoke.mjs`, nicht committen; Chromium mit `--autoplay-policy=no-user-gesture-required` + `--mute-audio`, damit `AudioContext` ohne Block läuft und nichts hörbar tönt). Server serviert zusätzlich `/embed/sounds/*.mp3`. Schritte:
  1. Laden → FAB. Klick FAB (= unlock).
  2. Warte `.mk-chip` → Screenshot `01-header-mute.png`. Prüfe: Header zeigt `.mk-mute` mit `🔊`.
  3. Asset-Erreichbarkeit: `page.request.get(base + '/embed/sounds/monika-incoming.mp3')` → status 200; ebenso sent.
  4. Klick `.mk-mute` → Text wird `🔇`; reload (Resume) → erneut öffnen → `.mk-mute` zeigt `🔇` (Mute persistiert via localStorage). Screenshot `02-muted-persist.png`.
  5. Vollen Pfad (Haftpflicht → … → Submit) durchklicken → **keine Page-Errors** (AudioContext-Fehler würden hier auftauchen). Screenshot `03-flow-no-errors.png`.
  6. Console-/pageerror-Sammler: 0 Fehler.

- [ ] **Step 3: Screenshots auswerten + SMOKE.md** — im selben Turn ansehen (Pflicht). `docs/06.06.2026/monika-p3-smoke/SMOKE.md`: Mute-Button sichtbar + toggelt + persistiert, MP3-Assets 200, voller Flow ohne Page-Errors. (Hörbarkeit ist im Headless nicht prüfbar — dokumentieren, dass Audio-Pfad fehlerfrei läuft + Assets fetchbar sind; manuelle Hörprobe = Aarons Staging-Test.)

---

## Task 8: Gates + PR

- [ ] **Step 1: vitest voll** — `npx vitest run --root <wt> sound store teaser flow-script payload typing anfrage-columns embed-anfrage` → alle grün.
- [ ] **Step 2: typecheck** — `npm run typecheck:embed` + voller `npm run typecheck` → grün.
- [ ] **Step 3: token-audit** — `npm run check:token-audit` → grün.
- [ ] **Step 4: PR** — temp-Smoke entfernen (`git clean -f`), push, `gh pr create --base staging` (bzw. base = P2-Branch falls #2509 noch nicht gemergt → stacked; nach #2509-Merge rebase `--onto origin/staging` + retarget). Body: 7-Punkte-Audit + Verweis Spec §7.

---

## Self-Review (writing-plans)

**Spec-Coverage (§7):** Incoming 1×/Turn + Min-Gap → Task 3 (`shouldThrottle`) + 5 Step 3 (`isFirst`-Gate). Sent bei Chip/Submit → Task 5 Step 4. Autoplay-Etikette (Teaser stumm, unlock bei FAB-Tap) → Task 4 (`unlock`) + 5 Step 2 (im FAB-Click); Teaser ruft keinen Sound (Task 5 fasst nur openWidget/choose/doAction/submit an, nicht den Teaser-Render). Gain 0.4 → Task 4 (`play`). Mute persistiert default-AN → Task 2 (`getMuted` default false) + 5 Step 5 (Button) + 6 (Style). History-Replay stumm → Task 5 Step 6 (verifiziert: Resume nutzt kein playStep). Degradation → Task 4 (ensureCtx/loadBuffers/play alle try-catch → no-op).

**Platzhalter-Scan:** keine TBD/TODO; alle Code-Steps vollständig.

**Typ-Konsistenz:** `createSoundEngine(base: string, isMuted: () => boolean): SoundEngine` — Signatur identisch in Task 4 (Def) + Task 5 (Caller via `() => muted.value`). `shouldThrottle(lastAt, now, minGapMs?)` Task 3 == Task 4-Nutzung. `getMuted/setMuted(cfg, …, storage?)` Task 2 == Task 5-Caller (2-arg-Form `getMuted(cfg)` / `setMuted(cfg, muted.value)` → default localStorage). `muted` = Preact-Signal<boolean>.
