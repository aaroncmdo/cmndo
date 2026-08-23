# Journey-Gate am Release-Tor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 10 Journey-Smokes laufen kuenftig gegen `app.staging.claimondo.de` am `release/rNNN-drain -> main`-PR und verhindern, dass ein Merge eine ganze Journey bricht — statt das erst am naechsten Morgen zu berichten.

**Architecture:** Ein neuer Workflow `journey-gate.yml` faehrt die Tor-Suite (8 Journeys + 2 DB-Teilschritte) gegen staging. Moeglich wird das durch ein zentrales Ziel-Modul, das Basic-Auth zielabhaengig setzt — die Login-Cookies gelten dank `cookieDomain: '.claimondo.de'` bereits fuer beide Hosts. Parallel wird der nightly-Job wieder lesbar gemacht (Sammel-Step abtrennen) und ein Journey↔Code-Mapping meldet jeder Session, welchen ganzen Lauf ihr PR beruehrt.

**Tech Stack:** GitHub Actions, Playwright (chromium, workers:1), Node 20 ESM-Scripts (`scripts/check-*.mjs`-Muster, 36 Vorlagen im Repo), Supabase JS.

**Spec:** `docs/superpowers/specs/2026-08-23-journey-gate-release-tor-design.md`

## Global Constraints

- **Regel 1:** Nie direkt auf `main` pushen. Diese Arbeit laeuft auf `kitta/journey-gate-release-tor`, PR gegen `staging`.
- **Regel 2:** Kein DDL in diesem Vorhaben. Falls doch noetig: nur ueber `mcp__plugin_supabase_supabase__apply_migration`.
- **Post-Task-Audit:** Jeder Commit traegt den 7-Punkte-Audit im Body (AGENTS.md).
- **Umlaute:** Nutzersichtbare Strings mit echten `ä/ö/ü/ß`. Code-Kommentare, Commit-Messages und `docs/` duerfen ASCII sein.
- **staging == prod-Datenbank.** Jeder Lauf schreibt in die Produktionsdatenbank. Nur self-cleaning Wegwerf-Seeds. `reserviere()`-Guard nie umgehen.
- **Tor-Suite (8 + 2):** J1, J2, J3, J4, J5, J6, J8, J10 + `provisionen-verrechnung`, `provisionen-staffel`. **Ausdruecklich NICHT im Tor:** `provisionen-lifecycle` (schiesst echten Release-Cron) und J7 Storno/DSGVO (irreversibel).
- **Kein Auto-Retry bei Rot.** `--retries=0` im Gate. Ein Flake ist ein Befund, kein Rauschen.
- **Zielpruefsatz** (aus `broadcast-prod-playwright-smoke-drei-fallen`): Jede neue Bedingung muss die Frage bestehen *„Wenn ich das ZIEL wechsle (localhost ⇄ staging ⇄ prod) — aendert sich diese Bedingung mit?"* Haengt sie an `CI` oder `IS_LOCAL`, ist sie falsch.

## File Structure

| Datei | Verantwortung |
|---|---|
| `tests/e2e/lib/ziel.ts` | **neu** — einzige Quelle fuer Ziel-URL + Basic-Auth-Entscheidung |
| `tests/e2e/flows/_golden-path-lib.ts:154` | **aendern** — `httpCredentials` in `newContext` |
| `tests/e2e/staging-clickthrough.spec.ts:6` | **aendern** — Klartext-Passwort raus, `ziel.ts` rein |
| `.github/workflows/journey-gate.yml` | **neu** — Tor-Suite gegen staging bei Drain-PRs |
| `.github/workflows/ci.yml:838` | **aendern** — Sammel-Step in eigenen Job `e2e-rest` |
| `scripts/journey-map.json` | **neu** — Journey ↔ Code-Pfade ↔ Waechter-Specs |
| `scripts/check-journey-bezug.mjs` | **neu** — liest PR-Diff, meldet betroffene Journeys |
| `scripts/aktiviere-journey-gate-protection.sh` | **neu** — Branch-Protection, Aaron fuehrt aus |
| `.claude/skills/regel4-smoke/SKILL.md` | **neu** |
| `.claude/skills/journey-verifikation/SKILL.md` | **neu** |
| `.claude/skills/release-drain/SKILL.md` | **neu** |

---

### Task 1: Ziel-Modul — eine Quelle fuer Ziel + Basic-Auth

Heute existieren **drei** Konventionen nebeneinander: `STAGING_BASIC_AUTH_USER/PASS`, `STAGING_BASIC_USER/PASS` und ein **Klartext-Passwort im Repo**. Ohne eine gemeinsame Stelle kann das Gate nicht zuverlaessig gegen staging fahren.

**Files:**
- Create: `tests/e2e/lib/ziel.ts`
- Test: `tests/e2e/lib/ziel.test.ts`

**Interfaces:**
- Produces: `ZIEL: string`, `ZIEL_IST_STAGING: boolean`, `basicAuthFuerZiel(): { username: string; password: string } | undefined`, `basicAuthFehlt(): boolean`

