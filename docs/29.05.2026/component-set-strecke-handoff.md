# Component-Set / Frontend-Hygiene-Strecke — Handoff

**Datum:** 2026-05-29
**Session:** Component-Set-/Frontend-Hygiene (eigener Worktree `.claude/worktrees/component-set-ratchet`, NICHT der Monika-Fleet)
**Status:** gutachter + dispatch komplett; admin/kunde/makler/components/public + login offen

Single entry point fuer jede Folge-Session, die die Component-Set-Boy-Scout-Migration weiterfuehrt.

---

## 1. Was erreicht wurde (heute, 7 PRs)

| PR | Inhalt | Status |
|----|--------|--------|
| #1990 | **Whitelabel-Fix**: 12 Web-Primitives lasen Marken-Farben als harte Inline-Hex -> neuer `cssColors`-Resolver (`var(--brand-*, fallback)`) in `design-tokens.ts`; alle Primitives umgestellt | MERGED |
| #1996 | **Radius-Unify** (Wurzel-Fix): zwei nicht-aligned Radius-Skalen (TS-Tokens 8/14/20 vs CSS `--radius-ios` 12/18/24/32) zu EINER zusammengefuehrt. `design-tokens.radius` = ios-Skala; `Button` = `radius.lg` (24px) | MERGED |
| #2003 | **gutachter Buttons** -> primitives.Button + Ratchet-**Tint-Fix** (`(?!/)` schliesst Opacity-Tints aus) | MERGED |
| #2008 | **SectionCard `id`+`cn`-Enhancement** + gutachter Card-Divs Batch 1 (termine/[id], statistiken, NachbesichtigungCard) | MERGED |
| #2013 | gutachter Card-Divs Batch 2 (abrechnung, SVKalender, profil) | MERGED |
| #2022 | **Scanner-Blindspot-Fix**: Brace-Balancing im Button-Detektor (Arrow-Handler vor className wurden nie geflaggt). Baseline 134->169 (+35 zuvor unsichtbare Buttons getrackt) | MERGED |
| #2027 | **dispatch Buttons** -> primitives.Button (19 Files, 41 Buttons). Baseline 169->152 | OFFEN |

---

## 2. Die zwei Wurzel-Fixes (WICHTIG fuer jede Folge-Migration)

