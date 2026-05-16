# CMM-60 Phase 4 — SV-`claims`-Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dem SV den direkten `claims`-Tabellen-Lesezugriff entziehen — `v_claim_sv` (security_definer) wird sein einziges Claim-Lese-Fenster.

**Architecture:** Eine SQL-Migration: `v_claim_sv` auf `security_definer` + Owner `postgres` umstellen, `is_sv_for_claim` aus der `claims`-SELECT-Policy entfernen. Kein App-Code (Reader-Audit: 0 SV-`claims`-Reader). Verifikation per RLS-Impersonation + SV-Portal-UI-Smoke.

**Tech Stack:** PostgreSQL/Supabase (Targeted-Apply), Playwright (UI-Smoke).

**Spec:** `docs/superpowers/specs/2026-05-16-cmm60-phase4-sv-claims-closure-design.md`
**Branch:** `kitta/cmm-60-phase4-sv-claims-closure` (existiert, von `staging`). Worktree: `wt-cmm60`.

**Live-`USING` von `claims_kunde_sv_dispatch_select_consolidated` (2026-05-16, verifiziert):**
`((is_dispatcher() AND dispatcher_owns_lead(lead_id)) OR (geschaedigter_user_id = ( SELECT auth.uid() AS uid)) OR is_claim_user_party(id) OR is_sv_for_claim(id))`

---

## File Structure

- **Create:** `supabase/migrations/<ts>_cmm60_phase4_sv_claims_closure.sql` — View-Flip + Policy-ALTER.
- **Create:** `scripts/probe-cmm60-p4-closure.sql` — RLS-Impersonation + Struktur-Verifikation.
- **Create:** `scripts/smoke-cmm60-p4-sv-portal.mjs` — SV-Portal-UI-Smoke (staging).

---

## Task 1: Migration schreiben

**Files:**
- Create: `supabase/migrations/<ts>_cmm60_phase4_sv_claims_closure.sql`

- [ ] **Step 1: Migrationsdatei generieren**

Run (im Worktree `wt-cmm60`):
```bash
npx supabase migration new cmm60_phase4_sv_claims_closure
```
Expected: neue leere Datei. `<ts>`-Dateinamen merken.

- [ ] **Step 2: Migration-SQL schreiben** (generierte Datei komplett ersetzen)

```sql
-- CMM-60 Phase 4 — SV-claims-Closure.
--
-- Schritt 2b hat v_claim_sv als spalten-gescopete SV-Projektion gebaut.
-- Phase 4 entzieht dem SV den direkten claims-Tabellen-Lesezugriff —
-- v_claim_sv wird sein einziges Claim-Lese-Fenster.
--
-- v_claim_sv muss dafuer von security_invoker auf security_definer: ein
-- security_invoker-View liefere nach der Closure 0 Zeilen, weil er an der
-- claims-RLS haengt, die wir gerade entziehen. Definer + Owner postgres ->
-- RLS-exempt, das View-eigene WHERE is_sv_for_claim ist der alleinige
-- Row-Filter.
--
-- Spec: docs/superpowers/specs/2026-05-16-cmm60-phase4-sv-claims-closure-design.md
-- NICHT in Scope: faelle-Drop + faelle->claims-Trigger-Drop = Phase 6.
-- is_sv_for_claim (Funktion) bleibt — claim_parties.cp_select_consolidated
-- nutzt sie weiter.

BEGIN;

-- 1. v_claim_sv selbsttragend machen (security_definer, RLS-exempt Owner).
ALTER VIEW public.v_claim_sv SET (security_invoker = false);
ALTER VIEW public.v_claim_sv OWNER TO postgres;

-- 2. is_sv_for_claim aus der claims-SELECT-Policy entfernen.
ALTER POLICY claims_kunde_sv_dispatch_select_consolidated ON public.claims
  USING (
    (is_dispatcher() AND dispatcher_owns_lead(lead_id))
    OR (geschaedigter_user_id = ( SELECT auth.uid() AS uid))
    OR is_claim_user_party(id)
  );

COMMIT;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_cmm60_phase4_sv_claims_closure.sql
git commit -m "feat(CMM-60): Phase-4 Migration — SV-claims-Closure

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
(Echte Umlaute im Commit — Pre-Commit-Hook blockt ASCII-Ersatz.)

---

## Task 2: Verifikations-Probe schreiben

**Files:**
- Create: `scripts/probe-cmm60-p4-closure.sql`

- [ ] **Step 1: Probe-Skript schreiben**

Inhalt von `scripts/probe-cmm60-p4-closure.sql` (reine Struktur-Checks, keine Platzhalter — die RLS-Impersonation läuft separat in Task 3 Step 5):

```sql
-- CMM-60 Phase-4 Closure-Verifikation.
-- Teil A: Struktur (ausserhalb Auth-Kontext).
SELECT chk, result FROM (
  SELECT 1 AS ord, 'v_claim_sv security_invoker NICHT mehr aktiv' AS chk,
    (NOT COALESCE(
      (SELECT (reloptions @> ARRAY['security_invoker=true'])
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='v_claim_sv'), false))::text AS result
  UNION ALL
  SELECT 2, 'v_claim_sv Owner = postgres',
    ((SELECT pg_get_userbyid(c.relowner)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='v_claim_sv') = 'postgres')::text
  UNION ALL
  SELECT 3, 'is_sv_for_claim nicht mehr in claims-SELECT-Policy',
    (NOT (SELECT qual ILIKE '%is_sv_for_claim%'
          FROM pg_policies
          WHERE tablename='claims'
            AND policyname='claims_kunde_sv_dispatch_select_consolidated'))::text
  UNION ALL
  SELECT 4, 'is_sv_for_claim-Funktion existiert weiter',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname='is_sv_for_claim')::text
) q ORDER BY ord;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/probe-cmm60-p4-closure.sql
git commit -m "test(CMM-60): Phase-4 Closure-Struktur-Probe

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migration applizieren + DB-Verifikation

