# CMM-44 SP-I2 — AS + Mandatsnummer → `kanzlei_faelle` + LexDrive-SV-Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) oder superpowers:executing-plans. Steps nutzen Checkbox-Syntax (`- [ ]`).

**Goal:** 11 Spalten (10 AS-Lifecycle + `mandatsnummer`) von `faelle` auf die 1:1-Sub-Table `kanzlei_faelle` umziehen (rein additiv), die rollen-differenzierte Anzeige lean halten, und dem SV ab Kanzlei-Phase `mandatsnummer` + den eingebetteten LexDrive-Vorgang zeigen.

**Architecture:** 4 PRs. PR1 = additive Migration (11× ADD auf `kanzlei_faelle` + Repoint von 3 Views, `unterschrift` via COALESCE→false). PR2 = Reader/Writer-Sweep über neuen `upsertKanzleiFall`/`peelKanzleiFaelleColumns`-Helper (erster Row-Creator von `kanzlei_faelle`, Create-Status `'versicherungskontakt'`), `filmcheck`-CLM-Write raus, Display-Label auf `claim_nummer`, lean Kunde-/SV-Anzeige. PR3 = `LexDriveMandatEmbed` (iframe + New-Tab-Fallback, ab Kanzlei-Phase). PR4 = Catch-up-Backfill. Backfill ist sonst **no-op** (cov=0 außer `unterschrift`-Default).

**Tech Stack:** Postgres 17 (Supabase `paizkjajbuxxksdoycev`), Supabase CLI (Migrations), Next.js 15 + TypeScript, Playwright (Smoke).

**Spec:** `docs/superpowers/specs/2026-05-23-cmm44-spi2-anschlussschreiben-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** `.claude/worktrees/cmm44-spi2-anschlussschreiben`, Branch `kitta/cmm44-spi2-anschlussschreiben` (off `origin/staging`). Spec-Commits `d37315bd`/`ed64e5f2` liegen drauf. **Pro PR ein eigener Branch off `staging`** (bzw. Vorgänger-Branch bei Types-Abhängigkeit).
- **Harte Regeln (AGENTS.md):** Nie auf `main`. **DDL nur via supabase-CLI** (`db query --linked` + `migration repair`), **nie** Management-API/MCP `apply_migration`. Kein unbegleiteter Stash.
- **DB-Apply (SP-A2/A3/B/G/H/I1):** Migration in `BEGIN/COMMIT`; Dry-Run `BEGIN; … ROLLBACK;`; Apply `npx supabase db query --linked --file <sql>`; dann `npx supabase migration repair --status applied <ts>`. **Kein** `db push`.
- **Worktree-Link:** `.env.local` ist gitignored → im frischen Worktree **fehlt** es. Task 0 kopiert es aus dem Haupt-Tree (`C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2\.env.local`) + `supabase link`. Read-only-Checks dürfen über MCP `execute_sql` laufen, **Apply** nur CLI.
- **PR-Hygiene (`feedback_kein_auto_merge`):** Branch pushen → Reviews → erst dann `gh pr create --base staging`. **Aaron mergt selbst.**
- **Smoke:** gegen `app.staging.claimondo.de`, Screenshots im selben Turn (Memory `feedback_smoke_screenshot_pflicht`).
- **Sequencing:** PR1 jederzeit. PR2 nach PR1-`staging`-Merge (braucht regenerierte Types). PR3 nach PR2-`staging`-Merge. PR4 nach PR3-`main`-Release.
- **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build`. Types-Regen via PowerShell (kein Bash-`2>&1` — SP-G-Lesson).

---

## Referenz: Die 11 Spalten (1:1 Namens-Mapping)

Live gemessen 2026-05-23. Alle nullable. Verschiebung gleichnamig auf `kanzlei_faelle`.

| Spalte | Typ | Default | Hinweis |
|---|---|---|---|
| `anschlussschreiben_am` | timestamptz | — | Phase/SLA-Treiber |
| `anschlussschreiben_url` | text | — | |
| `anschlussschreiben_sendedatum` | date | — | |
| `anschlussschreiben_unterschrift` | boolean | `false` | View-COALESCE→false |
| `anschlussschreiben_ocr_am` | timestamptz | — | |
| `as_geforderte_summe` | numeric | — | |
| `as_frist` | date | — | |
| `as_vs_reaktion_text` | text | — | |
| `as_salesforce_id` | text | — | |
| `as_zuletzt_synced_am` | timestamptz | — | |
| `mandatsnummer` | text | — | Kanzlei/SF-ID |

`KANZLEI_FAELLE_COLS` (im Code, Task 3): exakt diese 11 Strings.

---

## Transform-Regelwerk (PR2)

Jeder `faelle`-seitige Zugriff fällt in eines dieser Muster. **Sub-Table ist 1:1 pro Claim** (`kanzlei_faelle.claim_id` UNIQUE) → Reader via `.eq('claim_id', x).maybeSingle()` bzw. Embed; Writer via `upsertKanzleiFall`.

| Muster | Erkennung | Transform |
|---|---|---|
| **A — Direkt-Select aus `faelle`, nur SP-I2-Spalten** | `from('faelle').select('id, claim_id, anschlussschreiben_am')` | Quelle wechseln: `from('kanzlei_faelle').select('anschlussschreiben_am').eq('claim_id', claimId).maybeSingle()`. Result `{ anschlussschreiben_am } \| null`. |
| **B — Direkt-Select aus `faelle`, gemischt** | `select('id, status, anschlussschreiben_am, …')` | SP-I2-Spalten in Nested-Embed: `select('id, status, claims:claim_id(kanzlei_faelle(anschlussschreiben_am, …))')`. **Array-Normalisierung Pflicht** an beiden Ebenen: `const c = Array.isArray(row.claims) ? row.claims[0] : row.claims; const kf = Array.isArray(c?.kanzlei_faelle) ? c.kanzlei_faelle[0] : c?.kanzlei_faelle`. |
| **C — Write auf `faelle` (SP-I2-col)** | `from('faelle').update({ anschlussschreiben_am: …, status: … })` | SP-I2-Werte **peelen** (`peelKanzleiFaelleColumns`), Non-SP-I2-Rest bleibt im faelle/claims-Write, SP-I2-Teil via `await upsertKanzleiFall(db, claimId, kfUpdate)`. **Kein Dual-Write.** Guarded mit Result-Check. |
| **D — Nested `faelle(...)`-Select** | `from('<x>').select('…, faelle(anschlussschreiben_am)')` | SP-I2-Spalte in `claims:claim_id(kanzlei_faelle(<col>))`-Block. Array-Normalisierung. |
| **E — View-Read** | Read aus `v_faelle_mit_aktuellem_termin`/`v_claim_full`/`faelle_sv_view` | PR1 hat die View repointet → **kein Code-Change**. |
| **F — TS-Typ / JSX / Property** | `interface`-Feld, `obj.<col>`, JSX | Kein Change (gleicher Spaltenname), außer Reader liest jetzt aus kf-Embed (dann Property-Pfad anpassen). |
| **L — Display-Label** | `mandatsnummer ?? claim_nummer ?? id` | → `claim_nummer ?? id` als **primäres** Label; `mandatsnummer` zusätzlich als Sekundär-Detail rendern (nicht entfernen). Sites: `api/search/route.ts`, `admin/faelle/(hub)/page.tsx` + `FaelleKanban.tsx`, `kanzlei/*` Kanban, PDF `kanzlei-paket`. |

