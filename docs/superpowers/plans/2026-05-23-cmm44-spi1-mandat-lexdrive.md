# CMM-44 SP-I1 — LexDrive + Klage → `kanzlei_faelle` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vier dormante Kanzlei-Lifecycle-Spalten (`lexdrive_case_id`, `lexdrive_ocr_data`, `lexdrive_ocr_received_at`, `klage_uebergeben_am`, alle `cov=0`) von `faelle` auf die 1:1-Sub-Table `kanzlei_faelle` umziehen. **Rein additiv** — kein `DROP COLUMN` (Phase 6).

**Architecture:** **Eine additive PR** (Ansatz A): `ADD COLUMN` ×4 auf `kanzlei_faelle` + `CREATE OR REPLACE VIEW v_faelle_mit_aktuellem_termin` (4 Spalten-Quellen `f.<col>` → `kf.<col>` + neuer `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id`, 1:1 via UNIQUE — kein LATERAL). **Kein Code-Sweep** (einziger Reader, SV-Fallseite, liest über die View → Pattern E, kein Change), **kein Backfill** (cov=0, keine Writer). Verhalten unverändert: die View liefert die 4 Spalten vor wie nach dem Repoint als `NULL`.

**Tech Stack:** Postgres 17 (Supabase, Projekt-Ref `paizkjajbuxxksdoycev`), Supabase CLI (Migrations), Next.js 15 + TypeScript (`database.types.ts`-Regen), Playwright (Portal-Smoke).

**Spec:** `docs/superpowers/specs/2026-05-23-cmm44-spi1-mandat-lexdrive-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** `.claude/worktrees/cmm44-spi1-mandat-lexdrive`, Branch `kitta/cmm44-spi1-mandat-lexdrive` (off `origin/staging`). Der Spec-Commit `dd269918` liegt bereits hier. **Alle Implementierungs-Commits gehen auf denselben Branch** — eine PR.
- **Harte Regeln (AGENTS.md):** (1) Nie auf `main` pushen — PR gegen `staging`. (2) **DDL nur über supabase-CLI** (`db query --linked` + `migration repair`), **NICHT** über die Supabase-Management-API / MCP `apply_migration`. (3) Kein unbegleiteter Stash am Session-Ende.
- **DB-Apply-Muster (bewährt SP-A2/A3/B/G/H):** Migration in `BEGIN/COMMIT`; Dry-Run `BEGIN; … ROLLBACK;`; Apply via `npx supabase db query --linked --file <sql>`; danach `npx supabase migration repair --status applied <version>`. **Kein** `db push`.
- **Supabase-Link im Worktree:** `.env.local` ist gitignored → im frischen Worktree evtl. **nicht vorhanden**. Task 0 stellt das sicher (kopiert aus dem Haupt-Tree + `supabase link`). Read-only-Checks dürfen alternativ über den Supabase-MCP (`execute_sql`) laufen, der **Apply** aber zwingend über die CLI.
- **Haupt-Tree (Quelle für `.env.local`):** `C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2`.
- **Commit-Format:** 7-Punkte-Audit-Block + echte deutsche Umlaute in der Message.
- **PR-Hygiene (Memory `feedback_kein_auto_merge` + `feedback_draft_pr_nicht_release_sicher`):** Auto-Merge ist **WIDERRUFEN**. Branch pushen → Reviews laufen lassen → PR erst nach Spec-Review + Code-Quality-Review öffnen. **Aaron mergt selbst.**
- **Smoke:** immer gegen `app.staging.claimondo.de` (Memory: nie Prod), Screenshots im selben Turn auswerten.

---

## Referenz: Die 4 Spalten (1:1 Namens-Mapping, live gemessen 2026-05-23)

| `faelle.<col>` | Typ | nullable | `kanzlei_faelle` Ziel |
|---|---|---|---|
| `lexdrive_case_id` | `text` | YES | gleicher Name |
| `lexdrive_ocr_data` | `jsonb` | YES | gleicher Name |
| `lexdrive_ocr_received_at` | `timestamptz` | YES | gleicher Name |
| `klage_uebergeben_am` | `timestamptz` | YES | gleicher Name |

Alle nullable, keine Defaults. Coverage 0/0. Kein Writer im Code. Einziger Reader: `src/app/gutachter/fall/[id]/page.tsx` liest `lexdrive_case_id` **über die View** `v_faelle_mit_aktuellem_termin`.

---

## File Structure

**Neu:**
- `scripts/cmm44-spi1-measure.sql` — Live-Messung (Spalten-Existenz/Typ/cov auf `faelle` + `kanzlei_faelle`).
- `scripts/cmm44-spi1-verify.sql` — Verify nach Apply (4 Spalten auf `kanzlei_faelle`).
- `supabase/migrations/<ts>_cmm44_spi1_lexdrive_klage_to_kanzlei_faelle.sql` — die eine Migration (ADD + View-Repoint).
- `docs/23.05.2026/cmm44-spi1-smoke.md` — Smoke-Protokoll.
- `docs/23.05.2026/handoff-cmm44-spi1-abschluss.md` — Handoff.

**Modifiziert:**
- `src/lib/supabase/database.types.ts` — Type-Regen nach Apply.
- `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` — Update-Block (Task 5).

**NICHT modifiziert (bewusst):** kein `src/`-Code außer Types — der einzige Reader läuft über die repointete View.

---

## Task 0: Worktree-Link sicherstellen + Live-DB-Drift-Check

**Files:** Create `scripts/cmm44-spi1-measure.sql`.

- [ ] **Step 1: `.env.local` + Supabase-Link im Worktree sicherstellen**

```bash
cd ".claude/worktrees/cmm44-spi1-mandat-lexdrive"
# .env.local aus dem Haupt-Tree kopieren, falls im Worktree nicht vorhanden
test -f .env.local || cp "/c/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local" .env.local
# Link prüfen (legt supabase/.temp an, falls noch nicht gelinkt)
npx supabase link --project-ref paizkjajbuxxksdoycev 2>&1 | tail -3
```
Expected: `.env.local` vorhanden; `link` meldet „Finished supabase link" oder „already linked". Falls `link` nach einem Access-Token fragt → `SUPABASE_ACCESS_TOKEN` ist in `.env.local`; mit `export $(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local) && npx supabase link --project-ref paizkjajbuxxksdoycev` erneut.

- [ ] **Step 2: Mess-Query schreiben**

Datei `scripts/cmm44-spi1-measure.sql`:
```sql
-- CMM-44 SP-I1 — Live-Messung der 4 LexDrive/Klage-Spalten.
-- (a) Existenz/Typ/cov auf faelle  (b) ob schon auf kanzlei_faelle  (c) View-Quelle
SELECT 'faelle' AS tbl, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='faelle'
  AND column_name IN ('lexdrive_case_id','lexdrive_ocr_data','lexdrive_ocr_received_at','klage_uebergeben_am')