- [ ] **Step 1: Test schreiben**

```ts
// tests/e2e/lib/ziel.test.ts
import { describe, expect, it } from 'vitest'
import { brauchtBasicAuth, credentialsAus } from './ziel'

describe('brauchtBasicAuth', () => {
  it('erkennt staging als Basic-Auth-pflichtig', () => {
    expect(brauchtBasicAuth('https://app.staging.claimondo.de')).toBe(true)
  })
  it('behandelt prod NICHT wie staging', () => {
    // Klasse aus #5543: die Bedingung hing an `!IS_LOCAL` und skippte prod-Laeufe still.
    expect(brauchtBasicAuth('https://app.claimondo.de')).toBe(false)
  })
  it('behandelt localhost NICHT wie staging', () => {
    expect(brauchtBasicAuth('http://localhost:3000')).toBe(false)
  })
})

describe('credentialsAus', () => {
  it('akzeptiert beide historischen Variablennamen', () => {
    expect(credentialsAus({ STAGING_BASIC_AUTH_USER: 'a', STAGING_BASIC_AUTH_PASS: 'b' }))
      .toEqual({ username: 'a', password: 'b' })
    expect(credentialsAus({ STAGING_BASIC_USER: 'c', STAGING_BASIC_PASS: 'd' }))
      .toEqual({ username: 'c', password: 'd' })
  })
  it('liefert undefined bei leerem Passwort statt eines kaputten Kontexts', () => {
    // Klasse aus #5465: ein gesetztes-aber-leeres CI-Secret rendert als ''.
    expect(credentialsAus({ STAGING_BASIC_AUTH_USER: 'a', STAGING_BASIC_AUTH_PASS: '' })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag pruefen**

Run: `npx vitest run tests/e2e/lib/ziel.test.ts`
Expected: FAIL — `Failed to resolve import "./ziel"`

- [ ] **Step 3: Modul implementieren**

```ts
// tests/e2e/lib/ziel.ts
//
// EINE Quelle fuer "wohin faehrt dieser Lauf" und "braucht dieses Ziel Basic-Auth".
// Vorher lag beides verstreut in den Specs — mit drei Variablennamen und einem
// Klartext-Passwort im Repo (staging-clickthrough.spec.ts:6).
//
// Der Pruefsatz, an dem sich hier alles ausrichtet (broadcast-prod-playwright-smoke-drei-fallen):
// "Wenn ich das ZIEL wechsle (localhost <-> staging <-> prod) — aendert sich diese Bedingung mit?"
// Deshalb haengt NICHTS hier an `CI` oder `IS_LOCAL`, sondern ausschliesslich an der URL.

export type BasicAuth = { username: string; password: string }

/** Nur STAGING liegt hinter nginx-Basic-Auth. Muster aus #5543. */
export function brauchtBasicAuth(ziel: string): boolean {
  return /staging/i.test(ziel)
}

/**
 * Liest die Credentials aus einer ENV-Map. Beide historischen Namenspaare werden
 * akzeptiert, damit bestehende Specs und CI-Secrets unveraendert weiterlaufen.
 * `||` statt `??` ist Absicht: ein gesetztes-aber-leeres Secret rendert als ''.
 */
export function credentialsAus(env: Record<string, string | undefined>): BasicAuth | undefined {
  const username = env.STAGING_BASIC_AUTH_USER || env.STAGING_BASIC_USER || ''
  const password = env.STAGING_BASIC_AUTH_PASS || env.STAGING_BASIC_PASS || ''
  if (!username || !password) return undefined
  return { username, password }
}

export const ZIEL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
export const ZIEL_IST_STAGING = brauchtBasicAuth(ZIEL)

/** Credentials fuer das aktuelle Ziel — `undefined`, wenn das Ziel keine braucht. */
export function basicAuthFuerZiel(): BasicAuth | undefined {
  if (!ZIEL_IST_STAGING) return undefined
  return credentialsAus(process.env)
}

/** true = Ziel braucht Basic-Auth, aber es sind keine Credentials da -> Test muss skippen. */
export function basicAuthFehlt(): boolean {
  return ZIEL_IST_STAGING && basicAuthFuerZiel() === undefined
}
```

- [ ] **Step 4: Test laufen lassen, gruen pruefen**

Run: `npx vitest run tests/e2e/lib/ziel.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/lib/ziel.ts tests/e2e/lib/ziel.test.ts
git commit -m "feat(e2e): Ziel-Modul — eine Quelle fuer Ziel-URL + Basic-Auth"
```

---

### Task 2: Golden-Path-Lib faehrt gegen staging

**Files:**
- Modify: `tests/e2e/flows/_golden-path-lib.ts:154-158`
- Modify: `tests/e2e/staging-clickthrough.spec.ts:6`

**Interfaces:**
- Consumes: `basicAuthFuerZiel()` aus Task 1

Der Login selbst braucht **keine** Aenderung: `sessionToCookies(…, { cookieDomain: '.claimondo.de' })` setzt die Cookies bereits fuer alle Subdomains, `app.staging.claimondo.de` eingeschlossen. Es fehlt allein die Basic-Auth am Browser-Kontext.

- [ ] **Step 1: Import ergaenzen**

```ts
// tests/e2e/flows/_golden-path-lib.ts — zu den bestehenden Imports
import { basicAuthFuerZiel } from '../lib/ziel'
```

- [ ] **Step 2: Kontext um httpCredentials erweitern**

Ersetze in `_golden-path-lib.ts` Zeile 154-158:

```ts
  // httpCredentials nur, wenn das ZIEL sie braucht (staging hinter nginx-Basic-Auth).
  // Die Session-Cookies oben gelten dank cookieDomain '.claimondo.de' fuer beide Hosts —
  // deshalb ist das hier der einzige Unterschied zwischen einem prod- und einem staging-Lauf.
  const ctx = await browser.newContext({
    baseURL: APP,
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1200 },
    httpCredentials: basicAuthFuerZiel(),
  })
