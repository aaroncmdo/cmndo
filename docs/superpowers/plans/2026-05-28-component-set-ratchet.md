# Component-Set Ratchet + Button-Ergonomie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Komponenten-Set-Policy von einer 9-%-Wunschregel zu einem CI-erzwungenen Standard machen (Ratchet) und die Button-Primitive-API entreiben (loading, focus-ring, `onClick`/`variant`), damit das Primitive der leichteste Weg wird.

**Architecture:** (1) `scripts/check-component-set.mjs` wird von warn-only auf einen Baseline-**Ratchet** gehoben — Scan-/Diff-Logik in eine pure Lib extrahiert (node-testbar), CLI-Wrapper mit `--warn`/`--ratchet`/`--update-baseline`, in `ci.yml` verdrahtet wie `check:token-audit`. (2) Button bekommt eine pure `resolveButtonProps`-Logik (DRY über web+native), `onClick`/`variant` kanonisch mit `@deprecated onPress`/`tone`, `loading`-State und einen focus-visible-Ring. TDD läuft über die **pure functions** (vitest node-env, garantiert), JSX-Wiring wird per `tsc`+`build` abgesichert.

**Tech Stack:** Node ESM (`.mjs`) für Scripts, vitest (node-env) für Unit-Tests, TypeScript/React 19 (web `*.web.tsx`) + React Native (native `*.native.tsx`), Tailwind v4 + `src/lib/design-tokens.ts`, GitHub Actions (`.github/workflows/ci.yml`).

**Wichtig — Testlauf-Kontext:** vitest ist **nicht** in CI (CI gatet: typecheck, lint[soft], check:token-audit, check:tailwind-arbitrary, check:i18n, check:rls-grants, build). Die Unit-Tests hier sind Dev-Zeit-Disziplin. Der neue CI-**Gate** für diese Arbeit ist der `check:component-set --ratchet`-Step (Task 4) + `tsc`/`build`. Tests lokal via `npm run test`.

---

## File Structure

**Neu:**
- `scripts/lib/component-set-scan.mjs` — pure Scan-/Diff-Logik (PATTERNS, `scanContent`, `diffBaseline`). Keine I/O, keine git-Calls → unit-testbar.
- `scripts/lib/component-set-scan.test.mjs` — vitest-Tests der pure Logik.
- `scripts/component-set-baseline.json` — committete Baseline (Menge der heute verletzenden Files).
- `src/components/primitives/Button/Button.logic.ts` — pure `resolveButtonProps` (Alias-/State-Auflösung). DRY über web+native.
- `src/components/primitives/Button/Button.logic.test.ts` — vitest-Tests der Resolver-Logik.

**Geändert:**
- `scripts/check-component-set.mjs` — wird CLI-Wrapper um die Lib, mit Flag-Modi.
- `package.json` — `check:component-set`-Script bleibt; (kein neuer Eintrag nötig, Flags via `-- --ratchet`).
- `.github/workflows/ci.yml` — neuer Step `Component-Set-Ratchet`.
- `src/components/primitives/Button/Button.types.ts` — `variant`/`onClick`/`loading` ergänzen, `tone`/`onPress` `@deprecated`.
- `src/components/primitives/Button/Button.web.tsx` — Resolver nutzen + `loading`-Spinner + focus-ring-Klasse.
- `src/components/primitives/Button/Button.native.tsx` — Resolver nutzen + `ActivityIndicator` für `loading`.
- `src/app/globals.css` — `@keyframes cmdo-btn-spin` + `.cmdo-btn:focus-visible`-Regel.
- `AGENTS.md` — §Komponenten-Set: Ratchet + `onClick`/`variant` kanonisch dokumentieren.