**Sonderfall `filmcheck.ts`:** den CLM-YYYY-Generierungs-Block (Zeilen ~29–44) **+** den `.update({ mandatsnummer })` (Zeile ~50) **ersatzlos entfernen** — `claim_nummer` ist die kanonische Fallnummer (Spec §8.2). Der Rest von `saveFilmcheck` (auftraege-Write, Status-Transition, Mails) bleibt.

**Verify-Endzustand PR2:** paren-balanced Re-Grep (`scripts/cmm44-spi2-grep.mjs`) = 0 live `from('faelle')`-Selects/Updates + 0 nested `faelle(...)`-Selects der 11 Spalten. Build grün.

---

## File Structure

**Neu:**
- `scripts/cmm44-spi2-measure.sql`, `cmm44-spi2-verify.sql`, `cmm44-spi2-grep.mjs`, `smoke-cmm44-spi2.mjs`
- `supabase/migrations/<ts>_cmm44_spi2_add_kanzlei_faelle_columns.sql` (PR1), `<ts>_cmm44_spi2_catchup_backfill.sql` (PR4)
- `src/lib/kanzlei-fall/upsert-kanzlei-fall.ts` (Helper: `KANZLEI_FAELLE_COLS`, `peelKanzleiFaelleColumns`, `upsertKanzleiFall`)
- `src/components/gutachter/LexDriveMandatEmbed.tsx` (PR3)
- `docs/23.05.2026/cmm44-spi2-{views-audit,inventory,smoke}.md`, `handoff-cmm44-spi2-abschluss.md`

**Modifiziert:** `src/lib/supabase/database.types.ts` (PR1); PR2-Sweep-Files (Inventur Task 3); `src/app/faelle/[id]/_actions/filmcheck.ts`; Kunde-Card + SV-Fallakte (lean Anzeige).

---

## Task 0: Worktree-Link + Live-Drift-Check

**Files:** Create `scripts/cmm44-spi2-measure.sql`.

- [ ] **Step 1: Link sicherstellen**

```bash
cd ".claude/worktrees/cmm44-spi2-anschlussschreiben"
test -f .env.local || cp "/c/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local" .env.local
npx supabase link --project-ref paizkjajbuxxksdoycev 2>&1 | tail -3
```
Expected: `.env.local` da; link „Finished"/„already linked". Falls Token-Prompt: `export $(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local) && npx supabase link --project-ref paizkjajbuxxksdoycev`.

- [ ] **Step 2: Mess-Query schreiben** — `scripts/cmm44-spi2-measure.sql`:

```sql
-- CMM-44 SP-I2 — Existenz/Typ auf faelle + ob schon auf kanzlei_faelle + Coverage
SELECT 'faelle' AS tbl, column_name, data_type, is_nullable, COALESCE(column_default,'') AS dflt
FROM information_schema.columns
WHERE table_schema='public' AND table_name='faelle' AND column_name = ANY(ARRAY[
  'anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum',
  'anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe',
  'as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer'])
UNION ALL
SELECT 'kanzlei_faelle', column_name, data_type, is_nullable, COALESCE(column_default,'')
FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle' AND column_name = ANY(ARRAY[
  'anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum',
  'anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe',
  'as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer'])
ORDER BY tbl, column_name;
SELECT count(*) AS kf_rows FROM public.kanzlei_faelle;
```

- [ ] **Step 3: Messung fahren**

```bash
npx supabase db query --linked --file scripts/cmm44-spi2-measure.sql 2>&1 | tail -30
```
Expected: 11 `faelle`-Zeilen (Typen wie Referenztabelle; `anschlussschreiben_unterschrift` default `false`); `kanzlei_faelle`-Block **leer**; `kf_rows=0`. Bei Drift (Spalte schon auf kanzlei_faelle / kf_rows>0) → Migration anpassen bzw. STOP+melden.

- [ ] **Step 4: Kein Commit** (Script wird in Task 1 mitcommittet).

---

## Task 1: PR1 — Migration (11 ADD + 3 View-Repoints) + Dry-Run + Commit (nicht appliziert)

**Branch:** `kitta/cmm44-spi2-pr1-add` frisch von `kitta/cmm44-spi2-anschlussschreiben` (nimmt Spec-Commits mit).

**Files:** Create `scripts/cmm44-spi2-verify.sql`, `docs/23.05.2026/cmm44-spi2-views-audit.md`, `supabase/migrations/<ts>_cmm44_spi2_add_kanzlei_faelle_columns.sql`.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git checkout -b kitta/cmm44-spi2-pr1-add kitta/cmm44-spi2-anschlussschreiben
```

- [ ] **Step 2: Verify-Query** — `scripts/cmm44-spi2-verify.sql`:

```sql
-- Vor Apply: 0. Nach Apply: 11.
SELECT count(*) AS spi2_neu_auf_kanzlei_faelle FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle' AND column_name = ANY(ARRAY[
  'anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum',
  'anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe',
  'as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer']);
-- Vor Apply: alle false. Nach Apply: alle true.
SELECT
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin',true) ~ 'kf\.anschlussschreiben_am' AS v_term_as,
  pg_get_viewdef('public.v_faelle_mit_aktuellem_termin',true) ~ 'kf\.mandatsnummer' AS v_term_mandat,
  pg_get_viewdef('public.v_claim_full',true) ~ 'kf\.anschlussschreiben_am' AS v_full_as,
  pg_get_viewdef('public.faelle_sv_view',true) ~ 'kf\.mandatsnummer' AS svview_mandat,
  pg_get_viewdef('public.faelle_sv_view',true) ~ 'kf\.lexdrive_case_id' AS svview_caseid;
```

- [ ] **Step 3: View-Audit + viewdefs sichern**

```bash
for V in v_faelle_mit_aktuellem_termin v_claim_full faelle_sv_view; do
  echo "=== $V ===" >> docs/23.05.2026/cmm44-spi2-views-audit.md
  echo "SELECT pg_get_viewdef('public.$V', true);" > /tmp/vd.sql
  npx supabase db query --linked --file /tmp/vd.sql 2>&1 | tail -200 >> docs/23.05.2026/cmm44-spi2-views-audit.md