```

- [ ] **Step 3: Klartext-Passwort entfernen**

Ersetze in `tests/e2e/staging-clickthrough.spec.ts` Zeile 6:

```ts
// Frueher stand hier das Basic-Auth-Passwort im Klartext. Es liegt damit in der
// Git-Historie und muss rotiert werden (Spec §8). Ab jetzt kommt es aus der ENV.
import { basicAuthFuerZiel, basicAuthFehlt } from './lib/ziel'
const BASIC_AUTH = basicAuthFuerZiel()
```

Und ergaenze im `test.describe`-Kopf der Datei:

```ts
test.skip(basicAuthFehlt(), 'STAGING_BASIC_AUTH_PASS nicht gesetzt (Ziel = staging)')
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler. (Bei Heap-Abbruch: `NODE_OPTIONS=--max-old-space-size=8192`.)

- [ ] **Step 5: Nachweis, dass der Lauf gegen staging wirklich ankommt**

Run:
```bash
rm -rf playwright/.auth
PLAYWRIGHT_BASE_URL=https://app.staging.claimondo.de \
STAGING_BASIC_AUTH_USER=<user> STAGING_BASIC_AUTH_PASS=<pass> \
RUN_GOLDEN_PATH_DEEP=1 \
npx playwright test golden-path-deep-prod --project=chromium --reporter=line --retries=0
```
Expected: PASS. **Nicht am gruenen Ergebnis allein festmachen** — bei `0 passed / N skipped` ist der Lauf NICHT erbracht (stiller Skip). Die Zeile `N passed` muss dastehen.