**Files:**
- (nutzt Task-1-Migration + Task-2-Probe)

- [ ] **Step 1: Worktree-Supabase-Link sicherstellen**

```bash
cp -r "/c/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/supabase/.temp/." supabase/.temp/
```

- [ ] **Step 2: Pre-Apply-Check — Live-`USING` gegenprüfen**

```bash
printf "%s" "SELECT qual FROM pg_policies WHERE tablename='claims' AND policyname='claims_kunde_sv_dispatch_select_consolidated';" > scripts/_t.sql
npx supabase db query --linked --agent yes --file scripts/_t.sql
rm -f scripts/_t.sql
```
Expected: `qual` enthält `is_sv_for_claim(id)` und die 3 anderen Zweige exakt wie im Plan-Header. Weicht etwas ab → STOPP, Migration §2 anpassen.

- [ ] **Step 3: Migration applizieren (Targeted-Apply)**

```bash
npx supabase db query --linked --agent yes --file supabase/migrations/<ts>_cmm60_phase4_sv_claims_closure.sql
npx supabase migration repair --status applied <ts>
```
Expected: erste Query `"rows": []`; repair `Finished supabase migration repair.`

- [ ] **Step 4: Struktur-Probe ausführen**

```bash
npx supabase db query --linked --agent yes --file scripts/probe-cmm60-p4-closure.sql
```
Expected: alle 4 Checks `"result": "true"`.

- [ ] **Step 5: SV-Testdaten holen + RLS-Impersonation**

```bash
printf "%s" "SELECT sv.profile_id, sv.id AS sv_id FROM sachverstaendige sv JOIN claims c ON c.sv_id=sv.id WHERE sv.profile_id IS NOT NULL LIMIT 1;" > scripts/_t.sql
npx supabase db query --linked --agent yes --file scripts/_t.sql
rm -f scripts/_t.sql
```
Dann eine temporäre RLS-Impersonation-Query (mit den zurückgegebenen IDs):
```bash
cat > scripts/_imp.sql <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<SV_PROFILE_ID>','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT chk, result FROM (
  SELECT 1 AS ord, 'SV sieht v_claim_sv (>0 Zeilen)' AS chk,
    ((SELECT count(*) FROM public.v_claim_sv) > 0)::text AS result
  UNION ALL
  SELECT 2, 'v_claim_sv-Zeilen = claims des SV',
    ((SELECT count(*) FROM public.v_claim_sv)
     = (SELECT count(*) FROM public.claims WHERE sv_id='<SV_ID>'))::text
  UNION ALL
  SELECT 3, 'SV sieht claims-Tabelle direkt NICHT mehr (0 Zeilen)',
    ((SELECT count(*) FROM public.claims) = 0)::text
) q ORDER BY ord;
ROLLBACK;
SQL
npx supabase db query --linked --agent yes --file scripts/_imp.sql
rm -f scripts/_imp.sql
```
Expected: alle 3 Checks `"result": "true"` — `v_claim_sv` trägt sich selbst, direkter `claims`-Zugriff des SV ist zu.

Falls Check 1/2 `false` (View liefert 0 Zeilen): der Definer ist nicht RLS-exempt → `ALTER VIEW public.v_claim_sv OWNER TO postgres` hat nicht gegriffen bzw. `postgres` ist nicht RLS-exempt. STOPP, mit Aaron klären.

---

## Task 4: SV-Portal-UI-Smoke

**Files:**
- Create: `scripts/smoke-cmm60-p4-sv-portal.mjs`

- [ ] **Step 1: Smoke-Skript schreiben**

Inhalt von `scripts/smoke-cmm60-p4-sv-portal.mjs`:

