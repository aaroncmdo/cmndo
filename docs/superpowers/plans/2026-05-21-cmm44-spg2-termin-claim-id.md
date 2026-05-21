# CMM-44 SP-G2 — gutachter_termine.claim_id Phase-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gutachter_termine.claim_id` writer-getragen + faelle-entkoppelt machen — Writer setzen `claim_id` selbst, claim-aufloesende Reader nutzen `gt.claim_id`, CMM-58s faelle-lesender Ableitungs-Trigger faellt weg, View wird claim-gekeyt, ein RAISE-Validierungs-Trigger ersetzt das stille NULL-Risiko.

**Architecture:** 2 PRs mit **invertiertem Gating**. PR1 = Code-only (Writer setzen `claim_id`, claim-resolving Reader auf `gt.claim_id`) — der CMM-58-Trigger bleibt aktiv, daher ist PR1 verhaltensneutral. PR2 = Migration (DROP Ableitungs-Trigger+Funktion, CREATE Validierungs-Trigger mit RAISE, View-LATERAL `gt.fall_id` → `gt.claim_id`), **appliziert erst nachdem PR1 auf main/prod live ist** — sonst trifft der gedroppte Trigger alten Prod-Code (AAR-599-Klasse). CMM-58 hat die additive Struktur (Spalte/FK/Index/Backfill) schon gelegt — daher 2 statt 3 PRs.

**Tech Stack:** Next.js 15, TypeScript, `@supabase/supabase-js`, Supabase CLI (Migrations), Postgres, Playwright (Portal-Smoke).

**Spec:** `docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** `.claude/worktrees/cmm-44-spg2-pr1`, Branch `kitta/cmm-44-spg2-pr1-writer-reader` off `origin/staging`. Pro PR ein eigener Branch off `staging`. Memory `feedback_pr_gegen_staging`: PRs immer `--base staging`.
- **Harte Regeln (AGENTS.md):** Nie auf `main` pushen. DDL nur via supabase-CLI (`db query --linked` + `migration repair`, **kein** `db push` wegen Drift). Kein unbegleiteter Stash am Session-Ende.
- **DB-Apply-Muster (bewaehrt SP-A2/A3/B/G/H):** Migration in `BEGIN/COMMIT`; Dry-Run `BEGIN; … ROLLBACK;`; Apply via `npx supabase db query --linked --file <sql>`; danach `npx supabase migration repair --status applied <version>`.
- **Geteilte DB:** Staging-App + Prod-App teilen sich **eine** Supabase-DB (`paizkjajbuxxksdoycev`). Eine applizierte Migration wirkt sofort auf **beide** App-Slots. Darum die invertierte Gating-Regel (siehe Architektur).
- **Supabase-Link:** Der Worktree ist gelinkt (`supabase/.temp/` kopiert). `db query --linked` laeuft direkt.
- **Commit-Format:** Jeder Commit braucht den 7-Punkte-Audit-Block. Commit-Messages auf Englisch ODER mit echten deutschen Umlauten (der staging-Pre-Commit-Hook blockt ASCII-Ersatz wie `fuer`/`zurueck` — handoff §4).
- **PR-Hygiene (`feedback_kein_auto_merge` + `feedback_staging_auto_merge` + `feedback_draft_pr_nicht_release_sicher`):** Auto-Merge ist **WIDERRUFEN** fuer beide Targets. Branch pushen + Reviews laufen lassen, PR erst nach Spec-Review + Code-Quality-Review oeffnen. Aaron mergt selbst. **Draft-PRs werden trotzdem von der Release-Automation gemergt** → was nicht gemergt werden soll, gar nicht erst als PR oeffnen.

---

## Referenz: CMM-58-Ausgangszustand (live 2026-05-21 in Task 0 zu bestaetigen)

`gutachter_termine.claim_id` existiert bereits (Migration `20260516141502`, PR #1385/#1389 auf staging+main):

| Objekt | Zustand laut CMM-58 |
|---|---|
| `gutachter_termine.claim_id` | `uuid`, nullable, FK → `claims(id)` `ON DELETE SET NULL` |
| `idx_gutachter_termine_claim_id` | Index auf `claim_id` |
| Backfill | `claim_id = faelle.claim_id` ueber `fall_id` (einmalig) |
| `sync_gutachter_termine_claim_id()` | Trigger-Funktion, **liest faelle**, `SECURITY DEFINER` |
| `trg_sync_gutachter_termine_claim_id` | `BEFORE INSERT OR UPDATE OF fall_id` → leitet `claim_id` aus `fall_id` ab |

SP-G2 entfernt die letzten beiden, macht `claim_id` writer-getragen, ersetzt sie durch einen Validierungs-Trigger.

---

## Transform-Regelwerk

### Writer (PR1) — INSERTs auf `gutachter_termine`

Nur INSERTs sind relevant: der Sweep (Task 1) bestaetigt, dass **kein** `UPDATE OF fall_id` (Re-Link) existiert. Status-/Reminder-Updates schreiben auf eine Row, die `claim_id` schon traegt → kein Change.

| Muster | Erkennung | Transform |
|---|---|---|
| **W-A — Writer mit existierendem faelle-Load** | `from('gutachter_termine').insert({ fall_id: fall.id, … })` und ein `fall` aus `from('faelle').select(…)` ist bereits im Scope geladen | `claim_id` zur **bestehenden** faelle-`select` ergaenzen + `claim_id: fall.claim_id` in den `insert`. **Kein neuer faelle-Read** — nur eine Spalte mehr in einem ohnehin vorhandenen Select. |
| **W-B — Writer mit Claim-Kontext** | claim-native Insert, `claimId` ist im Scope | `claim_id: claimId` direkt setzen. |
| **W-C — Writer kopiert von Quell-Termin** | Folge-/Re-Termin aus bestehendem Termin | `claim_id: quellTermin.claim_id` (Quell-Termin traegt `claim_id` bereits); `quellTermin`-Select um `claim_id` ergaenzen. |
| **W-D — claim-loser Termin** | reiner Admin-/Konfrontations-Termin ohne fall/claim (`fall_id` NULL) | beide NULL lassen — legitim, der Validierungs-Trigger feuert **nicht** (Bedingung ist `fall_id IS NOT NULL AND claim_id IS NULL`). |

**Konkretes W-A-Beispiel (`src/lib/termine/kb-booking.ts`):**

```typescript
// VORHER (Zeile ~30):
const { data: fall, error: fallErr } = await db
  .from('faelle')
  .select('id, kunde_id, lead_id, claims:claim_id(kundenbetreuer_id)')
  .eq('id', fallId)
  .single()