⚠ `rm -rf playwright/.auth` ist Pflicht: die Datei traegt den Host nicht im Namen, und ein gecachter localhost-Login laesst den Lauf wie einen flaechendeckenden Produktfehler aussehen (4/4 rot, „0 Links").

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/flows/_golden-path-lib.ts tests/e2e/staging-clickthrough.spec.ts
git commit -m "feat(e2e): Journeys gegen staging fahrbar + Klartext-Passwort raus"
```

---

### Task 3: Journey-Gate-Workflow

**Files:**
- Create: `.github/workflows/journey-gate.yml`

**Interfaces:**
- Consumes: die Seed-Scripts und Spec-Namen aus `ci.yml:500-830` (unveraendert uebernommen, nur `PLAYWRIGHT_BASE_URL` gewechselt)

- [ ] **Step 1: Workflow anlegen**

```yaml
name: Journey-Gate

# Greift genau bei Drain-PRs (release/rNNN-drain -> main). Feature-PRs bleiben unberuehrt
# und damit so schnell wie heute. Begruendung + Messwerte: docs/superpowers/specs/
# 2026-08-23-journey-gate-release-tor-design.md
on:
  pull_request:
    branches: [main]
  workflow_dispatch:

# Drains laufen seriell durchs Tor: die Journey-Seeds teilen sich feste @claimondo.test-Konten
# auf der PROD-Datenbank (staging und prod nutzen dieselbe). Zwei parallele Laeufe racen den
# Seed — dieselbe Klasse, die den nightly-Job cross-run-flaky machte.
concurrency:
  group: journey-gate
  cancel-in-progress: false

permissions:
  contents: read
  pull-requests: write

env:
  # DAS ist der eine Unterschied zum nightly-Job: das Tor prueft den Stand, der nach main
  # SOLL — und der liegt auf staging, nicht auf prod.
  PLAYWRIGHT_BASE_URL: https://app.staging.claimondo.de
  STAGING_BASIC_AUTH_USER: ${{ secrets.STAGING_BASIC_AUTH_USER }}
  STAGING_BASIC_AUTH_PASS: ${{ secrets.STAGING_BASIC_AUTH_PASS }}
  NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  TEST_ADMIN_EMAIL: ${{ secrets.TEST_ADMIN_EMAIL }}
  TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
  TEST_SV_PASSWORD: ${{ secrets.TEST_SV_PASSWORD }}

jobs:
  journey-gate:
    runs-on: ubuntu-latest
    # Gemessen: alle 10 Journeys = 212 s, Setup = 99 s. 20 min ist grosszuegig und trotzdem
    # weit unter dem 90-min-Cap des nightly-Jobs (dort frisst der Sammel-Step 30 min).
    # ⚠ Wer Journeys ergaenzt, prueft diese Rechnung mit — genau daran ist das Cap des
    # nightly-Jobs dreimal hintereinander zu knapp gewesen (20 -> 45 -> 90).
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}

      - name: Install Playwright Chromium
        run: |
          if [ "${{ steps.playwright-cache.outputs.cache-hit }}" = "true" ]; then
            npx playwright install-deps chromium
          else
            npx playwright install --with-deps chromium
          fi

      # --- Tor-Suite: 8 Journeys + 2 DB-Teilschritte ---
      # NICHT im Tor: provisionen-lifecycle (schiesst den echten Release-Cron auf echte
      # Provisionen) und J7 Storno/DSGVO (irreversible Anonymisierung). Beide bleiben
      # nightly — bei 5-10 Toren/Tag statt einem pro Nacht ist das Risiko nicht tragbar.

      - name: Seed J4 (Reparatur-Weg)
        run: node scripts/smoke/reparatur-weg-e2e-seed.mjs

      - name: J1 + J4 — Haftpflicht-Vollstrecke + Reparatur-Weg
        run: npx playwright test golden-path-deep-prod reparatur-weg-e2e-smoke --project=chromium --reporter=line --retries=0
        env:
          RUN_GOLDEN_PATH_DEEP: '1'

      - name: J9 (Teil) — Provisionen, rein DB
        run: npx playwright test provisionen-verrechnung-smoke provisionen-staffel-smoke --project=chromium --reporter=line --retries=0
        env:
          RUN_PROVISION_SMOKE: '1'

      - name: Seed J8 (2FA-Enroll)
        run: node scripts/smoke/seed-smoke-enroll.mjs
      - name: J8 — 2FA-Enroll
        run: npx playwright test 2fa-enroll-smoke --project=chromium --workers=1 --reporter=line --retries=0
        env:
          RUN_2FA_ENROLL_SMOKE: '1'

      - name: Seed J5 (Kasko)
        run: node scripts/smoke/kasko-reparatur-seed.mjs
      - name: J5 — Kasko-Reparatur-Phase
        run: npx playwright test kasko-reparatur-phase-smoke --project=chromium --reporter=line --retries=0
        env:
          RUN_KASKO_SMOKE: '1'

      - name: Seed J10 (Werkstatt-Finder)
        run: node scripts/smoke/werkstatt-finder-seed.mjs
      - name: J10 — Werkstatt-Finder
        run: npx playwright test werkstatt-finder-smoke --project=chromium --reporter=line --retries=0
        env:
          RUN_WF_SMOKE: '1'

      - name: Seed J3 (SA-Vollmacht)
        run: node scripts/smoke/sa-vollmacht-seed.mjs
      - name: J3 — SA-Unterschrift
        run: npx playwright test sa-vollmacht-smoke --project=chromium --reporter=line --retries=0
        env:
          RUN_SA_SMOKE: '1'

      - name: Seed J6 (Kanzlei-Uebergabe)
        run: node scripts/smoke/kanzlei-uebergabe-seed.mjs
      - name: J6 — Kanzlei-Uebergabe
        run: npx playwright test kanzlei-uebergabe-smoke --project=chromium --reporter=line --retries=0
        env:
          RUN_KANZLEI_SMOKE: '1'

      - name: Seed J2 (Meldung alle Kanaele)
        run: node scripts/smoke/meldung-kanaele-seed.mjs
      - name: J2 — Meldung alle Kanaele
        run: npx playwright test meldung-kanaele-smoke --project=chromium --reporter=line --workers=1 --retries=0
        env:
          RUN_MELDUNG_SMOKE: '1'

      - name: Trace-Artefakte
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: journey-gate-traces-${{ github.run_id }}
          path: test-results/
          retention-days: 7
          if-no-files-found: warn

      # Bei Rot: konkreter Befund in den PR, nicht nur "failed". Aaron entscheidet dann
      # ueber das Label `journey-override` (Spec 3.3) — das Gate entscheidet nicht selbst.
      - name: Befund in den PR schreiben
        if: failure() && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const lauf = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: [
                '## 🚦 Journey-Gate rot',
                '',
                'Mindestens eine **vollstaendige Journey** ist auf `app.staging.claimondo.de` gebrochen —',
                'also auf genau dem Stand, der mit diesem Drain nach `main` und damit auf prod soll.',
                '',
                `**Welcher Schritt:** siehe den rot markierten Step in [Lauf ${context.runId}](${lauf}).`,
                'Die Playwright-Traces haengen als Artefakt am Lauf.',
                '',
                '**Das ist kein Flake-Rauschen:** das Tor faehrt mit `--retries=0`, jeder rote Lauf ist ein Befund.',
                '',
                '### Wie weiter',
                '1. Journey reparieren, neu drainen — der Normalfall.',
                '2. Oder mit Aaron absprechen: Label `journey-override` + Begruendung als Kommentar.',
                '',
                'Zuordnung Journey ↔ bewachende Spec: `docs/fundament/journey-smokes.md`',
              ].join('\n'),
            })