done
```
Prüfen, **wie** jede View die 11 Spalten heute speist (`f.<col>`) und ob `mandatsnummer`/`lexdrive_case_id` in `faelle_sv_view` fehlen (sollen ergänzt werden).

- [ ] **Step 4: Migration generieren**

```bash
npx supabase migration new cmm44_spi2_add_kanzlei_faelle_columns
```

- [ ] **Step 5: Block 1 (ADD) schreiben** — in die Datei (in `BEGIN;`, **ohne** abschließendes `COMMIT;` — Views + COMMIT folgen):

```sql
-- CMM-44 SP-I2 PR1 — additiv (kein DROP). Nach Apply: migration repair --status applied <ts>.
-- Spec: docs/superpowers/specs/2026-05-23-cmm44-spi2-anschlussschreiben-design.md
BEGIN;

-- Block 1: 11 ADD COLUMN auf kanzlei_faelle (Typen exakt von faelle, Live-Messung Task 0)
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN anschlussschreiben_am timestamptz,
  ADD COLUMN anschlussschreiben_url text,
  ADD COLUMN anschlussschreiben_sendedatum date,
  ADD COLUMN anschlussschreiben_unterschrift boolean DEFAULT false,
  ADD COLUMN anschlussschreiben_ocr_am timestamptz,
  ADD COLUMN as_geforderte_summe numeric,
  ADD COLUMN as_frist date,
  ADD COLUMN as_vs_reaktion_text text,
  ADD COLUMN as_salesforce_id text,
  ADD COLUMN as_zuletzt_synced_am timestamptz,
  ADD COLUMN mandatsnummer text;

-- Block 2: Backfill = No-op (cov=0; unterschrift-Default via View-COALESCE). kanzlei_faelle bleibt leer.
```

- [ ] **Step 6: Block 3 (View-Repoints) server-seitig generieren** — pro View die DDL via `replace()` erzeugen (deterministisch, kein Hand-Transkript; SP-I1-Lesson):

```bash
# v_faelle_mit_aktuellem_termin: 11 Quellen f.->kf. + LEFT JOIN + COALESCE fuer unterschrift
cat > /tmp/spi2-gen-term.sql <<'SQL'
SELECT 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' ||
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true),
    'f.anschlussschreiben_unterschrift', 'COALESCE(kf.anschlussschreiben_unterschrift, false)'),
    'f.anschlussschreiben_am', 'kf.anschlussschreiben_am'),
    'f.anschlussschreiben_url', 'kf.anschlussschreiben_url'),
    'f.anschlussschreiben_sendedatum', 'kf.anschlussschreiben_sendedatum'),
    'f.anschlussschreiben_ocr_am', 'kf.anschlussschreiben_ocr_am'),
    'f.as_geforderte_summe', 'kf.as_geforderte_summe'),
    'f.as_frist', 'kf.as_frist'),
    'f.as_vs_reaktion_text', 'kf.as_vs_reaktion_text'),
    'f.as_salesforce_id', 'kf.as_salesforce_id'),
    'f.as_zuletzt_synced_am', 'kf.as_zuletzt_synced_am'),
    'f.mandatsnummer', 'kf.mandatsnummer'),
    'LEFT JOIN gutachten g ON g.claim_id = c.id',
    'LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id') AS ddl;
SQL
npx supabase db query --linked --file /tmp/spi2-gen-term.sql 2>&1 | tail -50
```
**Wichtig:** `anschlussschreiben_unterschrift` MUSS **vor** den anderen `anschlussschreiben_*`/`f.an…` ersetzt werden (längster Match zuerst) — Reihenfolge oben ist korrekt. Verifizieren, dass die `ddl` `COALESCE(kf.anschlussschreiben_unterschrift, false)` + 10× `kf.<col>` + den neuen Join enthält und `f.mandatsnummer` nicht mehr (außer in `kf.mandatsnummer`). Den `kf`-Join-Anker prüfen: existiert SP-I1 schon ein `LEFT JOIN kanzlei_faelle kf` (aus einem früheren Repoint)? Wenn ja, **nur** die Spalten-Replaces anwenden, den Join-Insert weglassen. (SP-I1 hat `kf` **nicht** eingeführt — SP-I1 betraf `lexdrive_*` über `f.` → kf war neu? **Live prüfen** mit `pg_get_viewdef ~ 'LEFT JOIN kanzlei_faelle kf'`; SP-I1 hat `kf` eingeführt → der Join existiert bereits! Dann Join-Insert-Replace **weglassen**, nur Spalten-Replaces.)

> **GENAU PRÜFEN:** SP-I1 hat `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id` bereits in `v_faelle_mit_aktuellem_termin` eingefügt (für `lexdrive_*`). Der `LEFT JOIN`-Replace oben würde ihn **verdoppeln**. Vor dem Generieren: `npx supabase db query --linked --file <(echo "SELECT (pg_get_viewdef('public.v_faelle_mit_aktuellem_termin',true) ~ 'LEFT JOIN kanzlei_faelle kf') AS has_kf;")`. Ist `has_kf=true` → den letzten `replace(...)` (Join-Insert) **entfernen**, nur die 11 Spalten-Replaces behalten.

```bash
# v_claim_full: nur anschlussschreiben_am f.->kf. (+ ggf. LEFT JOIN kanzlei_faelle falls dort noch keiner)
cat > /tmp/spi2-gen-full.sql <<'SQL'
SELECT 'CREATE OR REPLACE VIEW public.v_claim_full AS ' ||
  replace(pg_get_viewdef('public.v_claim_full', true),
          'f.anschlussschreiben_am', 'kf.anschlussschreiben_am') AS ddl;