// … (Zeile ~151):
const { data: newTermin, error: insertErr } = await db
  .from('gutachter_termine')
  .insert({
    fall_id: fallId,
    kb_id: kbId,
    typ: 'kb_beratung',
    // … weitere Felder …
  })
  .select('id')
  .single()

// NACHHER:
const { data: fall, error: fallErr } = await db
  .from('faelle')
  .select('id, kunde_id, lead_id, claim_id, claims:claim_id(kundenbetreuer_id)')  // + claim_id
  .eq('id', fallId)
  .single()
// …
const { data: newTermin, error: insertErr } = await db
  .from('gutachter_termine')
  .insert({
    fall_id: fallId,
    claim_id: fall.claim_id,   // + claim_id (writer-getragen)
    kb_id: kbId,
    typ: 'kb_beratung',
    // … weitere Felder …
  })
  .select('id')
  .single()
```

**Konkretes W-A-Beispiel (`src/app/kunde/re-termin/[token]/actions.ts`):** identisch — `claim_id` zur `select('id, sv_id, lead_id, …')` (Zeile ~44) ergaenzen + `claim_id: fall.claim_id` in den Insert (Zeile ~70).

### Reader (PR1) — eng abgegrenzt

| Muster | Erkennung | Transform |
|---|---|---|
| **R-A — termin→claim Resolver via faelle** | Code liest `gt.fall_id` und holt darueber `faelle.claim_id` (`from('faelle').select('claim_id').eq('id', termin.fall_id)`), nur um an den Claim zu kommen | `claim_id` direkt aus `gutachter_termine` lesen (in der gt-`select` `claim_id` ergaenzen, den faelle-Hop entfernen). |
| **R-B — fall-skopierter Read (KEIN Change)** | `timeline.fall_id`, Ownership-Guards (z.B. `cancelKbTermin` liest `faelle` per `termin.fall_id` fuer `kunde_id`), Fall-Page-Links, reine fall-Zuordnung | bleibt `fall_id` bis Phase 6. **Nicht** anfassen — kein Over-Scope (Spec §6 Non-Goals). |

**Hinweis:** Manche Reader lesen `claim_id` schon korrekt (z.B. `src/lib/termine/get-sv-tagesplan.ts` nutzt `claims:claim_id(...)`) → kein Change. Die Inventur (Task 1) trennt R-A von R-B pro Stelle.

**Verify-Endzustand PR1:** `npx tsc --noEmit` + `npm run build` (8 GB heap) gruen; alle bekannten INSERT-Sites setzen `claim_id` (oder sind W-D claim-los); R-A-Reader lesen `gt.claim_id`.

---

## File Structure

**Neu:**
- `scripts/cmm44-spg2-measure.sql` — Live-Zustand: claim_id Spalte/FK/Index/Trigger-Existenz + Coverage (`fall_id` gesetzt & `claim_id` NULL = Verstoss-Count). Mit Spec/Plan committet.
- `scripts/cmm44-spg2-writers-grep.mjs` — paren-balanced Finder der `gutachter_termine`-INSERT/upsert-Sites; markiert pro Insert, ob `claim_id` im Payload steht (Task 1).
- `scripts/cmm44-spg2-verify.sql` — Post-PR2-Verify: Ableitungs-Trigger weg, Validierungs-Trigger da, View claim-gekeyt, 0 Coverage-Verstoesse (Task 4/5).
- `supabase/migrations/<ts>_cmm44_spg2_rewire_claim_id.sql` — PR2.
- `docs/21.05.2026/cmm44-spg2-writer-reader-inventory.md` — PR1-Inventur (Task 1).
- `docs/21.05.2026/cmm44-spg2-views-trigger-audit.md` — PR2 View-/Trigger-Audit (Task 4).
- `scripts/smoke-cmm44-spg2.mjs` — Portal-Smoke (analog `scripts/smoke-cmm44-sph.mjs`).
- `docs/21.05.2026/cmm44-spg2-smoke-pr1.md`, `cmm44-spg2-smoke-pr2.md` — Smoke-Protokolle.
- `docs/21.05.2026/handoff-cmm44-spg2-abschluss.md` — Handoff (Task 7).

**Modifiziert (PR1):** `src/`-Files mit `gutachter_termine`-INSERT (W-A/B/C) + R-A-Reader (Inventur Task 1). **Kein** Schema-Change in PR1, daher **keine** `database.types.ts`-Regen in PR1.

---

## Task 0: Live-DB-Drift-Check

**Files:** Create `scripts/cmm44-spg2-measure.sql`.

- [ ] **Step 1: Measure-Script schreiben**

Datei `scripts/cmm44-spg2-measure.sql`:
```sql
-- CMM-44 SP-G2 — Live-Zustand von gutachter_termine.claim_id + CMM-58-Trigger.
-- 1) Spalte + FK?
SELECT 'COLUMN' AS check, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachter_termine' AND column_name='claim_id';

-- 2) FK + Index?
SELECT 'FK' AS check, conname FROM pg_constraint
WHERE conrelid='public.gutachter_termine'::regclass AND contype='f'
  AND conname LIKE '%claim_id%';
SELECT 'INDEX' AS check, indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='gutachter_termine' AND indexname='idx_gutachter_termine_claim_id';

-- 3) CMM-58-Ableitungs-Trigger + Funktion noch da?
SELECT 'TRIGGER' AS check, tgname FROM pg_trigger
WHERE tgrelid='public.gutachter_termine'::regclass AND NOT tgisinternal
  AND tgname='trg_sync_gutachter_termine_claim_id';