```

- [ ] **Step 2: YAML-Syntax pruefen**

Run: `npx js-yaml .github/workflows/journey-gate.yml > /dev/null && echo "YAML ok"`
Expected: `YAML ok`

- [ ] **Step 3: Seed-Script-Namen gegen das Repo verifizieren**

Run:
```bash
for s in reparatur-weg-e2e-seed seed-smoke-enroll kasko-reparatur-seed werkstatt-finder-seed sa-vollmacht-seed kanzlei-uebergabe-seed meldung-kanaele-seed; do
  test -f "scripts/smoke/$s.mjs" && echo "ok   $s" || echo "FEHLT $s"
done
```
Expected: 7× `ok`. Jedes `FEHLT` ist ein Blocker — den echten Namen aus `ci.yml` uebernehmen, nicht raten.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/journey-gate.yml
git commit -m "feat(ci): Journey-Gate am Release-Tor (8 Journeys gegen staging)"
```

---

### Task 4: Nightly wieder lesbar machen

Der `e2e`-Job ist seit 14.08. durchgehend rot — aber die 10 Journey-Steps sind gruen. Rot ist allein der ungefilterte Sammel-Step (1799 s, 88 % der Laufzeit). Solange der im selben Job haengt, traegt der Job-Status kein Signal.

**Files:**
- Modify: `.github/workflows/ci.yml` — Step „Run E2E Tests" (~Z. 838) in eigenen Job

- [ ] **Step 1: Sammel-Step aus dem `e2e`-Job herausloesen**

Entferne den Step `- name: Run E2E Tests` aus dem `e2e`-Job und ergaenze am Ende von `ci.yml` einen eigenen Job:

```yaml
  # Der Sammel-Lauf ueber ALLE uebrigen Specs. Bis 23.08. haing er im `e2e`-Job und faerbte
  # ihn dauerhaft rot, obwohl alle 10 Journey-Steps gruen waren — damit war der
  # Journey-Waechter blind: braeche J4 wirklich, aenderte sich an der Anzeige nichts.
  # Als eigener Job traegt `e2e` wieder ein echtes Journey-Signal.
  # ⚠ Dieser Job DARF rot sein, ohne dass eine Journey kaputt ist. Wer hier rot sieht,
  # schaut zuerst auf `e2e` — der beantwortet die Frage "ist eine Journey gebrochen".
  e2e-rest:
    if: ${{ github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' }}
    needs: e2e
    runs-on: ubuntu-latest
    timeout-minutes: 90
    concurrency:
      group: prod-e2e-rest
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - name: Run E2E Tests (Rest)
        run: npx playwright test
        env:
          PLAYWRIGHT_BASE_URL: https://app.claimondo.de
          # Fixtures, die der e2e-Job in DIESEM Lauf bereits verbraucht hat.
          E2E_SEEDS_VERBRAUCHT: '.reparatur-weg-e2e-seed.json'
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      - name: Upload Playwright Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-rest
          path: playwright-report/
          retention-days: 7
          if-no-files-found: warn
```

- [ ] **Step 2: Timeout des `e2e`-Jobs nachziehen**

Ohne den 30-Minuten-Sammel-Step braucht `e2e` das 90-min-Cap nicht mehr. Setze `timeout-minutes: 90` → `timeout-minutes: 25` und ergaenze darueber:

```yaml
    # 90 -> 25 (23.08.): Das grosse Cap war ausschliesslich fuer den Sammel-Step noetig
    # (gemessen 46:13). Der ist seit 23.08. ein eigener Job (e2e-rest). Was bleibt, sind
    # Setup (99 s) + 10 Journeys (212 s) = ~5:11. 25 ist grosszuegig gepuffert.
    # ⚠ Wer Journeys ergaenzt, prueft diese Rechnung mit.
```

- [ ] **Step 3: YAML pruefen**

Run: `npx js-yaml .github/workflows/ci.yml > /dev/null && echo "YAML ok"`
Expected: `YAML ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "fix(ci): Sammel-Step aus dem Journey-Job loesen — rot heisst wieder rot"
```

---

### Task 5: Journey-Map + Bezugs-Meldung

**Files:**
- Create: `scripts/journey-map.json`
- Create: `scripts/check-journey-bezug.mjs`
- Modify: `package.json` (Script-Eintrag), `.github/workflows/ci.yml` (Step im `build`-Job)

**Interfaces:**
- Produces: `npm run check:journey-bezug` — Exit 0 immer (informativ), schreibt nach `$GITHUB_STEP_SUMMARY`

- [ ] **Step 1: Map anlegen**

Pfade aus `docs/fundament/journey-smokes.md` abgeleitet. **Vor dem Commit verifizieren**, dass jedes Muster im Repo trifft (Step 3).

