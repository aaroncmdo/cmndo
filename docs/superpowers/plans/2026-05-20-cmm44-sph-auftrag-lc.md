# CMM-44 SP-H — Auftrag-Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 18 Auftrag-Lifecycle-Spalten (Filmcheck, Storno, SV-Briefing, TechStellungnahme, Besichtigung-Start) von `faelle` auf die `auftraege`-Sub-Table migrieren. **Rein additiv** — kein per-Spalten-`DROP COLUMN`.

**Architecture:** PR1 = additive Migration (18× `ADD COLUMN` auf `auftraege`, **UPDATE-Backfill** auf existierende auftraege-Rows nur, View-Repoint via LATERAL JOIN auf den „aktuellen" Auftrag pro Claim). PR2 = Reader/Writer-Sweep code-only (1:N-Embed mit `order('reihenfolge desc').limit(1)`, Array-Normalisierung Pflicht). PR3 = idempotenter Catch-up-Backfill. `auftraege` ist 1:N pro Claim (kein UNIQUE auf `claim_id`); pre-launch hat genau 1 von 42 Claims einen Auftrag.

**Tech Stack:** Next.js 15, TypeScript, `@supabase/supabase-js`, Supabase CLI (Migrations), Postgres, Playwright (Portal-Smoke).

**Spec:** `docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** `.claude/worktrees/cmm-44-spb`, Branch `kitta/cmm-44-sph` off `origin/staging`. Pro PR ein eigener Branch off `staging` (oder Vorgänger-Branch, wenn Types-Abhängigkeit besteht). Memory `feedback_pr_gegen_staging`: PRs immer `--base staging`.
- **Harte Regeln (AGENTS.md):** Nie auf `main` pushen. DDL nur via supabase-CLI (`db query --linked` + `migration repair`). Kein unbegleiteter Stash am Session-Ende.
- **DB-Apply-Muster (bewährt aus SP-A2/A3/B/G):** Migration in `BEGIN/COMMIT`; Dry-Run `BEGIN; … ROLLBACK;`; Apply via `npx supabase db query --linked --file <sql>`; danach `npx supabase migration repair --status applied <version>`. **Kein** `db push`.
- **Supabase-Link:** Der Worktree ist gelinkt (`.env.local` + `supabase/.temp/`). `db query --linked` läuft direkt.
- **Commit-Format:** Jeder Commit braucht den 7-Punkte-Audit-Block + echte deutsche Umlaute.
- **PR-Hygiene (Memory `feedback_kein_auto_merge` + `feedback_draft_pr_nicht_release_sicher`):** Auto-Merge ist **WIDERRUFEN** für beide Targets. Branch pushen + Reviews laufen lassen, PR erst nach Spec-Review + Code-Quality-Review öffnen. Aaron mergt selbst.
- **Sequencing:** PR1 (additiv) jederzeit applizierbar. PR2 nach PR1-`staging`-Merge. PR3 nach PR2-`main`-Release.

---

## Referenz: Die 18 Spalten (1:1 Namens-Mapping)

Live gemessen 2026-05-20 (`scripts/cmm44-sph-measure.sql`). Alle Mappings sind **gleicher Name** auf `auftraege` (kein Reader-Rename — anders als SP-G).

| Cluster | `faelle.<col>` | Typ | Default |
|---|---|---|---|
| Filmcheck | `filmcheck_ok` | bool | `false` |
| Filmcheck | `filmcheck_am` | timestamptz | — |
| Filmcheck | `filmcheck_notizen` | text | — |
| Storno | `storniert_am` | timestamptz | — |
| Storno | `storno_grund` | text | — |
| Storno | `storno_durch_user_id` | uuid | — |
| Besichtigung | `besichtigung_gestartet_am` | timestamptz | — |
| SV-Briefing | `sv_briefing_text` | text | — |
| SV-Briefing | `sv_briefing_generated_at` | timestamptz | — |
| SV-Briefing | `sv_briefing_model` | text | — |
| SV-Briefing | `sv_briefing_version` | int4 | `1` (vermutet — wird in Task 1 Step 4 aus information_schema bestätigt) |
| SV-Briefing | `sv_briefing_struktur` | jsonb | — |
| SV-Briefing | `sv_notizen_vor_ort` | text | — |
| TechStellungnahme | `technische_stellungnahme_status` | text | `'nicht_erforderlich'` |
| TechStellungnahme | `technische_stellungnahme_notiz_sv` | text | — |
| TechStellungnahme | `technische_stellungnahme_beauftragt_am` | timestamptz | — |
| TechStellungnahme | `technische_stellungnahme_hochgeladen_am` | timestamptz | — |
| TechStellungnahme | `technische_stellungnahme_freigabe_am` | timestamptz | — |

**Hinweis Generator vs. explizit:** Wie in SP-G werden die 18 `ADD COLUMN`-Statements direkt in der Migration geschrieben — kein Generator-Script. Task 1 Step 4 misst die exakten Defaults nochmal live, dann werden sie ins SQL übernommen.

---

## Transform-Regelwerk (PR2 Reader/Writer-Sweep)

Jeder `faelle`-seitige Zugriff auf eine der 18 Spalten fällt in genau eines dieser Muster. **Kern-Unterschied zu SP-G:** `auftraege` ist 1:N pro Claim — Reader müssen den „aktuellen" Auftrag selektieren via `.order('reihenfolge', { ascending: false }).limit(1)`, Schreiber müssen am aktuellen Auftrag (oder mit Skip falls keiner existiert) updaten.

| Muster | Erkennung | Transform |
|---|---|---|
| **A — Direkt-Select aus `faelle`, nur SP-H-Spalten** | `from('faelle').select('id, claim_id, sv_briefing_text')` | Switch source: `from('auftraege').select('sv_briefing_text').eq('claim_id', claimId).order('reihenfolge', { ascending: false }).limit(1).maybeSingle()`. Spaltenname unverändert. Result-Type ist `{ sv_briefing_text: string \| null } \| null`. |
| **B — Direkt-Select aus `faelle`, gemischt** | `from('faelle').select('… non-SP-H …, sv_briefing_text, …')` | SP-H-Spalten in nested embed: `from('faelle').select('… non-SP-H …, claims:claim_id(auftraege(<SP-H-cols>))')`. **Array-Normalisierung Pflicht:** `const claims = Array.isArray(row.claims) ? row.claims[0] : row.claims; const ag = Array.isArray(claims?.auftraege) ? claims.auftraege[0] : claims?.auftraege`. Limitierung: dieser Pattern liefert **irgendeinen** Auftrag (PostgREST kann den Order-Hint nicht im nested embed garantieren). Wenn die Reader-Site einen deterministischen „aktuellen" Auftrag braucht, Pattern A vorziehen. |
| **C — Write auf `faelle` (SP-H-col)** | `from('faelle').update({ sv_briefing_text: …, status: 'erstellt' })` | SP-H-Werte aus dem faelle-`update`/`insert` **entfernen**, separater `from('auftraege').update({ sv_briefing_text: … }).eq('claim_id', claimId).order('reihenfolge', { ascending: false }).limit(1)` — auf den aktuellen Auftrag. Postgres-Trick: `UPDATE auftraege SET … WHERE id = (SELECT id FROM auftraege WHERE claim_id = X ORDER BY reihenfolge DESC LIMIT 1)`. In PostgREST-Syntax: erst per Subquery die ID lesen, dann update. Falls 0 Aufträge: `console.warn` (skip), nicht 500. **Kein Dual-Write.** Non-SP-H-Spalten bleiben im `faelle`-Update. Guarded mit `{ error }`. |
| **D — Nested `faelle(...)`-Select** | `from('<x>').select('…, faelle(sv_briefing_text)')` | SP-H-Spalte in `claims:claim_id(auftraege(<col>))`-Block via doppelt-genesteten Embed. Array-Normalisierung an beiden Stellen (claims-Embed + auftraege-Embed). |
| **E — View-Read** | Read aus `v_*` exponiert die Spalte | PR1 hat die View via LATERAL JOIN auf aktuellen Auftrag repointet → **kein Code-Change**. |
| **F — TS-Typ / JSX / Property-Access** | `interface`/`type`-Feld, `obj.<col>`, JSX | **Kein Change** — Spaltenname identisch. Falls ein Typ als `Database['public']['Tables']['faelle']['Row']['sv_briefing_text']` getypt ist, auf `Database['public']['Tables']['auftraege']['Row']['sv_briefing_text']` umstellen, aber **keine** Property-Umbenennung. |

**Verify-Endzustand für PR2:** kontext-sicherer paren-balanced Re-Grep (`scripts/cmm44-sph-grep.mjs`, analog SP-G) zeigt 0 live `from('faelle')`-Selects/Updates/Inserts und 0 nested `faelle(...)`-Selects der 18 Spalten. `npm run build` (8 GB heap) grün.

---

## File Structure

**Neu:**
- `scripts/cmm44-sph-measure.sql` — Live-Messung (existiert bereits, mit Spec committed).
- `scripts/cmm44-sph-views-audit.sql` — View-Audit-Query (Task 1).
- `scripts/cmm44-sph-verify.sql` — Verify-Query nach PR1/PR3 (Task 1/6).
- `scripts/cmm44-sph-grep.mjs` — kontext-sicherer paren-balanced Re-Grep (Task 3).
- `supabase/migrations/<ts>_cmm44_sph_add_auftraege_columns.sql` — PR1.
- `supabase/migrations/<ts>_cmm44_sph_catchup_backfill.sql` — PR3.
- `docs/20.05.2026/cmm44-sph-views-audit.md`, `cmm44-sph-inventory.md`, `cmm44-sph-smoke-pr2.md` — Audit-/Inventur-/Smoke-Protokolle.

**Modifiziert (PR2):** `src/`-Files mit `faelle`-seitigem Zugriff auf eine der 18 Spalten (Inventur Task 3). Types: `src/lib/supabase/database.types.ts` (PR1).

---

## Task 0: Live-DB-Drift-Check

**Files:** nutzt `scripts/cmm44-sph-measure.sql` (existiert).

- [ ] **Step 1: 18-Spalten-Messung erneut fahren**

Run:
```bash
npx supabase db query --linked --file scripts/cmm44-sph-measure.sql 2>&1 | grep -E '"zeile"' | sed 's/^ *"zeile": "//; s/",\?$//'
```
Expected: TOTALS-Zeile + 18 Detailzeilen. **Alle 18** zeigen `!! FEHLT auf auftraege (PR1 ADD)`. Zeigt eine Zeile `✓ a.udt=...`, hat eine andere Session die Spalte bereits hinzugefügt → aus Block 1 streichen + im Ausführungs-Log vermerken.

- [ ] **Step 2: Kein Commit** — reiner Verifikationsschritt.

---

## Task 1: PR1 — View-Audit + Trigger-Audit + Migration schreiben + Dry-Run

**Branch:** `kitta/cmm-44-sph-pr1-add-columns`, frisch von `kitta/cmm-44-sph` (Spec-Branch — der Spec-Commit `eacd7724` muss mitgenommen werden).

**Files:**
- Create: `scripts/cmm44-sph-views-audit.sql`
- Create: `scripts/cmm44-sph-verify.sql`
- Create: `docs/20.05.2026/cmm44-sph-views-audit.md`
- Create: `supabase/migrations/<ts>_cmm44_sph_add_auftraege_columns.sql`

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-sph-pr1-add-columns kitta/cmm-44-sph
```

- [ ] **Step 2: View-Audit-Query schreiben**

Datei `scripts/cmm44-sph-views-audit.sql`:
```sql
-- CMM-44 SP-H — welche Views exponieren eine der 18 SP-H-Spalten?
SELECT c.table_name AS view_name, c.column_name
FROM information_schema.columns c
JOIN information_schema.views v
  ON v.table_schema = c.table_schema AND v.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name IN (
    'filmcheck_ok','filmcheck_am','filmcheck_notizen',
    'storniert_am','storno_grund','storno_durch_user_id',
    'besichtigung_gestartet_am',
    'sv_briefing_text','sv_briefing_generated_at','sv_briefing_model',
    'sv_briefing_version','sv_briefing_struktur','sv_notizen_vor_ort',
    'technische_stellungnahme_status','technische_stellungnahme_notiz_sv',
    'technische_stellungnahme_beauftragt_am','technische_stellungnahme_hochgeladen_am',
    'technische_stellungnahme_freigabe_am'
  )
ORDER BY c.table_name, c.column_name;
```

- [ ] **Step 3: View-Audit ausführen + dokumentieren**

Run: `npx supabase db query --linked --file scripts/cmm44-sph-views-audit.sql 2>&1 | tail -60`

Pro Treffer-View `pg_get_viewdef('public.<view>', true)` prüfen, ob die Spalte aus `f.<col>` (faelle-Alias) oder anderswoher gespeist wird:
```bash
echo "SELECT pg_get_viewdef('public.<view_name>', true);" > /tmp/sph-vd.sql
npx supabase db query --linked --file /tmp/sph-vd.sql 2>&1 | tail -60
```

Ergebnis in `docs/20.05.2026/cmm44-sph-views-audit.md` festhalten — Tabelle `view_name | column_name | quelle (f. / andere) | repoint_strategy`. Falls Trefferliste leer → kein View-Repoint, Migration-Block 3 entfällt.

- [ ] **Step 4: Verify-Query schreiben + exakte Defaults messen**

Datei `scripts/cmm44-sph-verify.sql`:
```sql
-- CMM-44 SP-H — Verify: 18 neue Spalten auf auftraege?
SELECT count(*) AS sph_neu_auf_auftraege
FROM information_schema.columns
WHERE table_schema='public' AND table_name='auftraege'
  AND column_name IN (
    'filmcheck_ok','filmcheck_am','filmcheck_notizen',
    'storniert_am','storno_grund','storno_durch_user_id',
    'besichtigung_gestartet_am',
    'sv_briefing_text','sv_briefing_generated_at','sv_briefing_model',
    'sv_briefing_version','sv_briefing_struktur','sv_notizen_vor_ort',
    'technische_stellungnahme_status','technische_stellungnahme_notiz_sv',
    'technische_stellungnahme_beauftragt_am','technische_stellungnahme_hochgeladen_am',
    'technische_stellungnahme_freigabe_am'
  );
```

Exakte Defaults der 18 Spalten aus `faelle` messen (für Block 1):
```bash
cat > /tmp/sph-defaults.sql <<'SQL'
SELECT column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='faelle'
  AND column_name IN (
    'filmcheck_ok','filmcheck_am','filmcheck_notizen',
    'storniert_am','storno_grund','storno_durch_user_id',
    'besichtigung_gestartet_am',
    'sv_briefing_text','sv_briefing_generated_at','sv_briefing_model',
    'sv_briefing_version','sv_briefing_struktur','sv_notizen_vor_ort',
    'technische_stellungnahme_status','technische_stellungnahme_notiz_sv',
    'technische_stellungnahme_beauftragt_am','technische_stellungnahme_hochgeladen_am',
    'technische_stellungnahme_freigabe_am'
  )
ORDER BY column_name;
SQL
npx supabase db query --linked --file /tmp/sph-defaults.sql 2>&1 | grep -E '"(column_name|udt_name|is_nullable|column_default)"' | paste - - - - | head -25
```

Aus der Ausgabe die exakten Defaults notieren — sie gehen 1:1 ins SQL.

- [ ] **Step 5: Trigger-Body-Audit (SP-G-Lesson)**

Run:
```bash
cat > /tmp/sph-triggers.sql <<'SQL'
SELECT p.proname, p.prosrc
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'auftraege' AND NOT t.tgisinternal
ORDER BY p.proname;
SQL
npx supabase db query --linked --file /tmp/sph-triggers.sql 2>&1 | tail -100
```

Output prüfen — feuert ein Trigger-Body Notifications/Emails (`pg_notify`, `net.http_*`, externe Function-Calls)? Falls ja: PR1-Backfill-Block in `ALTER TABLE public.auftraege DISABLE TRIGGER <name>;` … `ENABLE TRIGGER`-Wrapper packen. Falls nein: Backfill ohne Wrapper. Befund in `docs/20.05.2026/cmm44-sph-views-audit.md` als „Trigger-Audit"-Sektion.

- [ ] **Step 6: PR1-Migration generieren + Block 1 + 2 schreiben**

```bash
npx supabase migration new cmm44_sph_add_auftraege_columns
```

Inhalt der generierten Datei — in `BEGIN/COMMIT`, mindestens Block 1 + 2 (Block 3 konditional):

```sql
-- CMM-44 SP-H PR1 — additive Migration (kein DROP)
-- Block 1: 18× ADD COLUMN auf auftraege
-- Block 2: UPDATE-Backfill auf existierende auftraege-Rows (UPDATE-only, kein INSERT)
-- Block 3: View-Repoint via LATERAL JOIN (konditional — falls View-Audit Treffer fand)
-- Nach Apply: npx supabase migration repair --status applied <timestamp>
-- Ticket: CMM-44 / Sub-Projekt SP-H

BEGIN;

-- ============================================================
-- Block 1: ADD COLUMN — 18 neue Spalten auf public.auftraege
-- Typ/Default exakt von faelle gespiegelt (Live-Messung 2026-05-20)
-- ============================================================
ALTER TABLE public.auftraege
  ADD COLUMN filmcheck_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN filmcheck_am timestamptz,
  ADD COLUMN filmcheck_notizen text,
  ADD COLUMN storniert_am timestamptz,
  ADD COLUMN storno_grund text,
  ADD COLUMN storno_durch_user_id uuid,
  ADD COLUMN besichtigung_gestartet_am timestamptz,
  ADD COLUMN sv_briefing_text text,
  ADD COLUMN sv_briefing_generated_at timestamptz,
  ADD COLUMN sv_briefing_model text,
  ADD COLUMN sv_briefing_version int4 NOT NULL DEFAULT 1,
  ADD COLUMN sv_briefing_struktur jsonb,
  ADD COLUMN sv_notizen_vor_ort text,
  ADD COLUMN technische_stellungnahme_status text NOT NULL DEFAULT 'nicht_erforderlich',
  ADD COLUMN technische_stellungnahme_notiz_sv text,
  ADD COLUMN technische_stellungnahme_beauftragt_am timestamptz,
  ADD COLUMN technische_stellungnahme_hochgeladen_am timestamptz,
  ADD COLUMN technische_stellungnahme_freigabe_am timestamptz;

-- ============================================================
-- Block 2: UPDATE-Backfill auf existierende auftraege-Rows.
-- Aaron-Entscheidung Option A: nur existierende Rows updaten, keine
-- neuen Aufträge erzeugen. Pre-launch hat 1 von 42 Claims einen Auftrag.
-- Bei 1:N pro Claim schreibt das die Werte in ALLE Aufträge desselben
-- Claims — pre-launch jeweils max. 1 Row, also unkritisch.
-- ============================================================
-- IF Step 5 found Trigger mit Notification-Side-Effects:
-- ALTER TABLE public.auftraege DISABLE TRIGGER <name>;

UPDATE public.auftraege a SET
  filmcheck_ok                            = f.filmcheck_ok,
  filmcheck_am                            = f.filmcheck_am,
  filmcheck_notizen                       = f.filmcheck_notizen,
  storniert_am                            = f.storniert_am,
  storno_grund                            = f.storno_grund,
  storno_durch_user_id                    = f.storno_durch_user_id,
  besichtigung_gestartet_am               = f.besichtigung_gestartet_am,
  sv_briefing_text                        = f.sv_briefing_text,
  sv_briefing_generated_at                = f.sv_briefing_generated_at,
  sv_briefing_model                       = f.sv_briefing_model,
  sv_briefing_version                     = f.sv_briefing_version,
  sv_briefing_struktur                    = f.sv_briefing_struktur,
  sv_notizen_vor_ort                      = f.sv_notizen_vor_ort,
  technische_stellungnahme_status         = f.technische_stellungnahme_status,
  technische_stellungnahme_notiz_sv       = f.technische_stellungnahme_notiz_sv,
  technische_stellungnahme_beauftragt_am  = f.technische_stellungnahme_beauftragt_am,
  technische_stellungnahme_hochgeladen_am = f.technische_stellungnahme_hochgeladen_am,
  technische_stellungnahme_freigabe_am    = f.technische_stellungnahme_freigabe_am
FROM public.faelle f
WHERE a.claim_id = f.claim_id;

-- IF Step 5 found Trigger:
-- ALTER TABLE public.auftraege ENABLE TRIGGER <name>;

-- ============================================================
-- Block 3: View-Repoint — nur falls View-Audit Treffer fand.
-- Pro betroffene View ein CREATE OR REPLACE VIEW. Spaltenname unverändert
-- via AS-Alias. Quelle via LATERAL JOIN auf den aktuellen Auftrag:
--   LEFT JOIN LATERAL (
--     SELECT a.<col1>, a.<col2>, …
--     FROM public.auftraege a
--     WHERE a.claim_id = c.id
--     ORDER BY a.reihenfolge DESC
--     LIMIT 1
--   ) cur_auftrag ON true
-- Wenn der View bisher `f.<col>` exponierte: ersetzen durch `cur_auftrag.<col> AS <col>`.
-- Wenn die Trefferliste leer ist (Audit Step 3), entfällt dieser Block komplett.
-- ============================================================

COMMIT;
```

Defaults aus Step 4 querchecken — wenn die Live-Messung andere Defaults zeigt als oben angenommen (z.B. `sv_briefing_version` Default ≠ 1, oder `technische_stellungnahme_status` Default ≠ 'nicht_erforderlich'), das SQL entsprechend anpassen.

**`auftraege.sv_briefing_version` NOT NULL DEFAULT 1**: vorsichtig — Block 2 würde dann `sv_briefing_version=NULL` aus `faelle` schreiben, was den NOT-NULL-Constraint bricht. Mitigation: im UPDATE den Wert `COALESCE(f.sv_briefing_version, 1)` setzen, oder vor der Migration verifizieren, dass `faelle.sv_briefing_version` ebenfalls NOT NULL ist (Live-Messung sagt cov=42/42, also vermutlich nicht-null). Falls Live-Messung zeigt, dass `faelle.sv_briefing_version IS NOT NULL` für alle Rows → der direkte Cast geht durch.

- [ ] **Step 7: Dry-Run gegen die Live-DB**

```bash
MIG=$(ls supabase/migrations/*_cmm44_sph_add_auftraege_columns.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/sph-pr1-dryrun.sql
npx supabase db query --linked --file /tmp/sph-pr1-dryrun.sql 2>&1 | tail -10
```

Expected: kein Fehler. Häufige Fehlerklassen:
- `column "<x>" already exists` → andere Session hat sie hinzugefügt; aus Block 1+2 streichen.
- `null value in column "sv_briefing_version" violates not-null constraint` → `COALESCE(f.sv_briefing_version, 1)` im UPDATE einsetzen.
- `cannot change data type of view column "<x>"` (in Block 3) → Precision-Casts in der `CREATE OR REPLACE VIEW`-Def ergänzen (SP-G-Lesson).
- Trigger-Notification-Fehler → DISABLE/ENABLE-Wrapper in Block 2.

- [ ] **Step 8: Commit (Scripts + Migration, NICHT appliziert)**

```bash
git add scripts/cmm44-sph-views-audit.sql scripts/cmm44-sph-verify.sql docs/20.05.2026/cmm44-sph-views-audit.md supabase/migrations/*_cmm44_sph_add_auftraege_columns.sql
git commit -F - <<'EOF'
chore(CMM-44): SP-H PR1 — ADD-Migration + View/Trigger-Audit (vor Apply)

18x ADD COLUMN auf auftraege (Filmcheck, Storno, Besichtigung, SV-Briefing,
TechStellungnahme) + UPDATE-Backfill der existierenden auftraege-Rows
(Option A: keine neuen Rows erzeugen) + ggf. View-Repoint via LATERAL JOIN
auf aktuellen Auftrag pro Claim. Dry-Run gegen Live-DB grün.

Audit:
- Build: n/a (SQL + Audit-Doc, kein Code)
- UI: n/a
- Redundanz: Verify-/Audit-SQL folgt SP-G-probe-Muster
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md
- Inkonsistenz: Spalten-Defs aus Live-Messung, nicht geraten
- Regression: n/a (additiv, noch nicht appliziert)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

Real umlauts in the commit body — replace any `ae/oe/ue/ss` ASCII-substitutes vor dem Commit (`grün` etc.).

---

## Task 2: PR1 — Apply + Verify + Types + Build + Push (KEIN PR)

**Branch:** `kitta/cmm-44-sph-pr1-add-columns` (Fortsetzung von Task 1).

- [ ] **Step 1: Drift-Recheck**

```bash
npx supabase db query --linked --file scripts/cmm44-sph-measure.sql 2>&1 | grep -E '"zeile"' | sed 's/^ *"zeile": "//; s/",\?$//'
```
Expected: alle 18 Spalten weiterhin `!! FEHLT auf auftraege`. Bei Drift → Migration anpassen.

- [ ] **Step 2: Migration applizieren**

```bash
MIG=$(ls supabase/migrations/*_cmm44_sph_add_auftraege_columns.sql | tail -1)
TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -10
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
```
Expected: kein Fehler. `migration repair` meldet „Repaired migration history".

- [ ] **Step 3: Verify — 18 Spalten auf auftraege**

```bash
npx supabase db query --linked --file scripts/cmm44-sph-verify.sql 2>&1 | grep -E '"sph_neu_auf_auftraege"'
```
Expected: `"sph_neu_auf_auftraege": 18`.

- [ ] **Step 4: Backfill-Effekt verifizieren**

```bash
cat > /tmp/sph-backfill-verify.sql <<'SQL'
-- Pre-launch hat 1 auftraege-Row für 1 Claim. Nach UPDATE-Backfill sollten die
-- 18 SP-H-Spalten dieses Rows die Werte aus dem zugehörigen faelle-Row tragen.
SELECT
  a.id AS auftrag_id,
  a.claim_id,
  a.filmcheck_ok AS a_filmcheck_ok,
  f.filmcheck_ok AS f_filmcheck_ok,
  a.technische_stellungnahme_status AS a_ts_status,
  f.technische_stellungnahme_status AS f_ts_status,
  a.sv_briefing_version AS a_briefing_ver,
  f.sv_briefing_version AS f_briefing_ver
FROM public.auftraege a
LEFT JOIN public.faelle f ON f.claim_id = a.claim_id
LIMIT 5;
SQL
npx supabase db query --linked --file /tmp/sph-backfill-verify.sql 2>&1 | tail -15
```
Expected: Pro auftraege-Row sind `a.<col>` und `f.<col>` gleich für die 18 SP-H-Spalten (sample-check über 4 Spalten).

- [ ] **Step 5: Types regenerieren**

```bash
powershell -Command "& { npx supabase gen types typescript --linked 2>\$null | Out-File -Encoding utf8 src/lib/supabase/database.types.ts }" 2>&1 | tail -3
```
PowerShell statt Bash-`2>&1`, weil Bash sonst CLI-Stderr-Update-Notice ins File bleeden lässt (SP-G-Lesson). Sanity:
```bash
head -1 src/lib/supabase/database.types.ts   # muss "export type Json =" sein
tail -1 src/lib/supabase/database.types.ts   # muss "} as const" sein
grep -nE "filmcheck_ok\b|sv_briefing_text\b|technische_stellungnahme_status\b" src/lib/supabase/database.types.ts | head -10
```
Expected: 3 SP-H-Spalten in mehreren Type-Sections gefunden (Row/Insert/Update) ⇒ auftraege-Type hat die neuen Felder.

- [ ] **Step 6: Build**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`, exit 0. Bei OOM trotz 8 GB → `rm -rf .next` + retry.

- [ ] **Step 7: Commit + Push (KEIN `gh pr create`)**

```bash
git add src/lib/supabase/database.types.ts
git commit -F - <<'EOF'
feat(CMM-44): SP-H PR1 — 18 ADD + UPDATE-Backfill + ggf. View-Repoint

ADD COLUMN x18 auf auftraege (Filmcheck, Storno, Besichtigung, SV-Briefing,
TechStellungnahme) + UPDATE-Backfill der existierenden auftraege-Rows aus
faelle via WHERE a.claim_id = f.claim_id (Option A — keine neuen auftraege-
Rows erzeugen). Pre-launch: 1 von 42 Claims hat einen Auftrag, dessen 18
SP-H-Werte sind nach Apply gleich den faelle-Werten. Migration appliziert
+ via repair recorded. Supabase-Types regeneriert.

Audit:
- Build: gruen (npm run build, exit 0)
- UI: n/a (Schema-Vorbereitung)
- Redundanz: keine — 18 Spalten auf auftraege neu (Live-Messung)
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md
- Inkonsistenz: Spalten-Defs live gemessen; Verify sph_neu_auf_auftraege=18
- Regression: additiv — bestehende Reader weiter funktional via View-Aliase (falls Block 3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-sph-pr1-add-columns 2>&1 | tail -3
```

**Wichtig:** `gh pr create` jetzt NICHT ausführen. Branch ist gepusht, wartet auf Spec-Review + Code-Quality-Review.

- [ ] **Step 8: PR öffnen — erst NACH bestandenen Reviews**

```bash
gh pr create --base staging --title "CMM-44 SP-H PR1 — 18 ADD + UPDATE-Backfill (Auftrag-LC)" --body "Additive ADD-COLUMN-Migration + UPDATE-Backfill der Auftrag-LC-Spalten auf auftraege. Migration bereits appliziert + repair-recorded. Spec: docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md"
```

> **GATE:** Task 3 (PR2) startet erst, wenn PR1 auf `staging` gemergt ist — der Reader-Sweep braucht die regenerierten Types in `database.types.ts`.

---

## Task 3: PR2 — Call-Site-Inventur (paren-balanced)

**Branch:** `kitta/cmm-44-sph-pr2-sweep`, frisch von `origin/staging` (nach PR1-Merge).

**Files:**
- Create: `scripts/cmm44-sph-grep.mjs`
- Create: `docs/20.05.2026/cmm44-sph-inventory.md`

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-sph-pr2-sweep origin/staging
```

- [ ] **Step 2: Re-Grep-Skript schreiben** (analog `scripts/cmm44-spg-grep.mjs`)

Datei `scripts/cmm44-sph-grep.mjs`:

```javascript
#!/usr/bin/env node
// CMM-44 SP-H — paren-balanced Re-Grep der 18 SP-H-Spalten in src/.
//
// Vermeidet die SP-G-Stolperfalle "Multi-line from('faelle')" und
// "doppelt-genestete faelle(...)"-Embeds. Schließt claims:claim_id(...)
// und auftraege(...)-Sub-Embeds als false-positives aus.

import fs from 'node:fs'
import path from 'node:path'

const COLS = [
  'filmcheck_ok', 'filmcheck_am', 'filmcheck_notizen',
  'storniert_am', 'storno_grund', 'storno_durch_user_id',
  'besichtigung_gestartet_am',
  'sv_briefing_text', 'sv_briefing_generated_at', 'sv_briefing_model',
  'sv_briefing_version', 'sv_briefing_struktur', 'sv_notizen_vor_ort',
  'technische_stellungnahme_status', 'technische_stellungnahme_notiz_sv',
  'technische_stellungnahme_beauftragt_am', 'technische_stellungnahme_hochgeladen_am',
  'technische_stellungnahme_freigabe_am',
]

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.claude') continue
      walk(p, out)
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p)
  }
  return out
}

function stripSubEmbeds(s) {
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, '')
    s = s.replace(/\bauftraege\s*\(([^()]|\([^()]*\))*\)/g, '')
  }
  return s
}

const fromRe = /\.from\(['"]faelle['"]\)/g
const nestedRe = /\bfaelle\s*\(/g
const hits = []

for (const f of walk('src')) {
  const s = fs.readFileSync(f, 'utf8')

  let m
  fromRe.lastIndex = 0
  while ((m = fromRe.exec(s))) {
    const window = s.slice(m.index, m.index + 1500)
    const stripped = stripSubEmbeds(window)
    for (const c of COLS) {
      const re = new RegExp(`\\b${c}\\b`)
      if (re.test(stripped)) {
        const ln = s.slice(0, m.index).split('\n').length
        hits.push(`${f}:${ln} | ${c} | from('faelle') direct`)
        break
      }
    }
  }

  nestedRe.lastIndex = 0
  while ((m = nestedRe.exec(s))) {
    const start = m.index + m[0].length
    let depth = 1, end = start
    while (end < s.length && depth > 0) {
      const ch = s[end]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      end++
    }
    const body = s.slice(start, end - 1)
    const stripped = stripSubEmbeds(body)
    for (const c of COLS) {
      const re = new RegExp(`\\b${c}\\b`)
      if (re.test(stripped)) {
        const ln = s.slice(0, m.index).split('\n').length
        hits.push(`${f}:${ln} | ${c} | nested faelle(...)`)
        break
      }
    }
  }
}

console.log(hits.join('\n'))
console.log(`\nTOTAL HITS: ${hits.length}`)
```

- [ ] **Step 3: Inventur fahren**

```bash
node scripts/cmm44-sph-grep.mjs > /tmp/sph-hits.txt
tail -1 /tmp/sph-hits.txt   # TOTAL HITS-Zeile
echo "--- per Spalte ---"
grep -oE '\| [a-z_]+ \|' /tmp/sph-hits.txt | sed 's/| //; s/ |//' | sort | uniq -c | sort -rn
echo "--- per File ---"
sed -E 's/:[0-9]+ \|.*//' /tmp/sph-hits.txt | sort | uniq -c | sort -rn | head -20
```

- [ ] **Step 4: Inventur-Doc schreiben**

`docs/20.05.2026/cmm44-sph-inventory.md` mit:
- Übersichtstabelle pro Spalte (Hit-Zahlen)
- Pro-Site-Klassifizierung (Pattern A-F aus dem Plan-Header)
- Liste der „Out-of-Scope"-Sites (Test-Fixtures `create-test-fall`, `seed-testdata`, claimlose Helper)
- Klassen-Splitting für den Sweep — falls >80 Sites, in PR2a/b/c chunken (sonst 1 PR)

```bash
git add scripts/cmm44-sph-grep.mjs docs/20.05.2026/cmm44-sph-inventory.md
git commit -m "docs(CMM-44): SP-H PR2 — Call-Site-Inventur (paren-balanced)"
```

---

## Task 4: PR2 — Transform anwenden + Build + Push (KEIN PR)

**Files:** alle in der Inventur als A/B/C/D klassifizierten Files. Klasse E/F → kein Code-Change.

- [ ] **Step 1: Pro Site das Transform anwenden** (Pattern-Regelwerk aus dem Plan-Header)

**Beispiel Muster A (Read, nur SP-H-Spalten):**

```typescript
// VORHER
const { data: fall } = await db.from('faelle')
  .select('id, claim_id, technische_stellungnahme_status')
  .eq('id', fallId).single()
const tsStatus = fall?.technische_stellungnahme_status

// NACHHER
const { data: fall } = await db.from('faelle')
  .select('id, claim_id')
  .eq('id', fallId).single()
let aktAuftrag: { technische_stellungnahme_status: string | null } | null = null
if (fall?.claim_id) {
  const { data: a } = await db.from('auftraege')
    .select('technische_stellungnahme_status')
    .eq('claim_id', fall.claim_id)
    .order('reihenfolge', { ascending: false })
    .limit(1)
    .maybeSingle()
  aktAuftrag = a
}
const tsStatus = aktAuftrag?.technische_stellungnahme_status
```

**Beispiel Muster B (Read, gemischt mit non-SP-H):**

```typescript
// VORHER
const { data: fall } = await db.from('faelle')
  .select('id, status, sv_briefing_text, sv_briefing_version')
  .eq('id', fallId).single()
const briefing = fall?.sv_briefing_text

// NACHHER
const { data: fall } = await db.from('faelle')
  .select('id, status, claims:claim_id(auftraege(sv_briefing_text, sv_briefing_version))')
  .eq('id', fallId).single()
const claims = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims
const auftraege = Array.isArray(claims?.auftraege) ? claims.auftraege : (claims?.auftraege ? [claims.auftraege] : [])
const aktAuftrag = auftraege[0] ?? null  // pre-launch max. 1, deterministische Reihenfolge nicht garantiert
const briefing = aktAuftrag?.sv_briefing_text
```

**Beispiel Muster C (Write, MOVE auf auftraege):**

```typescript
// VORHER
await db.from('faelle').update({
  sv_briefing_text: text,
  sv_briefing_generated_at: new Date().toISOString(),
  status: 'briefing_erstellt',
}).eq('id', fallId)

// NACHHER (SP-H-Werte auf auftraege, status bleibt auf faelle):
const { data: fall } = await db.from('faelle').select('claim_id').eq('id', fallId).single()
if (fall?.claim_id) {
  // Aktuellen Auftrag finden
  const { data: aktAuftrag } = await db.from('auftraege')
    .select('id')
    .eq('claim_id', fall.claim_id)
    .order('reihenfolge', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (aktAuftrag?.id) {
    const { error: aErr } = await db.from('auftraege')
      .update({
        sv_briefing_text: text,
        sv_briefing_generated_at: new Date().toISOString(),
      })
      .eq('id', aktAuftrag.id)
    if (aErr) return { ok: false, error: aErr.message }
  } else {
    console.warn(`[CMM-44 SP-H] kein Auftrag fuer claim ${fall.claim_id} — sv_briefing skip`)
  }
}
const { error: fErr } = await db.from('faelle').update({ status: 'briefing_erstellt' }).eq('id', fallId)
if (fErr) return { ok: false, error: fErr.message }
```

**Pattern D, E, F:** siehe Plan-Header §Transform-Regelwerk — Muster ist analog.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: 0 Fehler. Typische Fehler:
- „Property 'sv_briefing_text' does not exist on type 'Tables<\"faelle\">'..." → Reader wurde umgestellt aber Konsument liest noch das alte Property → nachziehen.
- „Argument of type … is not assignable to parameter of type 'never'" — PostgREST-Embed-Type. `Array.isArray`-Normalisierung einsetzen + ggf. explizite Typ-Annotation (`as { … } | null`).

- [ ] **Step 3: Kontext-sicherer Re-Grep**

```bash
node scripts/cmm44-sph-grep.mjs > /tmp/sph-postsweep.txt
echo "HITS nach Sweep:"
cat /tmp/sph-postsweep.txt
```
Expected: 0 oder fast 0 Hits. Verbleibende Treffer pro Stück triagieren — echte Reste fixen, false-positives (Kommentare, Test-Fixtures, View-E-Reads) dokumentieren.

- [ ] **Step 4: Voller Build**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10
```
Expected: grün, exit 0.

- [ ] **Step 5: Commit + Push (KEIN `gh pr create`)**

```bash
git add -A
git commit -F - <<'EOF'
refactor(CMM-44): SP-H PR2 — Reader/Writer-Sweep faelle->auftraege

18 Auftrag-LC-Spalten: alle faelle-seitigen Reads/Writes auf auftraege
umgestellt (gleicher Spaltenname, andere Tabelle, 1:N pro Claim). Reader
via .order('reihenfolge desc').limit(1) am aktuellen Auftrag, Writer
identifizieren erst den aktuellen Auftrag, dann update. Kein DB-Schema-
Change. Kein Dual-Write — SP-H-Werte aus faelle-Writes entfernt.

Audit:
- Build: gruen (npm run build, exit 0)
- UI: kein neuer Einstiegspunkt (Quell-Tabellen-Wechsel)
- Redundanz: aktuell-Auftrag-Pattern konsistent via order+limit(1)
- Dead-Code: faelle-seitige Zugriffe der 18 Spalten entfernt
- Spec: docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md
- Inkonsistenz: kein Spalten-Rename; 1:N-Array-Normalisierung an allen embeds
- Regression: kontext-sicherer paren-balanced Re-Grep — 0 live faelle-Zugriffe der 18 Spalten

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-sph-pr2-sweep
```

**KEIN `gh pr create`** — Branch ist gepusht, wartet auf Reviews.

- [ ] **Step 6: PR öffnen NACH Reviews**

```bash
gh pr create --base staging --title "CMM-44 SP-H PR2 — Reader/Writer-Sweep faelle->auftraege (18 Spalten)" --body "Tabellen-Wechsel für 18 Auftrag-LC-Spalten. Kein DB-Schema-Change. Spec: docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md"
```

---

## Task 5: PR2 — Portal-Smoke (nach staging-Merge)

**Files:**
- Modify (optional): `scripts/smoke-cmm44-spg.mjs` als Vorlage adaptieren auf SP-H, ODER ein dediziertes `scripts/smoke-cmm44-sph.mjs` schreiben

- [ ] **Step 1: Smoke-Script anlegen** (analog `scripts/smoke-cmm44-spg.mjs`)

Kopieren + auf SP-H-Routes anpassen. Kritische Pfade:
- **Admin** `/faelle/[id]` — Auftrag-LC-Sektion (Filmcheck-Status, SV-Briefing-Anzeige, TS-Workflow, Storno-Daten)
- **SV** `/gutachter/auftraege/[id]` und `/gutachter/fall/[id]` — primärer SP-H-Reader (Briefing wird hier gerendert und bearbeitet)
- **SV** `/gutachter/abrechnung` — wenn SP-H-Spalten dort gerendert werden
- **Public + Dispatch + Kunde** — Sanity-Check (kein 5xx / TypeError)

Detekt: 5xx, Console-Errors, `pageerror` (TypeError „Cannot read properties of undefined"), Hydration-Overlay, „undefined/NaN/[object Object] im Display".

- [ ] **Step 2: Smoke gegen staging fahren**

```bash
node --env-file=.env.local scripts/smoke-cmm44-sph.mjs
```

Smoke gegen `app.staging.claimondo.de` (Memory: nie Prod). Screenshots im selben Turn auswerten (Memory: Screenshot-Pflicht). Protokoll nach `docs/20.05.2026/cmm44-sph-smoke-pr2.md`.

- [ ] **Step 3: Commit Smoke-Protokoll**

```bash
git add scripts/smoke-cmm44-sph.mjs docs/20.05.2026/cmm44-sph-smoke-pr2.md
git commit -m "test(CMM-44): SP-H PR2 — Portal-Smoke nach Reader/Writer-Sweep"
git push
```

> **GATE:** Task 6 (PR3) startet erst, wenn PR2 auf `main` ist (staging→main-Release durch Aaron).

---

## Task 6: PR3 — Catch-up-Backfill

**Branch:** `kitta/cmm-44-sph-pr3-catchup-backfill`, frisch von `origin/staging`.

> **GATE-Check inhaltsbasiert** (Squash-Release, SP-A-Lektion c):
> ```bash
> git fetch origin
> git diff origin/main origin/staging -- src/ supabase/migrations/ | head -5
> ```
> Output leer oder nur unwesentlich → PR1+PR2 sind inhaltsbasiert auf main. Andernfalls warten.

**Files:**
- Create: `supabase/migrations/<ts>_cmm44_sph_catchup_backfill.sql`

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-sph-pr3-catchup-backfill origin/staging
```

- [ ] **Step 2: Catch-up-Backfill-Migration generieren**

```bash
npx supabase migration new cmm44_sph_catchup_backfill
```

Inhalt — idempotenter `UPDATE` mit COALESCE-Pattern (bestehende auftraege-Werte gewinnen, faelle füllt NULL-Lücken):

```sql
-- CMM-44 SP-H PR3 — Catch-up-Backfill (additiv, kein DROP)
--
-- Idempotenter Re-Backfill der 18 SP-H-Spalten auftraege<-faelle via UPDATE
-- mit COALESCE-Pattern. Bestehende auftraege-Werte gewinnen — fängt nur
-- NULL-Lücken aus Writes, die zwischen PR1-Apply und PR2-Writer-Deploy
-- noch auf faelle landeten. Pre-launch realistisch sehr wenig betroffen.
--
-- Nach Apply: npx supabase migration repair --status applied <timestamp>
-- Ticket: CMM-44 / Sub-Projekt SP-H / Plan Task 6 / Spec §3 PR3

BEGIN;

UPDATE public.auftraege a SET
  filmcheck_ok                            = COALESCE(a.filmcheck_ok, f.filmcheck_ok),
  filmcheck_am                            = COALESCE(a.filmcheck_am, f.filmcheck_am),
  filmcheck_notizen                       = COALESCE(a.filmcheck_notizen, f.filmcheck_notizen),
  storniert_am                            = COALESCE(a.storniert_am, f.storniert_am),
  storno_grund                            = COALESCE(a.storno_grund, f.storno_grund),
  storno_durch_user_id                    = COALESCE(a.storno_durch_user_id, f.storno_durch_user_id),
  besichtigung_gestartet_am               = COALESCE(a.besichtigung_gestartet_am, f.besichtigung_gestartet_am),
  sv_briefing_text                        = COALESCE(a.sv_briefing_text, f.sv_briefing_text),
  sv_briefing_generated_at                = COALESCE(a.sv_briefing_generated_at, f.sv_briefing_generated_at),
  sv_briefing_model                       = COALESCE(a.sv_briefing_model, f.sv_briefing_model),
  sv_briefing_version                     = COALESCE(a.sv_briefing_version, f.sv_briefing_version),
  sv_briefing_struktur                    = COALESCE(a.sv_briefing_struktur, f.sv_briefing_struktur),
  sv_notizen_vor_ort                      = COALESCE(a.sv_notizen_vor_ort, f.sv_notizen_vor_ort),
  technische_stellungnahme_status         = COALESCE(a.technische_stellungnahme_status, f.technische_stellungnahme_status),
  technische_stellungnahme_notiz_sv       = COALESCE(a.technische_stellungnahme_notiz_sv, f.technische_stellungnahme_notiz_sv),
  technische_stellungnahme_beauftragt_am  = COALESCE(a.technische_stellungnahme_beauftragt_am, f.technische_stellungnahme_beauftragt_am),
  technische_stellungnahme_hochgeladen_am = COALESCE(a.technische_stellungnahme_hochgeladen_am, f.technische_stellungnahme_hochgeladen_am),
  technische_stellungnahme_freigabe_am    = COALESCE(a.technische_stellungnahme_freigabe_am, f.technische_stellungnahme_freigabe_am)
FROM public.faelle f
WHERE a.claim_id = f.claim_id;

COMMIT;
```

**Hinweis NOT-NULL-Spalten** (`filmcheck_ok`, `sv_briefing_version`, `technische_stellungnahme_status`): COALESCE schützt davor, dass ein neuer faelle-Wert `NULL` einen bestehenden Default überschreibt — aber für die 3 NOT-NULL-Spalten kann der `auftraege`-Wert sowieso nie null sein (Default), also ist COALESCE hier praktisch ein No-op. Trotzdem konsistent halten für Code-Klarheit.

- [ ] **Step 3: Dry-Run**

```bash
MIG=$(ls supabase/migrations/*_cmm44_sph_catchup_backfill.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/sph-pr3-dryrun.sql
npx supabase db query --linked --file /tmp/sph-pr3-dryrun.sql 2>&1 | tail -5
```
Expected: kein Fehler.

- [ ] **Step 4: Applizieren + Verify**

```bash
MIG=$(ls supabase/migrations/*_cmm44_sph_catchup_backfill.sql | tail -1)
TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -5
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
npx supabase db query --linked --file scripts/cmm44-sph-verify.sql 2>&1 | grep -E '"sph_neu_auf_auftraege"'
```
Expected: `sph_neu_auf_auftraege = 18` unverändert (additiv).

- [ ] **Step 5: Commit + Push**

```bash
git add supabase/migrations/*_cmm44_sph_catchup_backfill.sql
git commit -F - <<'EOF'
feat(CMM-44): SP-H PR3 — Catch-up-Backfill auftraege aus faelle

Idempotenter Re-UPDATE der 18 SP-H-Spalten auftraege<-faelle via
COALESCE(a.<col>, f.<col>). Fängt faelle-Writes aus dem Fenster
PR1-Backfill -> PR2-Writer-Deploy. Additiv, kein Drop. Migration
appliziert + repair-recorded.

Audit:
- Build: n/a (reine UPDATE-Migration, kein Code)
- UI: n/a
- Redundanz: COALESCE-Pattern analog SP-G PR3
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md §3 PR3
- Inkonsistenz: additiv; faelle behält die Daten bis Phase 6
- Regression: n/a (additiv, COALESCE schützt bestehende auftraege-Werte)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-sph-pr3-catchup-backfill
```

- [ ] **Step 6: PR öffnen NACH Review**

```bash
gh pr create --base staging --title "CMM-44 SP-H PR3 — Catch-up-Backfill (18 COALESCE-UPDATEs)" --body "Catch-up-Backfill auftraege<-faelle. Migration bereits appliziert + repair-recorded. Spec: docs/superpowers/specs/2026-05-20-cmm44-sph-auftrag-lc-design.md §3 PR3"
```

- [ ] **Step 7: Finaler Portal-Smoke**

Smoke-Script aus Task 5 erneut gegen `app.staging.claimondo.de` fahren. Protokoll `docs/20.05.2026/cmm44-sph-smoke-pr3.md`. Bei 0 Hard-Fails fertig.

---

## Task 7: Abschluss

- [ ] **Step 1: Phase-1-Mapping nachziehen**

`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` — Update-Block (analog SP-A2/A3/B/G):
```markdown
**Update 2026-05-XX:** SP-H erledigt — 18 Auftrag-LC-Spalten auf `auftraege` migriert.
18 ADD COLUMN, UPDATE-Backfill auf existierende auftraege-Rows (Option A, kein
INSERT). 1:N-Cardinality via `.order('reihenfolge desc').limit(1)` für aktuellen
Auftrag. PR1 #<n> / PR2 #<n> / PR3 #<n>. Spec/Plan:
`docs/superpowers/specs|plans/2026-05-20-cmm44-sph-auftrag-lc*.md`.
```
PR-Nummern nach Merge eintragen.

- [ ] **Step 2: Handoff-Doc schreiben**

`docs/20.05.2026/handoff-cmm44-sph-abschluss.md` — analog SP-G-Handoff: was erledigt, Verifikation, Lessons (SP-H-spezifisch — 1:N-Cardinality-Pattern, UPDATE-only Backfill, „aktueller Auftrag" via order+limit, NOT-NULL-Default-Spiegelung im ADD COLUMN), lose Enden, nächster CMM-44-Schritt.

- [ ] **Step 3: Memory aktualisieren (extern)**

`C:\Users\Aaron Sprafke\.claude\projects\C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2\memory\project_cmm44_sph_status.md` schreiben (Pattern wie `project_cmm44_spg_status.md`). MEMORY.md-Pointer ergänzen.

- [ ] **Step 4: Commit**

```bash
git add docs/   # NUR docs/ — Memory liegt außerhalb des Repos
git commit -m "docs(CMM-44): SP-H erledigt — Handoff + Phase-1-Mapping nachgezogen"
git push origin HEAD
gh pr create --base staging --title "CMM-44 SP-H Abschluss — Handoff + Phase-1-Mapping" --body "SP-H abgeschlossen — siehe docs/20.05.2026/handoff-cmm44-sph-abschluss.md. Nächster CMM-44-Schritt: SP-C / SP-G2 / SP-J (reduziert auf 8 Spalten nach SP-H)."
```

- [ ] **Step 5: Session-Abschluss-Checkliste (AGENTS.md Regel 3)**

```bash
git status                          # Working-Tree clean?
git stash list                      # Leer / alte dokumentierte Stashes?
git log --branches --not --remotes  # Alle lokalen Commits gepusht?
```

---

## Definition of Done

- [ ] PR1 gemergt; Verify: 18 neue Spalten auf `auftraege`; Backfill befüllte die existierenden auftraege-Rows (pre-launch: 1 Row).
- [ ] PR2 gemergt; kontext-sicherer Re-Grep = 0 live `from('faelle')`-Zugriffe + 0 `faelle(...)`-Nested-Selects der 18 Spalten.
- [ ] PR3 appliziert + recorded; idempotenter COALESCE-UPDATE.
- [ ] `npm run build` (8 GB heap) grün nach Type-Regen.
- [ ] 5-Portal-Smoke nach PR2 + PR3 ohne Hard-Fail; Screenshots ausgewertet.
- [ ] Phase-1-Mapping + Handoff-Doc + Memory nachgezogen.

---

## Selbst-Review (Plan vs. Spec)

- **Spec §1 Scope (18 Spalten, 4 Cluster, 1:1 Namens-Mapping)** — Task 1 Step 6 ADD-Block deckt exakt die 18 mit den dokumentierten Typen/Defaults; Task 4 Step 1 zeigt Read-Beispiele für SP-H-Spalten. ✅
- **Spec §1 Cluster-Aufteilung** — Plan-Header Referenz-Tabelle bildet das 1:1 ab. ✅
- **Spec §2 (1:N-Cardinality via fehlendem UNIQUE, Trigger-Liste leer/unklar)** — Task 1 Step 5 prüft Trigger-Body live; Migration-UPDATE nutzt `WHERE a.claim_id = f.claim_id` ohne 1:N-Risiko (pre-launch 1 Row pro Claim, dokumentiert als zukünftige Anpassung wenn N>1). ✅
- **Spec §3 PR1 (ADD + UPDATE-Backfill + View-Repoint konditional)** — Task 1 + 2 vollständig; Block 3 ist konditional. ✅
- **Spec §3 PR2 (Reader/Writer-Sweep, Pattern A-F)** — Task 3 (Inventur paren-balanced) + Task 4 (Transform mit konkreten Code-Beispielen für Pattern A/B/C). Pattern D/E/F-Erläuterung im Plan-Header. ✅
- **Spec §3 PR3 (idempotenter Catch-up COALESCE)** — Task 6 mit kompletten SQL. ✅
- **Spec §4 (Migrations-Vorgehen)** — `BEGIN/COMMIT`, Dry-Run, `db query --linked` + `repair`, kein `db push`: Task 1 Step 7, Task 2 Step 2, Task 6 Step 3/4. ✅
- **Spec §5 (5-Portal-Smoke, Erfolgskriterien)** — Task 5 + Task 6 Step 7; `git grep` 0 in Task 4 Step 3 + Definition of Done. ✅
- **Spec §6 Risiken** — alle in Plan-Tasks adressiert: 1:N-Cardinality (Task 1 Step 6 dokumentiert), Writer ohne aktuellen Auftrag (Task 4 Step 1 Pattern C warn-skip), Array-Normalisierung (Plan-Header Regelwerk + Task 4 Step 1 Pattern B), Re-Grep (Task 3 + Task 4 Step 3), View-Repoint LATERAL (Task 1 Step 6 Block 3-Skeleton + Step 4 Defaults-Live-Messung), Trigger-Audit (Task 1 Step 5). ✅
- **`feedback_kein_auto_merge` + `feedback_draft_pr_nicht_release_sicher`** (aktuelle Memory-Lessons) — alle PRs: Branch pushen → Review → erst dann `gh pr create`. Aaron mergt selbst. Vermerkt in Task 2 Step 7+8, Task 4 Step 5+6, Task 6 Step 5+6. ✅
- **Typ-Konsistenz im Plan** — Property-Namen konsistent (`sv_briefing_text`, `technische_stellungnahme_status`, `aktAuftrag` als Pattern-Variable etc.) zwischen Tasks. ✅
- **Plan-Header — Goal/Architecture/Tech Stack** vorhanden, Header-Block-Format korrekt. ✅
- **Keine Placeholders** — alle Tasks zeigen konkrete Code-Beispiele oder Inventur-Befunde. Block-3-Sektion ist explizit konditional („falls Audit Treffer fand"), kein Placeholder.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