SELECT 'FUNCTION' AS check, proname FROM pg_proc WHERE proname='sync_gutachter_termine_claim_id';

-- 4) Coverage-Verstoss: fall_id gesetzt, aber claim_id NULL (muss 0 sein)?
SELECT 'VIOLATIONS' AS check, count(*) AS cnt
FROM public.gutachter_termine WHERE fall_id IS NOT NULL AND claim_id IS NULL;

-- 5) Gesamt-Statistik
SELECT 'STATS' AS check, count(*) AS total,
  count(*) FILTER (WHERE claim_id IS NOT NULL) AS mit_claim,
  count(*) FILTER (WHERE fall_id IS NULL) AS claim_los
FROM public.gutachter_termine;
```

- [ ] **Step 2: Ausfuehren + interpretieren**

Run:
```bash
npx supabase db query --linked --file scripts/cmm44-spg2-measure.sql 2>&1 | tail -40
```
Expected: `COLUMN claim_id uuid YES`, ein FK-Treffer, Index da, Ableitungs-Trigger + Funktion **vorhanden**, `VIOLATIONS cnt = 0`. Falls eine andere Session schon Teile umgebaut hat (z.B. Trigger weg) → im Ausfuehrungs-Log vermerken + Migration-Bloecke in Task 4 anpassen. Falls `VIOLATIONS > 0` → Block 0 (Catch-up) in der PR2-Migration ist Pflicht.

- [ ] **Step 3: Commit (Script, kein Apply)**

```bash
git add scripts/cmm44-spg2-measure.sql
git commit -F - <<'EOF'
chore(CMM-44): SP-G2 live-state measure script

Reads gutachter_termine.claim_id column/FK/index, CMM-58 derive-trigger
presence, and coverage violations (fall_id set + claim_id null) for the
SP-G2 drift-check.

Audit:
- Build: n/a (SQL only)
- UI: n/a
- Redundanz: follows SP-H measure-script pattern
- Dead-Code: nothing
- Spec: docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md
- Inkonsistenz: n/a
- Regression: n/a (read-only query)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 1: PR1 — Writer/Reader-Inventur (paren-balanced)

**Branch:** `kitta/cmm-44-spg2-pr1-writer-reader` (= Worktree-Branch, enthaelt Spec + measure-Script).

**Files:** Create `scripts/cmm44-spg2-writers-grep.mjs`, `docs/21.05.2026/cmm44-spg2-writer-reader-inventory.md`.

- [ ] **Step 1: Writer-Grep-Skript schreiben**

Datei `scripts/cmm44-spg2-writers-grep.mjs`:
```javascript
#!/usr/bin/env node
// CMM-44 SP-G2 — findet alle gutachter_termine INSERT/upsert-Sites und prueft,
// ob claim_id im Insert-Payload steht. Paren-balanced fuer multi-line Chains
// (.from('gutachter_termine')\n.insert({...})).

import fs from 'node:fs'
import path from 'node:path'

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.claude'].includes(e.name)) continue
      walk(p, out)
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p)
  }
  return out
}

// Liest ab einer Position die balancierte (...) ab.
function balanced(s, openIdx) {
  let depth = 0, i = openIdx
  for (; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') { depth--; if (depth === 0) return s.slice(openIdx, i + 1) }
  }
  return s.slice(openIdx)
}

const fromRe = /\.from\(\s*['"]gutachter_termine['"]\s*\)/g
const rows = []

for (const f of walk('src')) {
  const s = fs.readFileSync(f, 'utf8')
  let m
  fromRe.lastIndex = 0
  while ((m = fromRe.exec(s))) {
    // Fenster ab dem .from(...) bis ~600 Zeichen: enthaelt die Chain.
    const win = s.slice(m.index, m.index + 600)
    const opMatch = win.match(/\.(insert|upsert)\s*\(/)
    if (!opMatch) continue
    const op = opMatch[1]
    const payloadStart = m.index + opMatch.index + opMatch[0].length - 1
    const payload = balanced(s, payloadStart)
    const hasClaimId = /\bclaim_id\s*:/.test(payload)
    const ln = s.slice(0, m.index).split('\n').length
    rows.push(`${f}:${ln} | ${op} | claim_id:${hasClaimId ? 'YES' : 'NO'}`)
  }
}

console.log(rows.join('\n'))
console.log(`\nTOTAL INSERT/UPSERT SITES: ${rows.length}`)
console.log(`MISSING claim_id: ${rows.filter(r => r.endsWith('NO')).length}`)
```

- [ ] **Step 2: Writer-Inventur fahren**

```bash
node scripts/cmm44-spg2-writers-grep.mjs
```
Expected: Liste aller INSERT/upsert-Sites mit `claim_id:YES/NO`. Die `NO`-Sites sind die Transform-Kandidaten (W-A/B/C) — ausser sie sind claim-los (W-D, z.B. reine Admin-Termine). Bekannt erwartet: `src/lib/termine/kb-booking.ts`, `src/app/kunde/re-termin/[token]/actions.ts` (beide W-A, `NO`), plus Test/Seed (`create-test-fall`, `seed-testdata`, `lifecycle-seed`) und ggf. `spontan.ts`/`sv-gegenvorschlag.ts`/`kb-slots.ts`.

- [ ] **Step 3: Reader-Resolver manuell klassifizieren**

R-A-Reader sind nicht zuverlaessig greppbar (sie holen den Claim ueber `termin.fall_id`). Kandidaten aufspueren:
```bash
# Stellen, die einen Termin laden und dessen fall_id weiterverwenden:
grep -rn "\.fall_id" src/lib/termine src/app/api/termin src/app/api/kunde/termin 2>/dev/null | head -40
# Stellen, die faelle.claim_id ueber eine termin-fall_id aufloesen:
grep -rn "from('faelle')" src/ 2>/dev/null | grep -i "claim_id" | head -20
```
Pro Treffer entscheiden: **R-A** (holt den Claim nur zur Weiterverarbeitung → auf `gt.claim_id` umstellen) oder **R-B** (fall-skopiert: timeline/ownership/fall-link → bleibt). Im Zweifel R-B (konservativ, kein Over-Scope).