**Out of scope (Folge-Arbeit, durch den Ratchet ermöglicht):** der `onPress→onClick`/`tone→variant`-Rename-Codemod über die 72 Bestandsnutzer, die Migration der 5 Admin-Tabellen auf `shared/DataTable`, und die Card-API-Vervollständigung. Siehe Abschnitt „Follow-up" unten — bewusst NICHT in diesem Plan, weil per-File-Arbeit + Kollision mit aktiven Sessions.

---

## Task 1: Pure Scan-/Diff-Lib für den Ratchet

**Files:**
- Create: `scripts/lib/component-set-scan.mjs`
- Test: `scripts/lib/component-set-scan.test.mjs`

- [ ] **Step 1: Failing test schreiben**

`scripts/lib/component-set-scan.test.mjs`:
```js
import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from './component-set-scan.mjs'

describe('scanContent', () => {
  it('flaggt handgerollten Button mit Brand-Styling', () => {
    const src = '<button className="rounded-lg bg-claimondo-navy px-4">Los</button>'
    expect(scanContent(src)).not.toBeNull()
  })
  it('flaggt handgerollte <table>', () => {
    expect(scanContent('<table><tbody/></table>')).not.toBeNull()
  })
  it('ignoriert sauberes Markup ohne Treffer', () => {
    expect(scanContent('<div className="flex gap-2"><Button>Los</Button></div>')).toBeNull()
  })
})

describe('diffBaseline', () => {
  it('meldet neue Verletzer (in current, nicht in baseline)', () => {
    const r = diffBaseline(['a.tsx', 'b.tsx'], ['a.tsx'])
    expect(r.added).toEqual(['b.tsx'])
    expect(r.removed).toEqual([])
  })
  it('meldet behobene Verletzer (in baseline, nicht in current)', () => {
    const r = diffBaseline(['a.tsx'], ['a.tsx', 'c.tsx'])
    expect(r.added).toEqual([])
    expect(r.removed).toEqual(['c.tsx'])
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag verifizieren**

Run: `npm run test -- scripts/lib/component-set-scan.test.mjs`
Expected: FAIL — `Failed to resolve import "./component-set-scan.mjs"`.

- [ ] **Step 3: Lib implementieren**

`scripts/lib/component-set-scan.mjs`:
```js
// Pure Scan-/Diff-Logik fuer die Component-Set-Drift-Bremse.
// Keine I/O, kein git — damit unit-testbar. CLI-Wrapper: ../check-component-set.mjs