UNION ALL
SELECT 'kanzlei_faelle' AS tbl, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle'
  AND column_name IN ('lexdrive_case_id','lexdrive_ocr_data','lexdrive_ocr_received_at','klage_uebergeben_am')
ORDER BY tbl, column_name;

-- Coverage auf faelle (erwartet alle 0) + kanzlei_faelle Row-Count (erwartet 0)
SELECT
  (SELECT count(*) FROM public.faelle WHERE lexdrive_case_id IS NOT NULL) AS f_case_id,
  (SELECT count(*) FROM public.faelle WHERE lexdrive_ocr_data IS NOT NULL) AS f_ocr_data,
  (SELECT count(*) FROM public.faelle WHERE lexdrive_ocr_received_at IS NOT NULL) AS f_ocr_recv,
  (SELECT count(*) FROM public.faelle WHERE klage_uebergeben_am IS NOT NULL) AS f_klage,
  (SELECT count(*) FROM public.kanzlei_faelle) AS kf_rows;
```

- [ ] **Step 3: Messung fahren**

```bash
npx supabase db query --linked --file scripts/cmm44-spi1-measure.sql 2>&1 | tail -30
```
Expected:
- `faelle`-Block: alle 4 Spalten mit Typ `text` / `jsonb` / `timestamp with time zone` ×2, `is_nullable=YES`.
- `kanzlei_faelle`-Block: **leer** (die 4 Spalten existieren dort noch nicht).
- Coverage-Zeile: `f_case_id=0, f_ocr_data=0, f_ocr_recv=0, f_klage=0, kf_rows=0`.

**Drift-Reaktionen:**
- Zeigt der `kanzlei_faelle`-Block schon eine der 4 Spalten → andere Session war schneller; aus dem ADD-Block (Task 1) streichen + im Log vermerken.
- Ist eine `faelle`-cov > 0 oder `kf_rows` > 0 → der „Backfill = No-op"-Annahme widersprochen. **STOP** und melden (dann braucht es einen echten Backfill-Block; siehe Anhang A).

- [ ] **Step 4: Kein Commit** — reiner Verifikationsschritt (Script wird in Task 1 mitcommittet).

---

## Task 1: Migration schreiben (ADD + View-Repoint) + Dry-Run + Commit (nicht appliziert)

**Branch:** `kitta/cmm44-spi1-mandat-lexdrive` (Fortsetzung — Spec-Commit `dd269918` ist drauf).

**Files:**
- Create: `scripts/cmm44-spi1-verify.sql`
- Create: `supabase/migrations/<ts>_cmm44_spi1_lexdrive_klage_to_kanzlei_faelle.sql`

- [ ] **Step 1: Verify-Query schreiben**

Datei `scripts/cmm44-spi1-verify.sql`:
```sql
-- CMM-44 SP-I1 — Verify: 4 neue Spalten auf kanzlei_faelle?
SELECT count(*) AS spi1_neu_auf_kanzlei_faelle
FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle'
  AND column_name IN ('lexdrive_case_id','lexdrive_ocr_data','lexdrive_ocr_received_at','klage_uebergeben_am');