- [ ] **Step 4: Inventur-Doc schreiben**

`docs/21.05.2026/cmm44-spg2-writer-reader-inventory.md`:
- Tabelle aller INSERT-Sites mit Muster (W-A/B/C/D) + claim_id-Quelle.
- Liste der R-A-Reader (auf `gt.claim_id` umzustellen) und der bewusst belassenen R-B-Reads.
- Out-of-Scope-Notiz: Test-Fixtures duerfen claim_id setzen (saubere Seeds), sind aber nicht prod-kritisch.

```bash
git add scripts/cmm44-spg2-writers-grep.mjs docs/21.05.2026/cmm44-spg2-writer-reader-inventory.md
git commit -F - <<'EOF'
docs(CMM-44): SP-G2 PR1 — writer/reader inventory (paren-balanced)

Enumerates all gutachter_termine insert/upsert sites (claim_id present?)
and classifies termin->claim resolvers (R-A switch) vs fall-scoped reads
(R-B keep). Basis for the PR1 transform.

Audit:
- Build: n/a (script + doc)
- UI: n/a
- Redundanz: grep follows SP-H paren-balanced pattern
- Dead-Code: nothing
- Spec: docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md
- Inkonsistenz: n/a
- Regression: n/a (inventory only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: PR1 — Transform anwenden + Build + Push

**Files:** alle in der Inventur als W-A/B/C bzw. R-A klassifizierten Files.

- [ ] **Step 1: Writer-Transform pro Insert-Site anwenden** (Regelwerk W-A/B/C)

Fuer jede `claim_id:NO`-Site, die **nicht** W-D ist: `claim_id` in die bestehende faelle/Quell-`select` ergaenzen + `claim_id: <quelle>.claim_id` in den `insert`. Konkretes Muster siehe Regelwerk W-A oben (kb-booking, re-termin). Bei W-D (claim-los) `// CMM-44 SP-G2: claim-loser Termin, claim_id bleibt NULL`-Kommentar setzen, kein Change.

- [ ] **Step 2: Reader-Transform pro R-A-Site anwenden**

```typescript
// VORHER (R-A — Claim via fall_id aufgeloest):
const { data: termin } = await db.from('gutachter_termine')
  .select('id, fall_id, start_zeit').eq('id', terminId).single()
const { data: fall } = await db.from('faelle')
  .select('claim_id').eq('id', termin.fall_id).single()
const claimId = fall?.claim_id

// NACHHER (claim_id direkt vom Termin):
const { data: termin } = await db.from('gutachter_termine')
  .select('id, fall_id, claim_id, start_zeit').eq('id', terminId).single()
const claimId = termin?.claim_id
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: 0 Fehler. Typische Fehler: „Property 'claim_id' does not exist" → die gt-`select` wurde nicht um `claim_id` ergaenzt → nachziehen.

- [ ] **Step 4: Re-Grep — alle prod-Writer setzen claim_id**

```bash
node scripts/cmm44-spg2-writers-grep.mjs | grep -E "claim_id:NO"
```
Expected: nur noch W-D-Sites (claim-los) + Test-Fixtures, falls dort bewusst kein claim_id. Jede verbleibende prod-`NO`-Site triagieren.

- [ ] **Step 5: Voller Build**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`, exit 0. Bei OOM trotz 8 GB → `rm -rf .next` + retry.

- [ ] **Step 6: Commit + Push (KEIN `gh pr create`)**

```bash
git add -A
git commit -F - <<'EOF'
feat(CMM-44): SP-G2 PR1 — gutachter_termine writers set claim_id

All gutachter_termine inserts now set claim_id explicitly (sourced from the
already-loaded fall/claim or source termin, no new faelle read), and
termin->claim resolvers read gt.claim_id directly. CMM-58 derive-trigger
stays active -> behavior-neutral, fully backward compatible. No schema change.

Audit:
- Build: gruen (npm run build, exit 0)
- UI: kein neuer Einstiegspunkt (write-path adjustment)
- Redundanz: claim_id-Quelle aus bestehendem fall-Load, kein neuer Read
- Dead-Code: R-A faelle-claim_id-Hops entfernt
- Spec: docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md
- Inkonsistenz: kein Spalten-Rename; W-D claim-lose Termine bleiben NULL
- Regression: Writer-Grep 0 prod-Sites ohne claim_id; Trigger noch aktiv als Netz

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spg2-pr1-writer-reader 2>&1 | tail -3
```

- [ ] **Step 7: PR oeffnen — erst NACH bestandenen Reviews**

```bash
gh pr create --base staging --title "CMM-44 SP-G2 PR1 — gutachter_termine writers set claim_id" --body "Code-only: alle gutachter_termine-INSERTs setzen claim_id; claim-resolving Reader auf gt.claim_id. CMM-58-Trigger bleibt aktiv (verhaltensneutral). Kein Schema-Change. Spec: docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md"
```

---

## Task 3: PR1 — Portal-Smoke (nach staging-Merge)

**Files:** Create `scripts/smoke-cmm44-spg2.mjs` (analog `scripts/smoke-cmm44-sph.mjs`), `docs/21.05.2026/cmm44-spg2-smoke-pr1.md`.

- [ ] **Step 1: Smoke-Script anlegen**

Kopieren + auf SP-G2-Pfade anpassen. Kritische Pfade (Termin-Schreiber + -Anzeiger):
- **KB-Booking** (`kb-booking` → wo immer der KB-Beratungstermin gebucht wird) — Insert-Pfad.
- **Re-Termin** `/kunde/re-termin/[token]` — Insert-Pfad.
- **SV** `/gutachter/kalender`, `/gutachter/fall/[id]` — Termin-Anzeige (`get-sv-tagesplan`).
- **Kunde** `/kunde/faelle/[id]` — Termin-Anzeige.
- **Admin** `/admin/kalender` — View-Consumer (`v_faelle_mit_aktuellem_termin`).