```json
{
  "J1": {
    "titel": "Haftpflicht end-to-end",
    "pfade": ["src/app/(portal)/faelle/**", "src/lib/claims/**", "src/lib/status/**"],
    "waechter": ["golden-path-deep-prod"]
  },
  "J2": {
    "titel": "Meldung alle Kanaele",
    "pfade": ["src/app/kunde/schaden-melden/**", "src/app/api/v1/melde-schaden/**", "src/app/schaden/**"],
    "waechter": ["meldung-kanaele-smoke"]
  },
  "J3": {
    "titel": "SA + Vollmacht",
    "pfade": ["src/app/flow/**", "src/lib/vollmacht/**"],
    "waechter": ["sa-vollmacht-smoke"]
  },
  "J4": {
    "titel": "Reparatur-Weg",
    "pfade": ["src/lib/reparatur/**", "src/app/werkstatt/**"],
    "waechter": ["reparatur-weg-e2e-smoke", "reparatur-weg-kva-betrag-pflicht", "reparatur-weg-kva-ablehnung-loop"]
  },
  "J5": {
    "titel": "Kasko / Selbstzahler",
    "pfade": ["src/lib/abrechnung/**"],
    "waechter": ["kasko-reparatur-phase-smoke"]
  },
  "J6": {
    "titel": "Kanzlei-Uebergabe",
    "pfade": ["src/app/kanzlei/**", "src/lib/kanzlei/**"],
    "waechter": ["kanzlei-uebergabe-smoke"]
  },
  "J7": {
    "titel": "Storno / DSGVO",
    "pfade": ["src/lib/dsgvo/**", "src/app/(portal)/profil/**"],
    "waechter": ["storno-dsgvo-smoke"]
  },
  "J8": {
    "titel": "Onboarding je Rolle",
    "pfade": ["src/app/onboarding/**", "src/lib/auth/**"],
    "waechter": ["2fa-enroll-smoke", "onboarding-pflichtdok"]
  },
  "J9": {
    "titel": "Honorar / Provision / Zahlung",
    "pfade": ["src/lib/provisionen/**", "src/app/api/cron/**"],
    "waechter": ["provisionen-verrechnung-smoke", "provisionen-staffel-smoke", "provisionen-lifecycle-smoke"]
  },
  "J10": {
    "titel": "Dispatch / Vermittlung",
    "pfade": ["src/app/dispatch/**", "src/lib/dispatch/**", "src/app/gutachter-finden/**"],
    "waechter": ["werkstatt-finder-smoke", "golden-path-finder-prod"]
  }
}
```

- [ ] **Step 2: Script schreiben**

```js
#!/usr/bin/env node
// scripts/check-journey-bezug.mjs
//
// Meldet einer Session, welchen GANZEN Lauf ihr PR beruehrt — nicht nur, welche Datei
// sie geaendert hat. Hintergrund (Aaron, 23.08.): "Die Smokes fokussieren sich nur
// darauf, dass diese eine kleine Funktion einzeln gecheckt wird, aber nicht, ob der
// gesamte Lauf, in dem wir gerade arbeiten, wirklich funktioniert."
//
// INFORMATIV, nie blockierend (Exit 0). Das Blockieren macht das Journey-Gate am
// Release-Tor, wo wirklich gemessen wird — hier wuerde geraten.

import { execSync } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'

const MAP = JSON.parse(readFileSync(new URL('./journey-map.json', import.meta.url), 'utf8'))
const BASIS = process.env.JOURNEY_DIFF_BASIS || 'origin/staging'

/** glob-Muster -> RegExp. Nur `**` und `*` werden unterstuetzt, mehr braucht die Map nicht. */
function musterZuRegex(muster) {
  const escaped = muster.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + escaped.replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*') + '$')
}

function geaenderteDateien() {
  try {
    const out = execSync(`git diff --name-only ${BASIS}...HEAD`, { encoding: 'utf8' })
    return out.split('\n').map((z) => z.trim()).filter(Boolean)
  } catch {
    console.log(`[journey-bezug] Diff gegen ${BASIS} nicht ermittelbar — uebersprungen.`)
    return []
  }
}

const dateien = geaenderteDateien()
if (dateien.length === 0) process.exit(0)

const betroffen = []
for (const [id, j] of Object.entries(MAP)) {
  const regexe = j.pfade.map(musterZuRegex)
  const treffer = dateien.filter((d) => regexe.some((r) => r.test(d)))
  if (treffer.length > 0) betroffen.push({ id, ...j, treffer })
}

if (betroffen.length === 0) {
  console.log(`[journey-bezug] ${dateien.length} geaenderte Dateien, keine Journey beruehrt.`)
  process.exit(0)
}

const zeilen = [
  '## 🧭 Journey-Bezug dieses PRs',
  '',
  'Dieser PR beruehrt Code, der zu einer **vollstaendigen Journey** gehoert. Regel 4 verlangt,',
  'das operative Soll dieser Journey zu durchdenken und den bewachenden Smoke zu fahren —',
  'nicht nur die neu gebaute Funktion.',
  '',
  '| Journey | Bewachende Spec(s) | Ausloesende Datei |',
  '|---|---|---|',
]
for (const b of betroffen) {
  zeilen.push(`| **${b.id}** ${b.titel} | \`${b.waechter.join('` · `')}\` | \`${b.treffer[0]}\`${b.treffer.length > 1 ? ` +${b.treffer.length - 1}` : ''} |`)
}
zeilen.push('', 'Zuordnung + Lauf-Modi: `docs/fundament/journey-smokes.md`')