-- Verify: liest die View die 4 Spalten aus kf statt f?
SELECT
  position('kf.lexdrive_case_id' IN pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS kf_case_id,
  position('kf.lexdrive_ocr_data' IN pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS kf_ocr_data,
  position('kf.lexdrive_ocr_received_at' IN pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS kf_ocr_recv,
  position('kf.klage_uebergeben_am' IN pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true)) > 0 AS kf_klage;
```

- [ ] **Step 2: Repoint-DDL deterministisch server-seitig generieren**

Statt den ~200-Spalten-View-Body von Hand zu transkribieren (fehleranfällig), erzeugt Postgres die **vollständige, fertig gepatchte** DDL selbst — aus der aktuellen Live-Definition (maßgebliche Quelle, falls eine andere Session den View zwischenzeitlich repointet hat) via `replace()`:

```bash
cat > /tmp/spi1-gen-view.sql <<'SQL'
SELECT 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' ||
  replace(
    replace(
      replace(
        replace(
          replace(
            pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true),
            'f.lexdrive_case_id',         'kf.lexdrive_case_id'),
          'f.lexdrive_ocr_data',          'kf.lexdrive_ocr_data'),
        'f.lexdrive_ocr_received_at',     'kf.lexdrive_ocr_received_at'),
      'f.klage_uebergeben_am',            'kf.klage_uebergeben_am'),
    'LEFT JOIN gutachten g ON g.claim_id = c.id',
    'LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id'
  ) AS ddl;
SQL
npx supabase db query --linked --file /tmp/spi1-gen-view.sql 2>&1 | tail -40
```
Die Ausgabe (`ddl`) ist die **komplette literale `CREATE OR REPLACE VIEW … ;`-Anweisung** mit allen 5 Änderungen bereits angewandt. Sie geht 1:1 als Block 3 in die Migration (Step 4).

**Eindeutigkeit der `replace()`-Treffer (verifiziert gegen den Live-Body 2026-05-23):**
- `f.lexdrive_case_id`, `f.lexdrive_ocr_data`, `f.lexdrive_ocr_received_at`, `f.klage_uebergeben_am` kommen je **genau einmal** vor; `f.mandatsnummer` ist ein anderer String und bleibt unberührt.
- `LEFT JOIN gutachten g ON g.claim_id = c.id` kommt genau einmal vor (die LATERAL-Blöcke nutzen `gt`/`a`/`cp`, nicht `gutachten g`).
- Der `kf`-Alias ist im Body sonst nicht vergeben (Aliase: `f`, `c`, `g`, `t`, `cur_auftrag`, `cp_g`). Falls die `ddl`-Ausgabe wider Erwarten **keinen** `kf.`-Treffer enthält (eine andere Session hat den Body so umgebaut, dass die Such-Strings nicht mehr passen) → **STOP**, Body manuell inspizieren, Such-Strings anpassen.

- [ ] **Step 3: Migration generieren**

```bash
npx supabase migration new cmm44_spi1_lexdrive_klage_to_kanzlei_faelle
```

- [ ] **Step 4: Migration-SQL schreiben**

Die in Step 3 generierte (leere) Migrationsdatei mit folgendem Inhalt **überschreiben** — das ist der Anfang bis einschließlich Block-3-Kopfkommentar, **noch ohne** View-DDL und **ohne** `COMMIT;` (beides wird gleich angehängt):

```sql
-- CMM-44 SP-I1 — additive Migration (kein DROP)
-- Block 1: 4x ADD COLUMN auf kanzlei_faelle (LexDrive + Klage)
-- Block 2: Backfill = No-op (cov=0 auf faelle, kanzlei_faelle leer) — siehe Kommentar
-- Block 3: CREATE OR REPLACE VIEW v_faelle_mit_aktuellem_termin
--          (4 Quellen f.<col> -> kf.<col> + LEFT JOIN kanzlei_faelle)
-- Nach Apply: npx supabase migration repair --status applied <timestamp>
-- Ticket: CMM-44 / Sub-Projekt SP-I / Slice 1
-- Spec: docs/superpowers/specs/2026-05-23-cmm44-spi1-mandat-lexdrive-design.md

BEGIN;

-- ============================================================
-- Block 1: ADD COLUMN — 4 neue Spalten auf public.kanzlei_faelle
-- Typ exakt von faelle gespiegelt (Live-Messung Task 0 Step 3)
-- ============================================================
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN lexdrive_case_id text,
  ADD COLUMN lexdrive_ocr_data jsonb,
  ADD COLUMN lexdrive_ocr_received_at timestamptz,
  ADD COLUMN klage_uebergeben_am timestamptz;

-- ============================================================
-- Block 2: Backfill — bewusster No-op.
-- faelle-Coverage der 4 Spalten = 0 (Task 0), kanzlei_faelle hat 0 Rows.
-- Es gibt keine Daten zu migrieren. Ein INSERT-Backfill braeuchte zudem
-- kanzlei_faelle.status (NOT NULL ohne Default) — bei cov=0 gegenstandslos.
-- ============================================================

-- ============================================================
-- Block 3: View-Repoint — v_faelle_mit_aktuellem_termin
-- = exakt die in Task 1 Step 2 live gecapturte Definition, mit GENAU
--   diesen 5 Edits:
--   (1) f.lexdrive_case_id          -> kf.lexdrive_case_id
--   (2) f.lexdrive_ocr_data         -> kf.lexdrive_ocr_data
--   (3) f.lexdrive_ocr_received_at  -> kf.lexdrive_ocr_received_at
--   (4) f.klage_uebergeben_am       -> kf.klage_uebergeben_am
--   (5) nach "LEFT JOIN gutachten g ON g.claim_id = c.id" einfuegen:
--          LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
-- f.mandatsnummer BLEIBT unveraendert (nicht in dieser Slice).
-- Spaltenliste/Reihenfolge/Typen unveraendert -> CREATE OR REPLACE ohne DROP,
-- ohne Cast (kf.<col> hat denselben Typ wie f.<col>).
-- Block 3 (die generierte CREATE OR REPLACE VIEW ...;) + COMMIT folgen via Append.
-- ============================================================
```

**Block 3 + COMMIT anhängen:** Die in Step 2 erzeugte `ddl`-Zeichenkette ist die komplette `CREATE OR REPLACE VIEW … AS SELECT … ;`-Anweisung mit allen 5 Änderungen — **nicht** von Hand transkribieren. Die `ddl`-Ausgabe (genau ein Statement inkl. `;`) nach `/tmp/spi1-view-ddl.sql` kopieren, dann:

```bash
MIG=$(ls supabase/migrations/*_cmm44_spi1_lexdrive_klage_to_kanzlei_faelle.sql | tail -1)
printf '\n-- Block 3: View-Repoint (generiert in Step 2)\n' >> "$MIG"
cat /tmp/spi1-view-ddl.sql >> "$MIG"
printf '\nCOMMIT;\n' >> "$MIG"
```
Danach das File prüfen: **genau ein** `BEGIN;` (Zeile 1 des SQL), **genau ein** `COMMIT;` (am Ende), dazwischen Block 1 (ADD) + Block 2 (Kommentar) + Block 3 (`CREATE OR REPLACE VIEW … ;`):
```bash
grep -cE '^BEGIN;|^COMMIT;' "$MIG"   # erwartet: 2
grep -cE 'kf\.(lexdrive_case_id|lexdrive_ocr_data|lexdrive_ocr_received_at|klage_uebergeben_am)' "$MIG"  # erwartet: 4
```

- [ ] **Step 5: Dry-Run gegen die Live-DB**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spi1_lexdrive_klage_to_kanzlei_faelle.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/spi1-dryrun.sql
npx supabase db query --linked --file /tmp/spi1-dryrun.sql 2>&1 | tail -15
```
Expected: kein Fehler. Häufige Fehlerklassen:
- `column "<x>" already exists` → andere Session hat die Spalte hinzugefügt; aus Block 1 streichen.
- `cannot change name of view column "<x>" to "<y>"` / `cannot drop columns from view` → die gecapturte Basis war unvollständig/verändert; Step 2 neu capturen und die 5 Edits sauber anwenden (nichts sonst ändern).
- `cannot change data type of view column "<x>"` → ein Edit hat versehentlich eine andere Spalte (mit Cast) getroffen; nur die 4 LexDrive/Klage-Quellen ändern.

- [ ] **Step 6: Commit (Scripts + Migration, NICHT appliziert)**

```bash
git add scripts/cmm44-spi1-measure.sql scripts/cmm44-spi1-verify.sql supabase/migrations/*_cmm44_spi1_lexdrive_klage_to_kanzlei_faelle.sql
git commit -F - <<'EOF'
chore(CMM-44): SP-I1 — ADD-Migration + View-Repoint (vor Apply)

4x ADD COLUMN auf kanzlei_faelle (lexdrive_case_id, lexdrive_ocr_data,
lexdrive_ocr_received_at, klage_uebergeben_am) + CREATE OR REPLACE VIEW
v_faelle_mit_aktuellem_termin (4 Quellen f.->kf. + LEFT JOIN
kanzlei_faelle). Backfill = No-op (cov=0). Dry-Run gegen Live-DB gruen.

Audit:
- Build: n/a (SQL + Scripts, kein Code)
- UI: n/a
- Redundanz: Verify/Measure folgen SP-G/SP-H-Probe-Muster
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-23-cmm44-spi1-mandat-lexdrive-design.md
- Inkonsistenz: Typen live gemessen; View-Body live gecaptured
- Regression: n/a (additiv, noch nicht appliziert)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```
Vor dem Commit echte Umlaute prüfen (`grün`).

---

## Task 2: Apply + Verify + Types + Build + Push

**Branch:** `kitta/cmm44-spi1-mandat-lexdrive` (Fortsetzung).

- [ ] **Step 1: Drift-Recheck**

```bash
npx supabase db query --linked --file scripts/cmm44-spi1-measure.sql 2>&1 | tail -30
```
Expected: `kanzlei_faelle`-Block weiterhin leer (4 Spalten noch nicht da). Bei Drift → Migration anpassen (Task 1 Step 4).

- [ ] **Step 2: Migration applizieren + history reparieren**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spi1_lexdrive_klage_to_kanzlei_faelle.sql | tail -1)
TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -10
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
```
Expected: kein Fehler; `repair` meldet „Repaired migration history".

- [ ] **Step 3: Verify — Spalten + View**

```bash
npx supabase db query --linked --file scripts/cmm44-spi1-verify.sql 2>&1 | tail -15
```
Expected: `spi1_neu_auf_kanzlei_faelle = 4`; alle vier `kf_*`-Booleans `true`.

- [ ] **Step 4: View-Sanity — keine f.-Quelle mehr für die 4**

**Achtung Substring-Falle:** `position('f.lexdrive_case_id' …)` trifft auch innerhalb von `kf.lexdrive_case_id` (Substring!) → ist nach dem Repoint NICHT 0. Daher mit Regex prüfen, der den `kf.`-Alias ausschließt (ein Zeichen vor `f.`, das **kein** `k` ist — bzw. Zeilenanfang):
```bash
cat > /tmp/spi1-vd-check.sql <<'SQL'
SELECT
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true) ~ '(^|[^k])f\.lexdrive_case_id'        AS f_case_id_still,
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true) ~ '(^|[^k])f\.lexdrive_ocr_data'        AS f_ocr_data_still,
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true) ~ '(^|[^k])f\.lexdrive_ocr_received_at'  AS f_ocr_recv_still,
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true) ~ '(^|[^k])f\.klage_uebergeben_am'       AS f_klage_still,
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true) ~ '(^|[^k])f\.mandatsnummer'             AS f_mandat_still;
SQL
npx supabase db query --linked --file /tmp/spi1-vd-check.sql 2>&1 | tail -8
```
Expected: `f_case_id_still=false`, `f_ocr_data_still=false`, `f_ocr_recv_still=false`, `f_klage_still=false` (keine echte `faelle`-Quelle mehr für die 4), aber `f_mandat_still=true` (mandatsnummer bewusst noch auf faelle).

- [ ] **Step 5: Types regenerieren** (PowerShell, kein Bash-`2>&1` — SP-G-Lesson)

```bash
powershell -Command "& { npx supabase gen types typescript --linked 2>\$null | Out-File -Encoding utf8 src/lib/supabase/database.types.ts }" 2>&1 | tail -3
```
Sanity:
```bash
head -1 src/lib/supabase/database.types.ts   # "export type Json ="
tail -1 src/lib/supabase/database.types.ts   # "} as const"
```
Dann prüfen, dass die 4 Spalten jetzt im `kanzlei_faelle`-Type stehen. Der `kanzlei_faelle`-Block muss die 4 neuen Felder in `Row`/`Insert`/`Update` enthalten:
```bash
awk '/kanzlei_faelle: \{/{f=1} f&&/lexdrive_case_id|klage_uebergeben_am/{print} f&&/^      \}/{c++; if(c>3) exit}' src/lib/supabase/database.types.ts | head -12
```
Expected: mehrere Treffer (Row + Insert + Update). Wenn 0 Treffer → Type-Regen hat den Block nicht erfasst; Apply (Step 2) prüfen.

- [ ] **Step 6: Voller Build**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`, exit 0. Bei OOM trotz 8 GB → `rm -rf .next` + retry.

- [ ] **Step 7: Commit + Push (KEIN `gh pr create`)**

```bash
git add src/lib/supabase/database.types.ts
git commit -F - <<'EOF'
feat(CMM-44): SP-I1 — LexDrive+Klage auf kanzlei_faelle (appliziert)

4 Spalten (lexdrive_case_id, lexdrive_ocr_data, lexdrive_ocr_received_at,
klage_uebergeben_am) additiv auf kanzlei_faelle; v_faelle_mit_aktuellem_
termin repointet (kf.<col> + LEFT JOIN kanzlei_faelle). Migration
appliziert + via repair recorded. Types regeneriert. Verhalten
unveraendert (View liefert die 4 vor wie nach als NULL).

Audit:
- Build: gruen (npm run build, exit 0)
- UI: n/a (Schema-Relocation; SV-Reader laeuft ueber repointete View)
- Redundanz: keine — 4 Spalten neu auf kanzlei_faelle
- Dead-Code: nichts (faelle-Spalten bleiben bis Phase 6)
- Spec: docs/superpowers/specs/2026-05-23-cmm44-spi1-mandat-lexdrive-design.md
- Inkonsistenz: Typen live gemessen; Verify spi1_neu=4 + View kf.<col>
- Regression: additiv; einziger Reader liest ueber repointete View (Pattern E)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push origin kitta/cmm44-spi1-mandat-lexdrive 2>&1 | tail -3
```
**`gh pr create` jetzt NICHT** — Branch ist gepusht, wartet auf Reviews.

---

## Task 3: Reader/Writer-Re-Grep (Verifikation, kein Code-Change erwartet)

**Files:** keine (reine Verifikation).

- [ ] **Step 1: Re-Grep der 4 Spaltennamen in `src/`**

```bash
grep -rnE 'lexdrive_case_id|lexdrive_ocr_data|lexdrive_ocr_received_at|klage_uebergeben_am' src --include='*.ts' --include='*.tsx' | grep -v 'database.types.ts'
```
Expected (unverändert ggü. Baseline):
- `src/app/gutachter/fall/[id]/page.tsx` — 2× Lesen von `lexdrive_case_id` (über die View `v_faelle_mit_aktuellem_termin` → Pattern E, **kein Change**).
- `src/lib/kanzlei/lexdrive-link.ts` — nur Kommentar.
- **Keine** `from('faelle').update({ lexdrive_… })` / `.update({ klage_uebergeben_am })`-Writes (es gibt keine).

Erscheint ein **neuer** `from('faelle').select(...)` mit einer der 4 Spalten, oder ein Writer → triagieren: Reader auf `kanzlei_faelle` umstellen (via `getKanzleiFall`) bzw. Writer auf `kanzlei_faelle` UPSERT (Sync-Trigger füllt `claim_id`/`fall_id`, `status` Pflichtwert). Dann in Task 2 nachcommitten. **Bei der aktuellen Codebasis erwartet: 0 Änderungen.**

- [ ] **Step 2: Kein Commit** — Befund im Smoke-Doc (Task 4) festhalten.

---

## Task 4: PR öffnen (nach Reviews) + Portal-Smoke (nach staging-Merge)

**Files:** Create `docs/23.05.2026/cmm44-spi1-smoke.md`.

- [ ] **Step 1: PR öffnen — erst NACH Spec- + Code-Quality-Review**

```bash
gh pr create --base staging \
  --title "CMM-44 SP-I1 — LexDrive+Klage -> kanzlei_faelle (4 ADD + View-Repoint)" \
  --body "Additive Schema-Relocation: 4 dormante Spalten (cov=0) von faelle auf kanzlei_faelle + View-Repoint v_faelle_mit_aktuellem_termin. Kein Code-Sweep (Reader laeuft ueber View), kein Backfill. Migration appliziert + repair-recorded. Spec: docs/superpowers/specs/2026-05-23-cmm44-spi1-mandat-lexdrive-design.md"
```

- [ ] **Step 2: Smoke-Script nutzen/adaptieren**

Falls vorhanden `scripts/smoke-cmm44-*.mjs` als Vorlage; sonst manuell per Playwright/Browser gegen `app.staging.claimondo.de`. Kritischer Pfad:
- **SV** `/gutachter/fall/[id]` — die LexDrive-Deep-Link-Stelle (liest `lexdrive_case_id` über die View). Erwartung: rendert wie heute (case_id ist NULL → Login-URL-Fallback bzw. kein Deep-Link-Button), **kein** `TypeError`/5xx.
- **Sanity** Admin `/faelle` (Liste + eine Fallakte), Kunde-Portal-Start, Public `/` — kein 5xx / `pageerror` / Hydration-Overlay.

Detektoren: 5xx, Console-Errors, `pageerror` („Cannot read properties of undefined"), Hydration-Overlay, „undefined/NaN/[object Object]" im Display.

- [ ] **Step 3: Smoke gegen staging fahren + Screenshots auswerten**

Smoke erst **nach** staging-Merge (durch Aaron). Screenshots im selben Turn auswerten (Memory: Screenshot-Pflicht). Protokoll → `docs/23.05.2026/cmm44-spi1-smoke.md` (pro Portal: URL, Status, Screenshot-Befund, Re-Grep-Ergebnis aus Task 3).

```bash
git add docs/23.05.2026/cmm44-spi1-smoke.md
git commit -m "test(CMM-44): SP-I1 — Portal-Smoke (LexDrive-Reader via View)"
git push origin kitta/cmm44-spi1-mandat-lexdrive 2>&1 | tail -3
```

---

## Task 5: Abschluss

**Files:** Modify `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`; Create `docs/23.05.2026/handoff-cmm44-spi1-abschluss.md`; Memory (extern).

- [ ] **Step 1: Phase-1-Mapping nachziehen**

In `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` einen Update-Block ergänzen (analog SP-G/SP-H):
```markdown
**Update 2026-05-23:** SP-I1 (Slice 1 von SP-I) erledigt — 4 LexDrive/Klage-
Spalten (lexdrive_case_id, lexdrive_ocr_data, lexdrive_ocr_received_at,
klage_uebergeben_am, alle cov=0) additiv auf kanzlei_faelle (1:1). 4 ADD +
View-Repoint v_faelle_mit_aktuellem_termin (kf.<col> + LEFT JOIN). Kein
Code-Sweep (Reader via View), kein Backfill (cov=0). PR #<n>. Spec/Plan:
docs/superpowers/{specs,plans}/2026-05-23-cmm44-spi1-mandat-lexdrive*.md.
Offen in SP-I: mandatsnummer (Reklassifizierung), kanzlei_id, ~52 weitere.
```
PR-Nummer nach Merge eintragen.

- [ ] **Step 2: Handoff-Doc schreiben**

`docs/23.05.2026/handoff-cmm44-spi1-abschluss.md` — was erledigt, Verifikation (spi1_neu=4, View-Repoint, Build grün, Smoke), Lessons (4 dormante cov=0-Spalten → reine Relocation; 1:1-LEFT-JOIN statt LATERAL; CREATE-OR-REPLACE-Spaltenlisten-Invarianz; capture-and-patch des View-Bodys statt Hand-Transkription), lose Enden, nächster SP-I-Schritt (mandatsnummer-Slice).

- [ ] **Step 3: Memory aktualisieren (extern)**

`C:\Users\Aaron Sprafke\.claude\projects\C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2\memory\project_cmm44_spi1_status.md` schreiben (Pattern wie `project_cmm44_spg_status.md`) + MEMORY.md-Pointer ergänzen.

- [ ] **Step 4: Commit Docs**

```bash
git add docs/   # NUR docs/ — Memory liegt ausserhalb des Repos
git commit -m "docs(CMM-44): SP-I1 erledigt — Handoff + Phase-1-Mapping nachgezogen"
git push origin kitta/cmm44-spi1-mandat-lexdrive 2>&1 | tail -3
```

- [ ] **Step 5: Session-Abschluss-Checkliste (AGENTS.md Regel 3)**

```bash
git status                          # Working-Tree clean?
git stash list                      # Leer / alte dokumentierte Stashes?
git log --branches --not --remotes  # Alle lokalen Commits gepusht?
```

---

## Definition of Done

- [ ] 4 Spalten additiv auf `kanzlei_faelle` (Verify `spi1_neu_auf_kanzlei_faelle = 4`); Typen exakt von `faelle`.
- [ ] `v_faelle_mit_aktuellem_termin` repointet — alle vier `kf_*`-Booleans `true`, `f.lexdrive_*`/`f.klage_*`-Quellen weg, `f.mandatsnummer` unverändert.
- [ ] Backfill = dokumentierter No-op (cov=0 bestätigt in Task 0).
- [ ] Re-Grep: 0 neue `faelle`-Direkt-Reads/Writes der 4 Spalten; bekannter View-Reader unverändert.
- [ ] Types regeneriert, voller Build (8 GB) grün.
- [ ] PR gegen `staging` (kein Auto-Merge); nach Merge Portal-Smoke mit Screenshots ohne Hard-Fail.
- [ ] Phase-1-Mapping + Handoff-Doc + Memory nachgezogen; Session-Abschluss-Checkliste sauber.

---

## Anhang A: Falls Task 0 doch Daten findet (cov > 0 oder kf_rows > 0)

Dann ist „Backfill = No-op" falsch. Block 2 der Migration durch einen idempotenten Backfill ersetzen:
```sql
-- Block 2 (nur falls cov>0): kanzlei_faelle-Row je betroffenem Fall anlegen/fuellen.
-- Sync-Trigger leitet claim_id<->fall_id ab; status Pflichtwert setzen.
INSERT INTO public.kanzlei_faelle (fall_id, status, lexdrive_case_id, lexdrive_ocr_data, lexdrive_ocr_received_at, klage_uebergeben_am)
SELECT f.id, 'versicherungskontakt',
       f.lexdrive_case_id, f.lexdrive_ocr_data, f.lexdrive_ocr_received_at, f.klage_uebergeben_am
FROM public.faelle f
WHERE (f.lexdrive_case_id IS NOT NULL OR f.lexdrive_ocr_data IS NOT NULL
       OR f.lexdrive_ocr_received_at IS NOT NULL OR f.klage_uebergeben_am IS NOT NULL)
  AND f.claim_id IS NOT NULL
ON CONFLICT (fall_id) DO UPDATE SET
  lexdrive_case_id        = COALESCE(public.kanzlei_faelle.lexdrive_case_id, EXCLUDED.lexdrive_case_id),
  lexdrive_ocr_data       = COALESCE(public.kanzlei_faelle.lexdrive_ocr_data, EXCLUDED.lexdrive_ocr_data),
  lexdrive_ocr_received_at= COALESCE(public.kanzlei_faelle.lexdrive_ocr_received_at, EXCLUDED.lexdrive_ocr_received_at),
  klage_uebergeben_am     = COALESCE(public.kanzlei_faelle.klage_uebergeben_am, EXCLUDED.klage_uebergeben_am);
```
Der `status`-Default `'versicherungskontakt'` ist der erste erlaubte Wert laut `KanzleiFallRow`-Type (`'versicherungskontakt' | 'auszahlung'`). Bei cov>0 zusätzlich mit Aaron klären, ob der LexDrive-OCR-Writer schon verdrahtet werden soll (sonst neue Daten landen weiter auf `faelle`).

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