Detekt: 5xx, Console-Errors, `pageerror`, „undefined/NaN" im Display.

- [ ] **Step 2: Smoke gegen staging fahren**

```bash
node --env-file=.env.local scripts/smoke-cmm44-spg2.mjs
```
Smoke gegen `app.staging.claimondo.de` (Memory: nie Prod). Screenshots im selben Turn auswerten (Memory: Screenshot-Pflicht).

- [ ] **Step 3: claim_id-Befuellung empirisch verifizieren**

Nach einem gebuchten Test-Termin auf staging:
```bash
cat > /tmp/spg2-writer-verify.sql <<'SQL'
-- Juengste Termine: ist claim_id gesetzt wenn fall_id gesetzt?
SELECT id, fall_id IS NOT NULL AS hat_fall, claim_id IS NOT NULL AS hat_claim, created_at
FROM public.gutachter_termine
ORDER BY created_at DESC NULLS LAST
LIMIT 5;
SQL
npx supabase db query --linked --file /tmp/spg2-writer-verify.sql 2>&1 | tail -15
```
Expected: neue Termine mit `hat_fall=true` haben `hat_claim=true`. (Solange der CMM-58-Trigger noch lebt, gilt das ohnehin — dieser Check beweist, dass der Writer-Pfad nicht regressed.)

- [ ] **Step 4: Commit Smoke-Protokoll**

```bash
git add scripts/smoke-cmm44-spg2.mjs docs/21.05.2026/cmm44-spg2-smoke-pr1.md
git commit -m "test(CMM-44): SP-G2 PR1 — portal smoke after writer migration"
git push
```

> **GATE:** Task 4 (PR2-Migration) startet erst, wenn **PR1 auf `main`/prod** ist (staging→main-Release durch Aaron). Der Trigger-Drop darf nicht vor dem prod-Writer-Code appliziert werden (geteilte DB). Inhaltsbasierter Gate-Check in Task 4 Step 1.

---

## Task 4: PR2 — Drift-Recheck + View/Trigger-Audit + Migration schreiben + Dry-Run

**Branch:** `kitta/cmm-44-spg2-pr2-rewire`, frisch von `origin/staging` (nach PR1-main-Release).

**Files:** Create `scripts/cmm44-spg2-verify.sql`, `docs/21.05.2026/cmm44-spg2-views-trigger-audit.md`, `supabase/migrations/<ts>_cmm44_spg2_rewire_claim_id.sql`.

- [ ] **Step 1: Gate-Check (inhaltsbasiert, Squash-Release — SP-A-Lektion)**

```bash
git fetch origin
git diff origin/main origin/staging -- src/lib/termine/ src/app/kunde/re-termin/ | head -5
git checkout -b kitta/cmm-44-spg2-pr2-rewire origin/staging
```
Output der PR1-Writer-Files leer/unwesentlich → PR1 ist inhaltsbasiert auf main. Andernfalls warten.

- [ ] **Step 2: Drift-Recheck**

```bash
npx supabase db query --linked --file scripts/cmm44-spg2-measure.sql 2>&1 | tail -40
```
Expected: Ableitungs-Trigger + Funktion **noch da**, `VIOLATIONS = 0`. Falls eine andere Session sie schon gedroppt hat → Block 1 entsprechend kuerzen.

- [ ] **Step 3: View-Audit — aktuelle Definition live ziehen**

```bash
echo "SELECT pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true);" > /tmp/spg2-vd.sql
npx supabase db query --linked --file /tmp/spg2-vd.sql 2>&1 | tail -120
```
Die LATERAL-Subquery finden (`… FROM gutachter_termine gt WHERE gt.fall_id = f.id ORDER BY … LIMIT 1`). Vollstaendige Def + die exakte LATERAL-Klausel in `docs/21.05.2026/cmm44-spg2-views-trigger-audit.md` festhalten. **Andere Views pruefen**, die `gt.fall_id` joinen:
```bash
echo "SELECT table_name FROM information_schema.views WHERE table_schema='public';" > /tmp/spg2-views.sql
npx supabase db query --linked --file /tmp/spg2-views.sql 2>&1 | tail -40
# Pro Kandidat (faelle_sv_view, v_claim_full, v_claim_timeline, …) pg_get_viewdef auf 'gutachter_termine'/'gt.fall_id' pruefen.
```
Treffer mit `gt.fall_id`-Join in der Audit-Doc als Re-Key-Kandidaten listen.

- [ ] **Step 4: Verify-Script schreiben**

Datei `scripts/cmm44-spg2-verify.sql`:
```sql
-- CMM-44 SP-G2 — Post-Migration-Verify.
-- 1) Ableitungs-Trigger + Funktion entfernt?
SELECT 'OLD_TRIGGER_GONE' AS check,
  NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_sync_gutachter_termine_claim_id') AS ok;
SELECT 'OLD_FUNCTION_GONE' AS check,
  NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='sync_gutachter_termine_claim_id') AS ok;
-- 2) Validierungs-Trigger + Funktion da?
SELECT 'NEW_TRIGGER' AS check,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_validate_gutachter_termine_claim_id') AS ok;
-- 3) Keine Coverage-Verstoesse?
SELECT 'VIOLATIONS' AS check, count(*) AS cnt
FROM public.gutachter_termine WHERE fall_id IS NOT NULL AND claim_id IS NULL;
-- 4) View claim-gekeyt? (manuell pruefen: pg_get_viewdef zeigt gt.claim_id im LATERAL)
SELECT 'VIEW_USES_CLAIM_ID' AS check,
  position('gt.claim_id' in pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS ok;
```

- [ ] **Step 5: Migration generieren + schreiben**

```bash
npx supabase migration new cmm44_spg2_rewire_claim_id
```

