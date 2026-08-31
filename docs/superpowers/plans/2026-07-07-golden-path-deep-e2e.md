# Golden-Path Deep-E2E Implementation Plan (SP2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Playwright-Deep-E2E-Harness, die die SP1-Fixtures je Rolle im echten Browser bis zur Kern-CTA fährt (klicken + absenden + DB-Assert). Flagship = SV-Stellungnahme #3729.

**Architecture:** Playwright test-runner, self-contained (kein `playwright.config`-Edit). Auth via Cookie-Injection (`scripts/prod-smoke/cookie.mjs`), `serviceWorkers:'block'` per Context, `provision` in `beforeAll`, opt-in `RUN_GOLDEN_PATH_DEEP`. Fixture-IDs aus `scripts/test-fixtures/ids.ts`. DB-Assert via service-role.

**Tech Stack:** `@playwright/test`, `@supabase/supabase-js`, `@supabase/ssr` (cookie-Chunks), `tsx` (provision).

## Global Constraints

- **Läuft nur opt-in gegen Prod:** `test.skip(!process.env.RUN_GOLDEN_PATH_DEEP)` — in CI (kein env) skippen alle Flows. Nie in `testIgnore` nötig.
- **Nur Test-Accounts/Fixtures**, `fb…`-Claims. Kein Real-Data-Touch.
- **Kein shared-file-Edit:** `serviceWorkers:'block'` als Context-Option; `provision` als `beforeAll` (kein globalSetup); keine `playwright.config`-Änderung.
- **Env (via `set -a; source <(grep -E 'URL|ANON|SERVICE_ROLE' ../../../.env.local); set +a` vor dem Lauf):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Plus `TEST_SV_PASSWORD='Claimondo-SV-Smoke-2026'` + `RUN_GOLDEN_PATH_DEEP=1`.
- **App-Host:** `https://app.claimondo.de` (override `GOLDEN_APP_URL`). `projectRef` = `paizkjajbuxxksdoycev`, `cookieDomain` = `.claimondo.de`.
- **Stackt auf SP1** (Branch `kitta/golden-path-deep-e2e` off `kitta/test-fixtures-provisioner`).

### Verified facts (Prod 07.07.)

- **SV-Flagship-Flow:** `/gutachter/fall/{fbc10002}` (bridge `faelle_claim_bridge` fall_id=claim_id auto-getriggert bei Claim-Insert → resolvt) → Banner-CTA „Stellungnahme einreichen" (#3729) → `/gutachter/fall/{fbc10002}/stellungnahme` (`StellungnahmeClient`).
- **StellungnahmeClient-Form:** hidden `input[type="file"]` (accept pdf/jpeg/png), Pflicht-`input[type="checkbox"]` (Bestätigung), Submit-`button` „Stellungnahme einreichen" (disabled bis file+checkbox). Erfolg → `router.push('/gutachter/fall/{id}')`.
- **DB-Effekt:** `submitStellungnahme` → `auftraege.technische_stellungnahme_status='hochgeladen'` (via Event) + `fall_dokumente`-Insert. Double-Submit-Guard: ist schon `hochgeladen` → Fehler „bereits eingereicht" (→ `provision`-Reset auf `angefordert` vor jedem Lauf ist Pflicht).
- **Fixture-IDs (aus `scripts/test-fixtures/ids.ts`):** `CLAIMS.c2='fbc10002…'`, `AUFTRAEGE.c2='fba00002…'`, `ACCOUNTS.sv='25a8c28e…'`, etc.

---

### Task 1: Framework — `_golden-path-lib.ts` + Test-Upload

**Files:**
- Create: `tests/e2e/flows/_golden-path-lib.ts`
- Create: `tests/e2e/fixtures/test-upload.pdf` (kleines gültiges PDF)