export const PATTERNS = [
  {
    re: /<button\b[^>]*className=["'`][^"'`]*\b(rounded|bg-claimondo-(navy|ondo|shield))\b/,
    msg: 'handgerollter <button> mit Styling -> primitives.Button',
  },
  {
    re: /<div\b[^>]*className=["'`][^"'`]*bg-white[^"'`]*rounded[^"'`]*border[^"'`]*claimondo-border/,
    msg: 'handgerollte Section-Card-<div> -> primitives.Card / shared/SectionCard',
  },
  {
    re: /function\s+(StatCard|KpiCard|KpiBox|FilterChip|StatusPill|MiniDrawer|SectionCard|InfoRow|InfoCard)\b/,
    msg: 'lokale Reimplementierung eines shared-Pendants',
  },
  {
    re: /<table\b/,
    msg: 'handgerollte <table> -> shared/DataTable',
  },
]

// Gibt die erste passende msg zurueck, sonst null.
export function scanContent(src) {
  for (const { re, msg } of PATTERNS) {
    if (re.test(src)) return msg
  }
  return null
}

// added = in current, nicht in baseline (neue Verletzer -> CI rot).
// removed = in baseline, nicht in current (behoben -> Ratchet kann sinken).
export function diffBaseline(currentFiles, baselineFiles) {
  const base = new Set(baselineFiles)
  const cur = new Set(currentFiles)
  return {
    added: currentFiles.filter((f) => !base.has(f)).sort(),
    removed: baselineFiles.filter((f) => !cur.has(f)).sort(),
  }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg verifizieren**

Run: `npm run test -- scripts/lib/component-set-scan.test.mjs`
Expected: PASS (5 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/component-set-scan.mjs scripts/lib/component-set-scan.test.mjs
git commit -m "$(cat <<'EOF'
test(component-set): pure Scan-/Diff-Lib fuer Ratchet (TDD)

scanContent + diffBaseline als pure Functions extrahiert, node-testbar.

Audit: n/a (neue Lib+Test, kein UI/Route-Change). Build: tsc unberuehrt.
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `check-component-set.mjs` auf CLI-Modi umbauen

**Files:**
- Modify: `scripts/check-component-set.mjs` (komplett ersetzen)

- [ ] **Step 1: CLI-Wrapper implementieren**

`scripts/check-component-set.mjs` (Vollersatz):
```js
#!/usr/bin/env node
// Component-Set-Drift-Bremse. Drei Modi:
//   (default)         --warn   : listet Verdachts-Files, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Migrationen)
// Pure Logik: scripts/lib/component-set-scan.mjs. Siehe AGENTS.md §Komponenten-Set.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/component-set-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'component-set-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const files = execSync('git ls-files "src/app/**/*.tsx" "src/components/**/*.tsx"', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter(
    (f) =>
      !f.includes('/components/ui/') &&
      !f.includes('/components/primitives/') &&
      !f.includes('/components/shared/'),
  )

const violating = []
for (const f of files) {
  const msg = scanContent(readFileSync(f, 'utf8'))
  if (msg) {
    violating.push(f)
    if (mode === 'warn') console.warn(`[component-set] ${f}: ${msg}`)
  }
}
violating.sort()

if (mode === 'update') {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: violating.length,
    files: violating,
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[component-set] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[component-set] FEHLER: keine Baseline. Erst `npm run check:component-set -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[component-set] ${added.length} NEUE handgerollte Komponente(n) — bitte primitives/shared nutzen:`)
    for (const f of added) console.error(`  + ${f}`)
    console.error('Wenn bewusst & unvermeidbar: Datei migrieren ODER (Ausnahme) Baseline via `-- --update-baseline` neu schreiben + im PR begruenden.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[component-set] ${removed.length} Verletzer behoben — Baseline kann gesenkt werden: \`npm run check:component-set -- --update-baseline\``)
  }
  console.log(`[component-set] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(
  `[component-set] ${violating.length} Datei(en) mit Drift-Verdacht (${files.length} geprueft). Policy: AGENTS.md §Komponenten-Set`,
)
process.exit(0)
```

- [ ] **Step 2: Default-Modus testen (muss exit 0 bleiben, listet)**

Run: `node scripts/check-component-set.mjs`
Expected: Liste + `[component-set] N Datei(en) mit Drift-Verdacht`, exit 0.

- [ ] **Step 3: Ratchet ohne Baseline testen (muss exit 1)**

Run: `node scripts/check-component-set.mjs --ratchet; echo "exit=$?"`
Expected: Fehlermeldung „keine Baseline" + `exit=1`.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-component-set.mjs
git commit -m "$(cat <<'EOF'
feat(component-set): CLI-Modi warn/ratchet/update-baseline

check-component-set.mjs nutzt die pure Lib; --ratchet ist der CI-Gate,
--update-baseline schreibt die Baseline. Default bleibt warn (exit 0).

Audit: n/a (Build-Script). Build: tsc unberuehrt. Regression: alter
Default-Aufruf verhaelt sich wie zuvor (warn, exit 0).
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Baseline generieren + committen

**Files:**
- Create: `scripts/component-set-baseline.json` (generiert)

- [ ] **Step 1: Baseline schreiben**

Run: `npm run check:component-set -- --update-baseline`
Expected: `[component-set] Baseline aktualisiert: N Files -> .../component-set-baseline.json`.

- [ ] **Step 2: Ratchet gegen frische Baseline grün verifizieren**

Run: `node scripts/check-component-set.mjs --ratchet; echo "exit=$?"`
Expected: `[component-set] OK — N bekannte Verletzer (Baseline N), 0 neue.` + `exit=0`.

- [ ] **Step 3: Negativ-Probe — künstlichen Neu-Verstoß einbauen, Rot verifizieren, zurückrollen**

```bash
printf '%s\n' 'export default function X(){ return <button className="rounded-lg bg-claimondo-navy">x</button> }' > src/app/_ratchet_probe.tsx
node scripts/check-component-set.mjs --ratchet; echo "exit=$?"   # erwartet: + src/app/_ratchet_probe.tsx, exit=1
rm src/app/_ratchet_probe.tsx
```
Expected: Mittlerer Aufruf listet `+ src/app/_ratchet_probe.tsx` und `exit=1`; nach `rm` ist alles wieder sauber.

- [ ] **Step 4: Commit**

```bash
git add scripts/component-set-baseline.json
git commit -m "$(cat <<'EOF'
chore(component-set): Baseline-Snapshot der aktuellen Drift

Frozen set der heute handgerollten Komponenten. Ab jetzt blockt der
Ratchet NEUE Verstoesse; Bestand wird per Boy-Scout abgebaut.

Audit: n/a (generierter Snapshot). Regression: keine — reine Datendatei.
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Ratchet in CI verdrahten

**Files:**
- Modify: `.github/workflows/ci.yml` (nach dem Tailwind-Arbitrary-Step, vor i18n)

- [ ] **Step 1: Step einfügen**

In `.github/workflows/ci.yml`, direkt nach dem Block `- name: Tailwind-Arbitrary` / `run: npm run check:tailwind-arbitrary` (aktuell Zeile 61-62) einfügen:
```yaml
      # Component-Set-Drift-Bremse (Ratchet): blockt NEUE handgerollte
      # Buttons/Cards/Tables ggue. scripts/component-set-baseline.json.
      # Bestand wird per Boy-Scout abgebaut (-- --update-baseline senkt die
      # Baseline). Siehe AGENTS.md §Komponenten-Set.
      - name: Component-Set-Ratchet
        run: npm run check:component-set -- --ratchet
```

- [ ] **Step 2: YAML-Validität + Befehl lokal nachstellen**

Run: `npm run check:component-set -- --ratchet; echo "exit=$?"`
Expected: `exit=0` (entspricht dem, was der CI-Step ausführt).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci(component-set): Ratchet-Step als Gate gegen neue Drift

npm run check:component-set -- --ratchet nach Tailwind-Arbitrary.
PRs werden rot bei neuen handgerollten Komponenten.

Audit: n/a (CI-Config). Build: unbeeinflusst.
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Button-Resolver (pure) — Alias + Loading-State

**Files:**
- Create: `src/components/primitives/Button/Button.logic.ts`
- Test: `src/components/primitives/Button/Button.logic.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/components/primitives/Button/Button.logic.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveButtonProps } from './Button.logic'

describe('resolveButtonProps', () => {
  it('variant gewinnt ueber tone, sonst tone, sonst navy', () => {
    expect(resolveButtonProps({ variant: 'ondo', tone: 'danger' }).tone).toBe('ondo')
    expect(resolveButtonProps({ tone: 'danger' }).tone).toBe('danger')
    expect(resolveButtonProps({}).tone).toBe('navy')
  })
  it('onClick gewinnt ueber onPress', () => {
    const onClick = vi.fn()
    const onPress = vi.fn()
    resolveButtonProps({ onClick, onPress }).handler?.()
    expect(onClick).toHaveBeenCalledOnce()
    expect(onPress).not.toHaveBeenCalled()
  })
  it('loading erzwingt isDisabled', () => {
    expect(resolveButtonProps({ loading: true }).isDisabled).toBe(true)
    expect(resolveButtonProps({ disabled: true }).isDisabled).toBe(true)
    expect(resolveButtonProps({}).isDisabled).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag verifizieren**

Run: `npm run test -- src/components/primitives/Button/Button.logic.test.ts`
Expected: FAIL — `Failed to resolve import "./Button.logic"`.

- [ ] **Step 3: Resolver implementieren**

`src/components/primitives/Button/Button.logic.ts`:
```ts
// Pure Aufloesung der Button-Props (Alias-Bruecke + State). DRY ueber
// Button.web.tsx + Button.native.tsx. Keine React/RN-Abhaengigkeit.
import type { ButtonProps, ButtonTone } from './Button.types'

export function resolveButtonProps(props: ButtonProps): {
  tone: ButtonTone
  handler: (() => void) | undefined
  isDisabled: boolean
  loading: boolean
} {
  const tone = props.variant ?? props.tone ?? 'navy'
  const handler = props.onClick ?? props.onPress
  const loading = Boolean(props.loading)
  return { tone, handler, isDisabled: Boolean(props.disabled) || loading, loading }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg verifizieren**

Run: `npm run test -- src/components/primitives/Button/Button.logic.test.ts`
Expected: PASS (3 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/components/primitives/Button/Button.logic.ts src/components/primitives/Button/Button.logic.test.ts
git commit -m "$(cat <<'EOF'
test(button): pure resolveButtonProps (Alias-Bruecke + loading) TDD

variant->tone, onClick->onPress, loading->disabled. Shared web+native.

Audit: n/a (pure util+test). Build: tsc gruen.
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `Button.types.ts` — kanonische Props + Deprecation

**Files:**
- Modify: `src/components/primitives/Button/Button.types.ts`

- [ ] **Step 1: Types erweitern**

In `src/components/primitives/Button/Button.types.ts`: unter der `ButtonTone`-Zeile (Zeile 9) ergänzen:
```ts
/** Kanonischer Name fuer die Farbvariante (identische Werte wie ButtonTone). */
export type ButtonVariant = ButtonTone
```
Im `ButtonProps`-Objekt: `tone` und `onPress` als deprecated markieren und `variant`/`onClick`/`loading` ergänzen. Ersetze das `tone?`-Feld (Zeile 14-16) durch:
```ts
  /** @deprecated Nutze `variant`. Alias bleibt als Uebergangs-Bruecke (wird nach Codemod entfernt). */
  tone?: ButtonTone
  /** Farbvariante (default 'navy'). Kanonisch — ersetzt `tone`. */
  variant?: ButtonVariant
```
Ersetze das `onPress?`-Feld (Zeile 26-30) durch:
```ts
  /** @deprecated Nutze `onClick`. Alias bleibt als Uebergangs-Bruecke (wird nach Codemod entfernt). */
  onPress?: () => void
  /**
   * Klick-Handler. Optional — bei reinem `type="submit"` in einem `<form>` darf
   * er fehlen (das Formular uebernimmt den Submit). Kanonisch — ersetzt `onPress`.
   */
  onClick?: () => void
```
Vor `className` ergänzen:
```ts
  /** Zeigt einen Spinner und deaktiviert den Button (verhindert Doppel-Submit). */
  loading?: boolean
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 (bestehende `tone`/`onPress`-Nutzer kompilieren weiter — Aliase sind nur deprecated, nicht entfernt).

- [ ] **Step 3: Resolver-Tests bleiben grün**

Run: `npm run test -- src/components/primitives/Button/Button.logic.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/primitives/Button/Button.types.ts
git commit -m "$(cat <<'EOF'
feat(button): onClick/variant kanonisch, onPress/tone @deprecated + loading

API-Bruecke: alte Namen bleiben als deprecated Aliase (Codemod folgt),
neue Props onClick/variant/loading. Kein Breaking-Change.

Audit: n/a (Types). Build: tsc gruen — bestehende 72 Nutzer kompilieren.
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `globals.css` — Spinner-Keyframe + focus-visible-Ring

**Files:**
- Modify: `src/app/globals.css` (ans Dateiende anhängen)

- [ ] **Step 1: CSS ergänzen**

Ans Ende von `src/app/globals.css`:
```css
/* primitives/Button: focus-visible-Ring (a11y) + loading-Spinner. */
@keyframes cmdo-btn-spin {
  to { transform: rotate(360deg); }
}
.cmdo-btn:focus-visible {
  outline: 2px solid var(--brand-primary, #0D1B3E);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verifizieren, dass die Datei existiert + Regel drin ist**

Run: `git ls-files src/app/globals.css && grep -c "cmdo-btn" src/app/globals.css`
Expected: Pfad wird gelistet + Count `2`. (Falls `git ls-files` leer: korrekten globals.css-Pfad via `git ls-files "**/globals.css"` finden und dort anhängen.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
feat(button): globals.css — focus-visible-Ring + Spinner-Keyframe

Token-gebundener focus-Ring (var(--brand-primary)) + cmdo-btn-spin fuer
den loading-Spinner. Vorbereitung fuer Button.web.tsx.

Audit: n/a (CSS). Inkonsistenz: Brand-Var statt Hex (Fallback Claimondo-navy).
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `Button.web.tsx` — Resolver + loading + focus-ring

**Files:**
- Modify: `src/components/primitives/Button/Button.web.tsx`

- [ ] **Step 1: Imports + Resolver einsetzen**

In `src/components/primitives/Button/Button.web.tsx` nach Zeile 8 (`import type ...`) ergänzen:
```tsx
import { resolveButtonProps } from './Button.logic'
```
Im Funktionsbody die manuelle `tone`/`onPress`/`disabled`-Nutzung durch den Resolver ersetzen. Ersetze die Zeilen `const t = toneMap[tone]` … (Zeile 84) durch:
```tsx
  const { tone, handler, isDisabled, loading } = resolveButtonProps(arguments[0] as ButtonProps)
  const t = toneMap[tone]
  const isIcon = size === 'icon'
```
Hinweis: `tone`/`onPress`/`disabled` aus der Destrukturierung der Funktionssignatur entfernen (Step 2), damit kein Schatten-Konflikt entsteht.

- [ ] **Step 2: Signatur-Destrukturierung anpassen**

Ersetze die Parameter-Destrukturierung (Zeile 70-82) durch (nur noch die Props, die direkt verwendet werden — Alias-Props laufen über den Resolver via `arguments`):
```tsx
export function Button(props: ButtonProps) {
  const { children, size = 'md', iconLeft, iconRight, fullWidth, type = 'button', className, ariaLabel } = props
  const [hover, setHover] = useState(false)
  const { tone, handler, isDisabled, loading } = resolveButtonProps(props)
  const t = toneMap[tone]
  const isIcon = size === 'icon'
```
(Damit entfällt das `arguments`-Konstrukt aus Step 1 — `props` direkt nutzen.)

- [ ] **Step 3: Style/Markup — disabled→isDisabled, Spinner, focus-Klasse**

Im `style`-Objekt `disabled` → `isDisabled` ersetzen (Zeilen 98, 104, 105: `backgroundColor`, `cursor`, `opacity`). Das `<button>`-Markup (Zeile 109-124) ersetzen durch:
```tsx
  const spinner = (
    <span
      aria-hidden
      style={{
        width: fontSizeMap[size],
        height: fontSizeMap[size],
        border: `2px solid ${t.text}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'cmdo-btn-spin 700ms linear infinite',
      }}
    />
  )

  return (
    <button
      type={type}
      style={style}
      className={['cmdo-btn', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      onClick={isDisabled ? undefined : handler}
      disabled={isDisabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {loading ? spinner : iconLeft}
      {!isIcon && children}
      {isIcon && !loading && children}
      {iconRight}
    </button>
  )
```

- [ ] **Step 4: Typecheck + Build**

Run: `npm run typecheck`
Expected: exit 0.
Run: `npm run build`
Expected: exit 0 (Button ist breit konsumiert — voller Build ist Pflicht, AGENTS.md §Post-Task-Audit Punkt 1).

- [ ] **Step 5: Commit**

```bash
git add src/components/primitives/Button/Button.web.tsx
git commit -m "$(cat <<'EOF'
feat(button/web): Resolver + loading-Spinner + focus-visible-Ring

Nutzt resolveButtonProps (Alias/loading), rendert Spinner bei loading,
setzt cmdo-btn fuer den a11y focus-Ring. onClick/onPress beide bedient.

Audit:
- Build: gruen (npm run build)
- Redundanz: pure Resolver shared mit native, keine Duplikation
- Inkonsistenz: Spinner-Farbe = tone.text (Token), focus = var(--brand-primary)
- Regression: bestehende tone/onPress-Nutzer unveraendert (Aliase)
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `Button.native.tsx` — Resolver + ActivityIndicator

**Files:**
- Modify: `src/components/primitives/Button/Button.native.tsx`

- [ ] **Step 1: Imports + Resolver**

In `src/components/primitives/Button/Button.native.tsx` Zeile 6 (`import { Pressable, Text, View } from 'react-native'`) ersetzen durch:
```tsx
// @ts-expect-error RN ist optional peer dep
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
```
Nach Zeile 8 ergänzen:
```tsx
import { resolveButtonProps } from './Button.logic'
```

- [ ] **Step 2: Signatur + Resolver**

Parameter-Destrukturierung (Zeile 39-49) ersetzen durch:
```tsx
export function Button(props: ButtonProps) {
  const { children, size = 'md', iconLeft, iconRight, fullWidth, ariaLabel } = props
  const { tone, handler, isDisabled, loading } = resolveButtonProps(props)
  const t = toneMap[tone]
  const isIcon = size === 'icon'
```
Im `containerStyle` (Zeile 65) `disabled ? 0.5 : 1` → `isDisabled ? 0.5 : 1`.

- [ ] **Step 3: Markup — disabled→isDisabled, Spinner**

Den `<Pressable>`-Block (Zeile 76-88) ersetzen durch:
```tsx
    <Pressable
      onPress={isDisabled ? undefined : handler}
      disabled={isDisabled}
      accessibilityLabel={ariaLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }: { pressed: boolean }) => [
        containerStyle,
        { opacity: pressed && !isDisabled ? 0.7 : containerStyle.opacity },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.text} size="small" />
      ) : (
        <>
          {iconLeft ? <View>{iconLeft}</View> : null}
          {isIcon ? children : <Text style={textStyle}>{children}</Text>}
          {iconRight ? <View>{iconRight}</View> : null}
        </>
      )}
    </Pressable>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (Native-File ist via `@ts-expect-error` von RN-Typen entkoppelt; `resolveButtonProps` ist typisiert.)

- [ ] **Step 5: Commit**

```bash
git add src/components/primitives/Button/Button.native.tsx
git commit -m "$(cat <<'EOF'
feat(button/native): Resolver + ActivityIndicator fuer loading

Spiegelt die Web-Aenderung: resolveButtonProps (Alias/loading),
ActivityIndicator statt Inhalt bei loading. Shared Logik.

Audit: n/a (Native, kein Web-Build-Pfad). Redundanz: Resolver shared.
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: AGENTS.md — Ratchet + kanonische API dokumentieren

**Files:**
- Modify: `AGENTS.md` (§Komponenten-Set)

- [ ] **Step 1: Abschnitt ergänzen**

In `AGENTS.md`, am Ende des Abschnitts „# Komponenten-Set — verbindlich" (vor „# Whitelabel-Branding") einfügen:
```markdown
## Durchsetzung (Ratchet, ab Phase 2)

CI fährt `npm run check:component-set -- --ratchet`. Es blockt **neue** handgerollte Buttons/Cards/Tables/Reimplementierungen gegen `scripts/component-set-baseline.json` (Menge der bei Phase-2-Start bekannten Verletzer). Bestand wird per **Boy-Scout** abgebaut: Wer ein File anfasst, migriert dessen Buttons/Cards aufs Primitive und senkt die Baseline mit `npm run check:component-set -- --update-baseline`. Lokal (ohne Flag) bleibt das Script `--warn` (exit 0).

**Button-API:** `onClick`/`variant` sind **kanonisch**. `onPress`/`tone` sind `@deprecated`-Aliase (Übergangs-Brücke, werden nach dem Rename-Codemod entfernt) — kein neuer Code nutzt sie. `loading` zeigt Spinner + deaktiviert.

Design/Plan: `docs/superpowers/specs/2026-05-28-component-set-ratchet-design.md` + `docs/superpowers/plans/2026-05-28-component-set-ratchet.md`.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "$(cat <<'EOF'
docs(agents): Komponenten-Set — Ratchet + onClick/variant kanonisch

Dokumentiert das CI-Gate, Boy-Scout-Abbau, Deprecation der alten
Button-Aliase. Verweis auf Spec + Plan.

Audit: n/a (Doku).
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec-Coverage (gegen das Design-Doc):**
- Teil A Ratchet → Tasks 1-4 ✅ (Lib, CLI-Modi, Baseline, CI-Step). D2 (File-Set) in `diffBaseline`, D3 (warn lokal / ratchet CI) in Task 2/4.
- Teil B API-Reibung → Tasks 5-9 ✅ (Resolver/loading/focus, Types-Deprecation, web, native, globals.css). D1 (onClick/variant kanonisch + @deprecated Brücke) in Task 6.
- Teil D AGENTS.md → Task 10 ✅.
- Teil C Migration (Codemod + 5 Tabellen + Card-API) → bewusst **out of scope** (Follow-up unten) — Begründung: per-File-Arbeit + Kollision mit aktiven Sessions; der Ratchet ist die Voraussetzung dafür.

**Placeholder-Scan:** keine TBD/„später" — jeder Code-Step zeigt vollständigen Code; Befehle mit erwartetem Output.

**Typ-Konsistenz:** `resolveButtonProps` Rückgabe `{ tone, handler, isDisabled, loading }` wird in Task 8 + 9 identisch destrukturiert. `ButtonVariant = ButtonTone` (Task 6) konsistent mit Resolver (Task 5). `cmdo-btn` (Task 7 CSS) == className in Task 8. `--ratchet`/`--update-baseline`-Flags identisch in Task 2/3/4/10.

**Risiko-Hinweis für den Ausführenden:** Tasks 5-9 (Button) fassen ein **breit konsumiertes** Primitive an (72 Importer). Task 8/9 sind rein additiv (Aliase, kein Rename) → kein Breaking-Change; `npm run build` in Task 8 ist die harte Absicherung.

---

## Follow-up (NICHT in diesem Plan — separate Tickets/Pläne)

1. **Rename-Codemod** `onPress→onClick`, `tone→variant` über die 72 Bestandsnutzer (gestaffelt nach Datei-Temperatur; heiße Portale zuletzt). Danach Aliase aus `Button.types.ts` entfernen.
2. **5 Admin-Tabellen** auf `shared/DataTable` migrieren (kalt): `admin/statistiken/StatistikenClient`, `admin/partner/waitlist/WaitlistTable`, `admin/_components/StripeConnectStatusWidget` / `LeadPreiseVerteilungWidget` / `AusstehendeZahlungenTable`. Jede senkt die Baseline.
3. **Card-API** gegen häufige handgerollte SectionCard-Formen prüfen, Lücken schließen.
4. **Boy-Scout** als Dauer-Praxis (in AGENTS.md verankert, Task 10).