Inhalt der generierten Datei (Block 3 = View-Def aus Step 3, nur LATERAL-Klausel geaendert):
```sql
-- CMM-44 SP-G2 PR2 — gutachter_termine.claim_id faelle-entkoppeln.
-- Block 0: Catch-up-Backfill (Sicherheitsnetz fuer evtl. Luecken vor PR1-prod).
-- Block 1: CMM-58 Ableitungs-Trigger + Funktion droppen (las faelle).
-- Block 2: Validierungs-Trigger (RAISE nur bei fall_id gesetzt + claim_id NULL).
-- Block 3: View-Re-Key v_faelle_mit_aktuellem_termin (+ ggf. weitere aus Step 3).
-- Nach Apply: npx supabase migration repair --status applied <timestamp>
-- Ticket: CMM-44 / Sub-Projekt SP-G2 / Plan Task 4-5 / Spec §3.3/3.4

BEGIN;

-- ============================================================
-- Block 0: Catch-up — letzte Luecken schliessen, bevor der
-- Validierungs-Trigger scharf wird. Liest faelle einmalig (faelle
-- existiert in Phase 2 noch). Pre-launch realistisch 0 Rows.
-- ============================================================
UPDATE public.gutachter_termine gt
SET claim_id = f.claim_id
FROM public.faelle f
WHERE gt.fall_id = f.id AND gt.claim_id IS NULL AND f.claim_id IS NOT NULL;

-- ============================================================
-- Block 1: CMM-58 Ableitungs-Trigger + Funktion entfernen.
-- ============================================================
DROP TRIGGER IF EXISTS trg_sync_gutachter_termine_claim_id ON public.gutachter_termine;
DROP FUNCTION IF EXISTS public.sync_gutachter_termine_claim_id();

-- ============================================================
-- Block 2: Validierungs-Trigger — fail-loud, liest faelle NICHT.
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_gutachter_termine_claim_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.fall_id IS NOT NULL AND NEW.claim_id IS NULL THEN
    RAISE EXCEPTION 'gutachter_termine.claim_id darf nicht NULL sein wenn fall_id gesetzt ist (fall_id=%). CMM-44 SP-G2: der Writer muss claim_id setzen.', NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_gutachter_termine_claim_id ON public.gutachter_termine;
CREATE TRIGGER trg_validate_gutachter_termine_claim_id
  BEFORE INSERT OR UPDATE ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.validate_gutachter_termine_claim_id();

-- ============================================================
-- Block 3: View-Re-Key. <Aus Step 3 die VOLLSTAENDIGE pg_get_viewdef
-- uebernehmen> und in der LATERAL-Subquery NUR die Join-Klausel aendern:
--   VORHER:  WHERE gt.fall_id = f.id
--   NACHHER: WHERE gt.claim_id = c.id   (c = LEFT JOIN claims c ON c.id = f.claim_id)
-- ORDER BY / LIMIT 1 unveraendert lassen. Alle anderen Spalten + AS-Aliase
-- 1:1 uebernehmen. Bei „42P16 cannot change data type" → Precision-Casts
-- ergaenzen (SP-G-Lesson). Pro weiterer Treffer-View aus Step 3 ein eigener
-- CREATE OR REPLACE VIEW mit derselben gt.fall_id -> gt.claim_id-Aenderung.
-- ============================================================
CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS
  -- <VOLLSTAENDIGE DEFINITION HIER, LATERAL-Join auf gt.claim_id = c.id>
  SELECT 1;  -- PLATZHALTER: in Step 5 durch die echte Def ersetzen, NICHT so committen.

COMMIT;
```

> **Wichtig:** Der `SELECT 1`-Platzhalter in Block 3 ist nur Geruest. Vor Dry-Run durch die echte, aus Step 3 gezogene View-Definition mit geaenderter LATERAL-Klausel ersetzen.