```js
// CMM-60 Phase-4 UI-Smoke: SV-Portal gegen staging nach der claims-Closure.
// Login test-sv@claimondo.de -> /gutachter, /heute, Fallakte, /kalender.
// Prueft: keine 403/leeren Listen/pageerrors.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'

const BASE = 'https://app.staging.claimondo.de'
const OUT = 'docs/16.05.2026/cmm60-p4-sv-smoke'
const EMAIL = 'test-sv@claimondo.de'
const PW = 'Test1234!'
const FALL_ID = '33bf8685-6941-426c-b16b-3e29b1255000' // CLM-20260515-014, test-sv zugewiesen
const BASIC = { username: process.env.STAGING_BASIC_AUTH_USER, password: process.env.STAGING_BASIC_AUTH_PASS }

if (!BASIC.username || !BASIC.password) {
  console.error('FEHLER: STAGING_BASIC_AUTH_USER + STAGING_BASIC_AUTH_PASS fehlen.')
  process.exit(1)
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ httpCredentials: BASIC, viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'claimondo-cookie-consent', value: 'true', domain: 'app.staging.claimondo.de', path: '/' }])
const page = await ctx.newPage()
page.on('pageerror', e => { errors.push('PAGE-ERROR: ' + e.message); console.log('PAGE-ERROR:', e.message) })
page.on('response', r => { if (r.status() >= 500) { errors.push(`HTTP ${r.status()} ${r.url()}`); console.log('HTTP', r.status(), r.url()) } })

console.log('1. Login …')
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.fill('input[name="email"], input[type="email"]', EMAIL)
await page.fill('input[name="password"], input[type="password"]', PW)
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
])

const routes = [
  ['gutachter', '/gutachter'],
  ['heute', '/gutachter/heute'],
  ['fallakte', '/gutachter/fall/' + FALL_ID],
  ['kalender', '/gutachter/kalender'],
]
let denied = false
for (const [name, route] of routes) {
  console.log('2. ' + route + ' …')
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  const txt = await page.locator('body').innerText()
  if (/kein zugriff|nicht berechtigt|403|forbidden/i.test(txt)) {
    denied = true
    console.log('   ZUGRIFF VERWEIGERT auf ' + route)
  }
}

await browser.close()
console.log('\n=== ERGEBNIS ===')
console.log('pageerrors/5xx:', errors.length, '| denied:', denied)
const ok = errors.length === 0 && !denied
console.log(ok ? 'SMOKE GRÜN' : 'SMOKE ROT')
process.exit(ok ? 0 : 1)
```

- [ ] **Step 2: Smoke ausführen**

```bash
STAGING_BASIC_AUTH_USER=aaroncmdo STAGING_BASIC_AUTH_PASS='ClaimondoSuperuser123789!!' node scripts/smoke-cmm60-p4-sv-portal.mjs
```
Expected: `SMOKE GRÜN` — kein 403, keine pageerrors, alle 4 SV-Routen laden.

- [ ] **Step 3: Screenshots auswerten**

Die 4 Screenshots unter `docs/16.05.2026/cmm60-p4-sv-smoke/` sichten (Memory `feedback_smoke_screenshot_pflicht`): SV-Cockpit + Fallakte + Kalender rendern befüllt, kein leerer Zustand durch fehlenden claims-Zugriff.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-cmm60-p4-sv-portal.mjs docs/16.05.2026/cmm60-p4-sv-smoke/
git commit -m "test(CMM-60): Phase-4 SV-Portal-UI-Smoke (staging)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: PR + Linear

- [ ] **Step 1: Push + PR gegen staging**

```bash
git push
gh pr create --base staging --head kitta/cmm-60-phase4-sv-claims-closure \
  --title "feat(CMM-60): Phase 4 — SV-claims-Closure" \
  --body "CMM-60 Phase 4: dem SV den direkten claims-Tabellen-Lesezugriff entzogen. v_claim_sv auf security_definer (Owner postgres) — selbsttragend; is_sv_for_claim aus claims_kunde_sv_dispatch_select_consolidated entfernt. is_sv_for_claim-Funktion bleibt (claim_parties). Reader-Audit: 0 SV-claims-Reader, kein Code-Change. Struktur- + RLS-Impersonation- + SV-Portal-UI-Smoke gruen. faelle-Drop = Phase 6. Spec/Plan: docs/superpowers/specs|plans/2026-05-16-cmm60-phase4-*"
```
Expected: PR-URL.

- [ ] **Step 2: Linear CMM-60 Kommentar**

Kommentar an CMM-60: Phase 4 appliziert, SV-claims-Closure live, v_claim_sv security_definer, PR-Link, Smokes grün, faelle-Drop = Phase 6.

---

## Verifikation gesamt

Plan erfüllt wenn:
- `v_claim_sv` ist `security_definer`, Owner `postgres`.
- `claims_kunde_sv_dispatch_select_consolidated` ohne `is_sv_for_claim`; Funktion existiert weiter.
- RLS-Impersonation: SV sieht `v_claim_sv` (>0, = eigene Claims), `claims`-Tabelle direkt = 0 Zeilen.
- SV-Portal-UI-Smoke grün, Screenshots ausgewertet.
- PR gegen `staging` offen, Linear aktualisiert.