const text = zeilen.join('\n')
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
process.exit(0)
```

- [ ] **Step 3: Pfad-Muster gegen das Repo verifizieren**

Jedes Muster ohne Treffer ist eine tote Zeile in der Map — genau die Drift, die das Script verhindern soll.

Run:
```bash
node -e "
const m=require('./scripts/journey-map.json');
const {execSync}=require('child_process');
for(const [id,j] of Object.entries(m))
  for(const p of j.pfade){
    const n=execSync('git ls-files \"'+p+'\" | wc -l',{encoding:'utf8'}).trim();
    console.log((n==='0'?'LEER ':'ok   ')+id+'  '+p+'  ('+n+')');
  }
"
```
Expected: kein `LEER`. Jedes `LEER` heisst: Pfad im Repo nachsehen und Muster korrigieren — **nicht raten** (`feedback-bezeichner-werden-nachgeschlagen-nie-geraten`).

- [ ] **Step 4: Verdrahten**

`package.json`:
```json
"check:journey-bezug": "node scripts/check-journey-bezug.mjs",
```

`ci.yml`, im `build`-Job nach den uebrigen `check:`-Steps:
```yaml
      # Informativ (Exit 0): meldet der Session, welchen GANZEN Lauf ihr PR beruehrt.
      - name: Journey-Bezug
        run: npm run check:journey-bezug
        env:
          JOURNEY_DIFF_BASIS: origin/${{ github.base_ref || 'staging' }}
```

⚠ `actions/checkout@v4` holt standardmaessig nur einen Commit. Ergaenze im `build`-Job
`with: { fetch-depth: 0 }`, sonst ist der Diff leer und das Script meldet stumm „keine Journey".

- [ ] **Step 5: Lokal gegen einen echten Diff pruefen**

Run: `JOURNEY_DIFF_BASIS=origin/staging npm run check:journey-bezug`
Expected: Tabelle oder die Zeile „keine Journey beruehrt" — in beiden Faellen Exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/journey-map.json scripts/check-journey-bezug.mjs package.json .github/workflows/ci.yml
git commit -m "feat(ci): Journey-Bezug — jede Session erfaehrt, welchen ganzen Lauf sie beruehrt"
```

---

### Task 6: Branch-Protection vorbereiten (Aaron fuehrt aus)

`main` ist heute **nicht** branch-protected (`gh api …/branches/main/protection` → 404). Ohne Aktivierung kann das Gate nur berichten.

**Files:**
- Create: `scripts/aktiviere-journey-gate-protection.sh`

- [ ] **Step 1: Script anlegen**

```bash
#!/usr/bin/env bash
# Aktiviert Branch-Protection auf `main` mit dem Journey-Gate als einzigem required check.
# AARON FUEHRT DIESES SCRIPT AUS — es veraendert den Repo-Flow fuer alle.
#
# Bewusst minimal:
#   - genau EIN required check (journey-gate), keine weiteren
#   - KEINE Review-Pflicht: sonst braucht jeder Release-Drain einen zweiten Menschen
#   - enforce_admins=false: der Notausgang bleibt offen
#
# Rueckgaengig:  gh api -X DELETE repos/:owner/:repo/branches/main/protection
set -euo pipefail

echo "Vorher:"
gh api repos/:owner/:repo/branches/main/protection 2>&1 | head -3 || true

gh api -X PUT repos/:owner/:repo/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["journey-gate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo
echo "Nachher:"
gh api repos/:owner/:repo/branches/main/protection --jq '.required_status_checks.contexts'
echo "Fertig. Ab jetzt blockiert ein rotes Journey-Gate den Merge nach main."
```

- [ ] **Step 2: Ausfuehrbar machen und committen**

```bash
chmod +x scripts/aktiviere-journey-gate-protection.sh
git add scripts/aktiviere-journey-gate-protection.sh
git commit -m "chore(ci): Branch-Protection-Aktivierung vorbereitet (Aaron fuehrt aus)"
```

⚠ **Nicht selbst ausfuehren.** Das Script veraendert den Repo-Flow fuer alle neun laufenden Sessions.

---

### Task 7: Skills fuer die wiederkehrenden Ablaeufe

**Files:**
- Create: `.claude/skills/regel4-smoke/SKILL.md`
- Create: `.claude/skills/journey-verifikation/SKILL.md`
- Create: `.claude/skills/release-drain/SKILL.md`

Jeder Skill traegt die teuer erkauften Fallen inline — der Zweck ist, dass sie **zum Zeitpunkt der Arbeit** wirken statt in einer Memory-Datei zu warten.

- [ ] **Step 1: `regel4-smoke` schreiben**