### 2a. Whitelabel (cssColors)
- Web-Primitives nutzen **Inline-Styles**; Inline-Hex umgeht CSS-Custom-Properties -> kein Whitelabel-Durchgriff.
- Fix: `cssColors` (in `src/lib/design-tokens.ts`) = `colors` mit den 6 Marken-Keys (navy/ondo/shield/lightBlue/border/bg) als `var(--brand-*, <Claimondo-Hex>)`. Web-Primitives lesen Brand aus `cssColors`, Native aus `colors`. Semantische Keys (white/success/warning/danger/info/*Text) bleiben Hex.
- **Konsequenz:** handgerollte `bg-claimondo-*` (Tailwind) branden via globals.css automatisch; `primitives.Button` brandet via cssColors. Beide korrekt. Verifikation immer per Brand-Smoke: Wrapper `--brand-primary:#cc0000` -> navy-Button muss rot rendern.

### 2b. Radius (eine Skala)
- `design-tokens.radius` = **sm 12 / md 18 / lg 24 / xl 32** (== `--radius-ios-*`). `Button` rendert `radius.lg` = 24px. `Card`/SectionCard = `radius.md` = 18px.
- **Konsequenz:** handgerollte Buttons (oft `rounded-ios-xl` 32px) normalisieren bei Migration auf 24px — das ist GEWOLLT (Konsistenz, Aaron-Entscheidung 29.05.). Cards 16->18px vernachlaessigbar.

---

## 3. Faithful-minimal — die Migrations-Regel (Aaron-Entscheidung)

> "alles soll gleich aussehen, nur Schrift/Farbe/Logo aendern sich (Whitelabel). Design konsistent."

**Migrieren** (kein Look-Bruch):
- Solide **Brand-Fill-Primaerbuttons** (`bg-claimondo-navy/ondo/shield`, `bg-[var(--brand-primary|secondary)]` OHNE `/opacity`) -> `variant="navy"`/`"ondo"`.
- Saubere **Navy-Outline-Sekundaere** (weiss + `border-claimondo-border` + `text-claimondo-navy`) -> `variant="ghost"` (auf hellem BG).
- **Card-Divs** (`bg-white rounded border-claimondo-border`) -> `shared/SectionCard` (Padding/conditional-bg via `className`+`cn`, `id`-Prop, Heading bleibt in children, space-y -> `bodyClassName`).

**NICHT migrieren** (kein faithfuler Variant-Match -> handrolled lassen, in Baseline tracken):
- **Outline-Danger/Success** (weiss + farb-text + farb-border, Fill nur `:hover`) — es gibt keine Outline-Danger-Variante; `danger` waere solid-rosa = Regression.
- **Grau-Fill** (`bg-claimondo-bg`), **Opacity-Tints** (`/5`, `/10`).
- **Filter-Tabs / Toggles** (conditional active-bg) — gehoeren konzeptuell auf ui/tabs.
- **`<Link>`/`<a>` mit Button-Look** — `primitives.Button` rendert `<button>`, kein href -> Navigation braeche.
- **Glass-/Cinematic-Feldmodus**, expandierbare/Radio-Cards, Disclosure mit aria-expanded.
- **divide-y-Listen-Container**, **Tabellen-Wrapper** (DataTableContainer + 0-Padding) — SectionCard-Body-Wrapper bricht das.

**Erhalten beim Migrieren:** onClick/disabled/type=submit; conditional pending-children (NICHT durch `loading` ersetzen wenn Original keinen Spinner hatte); `loading` nur wo schon ein Spinner war (Spinner-Icon-Import dann entfernen); Icons -> `iconLeft`/`iconRight`; `aria-label` -> `ariaLabel`; `title`-Tooltip -> Wrapper-`<span title>` (Button hat kein `title`-Prop); Layout-Klassen (`flex-1`, `mt-*`) via `className`.

---

## 4. Der Ratchet (CI-Gate)

- `scripts/lib/component-set-scan.mjs` = PATTERNS (Button via tag-bewusster `hasBrandFillButton`, Card-div, Reimpl, table). `scripts/check-component-set.mjs` = CLI (`--warn` lokal / `--ratchet` CI / `--update-baseline`).
- `scripts/component-set-baseline.json` = Menge bekannter Verletzer. CI (`--ratchet`) failt nur bei **NEUEN** Verletzern ueber Baseline. Migrierte Files droppen raus.
- **Workflow pro Boy-Scout-Batch:** migrieren -> `node scripts/check-component-set.mjs --update-baseline` -> committen. Baseline sinkt.
- Unit-Tests: `scripts/lib/component-set-scan.test.mjs` (15 Tests, decken Tint-/Brace-/Quote-/Outline-Faelle ab).

---

## 5. OFFENE Arbeit (Backlog, priorisiert)

| Task | Scope | Hinweis |
|------|-------|---------|
| **#14 Scanner hover-FP** | `BUTTON_FILL_RE` matcht `hover:bg-claimondo-*` (Outline-Buttons mit Hover-Fill) faelschlich als solide. Von #2022-Brace-Balancing offengelegt. Fix: Left-Boundary `(?<![\w:-])bg-claimondo-...`. Danach `--update-baseline` (sinkt). | **Zuerst** — bremst sonst alle Folge-Migrationen + blaeht Baseline mit Phantom-Violators. Separater PR. |
| #5 admin | admin-Portal Buttons + Card-Divs (Wizards, AbrechnungenListClient, …) | Achtung: parallele DataTable-Sessions — Kollisionscheck. |
| #6 faelle/[id] | Admin-Fallakte | |
| #7 kunde | Kunde-Portal — **Whitelabel-kritisch** (Kunde-Sicht pro Claim brandet). Brand-Smoke Pflicht. | |
| #8 makler | makler-Portal | |
| #9 components | shared/leaf-Components | |
| #10 public/landing | ZULETZT, kollisionsbewusst (Marketing-Split-Sessions) | Subdomains nie anfassen. |
| #1 login | Buttons -> primitives; ggf. ui/tabs-Refactor noetig | deferred. |

**Card-Divs Rest (gutachter):** `leadpreise` (Tabellen-Wrapper), `reklamationen` (divide-y-Liste), `NachbesichtigungCard`-Info-Pille — bewusst belassen (kein faithfuler Fit / Card-Regex-FP).

---

## 6. Lessons (verifiziert, in Memory)

1. **Workflow-Apply-Agents sind unzuverlaessig** (`feedback_workflow_agents_apply_unreliable`): melden `applied:true` ohne Aenderung, halluzinieren API (z.B. altes `tone`/`onPress`), ueber-migrieren (Outline-Danger -> solid-rosa). **Agents nur fuer Analyse/Edit-Specs**; das Anwenden selbst machen ODER hart gaten (git-diff jeder Datei, tsc, build, ratchet).
2. **CRLF**: Files sind CRLF; Agent-`oldString`s kommen als LF -> exakter Match scheitert. Beim programmatischen Apply EOL-aware matchen (`\n`->`\r\n`).
3. **Import-Insertion**: niemals naiv "nach letzter `import`-Zeile" — bei Multi-Line-Imports (`import {\n ... \n} from`) landet die Zeile mitten im Block. Echtes Block-Ende finden (`} from '...'`).
4. **`primitives.Button` hat kein `title`-Prop** -> Wrapper-`<span title>`.
5. **Stacked PRs nach Squash-Merge**: wenn Base squash-merged wird, geht der gestackte PR CONFLICTING. Fix: `git rebase --onto origin/staging <alte-base-tip>` -> nur die eigenen Commits replayen, force-with-lease.

---

## 7. Verifikations-Tooling (esbuild + Playwright)

Brand-Smoke-Harness (inline in Bash, temp-File, nach Lauf loeschen): rendert echte `primitives.Button`/`Card` in zwei Wrappern (ohne Brand + `--brand-primary:#cc0000`), misst computed `background-color` + `border-radius`, Screenshot. Beweist: navy->rot, ondo->gruen, danger bleibt rose (semantisch), radius 24/18px. **Dispatch-Smoke 29.05. gruen** (navy default `rgb(13,27,62)`/24px, branded `rgb(204,0,0)`/24px, 0 Console-Errors).

> Hinweis: dispatch/gutachter-Komponenten importieren Server-Actions/Router -> einzeln isoliert rendern unpraktisch. Daher Smoke des Button-**Primitives** in den genutzten Varianten; echte In-Context-Visual-Bestaetigung kommt vom Staging-Deploy.

---

## 8. Branch / Worktree

- Worktree: `.claude/worktrees/component-set-ratchet` (eigener git-worktree, isoliert vom Monika-Fleet im Haupt-Checkout).
- Aktueller Branch: `kitta/aar-dispatch-component-set` (#2027).
- **Regel:** jede Folge-Strecke = frischer Branch off `origin/staging` (NACH Merge der Vorgaenger, sonst Baseline-Konflikt). PR `--base staging`. Nicht selbst mergen (keine Merge-Session).