**Interfaces:**
- Consumes: `sessionToCookies` (`scripts/prod-smoke/cookie.mjs`), `createChunks` (transitiv), Fixture-IDs (`scripts/test-fixtures/ids.ts`).
- Produces: `ROLES`, `APP`, `loginContext(browser, roleKey)`, `serviceClient()`, `assertRow(table, id, expected)`, re-exported `CLAIMS`/`AUFTRAEGE`/`ACCOUNTS`.

- [ ] **Step 1: Create the test PDF**

Run:
```bash
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Root 1 0 R/Size 4>>\n%%%%EOF\n' > tests/e2e/fixtures/test-upload.pdf
```
Expected: `tests/e2e/fixtures/test-upload.pdf` existiert (>0 B, mime application/pdf).

- [ ] **Step 2: Write `_golden-path-lib.ts`**

```typescript
import type { Browser, BrowserContext } from '@playwright/test'
import { expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// @ts-expect-error — JS-Helper aus dem prod-smoke-Harness (kein .d.ts nötig)
import { sessionToCookies } from '../../../scripts/prod-smoke/cookie.mjs'

export { CLAIMS, AUFTRAEGE, ACCOUNTS, PARTIES, SV_SACHVERSTAENDIGE_ID } from '../../../scripts/test-fixtures/ids'

export const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Fixture-Accounts (Passwörter: <PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD> grandfathered, sv per env).
export const ROLES = {
  sv: { email: process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de', pass: process.env.TEST_SV_PASSWORD ?? '' },
  dispatch: { email: 'test-dispatch@claimondo.de', pass: process.env.TEST_DISPATCH_PASSWORD ?? '<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>' },
  kunde: { email: 'test-kunde@claimondo.de', pass: process.env.TEST_KUNDE_PASSWORD ?? '<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>' },
  kb: { email: 'test-kb@claimondo.de', pass: process.env.TEST_KB_PASSWORD ?? '<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>' },
  kanzlei: { email: 'test-kanzlei@claimondo.de', pass: process.env.TEST_KANZLEI_PASSWORD ?? '<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>' },
  admin: { email: 'test-admin@claimondo.de', pass: process.env.TEST_ADMIN_PASSWORD ?? '<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>' },
} as const

export type RoleKey = keyof typeof ROLES

/** GoTrue password-grant + Cookie-Injection -> isolierter, SW-blockierter, eingeloggter Context. */
export async function loginContext(browser: Browser, roleKey: RoleKey): Promise<BrowserContext> {
  const { email, pass } = ROLES[roleKey]
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  })
  const session = await res.json()
  if (!session?.access_token) throw new Error(`Auth ${roleKey} fehlgeschlagen: ${session?.error_description ?? JSON.stringify(session)}`)

  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const cookies = sessionToCookies(session, { projectRef, cookieDomain: '.claimondo.de' })
  const ctx = await browser.newContext({
    baseURL: APP,
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1200 },
  })
  await ctx.addCookies(cookies)
  return ctx
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** DB-Assert nach einer UI-Aktion: Row per id laden, gegen expected matchen. */
export async function assertRow(table: string, id: string, expected: Record<string, unknown>): Promise<void> {
  const { data, error } = await serviceClient().from(table).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`assertRow ${table} ${id}: ${error.message}`)
  expect(data, `${table} ${id} existiert`).toBeTruthy()
  expect(data).toMatchObject(expected)
}
```

- [ ] **Step 3: Verify it type-checks / lists**

Run: `npx playwright test golden-path-deep-prod --list` (nach Task 2 vorhanden) — hier zunächst: `npx tsc --noEmit tests/e2e/flows/_golden-path-lib.ts` überspringen (Playwright-TS-Kontext); Validierung erfolgt in Task 2 beim echten Lauf.

- [ ] **Step 4: Commit** — `test(golden-path): Framework — loginContext (cookie-injection) + serviceClient + assertRow`.

---

### Task 2: SV Flagship — Stellungnahme #3729 (deep, gegen Prod verifiziert)