Frontmatter `name` + `description`; Inhalt mindestens:
- Schritt 1 = **operatives Soll** formulieren (Fachlogik, nicht Code lesen)
- `rm -rf playwright/.auth` nach jedem Host-Wechsel — die Datei traegt den Host nicht im Namen
- Am **DB-Zustand** messen, nicht am Toast (`sonner` ist beim Auslesen oft schon weg)
- Volle Optionstitel statt Substring (`has-text("Ich")` traf „n·ich·t eindeutig")
- `button[type="submit"]`.first() trifft **ABMELDEN** in jedem Portal mit Nav
- Cleanup in `test.afterEach`, nicht `finally` — ein Test-Timeout ueberspringt `finally`
- Gegenprobe ist das **Zugriffslog des Ziels**, nicht der Test-Output

- [ ] **Step 2: `journey-verifikation` schreiben**

- `npm run check:journey-bezug` fahren → welche Journey?
- `docs/fundament/journey-smokes.md` → welcher Waechter?
- Vorbedingungen scharf stellen, sonst gruen/rot aus dem falschen Grund
- Tor-Suite vs. nightly-Suite (J7/J9-lifecycle sind bewusst nicht im Tor)

- [ ] **Step 3: `release-drain` schreiben**

- Von `staging` branchen, nicht von `main` (sonst CONFLICTING)
- Nach dem Merge FRISCH branchen (Stacked-PR-Falle)
- `gh pr create --body-file`, nie `--body "…"` (Backticks werden ausgefuehrt)
- Bei rotem Journey-Gate: mit Aaron absprechen, Label `journey-override` + Begruendung

- [ ] **Step 4: Skills laden pruefen**

Run: `ls .claude/skills/*/SKILL.md`
Expected: 4 Dateien (bibliothekar + die drei neuen). Frontmatter braucht `name` und `description`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/
git commit -m "feat(skills): drei Repo-Skills fuer Regel-4-Smoke, Journey-Verifikation, Release-Drain"
```

---

### Task 8: Scharfer Nachweis

Ohne diesen Schritt ist der Umbau eine Behauptung. `verification-before-completion`: Beweise vor Behauptungen.

- [ ] **Step 1: PR gegen `staging` oeffnen**

```bash
git push -u origin kitta/journey-gate-release-tor
gh pr create --base staging --title "feat(ci): Journey-Gate am Release-Tor" --body-file docs/superpowers/specs/2026-08-23-journey-gate-release-tor-design.md
```

- [ ] **Step 2: Gate manuell gegen staging fahren**

Run: `gh workflow run "Journey-Gate" --ref kitta/journey-gate-release-tor`
Dann: `gh run list --workflow=journey-gate.yml --limit 1`
Expected: `success`, Laufzeit **< 8 Min**.

⚠ Jeden Step einzeln lesen. Ein `0 passed / N skipped` ist **kein** gruener Nachweis — es ist ein stiller Skip.

- [ ] **Step 3: Rot-Fall scharf pruefen**

Einen Journey-Assert temporaer brechen (z.B. in `sa-vollmacht-smoke` einen erwarteten Wert verfaelschen), pushen, Gate laufen lassen.
Expected: Gate rot **und** ein PR-Kommentar mit dem konkreten Befund. Danach zuruecknehmen.

Ohne diesen Test ist unbewiesen, dass der Kommentar-Pfad ueberhaupt feuert.

- [ ] **Step 4: `check:journey-bezug` am echten PR pruefen**

Expected: Job-Summary des `build`-Jobs zeigt die Tabelle mit der beruehrten Journey.

- [ ] **Step 5: Ergebnisse an Aaron berichten**

Mit Zahlen: Gate-Laufzeit, Journey-Ergebnisse, Verhalten im Rot-Fall. Plus die zwei offenen Punkte aus Spec §8 (Branch-Protection aktivieren, Passwort rotieren).

---

## Self-Review

**Spec-Abdeckung:** §3.1 → Task 3 · §3.2 → Task 3 (Tor-Zuschnitt) · §3.3 → Task 3 (PR-Kommentar) + Task 6 · §3.4 → Task 5 · §3.5 → Task 4 · §3.6 → Task 1+2 · §4 → Task 7 · §7 → Task 8. Keine Luecke.

**Platzhalter:** keine. Task 7 beschreibt Skill-Inhalte als Stichpunktliste statt als Volltext — bewusst, weil die Fallen woertlich aus den Memory-Dateien uebernommen werden und dort bereits ausformuliert sind.

**Typ-Konsistenz:** `basicAuthFuerZiel()` (Task 1) wird in Task 2 unter demselben Namen konsumiert. `brauchtBasicAuth`/`credentialsAus` sind exportiert, weil die Tests sie direkt aufrufen. `BasicAuth` ist der einzige Rueckgabetyp.

**Reihenfolge:** Task 1 → 2 (Modul vor Konsument), Task 3 haengt an Task 2 (ohne Basic-Auth kein staging-Lauf). Task 4, 5, 7 sind unabhaengig. Task 6 ist reine Vorbereitung. Task 8 kommt zuletzt.