SQL
npx supabase db query --linked --file /tmp/spi2-gen-full.sql 2>&1 | tail -50
```
`v_claim_full` braucht einen `kanzlei_faelle kf`-Join falls keiner da ist — Audit (Step 3) zeigt die FROM-Struktur; den Join analog `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = <claims-alias>.id` ergänzen (Alias aus dem viewdef ablesen).

```bash
# faelle_sv_view: mandatsnummer + lexdrive_case_id ERGAENZEN (am Ende der SELECT-Liste, vor FROM) + kf-Join.
# Da additive Spalten -> CREATE OR REPLACE erlaubt das Anhaengen am Ende. Manuell aus dem Audit-viewdef:
#   SELECT <bestehend>, kf.mandatsnummer, kf.lexdrive_case_id FROM ... LEFT JOIN kanzlei_faelle kf ON kf.claim_id = <claim-alias>.id
```
`faelle_sv_view`: die Audit-viewdef (Step 3) nehmen, `kf.mandatsnummer` + `kf.lexdrive_case_id` an die SELECT-Liste **anhängen** (neue Spalten ans Ende — CREATE OR REPLACE erlaubt nur Append), `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = <alias>.id` ergänzen. Falls `faelle_sv_view` keinen `claims`-Join hat (nur faelle), via `kf.fall_id = f.id` joinen.

- [ ] **Step 7: Migration zusammensetzen** — die 3 generierten `CREATE OR REPLACE VIEW …;` an Block 1/2 anhängen, dann `COMMIT;`:

```bash
MIG=$(ls supabase/migrations/*_cmm44_spi2_add_kanzlei_faelle_columns.sql | tail -1)
printf '\n-- Block 3: View-Repoints (generiert Step 6)\n' >> "$MIG"
cat /tmp/spi2-view-term.sql /tmp/spi2-view-full.sql /tmp/spi2-view-svview.sql >> "$MIG"   # die bereinigten DDLs
printf '\nCOMMIT;\n' >> "$MIG"
grep -cE '^BEGIN;|^COMMIT;' "$MIG"   # erwartet 2
```
(Die generierten `ddl`-Strings aus Step 6 jeweils nach `/tmp/spi2-view-*.sql` kopieren, je ein `;` am Ende.)

- [ ] **Step 8: Dry-Run**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spi2_add_kanzlei_faelle_columns.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/spi2-pr1-dryrun.sql
npx supabase db query --linked --file /tmp/spi2-pr1-dryrun.sql 2>&1 | tail -15
```
Expected: kein Fehler. Fehlerklassen: `column already exists` (Drift → ADD streichen); `cannot change name/type of view column` (Spalten-Reihenfolge/Typ verändert → nur die 11 Quellen + Append ändern, sonst nichts); doppelter `kf`-Join (→ Join-Insert entfernen, s. Step 6).

- [ ] **Step 9: Commit (nicht appliziert)**

```bash
git add scripts/cmm44-spi2-measure.sql scripts/cmm44-spi2-verify.sql docs/23.05.2026/cmm44-spi2-views-audit.md supabase/migrations/*_cmm44_spi2_add_kanzlei_faelle_columns.sql
git commit -F - <<'EOF'
chore(CMM-44): SP-I2 PR1 — 11 ADD + 3 View-Repoints (vor Apply)

11 ADD COLUMN auf kanzlei_faelle (AS-LC + mandatsnummer) + CREATE OR REPLACE
VIEW v_faelle_mit_aktuellem_termin/v_claim_full/faelle_sv_view (Quellen
f.->kf., unterschrift via COALESCE->false, faelle_sv_view +mandatsnummer/
lexdrive_case_id). Backfill no-op (cov=0). Dry-Run gruen.

Audit:
- Build: n/a (SQL + Audit-Doc)
- UI: n/a
- Redundanz: View-DDL server-seitig generiert (SP-I1-Muster)
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-23-cmm44-spi2-anschlussschreiben-design.md
- Inkonsistenz: Typen live gemessen; unterschrift-COALESCE
- Regression: n/a (additiv, nicht appliziert)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: PR1 — Apply + Verify + Types + Build + Push

- [ ] **Step 1: Drift-Recheck** — `npx supabase db query --linked --file scripts/cmm44-spi2-measure.sql 2>&1 | tail -30` → kanzlei_faelle-Block weiterhin leer.
- [ ] **Step 2: Apply + repair**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spi2_add_kanzlei_faelle_columns.sql | tail -1); TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -10
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
```

- [ ] **Step 3: Verify** — `npx supabase db query --linked --file scripts/cmm44-spi2-verify.sql 2>&1 | tail -15` → `spi2_neu_auf_kanzlei_faelle=11`; alle 5 View-Booleans `true`.
- [ ] **Step 4: View-Runtime-Smoke**

```bash
echo "SELECT count(*) AS n, count(*) FILTER (WHERE anschlussschreiben_am IS NOT NULL) AS as_am, count(*) FILTER (WHERE mandatsnummer IS NOT NULL) AS mandat FROM public.v_faelle_mit_aktuellem_termin;" > /tmp/vr.sql
npx supabase db query --linked --file /tmp/vr.sql 2>&1 | tail -5
```
Expected: läuft fehlerfrei; `as_am=0` (kf leer), `mandat=0` (kf leer — die 12 mandatsnummer sind noch auf faelle, nicht migriert; PR2 migriert sie via Catch-up nicht — sie werden beim ersten Writer-Hit angelegt). **Hinweis:** Da `mandatsnummer` cov=12 auf faelle hat, aber kf leer → die View zeigt jetzt `mandatsnummer=NULL` für diese 12 (Quelle gewechselt auf leeres kf). Das ist der **bewusste** Stand bis PR4-Catch-up (s. Task 9) bzw. bis der nächste Writer die kf-Row anlegt. **Akzeptiert** (cov-Verlust temporär; Display fällt auf `claim_nummer` zurück — Label-Change PR2).

> **Achtung mandatsnummer cov=12:** anders als die anderen 10 (cov=0) hat `mandatsnummer` echte Daten. Der View-Repoint macht sie sofort NULL-sichtbar. **Migration der 12 Werte gehört in PR1-Block-2** (nicht no-op für mandatsnummer!). → **Korrektur:** Block 2 doch nutzen für `mandatsnummer` (s. Task 1 Nachtrag unten).

- [ ] **Step 5: Types-Regen** (PowerShell)

```bash
powershell -Command "& { npx supabase gen types typescript --linked 2>\$null | Out-File -Encoding utf8 src/lib/supabase/database.types.ts }" 2>&1 | tail -3
head -1 src/lib/supabase/database.types.ts; tail -1 src/lib/supabase/database.types.ts
```

- [ ] **Step 6: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10` → exit 0.
- [ ] **Step 7: Commit + Push (KEIN PR)** — feat-Commit (7-Punkte-Audit), `git push -u origin kitta/cmm44-spi2-pr1-add`. PR erst nach Reviews.

> **GATE:** PR2 startet nach PR1-`staging`-Merge (braucht Types).

### Task 1 Nachtrag — `mandatsnummer`-Backfill in Block 2 (cov=12!)

`mandatsnummer` ist die **einzige** Spalte mit echten Daten (12 Rows). Damit der Repoint nicht 12 Werte „verliert", Block 2 der PR1-Migration um einen `mandatsnummer`-Backfill ergänzen, der die kf-Rows anlegt:

```sql
-- Block 2 (mandatsnummer cov=12): kanzlei_faelle-Row je betroffenem Fall anlegen.
-- Sync-Trigger fuellt fall_id; status Pflichtwert.
INSERT INTO public.kanzlei_faelle (claim_id, status, mandatsnummer)
SELECT f.claim_id, 'versicherungskontakt', f.mandatsnummer
FROM public.faelle f
WHERE f.mandatsnummer IS NOT NULL AND f.claim_id IS NOT NULL
ON CONFLICT (claim_id) DO UPDATE SET
  mandatsnummer = COALESCE(public.kanzlei_faelle.mandatsnummer, EXCLUDED.mandatsnummer);
```
(Die 10 AS-Spalten bleiben cov=0 → kein Backfill. Nur `mandatsnummer`.) Verify nach Apply: `SELECT count(*) FROM kanzlei_faelle WHERE mandatsnummer IS NOT NULL;` → 12; und die View zeigt `mandat=12` wieder.

---

## Task 3: PR2 — `upsertKanzleiFall`-Helper + Call-Site-Inventur

**Branch:** `kitta/cmm44-spi2-pr2-sweep` frisch von `origin/staging` (nach PR1-Merge).

**Files:** Create `src/lib/kanzlei-fall/upsert-kanzlei-fall.ts`, `scripts/cmm44-spi2-grep.mjs`, `docs/23.05.2026/cmm44-spi2-inventory.md`.

- [ ] **Step 1: Branch** — `git fetch origin && git checkout -b kitta/cmm44-spi2-pr2-sweep origin/staging`.

- [ ] **Step 2: Helper schreiben** — `src/lib/kanzlei-fall/upsert-kanzlei-fall.ts`:

```typescript
// CMM-44 SP-I2: erster Row-Creator + Writer-Helper fuer kanzlei_faelle (1:1 pro Claim).
import type { SupabaseClient } from '@supabase/supabase-js'

/** Die 11 SP-I2-Spalten, die auf kanzlei_faelle leben. */
export const KANZLEI_FAELLE_COLS = [
  'anschlussschreiben_am', 'anschlussschreiben_url', 'anschlussschreiben_sendedatum',
  'anschlussschreiben_unterschrift', 'anschlussschreiben_ocr_am', 'as_geforderte_summe',
  'as_frist', 'as_vs_reaktion_text', 'as_salesforce_id', 'as_zuletzt_synced_am', 'mandatsnummer',
] as const

/** Trennt ein faelle-Update in {rest, kfUpdate}: die SP-I2-Spalten gehen auf kanzlei_faelle. */
export function peelKanzleiFaelleColumns(
  update: Record<string, unknown>,
): { rest: Record<string, unknown>; kfUpdate: Record<string, unknown> } {
  const rest: Record<string, unknown> = {}
  const kfUpdate: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(update)) {
    if ((KANZLEI_FAELLE_COLS as readonly string[]).includes(k)) kfUpdate[k] = v
    else rest[k] = v
  }
  return { rest, kfUpdate }
}