**Files:**
- Create: `tests/e2e/flows/golden-path-deep-prod.spec.ts`

**Interfaces:** Consumes `loginContext`/`assertRow`/`APP`/`CLAIMS`/`AUFTRAEGE` (lib). Produces die Spec (erweiterbar je Rolle).

- [ ] **Step 1: Write the spec (SV-Flagship)**

```typescript
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { loginContext, assertRow, APP, CLAIMS, AUFTRAEGE } from './_golden-path-lib'

// Deep Golden-Path gegen Prod — opt-in, serial, nie in CI.
// Run:
//   set -a; source <(grep -E 'NEXT_PUBLIC_SUPABASE_URL|ANON_KEY|SERVICE_ROLE' ../../../.env.local); set +a
//   RUN_GOLDEN_PATH_DEEP=1 TEST_SV_PASSWORD='Claimondo-SV-Smoke-2026' \
//   npx playwright test golden-path-deep-prod --workers=1 --reporter=line
test.describe.configure({ mode: 'serial' })
test.skip(!process.env.RUN_GOLDEN_PATH_DEEP, 'set RUN_GOLDEN_PATH_DEEP=1 (läuft echt gegen Prod)')

// Fixtures auf Kanon-Zustand zurücksetzen (deep mutiert sie; SV-Submit setzt hochgeladen).
test.beforeAll(() => {
  execFileSync('npx', ['tsx', 'scripts/test-fixtures/provision.ts'], {
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
})

test('SV #3729 — Stellungnahme einreichen (C2) → auftrag hochgeladen', async ({ browser }) => {
  test.setTimeout(90_000)
  test.skip(!process.env.TEST_SV_PASSWORD, 'TEST_SV_PASSWORD nicht gesetzt')
  const ctx = await loginContext(browser, 'sv')
  const page = await ctx.newPage()

  // 1. Fallseite — der #3729-Banner-CTA muss erreichbar sein.
  await page.goto(`${APP}/gutachter/fall/${CLAIMS.c2}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  expect(new URL(page.url()).pathname, 'SV nicht zu /login gebounced').not.toMatch(/\/login|\/anmelden/)
  const cta = page.getByRole('link', { name: /Stellungnahme einreichen/i }).first()
  await expect(cta, '#3729-CTA sichtbar').toBeVisible({ timeout: 15_000 })

  // 2. Auf die Stellungnahme-Seite (CTA klicken).
  await cta.click()
  await page.waitForURL(/\/gutachter\/fall\/.+\/stellungnahme/, { timeout: 20_000 })

  // 3. Formular: Datei + Bestätigung + absenden.
  await page.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/test-upload.pdf')
  await page.locator('input[type="checkbox"]').first().check()
  await page.getByRole('button', { name: 'Stellungnahme einreichen' }).click()

  // 4. Erfolg → redirect zurück zur Fallseite.
  await page.waitForURL(new RegExp(`/gutachter/fall/${CLAIMS.c2}$`), { timeout: 30_000 })

  // 5. DB-Assert.
  await assertRow('auftraege', AUFTRAEGE.c2, { technische_stellungnahme_status: 'hochgeladen' })

  await ctx.close()
})
```

- [ ] **Step 2: Run against prod**

Run:
```bash
set -a; source <(grep -E 'NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY' ../../../.env.local); set +a
RUN_GOLDEN_PATH_DEEP=1 TEST_SV_PASSWORD='Claimondo-SV-Smoke-2026' \
  npx playwright test golden-path-deep-prod --workers=1 --reporter=line
```
Expected: 1 passed. Der `beforeAll`-provision loggt `0 Fehler`; der Flow klickt den CTA, lädt hoch, sendet, DB-Assert grün.

**Falls SV zu `/login` gebounced wird** (mfa-gate blockt cookie-injizierte Session): Risiko aus der Spec → mit `eaf5be72` (2fa-totp-test-infra) koordinieren; hier dokumentieren + Flagship blockiert markieren.

- [ ] **Step 3: Commit** — `test(golden-path): SV #3729 Flagship deep-flow (prod-verifiziert)`.