- [ ] **Step 6: Dry-Run gegen Live-DB**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spg2_rewire_claim_id.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/spg2-pr2-dryrun.sql
npx supabase db query --linked --file /tmp/spg2-pr2-dryrun.sql 2>&1 | tail -15
```
Expected: kein Fehler. Fehlerklassen:
- `cannot change data type of view column "<x>"` → Precision-Casts in der View-Def ergaenzen.
- `trigger "…" for relation "gutachter_termine" does not exist` → harmlos durch `IF EXISTS` abgedeckt; falls doch → andere Session hat gedroppt, Block 1 anpassen.
- Wenn der Dry-Run wegen RAISE im Validierungs-Trigger fehlschlaegt → es gibt noch Verstoss-Rows; Block 0 hat sie nicht gefangen (z.B. `faelle.claim_id` selbst NULL) → vor der Migration manuell klaeren.

- [ ] **Step 7: Commit (Migration + Audit + Verify, NICHT appliziert)**

```bash
git add scripts/cmm44-spg2-verify.sql docs/21.05.2026/cmm44-spg2-views-trigger-audit.md supabase/migrations/*_cmm44_spg2_rewire_claim_id.sql
git commit -F - <<'EOF'
chore(CMM-44): SP-G2 PR2 — rewire migration + view/trigger audit (pre-apply)

Drops CMM-58 derive-trigger + function (read faelle), adds a RAISE
validation trigger (fail-loud on fall_id set + claim_id null), re-keys
v_faelle_mit_aktuellem_termin LATERAL from gt.fall_id to gt.claim_id.
Block 0 catch-up backfill as safety net. Dry-run against live DB green.

Audit:
- Build: n/a (SQL + audit doc)
- UI: n/a
- Redundanz: verify/audit follows SP-G/SP-H probe pattern
- Dead-Code: removes the obsolete CMM-58 derive-trigger
- Spec: docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md
- Inkonsistenz: view def pulled live, only the LATERAL join key changed
- Regression: n/a (not applied yet; gated on PR1 main-release)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: PR2 — Apply + Verify + Types + Build + Push

**Branch:** `kitta/cmm-44-spg2-pr2-rewire` (Fortsetzung).

- [ ] **Step 1: Migration applizieren**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spg2_rewire_claim_id.sql | tail -1)
TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -10
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
```
Expected: kein Fehler; `migration repair` meldet „Repaired migration history".

- [ ] **Step 2: Verify**

```bash
npx supabase db query --linked --file scripts/cmm44-spg2-verify.sql 2>&1 | tail -20
```
Expected: `OLD_TRIGGER_GONE ok=true`, `OLD_FUNCTION_GONE ok=true`, `NEW_TRIGGER ok=true`, `VIOLATIONS cnt=0`, `VIEW_USES_CLAIM_ID ok=true`.

- [ ] **Step 3: Types regenerieren (View-Def-Aenderung — meist no-op)**

```bash
powershell -Command "& { npx supabase gen types typescript --linked 2>\$null | Out-File -Encoding utf8 src/lib/supabase/database.types.ts }" 2>&1 | tail -3
git diff --stat src/lib/supabase/database.types.ts
```
PowerShell statt Bash-`2>&1` (SP-G-Lesson: Bash bleedet die CLI-Update-Notice ins File). Erwartung: leerer/minimaler Diff (View-Output-Spalten unveraendert, Trigger taucht in Types nicht auf). Falls Diff → mitcommitten; falls leer → kein Types-Commit noetig.

- [ ] **Step 4: Build**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10
```
Expected: gruen, exit 0.

- [ ] **Step 5: Commit + Push (KEIN `gh pr create`)**

```bash
git add -A
git commit -F - <<'EOF'
feat(CMM-44): SP-G2 PR2 — drop derive-trigger, add validation, re-key view

Applied: dropped CMM-58 sync_gutachter_termine_claim_id trigger+function
(read faelle), added validate_gutachter_termine_claim_id (RAISE on fall_id
set + claim_id null), re-keyed v_faelle_mit_aktuellem_termin LATERAL onto
gt.claim_id. claim_id is now fully writer-borne and faelle-decoupled.
Migration applied + repair-recorded. Verify all green.

Audit:
- Build: gruen (npm run build, exit 0)
- UI: n/a (DB-level rewire)
- Redundanz: replaces CMM-58 derive-trigger 1:1, no duplication
- Dead-Code: CMM-58 derive-trigger+function removed
- Spec: docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md
- Inkonsistenz: view re-key keeps all output columns/aliases identical
- Regression: gated on PR1 main-release; validation trigger 0 violations at apply

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spg2-pr2-rewire 2>&1 | tail -3
```

- [ ] **Step 6: PR oeffnen NACH Reviews**

```bash
gh pr create --base staging --title "CMM-44 SP-G2 PR2 — rewire claim_id (drop trigger + validation + view re-key)" --body "Migration appliziert + repair-recorded. Drop CMM-58 derive-trigger, add RAISE validation trigger, re-key v_faelle_mit_aktuellem_termin onto gt.claim_id. Gated nach PR1 main-release. Spec: docs/superpowers/specs/2026-05-21-cmm44-spg2-termin-claim-id-design.md"
```

---

## Task 6: PR2 — Portal-Smoke (nach staging-Merge)

**Files:** `docs/21.05.2026/cmm44-spg2-smoke-pr2.md`.

- [ ] **Step 1: Smoke gegen staging fahren**

```bash
node --env-file=.env.local scripts/smoke-cmm44-spg2.mjs
```
Kritisch nach dem Trigger-Drop: **Termin buchen** (kb-booking + re-termin) muss durchlaufen (claim_id wird jetzt rein vom Writer gesetzt, kein Trigger-Netz mehr) — der Validierungs-Trigger darf **nicht** faelschlich feuern. View-Consumer (`/admin/kalender`, SV-/Kunde-Terminanzeige) muessen den aktuellen Termin weiter zeigen. Screenshots im selben Turn auswerten.

- [ ] **Step 2: RAISE-Trigger empirisch proben (negativ + positiv)**

```bash
cat > /tmp/spg2-trigger-probe.sql <<'SQL'
-- Positiv: Insert mit fall_id + claim_id NULL muss RAISEn (rollback).
DO $$
BEGIN
  BEGIN
    INSERT INTO public.gutachter_termine (fall_id, claim_id, start_zeit, end_zeit, typ, status)
    VALUES ((SELECT id FROM public.faelle LIMIT 1), NULL, now(), now() + interval '1h', 'besichtigung', 'reserviert');
    RAISE NOTICE 'FEHLER: Insert haette RAISEn muessen';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: Validierungs-Trigger hat geblockt: %', SQLERRM;
  END;
END $$;
-- Negativ: claim-loser Termin (fall_id NULL) muss durchgehen — als Rollback.
BEGIN;
INSERT INTO public.gutachter_termine (fall_id, claim_id, start_zeit, end_zeit, typ, status)
VALUES (NULL, NULL, now(), now() + interval '1h', 'besichtigung', 'reserviert');
ROLLBACK;
SQL
npx supabase db query --linked --file /tmp/spg2-trigger-probe.sql 2>&1 | tail -15
```
Expected: „OK: Validierungs-Trigger hat geblockt" + der claim-lose Insert geht (vor ROLLBACK) durch.

- [ ] **Step 3: Commit Smoke-Protokoll**

```bash
git add docs/21.05.2026/cmm44-spg2-smoke-pr2.md
git commit -m "test(CMM-44): SP-G2 PR2 — portal smoke + RAISE-trigger probe"
git push
```

> **GATE:** SP-G2 ist nach PR2-staging-Merge funktional fertig. Kein PR3 noetig (CMM-58-Backfill + Block-0-Catch-up decken die Daten ab).

---

## Task 7: Abschluss

- [ ] **Step 1: Phase-1-Mapping nachziehen**

`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` — Update-Block:
```markdown
**Update 2026-05-21:** SP-G2 erledigt — gutachter_termine.claim_id ist
writer-getragen + faelle-entkoppelt. CMM-58-Ableitungs-Trigger gedroppt,
RAISE-Validierungs-Trigger ersetzt, v_faelle_mit_aktuellem_termin LATERAL
auf gt.claim_id re-keyed. gutachter_termine ist damit Phase-6-ready.
**Entsperrt SP-D** (25 Termin-Cluster-Spalten faelle->gutachter_termine).
PR1 #<n> (Writer/Reader) / PR2 #<n> (Migration). Spec/Plan:
docs/superpowers/specs|plans/2026-05-21-cmm44-spg2-termin-claim-id*.md.
```
PR-Nummern nach Merge eintragen.

- [ ] **Step 2: Handoff-Doc schreiben**

`docs/21.05.2026/handoff-cmm44-spg2-abschluss.md` — analog SP-G/SP-H-Handoff: was erledigt, Verifikation, Lessons (SP-G2-spezifisch — invertiertes Gating bei Trigger-Drop, RAISE-Validierungs-Trigger statt faelle-Read, Writer-claim_id aus bestehendem fall-Load), lose Enden, naechster CMM-44-Schritt (**SP-D entsperrt**).

- [ ] **Step 3: Memory aktualisieren (extern)**

`C:\Users\Aaron Sprafke\.claude\projects\C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2\memory\project_cmm44_spg2_status.md` schreiben (Pattern wie `project_cmm44_spg_status.md`). MEMORY.md-Pointer ergaenzen. `project_cmm44_faelle_dekomposition.md` SP-D-Entsperrung vermerken.

- [ ] **Step 4: Commit + Abschluss-PR**

```bash
git add docs/   # NUR docs/ — Memory liegt ausserhalb des Repos
git commit -m "docs(CMM-44): SP-G2 done — handoff + phase-1 mapping (SP-D unblocked)"
git push origin HEAD
gh pr create --base staging --title "CMM-44 SP-G2 Abschluss — Handoff + Phase-1-Mapping" --body "SP-G2 abgeschlossen — siehe docs/21.05.2026/handoff-cmm44-spg2-abschluss.md. gutachter_termine.claim_id writer-getragen + faelle-entkoppelt; SP-D entsperrt."
```

- [ ] **Step 5: Session-Abschluss-Checkliste (AGENTS.md Regel 3)**

```bash
git status                          # Working-Tree clean?
git stash list                      # Leer / alte dokumentierte Stashes?
git log --branches --not --remotes  # Alle lokalen Commits gepusht?
```

---

## Definition of Done

- [ ] PR1 gemergt + auf main released; Writer-Grep = 0 prod-INSERT-Sites ohne `claim_id`; claim-resolving Reader nutzen `gt.claim_id`; Build gruen.
- [ ] PR2 appliziert + recorded; Verify: alter Trigger+Funktion weg, Validierungs-Trigger da, `VIOLATIONS=0`, View claim-gekeyt.
- [ ] `npm run build` (8 GB heap) gruen.
- [ ] Portal-Smoke nach PR1 + PR2 ohne Hard-Fail; Screenshots ausgewertet; RAISE-Trigger-Probe (positiv blockt, negativ geht durch).
- [ ] Phase-1-Mapping + Handoff + Memory nachgezogen; SP-D-Entsperrung dokumentiert.

---

## Selbst-Review (Plan vs. Spec)

- **Spec §1 Kontext (CMM-58 hat Struktur, Phase-2 offen)** — Task 0 bestaetigt den CMM-58-Zustand live; Referenz-Tabelle bildet ihn ab. ✅
- **Spec §2 Entscheidung (Option B + RAISE)** — Block 1 droppt Ableitungs-Trigger (Task 4 Step 5), Block 2 = RAISE-Validierungs-Trigger; Probe in Task 6 Step 2. ✅
- **Spec §3.1 Writer (INSERT-only, keine fall_id-Updates)** — Regelwerk W-A/B/C/D + Task 1 Grep (claim_id present?) + Task 2 Transform mit echtem kb-booking/re-termin-Code. ✅
- **Spec §3.2 Reader (eng, nur claim-Resolver)** — Regelwerk R-A/R-B + Task 1 Step 3 manuelle Klassifizierung, R-B bleibt. ✅
- **Spec §3.3 View-Re-Key** — Task 4 Step 3 (live pg_get_viewdef) + Block 3 (LATERAL gt.fall_id->gt.claim_id, Precision-Casts). ✅
- **Spec §3.4 Trigger (drop + RAISE-Validierung, Korrektheits-Annahme)** — Block 1+2; Annahme „fall_id impliziert claim_id" durch Block 0 Catch-up + VIOLATIONS=0-Verify abgesichert. ✅
- **Spec §4 PR-Struktur + invertiertes Gating** — PR1 (Task 1-3) code-only → main; GATE; PR2 (Task 4-6) Migration. Gate-Check Task 4 Step 1 inhaltsbasiert. ✅
- **Spec §4 Ordering-Regel (DB nicht vor Code)** — explizit als GATE nach Task 3 + Begruendung „geteilte DB". ✅
- **Spec §5 Verifikation** — Writer-Grep (Task 2 Step 4), Live-Recheck (Task 4 Step 2), Portal-Smoke + Screenshot (Task 3/6), View-Verify (Task 5 Step 2). ✅
- **Spec §6 Non-Goals** — R-B-Reads bleiben (keine flaeche fall_id-Entfernung), keine View-Neufassung (nur LATERAL-Key), keine RLS-Umstellung — im Regelwerk + Task 1 Step 3 verankert. ✅
- **Lessons** — `feedback_information_schema_check` (Task 0/4 live), `feedback_post_drop_smoke` + `feedback_smoke_screenshot_pflicht` (Task 3/6), `feedback_kein_auto_merge`/`feedback_draft_pr_nicht_release_sicher` (PR erst nach Review, Vorbedingungen), `feedback_migration_repair_twin_drift` (db query + repair, kein db push). ✅
- **Keine Placeholders** — bis auf den **bewusst markierten** `SELECT 1`-View-Geruest-Platzhalter in Task 4 Step 5 (die echte Def wird live gezogen, da 100+ Spalten nicht sinnvoll vorab einbettbar — explizit als „NICHT so committen" markiert). Alle anderen Steps zeigen konkreten Code/SQL/Befehle. ✅
- **Typ-Konsistenz** — `claim_id`, `validate_gutachter_termine_claim_id`, `trg_validate_gutachter_termine_claim_id`, `fall.claim_id` konsistent ueber alle Tasks. ✅

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