/** create-or-update der kanzlei_faelle-Row eines Claims. status='versicherungskontakt' beim Anlegen
 *  (UPDATE laesst status unangetastet). Sync-Trigger leitet fall_id ab. Nicht-fatal. */
export async function upsertKanzleiFall(
  db: SupabaseClient,
  claimId: string | null,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) {
    console.warn(`[CMM-44 SP-I2] kein claim_id — ${Object.keys(fields).join(',')} skip`)
    return { ok: false, error: 'no_claim_id' }
  }
  if (Object.keys(fields).length === 0) return { ok: true }
  const { data: existing } = await db.from('kanzlei_faelle').select('id').eq('claim_id', claimId).maybeSingle()
  if (existing?.id) {
    const { error } = await db.from('kanzlei_faelle').update(fields).eq('id', existing.id)
    if (error) { console.error('[CMM-44 SP-I2] kanzlei_faelle update:', error.message); return { ok: false, error: error.message } }
  } else {
    const { error } = await db.from('kanzlei_faelle').insert({ claim_id: claimId, status: 'versicherungskontakt', ...fields })
    if (error) { console.error('[CMM-44 SP-I2] kanzlei_faelle insert:', error.message); return { ok: false, error: error.message } }
  }
  return { ok: true }
}
```

- [ ] **Step 3: Re-Grep-Skript** — `scripts/cmm44-spi2-grep.mjs` (analog `cmm44-sph-grep.mjs`, COLS = die 11; strippt `claims:claim_id(...)`- und `kanzlei_faelle(...)`-Sub-Embeds):

```javascript
#!/usr/bin/env node
// CMM-44 SP-I2 — paren-balanced Re-Grep der 11 Spalten in src/.
import fs from 'node:fs'; import path from 'node:path'
const COLS = ['anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum','anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe','as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer']
function walk(d, o = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (['node_modules','.next','.claude'].includes(e.name)) continue; walk(p, o) } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) o.push(p) } return o }
function strip(s) { let prev = ''; while (prev !== s) { prev = s; s = s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, ''); s = s.replace(/\bkanzlei_faelle\s*\(([^()]|\([^()]*\))*\)/g, '') } return s }
const fromRe = /\.from\(['"]faelle['"]\)/g, nestedRe = /\bfaelle\s*\(/g, hits = []
for (const f of walk('src')) { const s = fs.readFileSync(f, 'utf8'); let m
  fromRe.lastIndex = 0; while ((m = fromRe.exec(s))) { const w = strip(s.slice(m.index, m.index + 1800)); for (const c of COLS) if (new RegExp(`\\b${c}\\b`).test(w)) { hits.push(`${f}:${s.slice(0,m.index).split('\n').length} | ${c} | from('faelle')`); break } }
  nestedRe.lastIndex = 0; while ((m = nestedRe.exec(s))) { const st = m.index + m[0].length; let d = 1, e = st; while (e < s.length && d > 0) { if (s[e] === '(') d++; else if (s[e] === ')') d--; e++ } const w = strip(s.slice(st, e - 1)); for (const c of COLS) if (new RegExp(`\\b${c}\\b`).test(w)) { hits.push(`${f}:${s.slice(0,m.index).split('\n').length} | ${c} | nested faelle(...)`); break } } }
console.log(hits.join('\n')); console.log(`\nTOTAL HITS: ${hits.length}`)
```

- [ ] **Step 4: Inventur fahren + dokumentieren**

```bash
node scripts/cmm44-spi2-grep.mjs > /tmp/spi2-hits.txt
tail -1 /tmp/spi2-hits.txt
grep -oE '\| [a-z_]+ \|' /tmp/spi2-hits.txt | sort | uniq -c | sort -rn
sed -E 's/:[0-9]+ \|.*//' /tmp/spi2-hits.txt | sort | uniq -c | sort -rn | head -30
```
`docs/23.05.2026/cmm44-spi2-inventory.md`: pro Site → Pattern (A–F/L), pro-Spalte-Zähler, Out-of-Scope-Liste (Tests/seed/`create-test-fall`). Falls >40 Sites → PR2 in 2a (Writer + filmcheck + Label) / 2b (Reader + Anzeige) splitten. Commit Helper + Grep + Inventory.

---

## Task 4: PR2a — Writer-Sweep + filmcheck + Label + Build + Push

**Files:** alle Inventur-Writer (Pattern C) + `filmcheck.ts` + Label-Sites (Pattern L).

- [ ] **Step 1: Writer umstellen (Pattern C)** — pro Writer peelen + upserten. Beispiel `state-machine.ts` (setzt `anschlussschreiben_am`):

```typescript
// VORHER:  update.anschlussschreiben_am = now   (im faelle-update-Objekt)
// NACHHER (claimId ist im Scope der state-machine vorhanden):
import { peelKanzleiFaelleColumns, upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
// ... nach Aufbau des `update`-Objekts, vor dem faelle-Write:
const { rest, kfUpdate } = peelKanzleiFaelleColumns(update)
if (Object.keys(kfUpdate).length > 0) await upsertKanzleiFall(db, claimId, kfUpdate)
// dann: db.from('faelle').update(rest).eq('id', fallId)   (rest statt update)
```

Beispiel `process-event.ts` (`computeFieldUpdates` liefert `anschlussschreiben_am` bzw. `mandatsnummer`+`as_salesforce_id`): im Apply-Block analog zu den bestehenden SP-H/SP-D/SP-J-Peels einen `peelKanzleiFaelleColumns(fuFaelle)` ergänzen und `await upsertKanzleiFall(db, claimIdForUpdates, kfUpdate)` nach den faelle/claims-Writes aufrufen. Beispiel `push-mandat.ts:226` (`mandatsnummer`): statt `db.from('faelle').update({ mandatsnummer })` → `await upsertKanzleiFall(db, fall.claim_id, { mandatsnummer: kanzleiMandatId })` + separater `updated_at`-Touch auf faelle falls nötig. `AnschlussschreibenUploadBlock`-Action (`url`/`sendedatum`/`unterschrift`/`ocr_am`): peel → upsert.

- [ ] **Step 2: `filmcheck.ts` CLM-Write entfernen** — in `src/app/faelle/[id]/_actions/filmcheck.ts` `saveFilmcheck`:

```typescript
// ENTFERNEN: Zeilen ~29-44 (year/maxRow-Query/nextNum/mandatsnummer-Generierung)
// ENTFERNEN: den .update({ mandatsnummer }) — stattdessen nur claim_id laden:
const { data: fallClaimRow, error } = await supabase
  .from('faelle').select('claim_id').eq('id', fallId).single()
if (error) return { success: false, error: error.message }
// (Rest unveraendert: auftraege-Write, transitionFallStatus, Mails, Tasks)
```
Begründung-Kommentar setzen: `// CMM-44 SP-I2: mandatsnummer-Generierung entfernt — claim_nummer ist die kanonische Fallnummer.`

- [ ] **Step 3: Display-Label (Pattern L)** — in `api/search/route.ts`, `admin/faelle/(hub)/page.tsx` + `FaelleKanban.tsx`, `kanzlei/*`-Kanban, `lib/pdf/kanzlei-paket.tsx`: primäres Label `claim_nummer ?? id` (statt `mandatsnummer ?? claim_nummer ?? id`); wo `mandatsnummer` zusätzlich relevant ist (Kanzlei-Kontext), als sekundäres Feld behalten. Beispiel:

```typescript
// VORHER: const label = fall.mandatsnummer ?? fall.claim_nummer ?? fall.id.slice(0, 8)
// NACHHER: const label = fall.claim_nummer ?? fall.id.slice(0, 8)
//          (mandatsnummer separat anzeigen, wo Kanzlei-Kontext: <span>{fall.mandatsnummer}</span>)
```

- [ ] **Step 4: Typecheck + Re-Grep (Writer-Teil)** — `npx tsc --noEmit`; `node scripts/cmm44-spi2-grep.mjs` → 0 `from('faelle').update(...)` der 11 Spalten.
- [ ] **Step 5: Build + Commit + Push** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build`; refactor-Commit (7-Punkte-Audit); push. Kein PR bis Reviews.

---

## Task 5: PR2b — Reader-Sweep + lean Anzeige + Build + Push

**Files:** alle Inventur-Reader (Pattern A/B/D) + Kunde-Card + SV-Fallakte-mandatsnummer.

- [ ] **Step 1: Reader umstellen (A/B/D)** — pro Site nach Regelwerk. Pattern-A-Beispiel (`cron/vs-timer` liest `anschlussschreiben_am`):

```typescript
// VORHER: from('faelle').select('fall_id, anschlussschreiben_am, ...').not('anschlussschreiben_am','is',null)
// NACHHER: aus kanzlei_faelle lesen (anschlussschreiben_am lebt dort), claim_id-Join:
//   from('kanzlei_faelle').select('claim_id, anschlussschreiben_am, faelle:fall_id(...)').not('anschlussschreiben_am','is',null)
// bzw. via v_faelle_mit_aktuellem_termin (Pattern E, kein Change) wenn die Site schon die View liest.
```
Pattern-B (gemischt, z.B. `get-kunde-faelle.ts`): `claims:claim_id(kanzlei_faelle(anschlussschreiben_am))` + Array-Normalisierung. **Reader, die schon `v_faelle_mit_aktuellem_termin`/`faelle_sv_view` lesen → Pattern E, kein Change.**

- [ ] **Step 2: Lean Kunde-Anzeige** — `src/components/kunde/FallStatusCard.tsx`: bestehende AS-Frist-Card bleibt; **eine** Zeile ergänzen (im `s === 'anschlussschreiben'`-Block):

```tsx
<p className="text-xs text-claimondo-ondo mt-1">Die Kanzlei meldet sich bei dir per WhatsApp.</p>
```
`anschlussschreiben_am` kommt in `StatusFall` weiterhin via die kunde-Loader (Pattern A/B oben umgestellt). **Keine** mandatsnummer/PDF/Beträge für Kunde.

- [ ] **Step 3: SV-mandatsnummer (ab Kanzlei-Phase)** — in der SV-Fallakte (`gutachter/fall/[id]/page.tsx` liest `faelle_sv_view`, das nun `mandatsnummer`+`lexdrive_case_id` führt): eine read-only Zeile rendern, **nur** wenn `mandatsnummer` gesetzt (= ab Kanzlei-Phase):

```tsx
{fall.mandatsnummer && (
  <div className="rounded-ios-xl bg-claimondo-bg px-4 py-3">
    <p className="text-xs text-claimondo-ondo">Kanzlei-Mandat</p>
    <p className="text-sm font-semibold text-claimondo-navy">{fall.mandatsnummer}</p>
  </div>
)}
```
(Embed-Komponente folgt PR3.)

- [ ] **Step 4: Typecheck + Re-Grep + Build** — `npx tsc --noEmit`; `node scripts/cmm44-spi2-grep.mjs` → **0 Hits**; `npm run build` (8 GB) grün.
- [ ] **Step 5: Commit + Push** — refactor-Commit; push. Kein PR bis Reviews.

---

## Task 6: PR2 — Portal-Smoke (nach staging-Merge)

**Files:** Create `scripts/smoke-cmm44-spi2.mjs` (analog `smoke-cmm44-spi1.mjs`).

- [ ] **Step 1: Smoke-Script** — DB-Sanity (11 Spalten auf kanzlei_faelle; View liefert sie) + Portale: SV `/gutachter/fall/[id]` (mandatsnummer ab Kanzlei-Phase), Admin `/faelle/[id]` (AS-Sektion), Kunde `/kunde` + `/kunde/faelle/[id]` (Frist-Card + WA-Hinweis), Public `/`. Detektoren: 5xx/pageerror/console.
- [ ] **Step 2: Smoke fahren + Screenshots auswerten** — `node --env-file=.env.local scripts/smoke-cmm44-spi2.mjs`; Protokoll `docs/23.05.2026/cmm44-spi2-smoke.md`. Screenshots im selben Turn prüfen (Frist-Card zeigt WA-Hinweis; Admin-AS rendert; SV zeigt mandatsnummer nur bei Kanzlei-Fällen).
- [ ] **Step 3: Commit Smoke-Protokoll + push.**

> **GATE:** PR3 startet nach PR2-`staging`-Merge.

---

## Task 7: PR3 — LexDrive-SV-Embed (Spike + Komponente)

**Branch:** `kitta/cmm44-spi2-pr3-embed` von `origin/staging`.

**Files:** Create `src/components/gutachter/LexDriveMandatEmbed.tsx`; Modify SV-Fallakte (`gutachter/fall/[id]/page.tsx` Mount).

- [ ] **Step 1: Embed-Spike (manuell, dokumentiert)** — mit echtem LexDrive-SV-Login auf `app.staging.claimondo.de`: (a) lädt `aktendetailansicht?recordId=…` im iframe (kein frame-ancestors-Block)? (b) bleibt der SV nach Login eingeloggt (3rd-party-cookie, Chrome+Safari)? (c) hilft First-Party-Login-Tab + `document.requestStorageAccess()`? Ergebnis → `docs/23.05.2026/cmm44-spi2-embed-spike.md`. **Default-Darstellung** danach: iframe-inline wenn stabil, sonst „im Tab öffnen" primär.

- [ ] **Step 2: Komponente** — `src/components/gutachter/LexDriveMandatEmbed.tsx`:

```tsx
'use client'
import { getLexdriveDeepLink, getLexdriveLoginUrl } from '@/lib/kanzlei/lexdrive-link'

export function LexDriveMandatEmbed({ caseId, mandatsnummer }: { caseId: string | null; mandatsnummer: string | null }) {
  const deepLink = getLexdriveDeepLink(caseId)
  if (!caseId || !deepLink) return null   // nur ab Kanzlei-Phase (lexdrive_case_id gesetzt)
  return (
    <div className="rounded-ios-xl border border-claimondo-border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-claimondo-border">
        <div>
          <p className="text-xs text-claimondo-ondo">Mandat bei der Kanzlei (LexDrive)</p>
          {mandatsnummer && <p className="text-sm font-semibold text-claimondo-navy">{mandatsnummer}</p>}
        </div>
        <a href={deepLink} target="_blank" rel="noopener noreferrer"
           className="text-sm font-medium text-claimondo-ondo hover:underline">In LexDrive öffnen ↗</a>
      </div>
      {/* iframe nur wenn Spike (Step 1) Session-stabil zeigt; sonst diesen Block weglassen + Hinweis darunter */}
      <iframe src={deepLink} title="LexDrive-Mandat" className="w-full h-[600px] border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups" />
      <p className="px-4 py-2 text-xs text-claimondo-ondo/70">
        Melde dich mit deinem LexDrive-Zugang an. Falls die Ansicht leer bleibt, nutze „In LexDrive öffnen".
      </p>
    </div>
  )
}
```
Token-Audit: keine Inline-Hex (nur claimondo-Klassen). Falls Spike „instabil" → iframe-Block entfernen, nur Header + Deep-Link-Button behalten.

- [ ] **Step 3: Mount in SV-Fallakte** — in `gutachter/fall/[id]/page.tsx` die Komponente rendern (caseId = `fall.lexdrive_case_id`, mandatsnummer = `fall.mandatsnummer`), in der bestehenden Kanzlei/Mandat-Sektion bzw. wo `lexdriveCaseId` schon verarbeitet wird (Zeile ~508/631).
- [ ] **Step 4: Build + Commit + Push** — `npm run build` (8 GB); feat-Commit; push. Kein PR bis Reviews.
- [ ] **Step 5: Smoke** — SV-Fallseite eines Kanzlei-Falls: Embed/Deep-Link rendert, kein 5xx/Hydration-Fehler, Token-Audit grün (`npm run check:token-audit`). Screenshot auswerten. → `docs/23.05.2026/cmm44-spi2-embed-smoke.md`.

---

## Task 8: PR4 — Catch-up-Backfill

**Branch:** `kitta/cmm44-spi2-pr4-catchup` von `origin/staging` (nach PR3-`main`-Release; Content-GATE: `git diff origin/main origin/staging -- src/ supabase/migrations/ | head`).

**Files:** Create `supabase/migrations/<ts>_cmm44_spi2_catchup_backfill.sql`.

- [ ] **Step 1: Migration** — idempotenter Upsert für faelle-Werte aus dem Fenster PR1-Apply→PR2-Writer-Deploy (realistisch fast leer, da cov=0 außer mandatsnummer das in PR1 schon migriert wurde):

```sql
BEGIN;
INSERT INTO public.kanzlei_faelle (claim_id, status, anschlussschreiben_am, anschlussschreiben_url,
  anschlussschreiben_sendedatum, anschlussschreiben_unterschrift, anschlussschreiben_ocr_am,
  as_geforderte_summe, as_frist, as_vs_reaktion_text, as_salesforce_id, as_zuletzt_synced_am, mandatsnummer)
SELECT f.claim_id, 'versicherungskontakt', f.anschlussschreiben_am, f.anschlussschreiben_url,
  f.anschlussschreiben_sendedatum, f.anschlussschreiben_unterschrift, f.anschlussschreiben_ocr_am,
  f.as_geforderte_summe, f.as_frist, f.as_vs_reaktion_text, f.as_salesforce_id, f.as_zuletzt_synced_am, f.mandatsnummer
FROM public.faelle f
WHERE f.claim_id IS NOT NULL AND (
  f.anschlussschreiben_am IS NOT NULL OR f.anschlussschreiben_url IS NOT NULL OR f.anschlussschreiben_sendedatum IS NOT NULL
  OR f.anschlussschreiben_ocr_am IS NOT NULL OR f.as_geforderte_summe IS NOT NULL OR f.as_frist IS NOT NULL
  OR f.as_vs_reaktion_text IS NOT NULL OR f.as_salesforce_id IS NOT NULL OR f.as_zuletzt_synced_am IS NOT NULL
  OR f.mandatsnummer IS NOT NULL)
ON CONFLICT (claim_id) DO UPDATE SET
  anschlussschreiben_am = COALESCE(public.kanzlei_faelle.anschlussschreiben_am, EXCLUDED.anschlussschreiben_am),
  anschlussschreiben_url = COALESCE(public.kanzlei_faelle.anschlussschreiben_url, EXCLUDED.anschlussschreiben_url),
  anschlussschreiben_sendedatum = COALESCE(public.kanzlei_faelle.anschlussschreiben_sendedatum, EXCLUDED.anschlussschreiben_sendedatum),
  anschlussschreiben_ocr_am = COALESCE(public.kanzlei_faelle.anschlussschreiben_ocr_am, EXCLUDED.anschlussschreiben_ocr_am),
  as_geforderte_summe = COALESCE(public.kanzlei_faelle.as_geforderte_summe, EXCLUDED.as_geforderte_summe),
  as_frist = COALESCE(public.kanzlei_faelle.as_frist, EXCLUDED.as_frist),
  as_vs_reaktion_text = COALESCE(public.kanzlei_faelle.as_vs_reaktion_text, EXCLUDED.as_vs_reaktion_text),
  as_salesforce_id = COALESCE(public.kanzlei_faelle.as_salesforce_id, EXCLUDED.as_salesforce_id),
  as_zuletzt_synced_am = COALESCE(public.kanzlei_faelle.as_zuletzt_synced_am, EXCLUDED.as_zuletzt_synced_am),
  mandatsnummer = COALESCE(public.kanzlei_faelle.mandatsnummer, EXCLUDED.mandatsnummer);
COMMIT;
```
(`anschlussschreiben_unterschrift` bewusst NICHT im Catch-up — Default-false-only, kein Signal; View-COALESCE deckt es.)

- [ ] **Step 2: Dry-Run + Apply + repair + Verify** (Muster Task 2). Commit + Push. PR nach Review.

---

## Task 9: Abschluss

- [ ] **Step 1: Phase-1-Mapping** — `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` Update-Block (analog SP-I1): SP-I2 erledigt, 11 Spalten, PR-Nummern, Hinweis mandatsnummer=SF-ID + filmcheck-CLM entfernt + Embed.
- [ ] **Step 2: Handoff** — `docs/23.05.2026/handoff-cmm44-spi2-abschluss.md`: erledigt, Verifikation, Lessons (1:1-upsert-Create-Pattern + status-Default, mandatsnummer-cov12-Backfill in PR1, COALESCE-unterschrift, Embed-Spike-Ergebnis, Label=beides), nächster SP-I-Schritt (Regulierung/VS-Cluster).
- [ ] **Step 3: Memory** — `project_cmm44_spi2_status.md` + MEMORY.md-Pointer (extern).
- [ ] **Step 4: Commit Docs + Session-Abschluss-Checkliste** (`git status` / `git stash list` / `git log --branches --not --remotes`).

---

## Definition of Done

- [ ] 11 Spalten additiv auf `kanzlei_faelle` (Verify=11); 3 Views repointet (5 View-Booleans true; `unterschrift` COALESCE; `faelle_sv_view` +mandatsnummer/lexdrive_case_id); `mandatsnummer` cov=12 nach kanzlei_faelle backfilled.
- [ ] `upsertKanzleiFall`/`peelKanzleiFaelleColumns`-Helper; alle Writer darüber; `filmcheck`-CLM-Write entfernt; Label `claim_nummer` primär + `mandatsnummer` sekundär; Re-Grep = 0.
- [ ] Kunde lean + WA-Hinweis; SV mandatsnummer + Embed ab Kanzlei-Phase; Admin unverändert.
- [ ] Embed-Spike dokumentiert; Deep-Link-Fallback funktioniert; Token-Audit grün.
- [ ] Build (8 GB) grün; Portal-Smoke (Kunde/SV/Admin/public) ohne Hard-Fail, Screenshots ausgewertet.
- [ ] Phase-1-Mapping + Handoff + Memory; Session-Checkliste sauber.

---

## Selbst-Review (Plan vs. Spec)

- **Spec §Scope (11 Spalten voll)** → Task 1 ADD-Block (11) + Referenztabelle. ✅
- **Spec §4 mandatsnummer (= SF-ID; filmcheck-CLM raus; Label beides)** → Task 4 Step 2 (filmcheck) + Step 3 (Label `claim_nummer` primär + mandatsnummer sekundär). ✅
- **Spec PR1 (ADD + Repoint 3 Views + COALESCE)** → Task 1/2; mandatsnummer-cov12-Backfill als Task-1-Nachtrag (Korrektur des „no-op"). ✅
- **Spec PR2 (upsert-Helper als Row-Creator, Sweep, lean Anzeige)** → Task 3 (Helper) + Task 4/5. ✅
- **Spec PR3 (Embed iframe + Fallback, ab Kanzlei-Phase, SV eigenes Login)** → Task 7 (Spike + Komponente, render nur bei caseId). ✅
- **Spec PR4 (Catch-up)** → Task 8. ✅
- **Spec Display-Matrix** → Task 5 (Kunde WA-Hinweis, SV mandatsnummer bei mandatsnummer-gesetzt, Admin unverändert). ✅
- **Spec §8 Entscheidungen** → Label/filmcheck/SV-ab-Kanzlei-Phase alle in Task 4/5/7. ✅
- **Placeholder-Scan:** Sweep ist pattern+inventory-getrieben (Task 3/4/5) mit konkreten Code-Beispielen je Pattern — kein vager Platzhalter. View-DDL server-generiert (kein Hand-Transkript). Embed-iframe-Default ist spike-konditional (explizit, kein Platzhalter). ✅
- **Typ-Konsistenz:** `KANZLEI_FAELLE_COLS`/`peelKanzleiFaelleColumns`/`upsertKanzleiFall` konsistent zwischen Task 3/4/5; `LexDriveMandatEmbed`-Props (`caseId`/`mandatsnummer`) konsistent Task 7. ✅

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