---

### Tasks 3–7: Weitere Rollen-Flows (je ein `test()` in derselben Spec)

Jeder Flow: `loginContext(browser, <role>)` → zum Fixture-Claim → CTA interagieren → `assertRow`. **Step 1 jedes Tasks = die echte Client-Komponente lesen** (Selektoren verifizieren, nicht raten) — analog zum Flagship. Struktur + Assert-Ziel stehen fest:

- [ ] **Task 3 — Kunde (C1): Pflichtdok-Upload.** Read `src/app/kunde/faelle/[id]/**` (Upload-Client). Flow: login `kunde` → `${APP}/kunde/faelle/${CLAIMS.c1}` (bzw. Kalender/Dokumente-Subroute) → Pflichtdok-Slot `fahrzeugschein` → `input[type=file]` setInputFiles → absenden. Assert: `pflichtdokumente` (fall_id=CLAIMS.c1, dokument_typ='fahrzeugschein') hat `hochgeladen_am`/status gesetzt. Commit.
- [ ] **Task 4 — Dispatch (C1): SV zuweisen.** Read `src/app/dispatch/**` (Lead/assign-from-map-Client, `getSvSuggestionsWithSlots`/`reserveSvTerminForLead`). Flow: login `dispatch` → C1-Lead/Karte → test-sv zuweisen + Slot → bestätigen. Assert: `claims.{CLAIMS.c1}.sv_id` gesetzt bzw. `gutachter_termine` für C1. Commit. (⚠ Dispatch-Karte = Lane anderer Sessions; nur lesen, nichts an deren Files ändern.)
- [ ] **Task 5 — Kanzlei (C3): Mandat-Aktion.** Read `src/app/kanzlei/mandate/**`. Flow: login `kanzlei` → Mandat C3 → eine Kanzlei-Aktion (z.B. Status/Anschlussschreiben). Assert: entsprechendes `kanzlei_faelle`/`claims`-Feld. Commit.
- [ ] **Task 6 — KB (C2): KB-Aktion.** Read `src/app/mitarbeiter/**` (KB-Fallsicht C2). Flow: login `kb` → C2 → eine KB-Aktion. Assert: Claim/Task-Feld. Commit.
- [ ] **Task 7 — Admin: Claim-Aktion.** Read `src/app/admin/faelle/**`. Flow: login `admin` (⚠ 2FA-Risiko: test-admin twofa_aktiviert=true — falls cookie-injection nicht durchkommt, dokumentieren/deferren) → Claim-Aktion. Assert: Claim-Feld. Commit.

## Self-Review

**1. Spec coverage:** Cookie-Injection-Auth + SW-block (Task 1 `loginContext`) · provision-first (Task 2 `beforeAll`) · opt-in-Guard (Task 2) · Fixture-Anker (ids-Import) · DB-Assert (`assertRow`) · SV-Flagship deep (Task 2) · je Rolle ein Flow (Tasks 3–7) · Residue toleriert (provision-Reset) · self-contained/kein config-Edit (durchgehend). Makler deferred (Spec YAGNI). Alle Punkte abgedeckt.

**2. Placeholder scan:** Task 1+2 vollständiger Code + verifizierte Selektoren/DB-Effekte. Tasks 3–7 haben eine benannte Discovery (echte Client lesen) + festes Assert-Ziel — kein hand-waving, gleiche Methode wie SP1-C3/Flagship.

**3. Type consistency:** `loginContext(browser, roleKey)`, `assertRow(table, id, expected)`, `serviceClient()`, `ROLES`, `APP` — über alle Tasks identisch. Fixture-IDs `CLAIMS.c2`/`AUFTRAEGE.c2` konsistent mit `scripts/test-fixtures/ids.ts`.
