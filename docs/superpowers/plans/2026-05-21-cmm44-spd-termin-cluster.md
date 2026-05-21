# CMM-44 SP-D — Termin-Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 25 termin-bezogenen `faelle`-Spalten (Termin 15 + Nachbesichtigung 9 + `no_show_gemeldet_am`) auf die `gutachter_termine`-Sub-Table migrieren — 23 als `ADD COLUMN`, 2 als Reader-Switch auf bestehende GT-Zwillinge. **Rein additiv** — kein per-Spalten-`DROP COLUMN`.

**Architecture:** PR1 = additive Migration (23× `ADD COLUMN` auf `gutachter_termine`, UPDATE-Backfill auf den **aktuellsten Termin pro Claim** via `start_zeit DESC LIMIT 1`, View-Repoint gated auf SP-G2 PR2 #1525). PR2 = Reader/Writer-Sweep code-only (1:N-Embed mit `order('start_zeit', desc).limit(1)`, Array-Normalisierung; die 2 DUP-Spalten → bestehende GT-Spalte). PR3 = idempotenter Catch-up-Backfill. `gutachter_termine` ist 1:N pro Claim (18 Termine live, 12 claim-los).

**Tech Stack:** Next.js 15, TypeScript, `@supabase/supabase-js`, Supabase CLI (Migrations), Postgres, Playwright (Portal-Smoke).

**Spec:** `docs/superpowers/specs/2026-05-21-cmm44-spd-termin-cluster-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** `.claude/worktrees/cmm-44-spd`, Branch `kitta/cmm-44-spd-termin-cluster` off `origin/staging`. Pro PR ein eigener Branch off `staging`. PRs immer `--base staging` ([[feedback_pr_gegen_staging]]).
- **Harte Regeln (AGENTS.md):** Nie auf `main` pushen. DDL nur via supabase-CLI (`db query --linked` + `migration repair`, **kein** `db push`). Kein unbegleiteter Stash am Session-Ende.
- **DB-Apply-Muster (bewährt SP-A2/A3/B/G/H/G2):** Migration in `BEGIN/COMMIT`; Dry-Run `BEGIN; … ROLLBACK;`; Apply via `npx supabase db query --linked --file <sql>`; danach `npx supabase migration repair --status applied <version>`.
- **Worktree-Setup:** `.env.local` (gitignored) + `supabase/.temp/` aus Haupt-Repo kopieren, sonst kein `db query --linked` / kein Smoke.
- **db query Multi-Statement-Falle:** mehrere SELECTs → nur das **letzte** Resultset. Measure/Verify als **ein** UNION-ALL mit `(k,v)`-Spalten.
- **Commit-Format:** 7-Punkte-Audit-Block; Commit-Messages Englisch ODER echte Umlaute (staging-Hook blockt ASCII-Ersatz).
- **PR-Hygiene:** Auto-Merge WIDERRUFEN ([[feedback_staging_auto_merge]]). Branch pushen → Reviews → PR erst danach. Aaron mergt selbst. Draft-PRs werden trotzdem auto-gemergt → nicht-merge-reife PRs gar nicht öffnen ([[feedback_draft_pr_nicht_release_sicher]]).
- **SP-G2-PR2-Abhängigkeit:** PR2 #1525 hat `v_faelle_mit_aktuellem_termin` + `v_claim_timeline` schon auf `gt.claim_id` re-keyed (live appliziert, PR offen). SP-D-**View-Repoints** (PR1 Block 3) müssen auf der post-PR2-Def aufsetzen → **erst wenn PR2 auf staging gemergt ist** (sonst git-Def-Drift). ADD/Backfill (Block 1+2) sind unabhängig.

---

## Referenz: Die 25 Spalten

Live gemessen 2026-05-21 (Task 0). Verdikt-Audit aus Spec §2.

### A · 23 ADD COLUMN (gleicher Name auf `gutachter_termine`)
| Cluster | Spalte | Typ | Default (Task 1 live bestätigt) |
|---|---|---|---|
| Ort | `besichtigungsort_adresse` | text | — |
| Ort | `besichtigungsort_lat` | numeric | — |
| Ort | `besichtigungsort_lng` | numeric | — |
| Ort | `besichtigungsort_place_id` | text | — |
| Ort | `besichtigungsort_notiz` | text | — |
| Routing | `geschaetzte_fahrdistanz_km` | numeric | — |
| Reminder | `termin_erinnerung_5min_gesendet` | boolean | `false` (vermutet) |
| Reminder | `sv_termin_dokument_reminder_gesendet_am` | timestamptz | — |
| Reminder | `losfahren_erinnerung_gesendet` | boolean | `false` (vermutet) |
| Sub-Table | `wunschtermin` | timestamptz | — |
| No-Show | `no_show_gemeldet_am` | timestamptz | — |
| Re-Termin | `re_termin_token` | uuid | — |
| Re-Termin | `re_termin_token_eingelaufen_am` | timestamptz | — |
| Re-Termin | `re_termin_eskalation_an_kb_am` | timestamptz | — |
| Nachbesichtigung | `nachbesichtigung_status` | text | — (Task 1: ggf. Default) |
| Nachbesichtigung | `nachbesichtigung_angefordert_am` | timestamptz | — |
| Nachbesichtigung | `nachbesichtigung_termin_datum` | timestamptz | — |
| Nachbesichtigung | `nachbesichtigung_konfrontation` | boolean | `false` (vermutet) |
| Nachbesichtigung | `nachbesichtigung_ergebnis` | text | — |
| Nachbesichtigung | `nachbesichtigung_kunde_termin_vorschlaege` | jsonb | — |
| Nachbesichtigung | `nachbesichtigung_kunde_termin_eingereicht_am` | timestamptz | — |
| Nachbesichtigung | `nachbesichtigung_sv_konfrontation_gewuenscht` | boolean | `false` (vermutet) |
| Nachbesichtigung | `nachbesichtigung_sv_termin_vereinbart_am` | timestamptz | — |

### B · 2 DUP — Reader-Switch auf bestehende GT-Spalte (KEIN ADD)
| `faelle`-Spalte | bestehende GT-Spalte |
|---|---|
| `geschaetzte_fahrzeit_min` (int) | `geschaetzte_fahrtzeit_min` (int) |
| `gcal_event_id` (text) | `google_event_id` (text) |

---

## Transform-Regelwerk (PR2 Reader/Writer-Sweep)

`gutachter_termine` ist 1:N pro Claim — Reader selektieren den **aktuellen** Termin via `.order('start_zeit', { ascending: false }).limit(1)`, Schreiber updaten den aktuellen Termin (oder skip falls keiner).

| Muster | Erkennung | Transform |
|---|---|---|
| **A — Direkt-Select aus `faelle`, nur SP-D-Spalten** | `from('faelle').select('id, claim_id, besichtigungsort_adresse')` | `from('gutachter_termine').select('besichtigungsort_adresse').eq('claim_id', claimId).order('start_zeit', { ascending: false }).limit(1).maybeSingle()`. Spaltenname unverändert (ADD-Spalten). |
| **B — Direkt-Select aus `faelle`, gemischt** | `from('faelle').select('… non-SP-D …, besichtigungsort_adresse')` | SP-D-Spalten in nested embed: `claims:claim_id(gutachter_termine(<SP-D-cols>))`. **Array-Normalisierung Pflicht** an beiden Ebenen. Limitierung: PostgREST-Embed garantiert keinen Order-Hint → wenn deterministischer „aktueller" Termin nötig, Pattern A. |
| **C — Write auf `faelle` (SP-D-col)** | `from('faelle').update({ besichtigungsort_adresse: …, status: … })` | SP-D-Werte aus dem faelle-`update` **entfernen**, separater `from('gutachter_termine').update({ … })` auf den aktuellen Termin: erst `select('id').eq('claim_id', claimId).order('start_zeit', { ascending:false }).limit(1).maybeSingle()`, dann `.update().eq('id', aktTermin.id)`. Falls 0 Termine: `console.warn`+skip, nicht 500. **Kein Dual-Write.** Guarded mit `{ error }`. |
| **D — Nested `faelle(...)`-Select** | `from('<x>').select('…, faelle(besichtigungsort_adresse)')` | SP-D-Spalte in `claims:claim_id(gutachter_termine(<col>))`-Block. Array-Normalisierung beidseitig. |
| **E — View-Read** | Read aus `v_*` exponiert die Spalte | PR1 hat die View via LATERAL re-pointet → **kein Code-Change**. |
| **F — TS-Typ / JSX / Property-Access** | `interface`-Feld, `obj.<col>`, JSX | Kein Rename → kein Change. Falls als `Database['public']['Tables']['faelle']['Row'][...]` getypt → auf `'gutachter_termine'` umstellen. |
| **DUP — die 2 Zwillings-Spalten** | Read/Write von `faelle.geschaetzte_fahrzeit_min` / `faelle.gcal_event_id` | Auf die **bestehende GT-Spalte** umstellen: `geschaetzte_fahrzeit_min`→`gutachter_termine.geschaetzte_fahrtzeit_min`, `gcal_event_id`→`gutachter_termine.google_event_id` (aktueller Termin, Pattern A/C). **Property-Name ändert sich** → Konsument nachziehen. |

**Verify-Endzustand PR2:** kontext-sicherer paren-balanced Re-Grep (`scripts/cmm44-spd-grep.mjs`) zeigt 0 live `from('faelle')`-Zugriffe + 0 nested `faelle(...)`-Selects der 25 Spalten. `npm run build` (8 GB heap) grün.

---

## File Structure

**Neu:**
- `scripts/cmm44-spd-measure.sql` — Live-Messung der 25 Spalten (UNION-ALL). Mit Plan committet.
- `scripts/cmm44-spd-verify.sql` — Verify nach PR1/PR3.
- `scripts/cmm44-spd-grep.mjs` — paren-balanced Re-Grep der 25 Spalten.
- `supabase/migrations/<ts>_cmm44_spd_add_termin_columns.sql` — PR1.
- `supabase/migrations/<ts>_cmm44_spd_catchup_backfill.sql` — PR3.
- `docs/21.05.2026/cmm44-spd-views-audit.md`, `cmm44-spd-inventory.md`, `cmm44-spd-smoke-pr2.md`.
- `scripts/smoke-cmm44-spd.mjs` — Portal-Smoke (analog `scripts/smoke-cmm44-spg2.mjs`).

**Modifiziert (PR2):** `src/`-Files mit `faelle`-seitigem Zugriff auf eine der 25 Spalten (Inventur Task 3). Types: `src/lib/supabase/database.types.ts` (PR1).

---

## Task 0: Live-DB-Drift-Check

**Files:** Create `scripts/cmm44-spd-measure.sql`.

- [ ] **Step 1: Measure-Script schreiben** (eine UNION-ALL, je Spalte: existiert auf GT? auf faelle? + Default auf faelle)

```sql
-- CMM-44 SP-D — welche der 25 sind schon auf gutachter_termine, welche auf faelle?
WITH cols(c) AS (VALUES
 ('besichtigungsort_adresse'),('besichtigungsort_lat'),('besichtigungsort_lng'),('besichtigungsort_place_id'),
 ('besichtigungsort_notiz'),('geschaetzte_fahrdistanz_km'),('termin_erinnerung_5min_gesendet'),
 ('sv_termin_dokument_reminder_gesendet_am'),('losfahren_erinnerung_gesendet'),('wunschtermin'),
 ('no_show_gemeldet_am'),('re_termin_token'),('re_termin_token_eingelaufen_am'),('re_termin_eskalation_an_kb_am'),
 ('nachbesichtigung_status'),('nachbesichtigung_angefordert_am'),('nachbesichtigung_termin_datum'),
 ('nachbesichtigung_konfrontation'),('nachbesichtigung_ergebnis'),('nachbesichtigung_kunde_termin_vorschlaege'),
 ('nachbesichtigung_kunde_termin_eingereicht_am'),('nachbesichtigung_sv_konfrontation_gewuenscht'),
 ('nachbesichtigung_sv_termin_vereinbart_am'))
SELECT cols.c AS k,
  (CASE WHEN gt.column_name IS NOT NULL THEN 'ON_GT(' || gt.data_type || ')' ELSE 'MISSING' END) AS v
FROM cols LEFT JOIN information_schema.columns gt
  ON gt.table_schema='public' AND gt.table_name='gutachter_termine' AND gt.column_name=cols.c
ORDER BY cols.c;
```

- [ ] **Step 2: Ausführen + interpretieren**

Run: `npx supabase db query --linked --file scripts/cmm44-spd-measure.sql 2>&1 | grep -E '"k"|"v"'`
Expected: **alle 23 ADD-Spalten** = `MISSING` (auf GT noch nicht da). Zeigt eine `ON_GT(...)` → andere Session hat sie schon hinzugefügt → aus dem ADD-Block streichen + im Log vermerken. (Die 2 DUP-Spalten `geschaetzte_fahrzeit_min`/`gcal_event_id` sind NICHT in der Liste — ihre GT-Zwillinge `geschaetzte_fahrtzeit_min`/`google_event_id` existieren bereits.)

- [ ] **Step 3: Commit (Script, kein Apply)**

```bash
git add scripts/cmm44-spd-measure.sql
git commit -m "chore(CMM-44): SP-D live-state measure script (23 ADD targets)"
```
(7-Punkte-Audit im Body; n/a außer „Spec: …spd…design.md".)

---

## Task 1: PR1 — View-Audit + Defaults messen + Migration schreiben + Dry-Run

**Branch:** `kitta/cmm-44-spd-pr1-add-columns`, frisch von `kitta/cmm-44-spd-termin-cluster` (Spec/Plan-Branch).

**Files:** Create `scripts/cmm44-spd-verify.sql`, `docs/21.05.2026/cmm44-spd-views-audit.md`, `supabase/migrations/<ts>_cmm44_spd_add_termin_columns.sql`.

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spd-pr1-add-columns kitta/cmm-44-spd-termin-cluster
```

- [ ] **Step 2: Exakte Typen + Defaults der 23 ADD-Spalten live messen** (für den ADD-Block)

```bash
cat > /tmp/spd-defaults.sql <<'SQL'
SELECT column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='faelle'
  AND column_name IN ('besichtigungsort_adresse','besichtigungsort_lat','besichtigungsort_lng',
   'besichtigungsort_place_id','besichtigungsort_notiz','geschaetzte_fahrdistanz_km',
   'termin_erinnerung_5min_gesendet','sv_termin_dokument_reminder_gesendet_am','losfahren_erinnerung_gesendet',
   'wunschtermin','no_show_gemeldet_am','re_termin_token','re_termin_token_eingelaufen_am',
   're_termin_eskalation_an_kb_am','nachbesichtigung_status','nachbesichtigung_angefordert_am',
   'nachbesichtigung_termin_datum','nachbesichtigung_konfrontation','nachbesichtigung_ergebnis',
   'nachbesichtigung_kunde_termin_vorschlaege','nachbesichtigung_kunde_termin_eingereicht_am',
   'nachbesichtigung_sv_konfrontation_gewuenscht','nachbesichtigung_sv_termin_vereinbart_am')
ORDER BY column_name;
SQL
npx supabase db query --linked --file /tmp/spd-defaults.sql 2>&1 | grep -E '"(column_name|udt_name|is_nullable|column_default)"' | paste - - - - | head -30
```
Defaults 1:1 ins ADD-SQL übernehmen. Besonders NOT-NULL-Spalten (vermutet: die 4 booleans `DEFAULT false`).

- [ ] **Step 3: View-Audit — welche Views exponieren eine der 25?**

```bash
cat > /tmp/spd-views.sql <<'SQL'
SELECT c.table_name AS view_name, c.column_name
FROM information_schema.columns c
JOIN information_schema.views v ON v.table_schema=c.table_schema AND v.table_name=c.table_name
WHERE c.table_schema='public' AND c.column_name IN (
 'besichtigungsort_adresse','besichtigungsort_lat','besichtigungsort_lng','besichtigungsort_place_id',
 'besichtigungsort_notiz','geschaetzte_fahrdistanz_km','geschaetzte_fahrzeit_min','gcal_event_id',
 'termin_erinnerung_5min_gesendet','sv_termin_dokument_reminder_gesendet_am','losfahren_erinnerung_gesendet',
 'wunschtermin','no_show_gemeldet_am','re_termin_token','re_termin_token_eingelaufen_am','re_termin_eskalation_an_kb_am',
 'nachbesichtigung_status','nachbesichtigung_angefordert_am','nachbesichtigung_termin_datum','nachbesichtigung_konfrontation',
 'nachbesichtigung_ergebnis','nachbesichtigung_kunde_termin_vorschlaege','nachbesichtigung_kunde_termin_eingereicht_am',
 'nachbesichtigung_sv_konfrontation_gewuenscht','nachbesichtigung_sv_termin_vereinbart_am')
ORDER BY c.table_name, c.column_name;
SQL
npx supabase db query --linked --file /tmp/spd-views.sql 2>&1 | tail -40
```
Pro Treffer-View `pg_get_viewdef('public.<view>', true)` ziehen, prüfen ob Spalte aus `f.<col>` kommt. In `docs/21.05.2026/cmm44-spd-views-audit.md` festhalten (`view_name | column | quelle | repoint`). **Falls Treffer → Block 3 (View-Repoint) ist gated auf SP-G2 PR2 #1525-staging-Merge** (sonst baut die CREATE-OR-REPLACE auf einer pre-PR2-Def auf). Leere Trefferliste → Block 3 entfällt.

- [ ] **Step 4: Verify-Query schreiben** (`scripts/cmm44-spd-verify.sql`, UNION-ALL)

```sql
SELECT 'spd_added_on_gt' AS k, (SELECT count(*)::text FROM information_schema.columns
  WHERE table_schema='public' AND table_name='gutachter_termine' AND column_name IN (
   'besichtigungsort_adresse','besichtigungsort_lat','besichtigungsort_lng','besichtigungsort_place_id',
   'besichtigungsort_notiz','geschaetzte_fahrdistanz_km','termin_erinnerung_5min_gesendet',
   'sv_termin_dokument_reminder_gesendet_am','losfahren_erinnerung_gesendet','wunschtermin','no_show_gemeldet_am',
   're_termin_token','re_termin_token_eingelaufen_am','re_termin_eskalation_an_kb_am','nachbesichtigung_status',
   'nachbesichtigung_angefordert_am','nachbesichtigung_termin_datum','nachbesichtigung_konfrontation',
   'nachbesichtigung_ergebnis','nachbesichtigung_kunde_termin_vorschlaege','nachbesichtigung_kunde_termin_eingereicht_am',
   'nachbesichtigung_sv_konfrontation_gewuenscht','nachbesichtigung_sv_termin_vereinbart_am')) AS v;
```
Expected nach Apply: `spd_added_on_gt = 23`.

- [ ] **Step 5: Migration generieren + Block 1 + 2 schreiben**

```bash
npx supabase migration new cmm44_spd_add_termin_columns
```

Inhalt (in `BEGIN/COMMIT`; Block 3 konditional, gated auf PR2):
```sql
-- CMM-44 SP-D PR1 — additive Migration (kein DROP)
-- Block 1: 23x ADD COLUMN auf gutachter_termine (Typ/Default live gemessen Task 1)
-- Block 2: UPDATE-Backfill auf den AKTUELLSTEN Termin pro Claim (start_zeit DESC)
-- Block 3: View-Repoint — NUR falls Audit Treffer fand UND PR2 #1525 auf staging gemergt
-- Nach Apply: npx supabase migration repair --status applied <timestamp>
BEGIN;

-- Block 1 (Defaults aus Task 1 Step 2 querchecken/anpassen):
ALTER TABLE public.gutachter_termine
  ADD COLUMN besichtigungsort_adresse text,
  ADD COLUMN besichtigungsort_lat numeric,
  ADD COLUMN besichtigungsort_lng numeric,
  ADD COLUMN besichtigungsort_place_id text,
  ADD COLUMN besichtigungsort_notiz text,
  ADD COLUMN geschaetzte_fahrdistanz_km numeric,
  ADD COLUMN termin_erinnerung_5min_gesendet boolean NOT NULL DEFAULT false,
  ADD COLUMN sv_termin_dokument_reminder_gesendet_am timestamptz,
  ADD COLUMN losfahren_erinnerung_gesendet boolean NOT NULL DEFAULT false,
  ADD COLUMN wunschtermin timestamptz,
  ADD COLUMN no_show_gemeldet_am timestamptz,
  ADD COLUMN re_termin_token uuid,
  ADD COLUMN re_termin_token_eingelaufen_am timestamptz,
  ADD COLUMN re_termin_eskalation_an_kb_am timestamptz,
  ADD COLUMN nachbesichtigung_status text,
  ADD COLUMN nachbesichtigung_angefordert_am timestamptz,
  ADD COLUMN nachbesichtigung_termin_datum timestamptz,
  ADD COLUMN nachbesichtigung_konfrontation boolean NOT NULL DEFAULT false,
  ADD COLUMN nachbesichtigung_ergebnis text,
  ADD COLUMN nachbesichtigung_kunde_termin_vorschlaege jsonb,
  ADD COLUMN nachbesichtigung_kunde_termin_eingereicht_am timestamptz,
  ADD COLUMN nachbesichtigung_sv_konfrontation_gewuenscht boolean NOT NULL DEFAULT false,
  ADD COLUMN nachbesichtigung_sv_termin_vereinbart_am timestamptz;

-- Block 2: Backfill auf den aktuellsten Termin pro Claim.
-- Bei 4 NOT-NULL-Defaults: COALESCE(f.<col>, false) damit ein NULL aus faelle den
-- Default nicht bricht (Task 2 Step 7 Dry-Run zeigt es sonst als not-null-violation).
UPDATE public.gutachter_termine gt SET
  besichtigungsort_adresse              = f.besichtigungsort_adresse,
  besichtigungsort_lat                  = f.besichtigungsort_lat,
  besichtigungsort_lng                  = f.besichtigungsort_lng,
  besichtigungsort_place_id             = f.besichtigungsort_place_id,
  besichtigungsort_notiz                = f.besichtigungsort_notiz,
  geschaetzte_fahrdistanz_km            = f.geschaetzte_fahrdistanz_km,
  termin_erinnerung_5min_gesendet       = COALESCE(f.termin_erinnerung_5min_gesendet, false),
  sv_termin_dokument_reminder_gesendet_am = f.sv_termin_dokument_reminder_gesendet_am,
  losfahren_erinnerung_gesendet         = COALESCE(f.losfahren_erinnerung_gesendet, false),
  wunschtermin                          = f.wunschtermin,
  no_show_gemeldet_am                   = f.no_show_gemeldet_am,
  re_termin_token                       = f.re_termin_token,
  re_termin_token_eingelaufen_am        = f.re_termin_token_eingelaufen_am,
  re_termin_eskalation_an_kb_am         = f.re_termin_eskalation_an_kb_am,
  nachbesichtigung_status               = f.nachbesichtigung_status,
  nachbesichtigung_angefordert_am       = f.nachbesichtigung_angefordert_am,
  nachbesichtigung_termin_datum         = f.nachbesichtigung_termin_datum,
  nachbesichtigung_konfrontation        = COALESCE(f.nachbesichtigung_konfrontation, false),
  nachbesichtigung_ergebnis             = f.nachbesichtigung_ergebnis,
  nachbesichtigung_kunde_termin_vorschlaege = f.nachbesichtigung_kunde_termin_vorschlaege,
  nachbesichtigung_kunde_termin_eingereicht_am = f.nachbesichtigung_kunde_termin_eingereicht_am,
  nachbesichtigung_sv_konfrontation_gewuenscht = COALESCE(f.nachbesichtigung_sv_konfrontation_gewuenscht, false),
  nachbesichtigung_sv_termin_vereinbart_am = f.nachbesichtigung_sv_termin_vereinbart_am
FROM public.faelle f
WHERE gt.claim_id = f.claim_id
  AND gt.id = (SELECT x.id FROM public.gutachter_termine x
               WHERE x.claim_id = f.claim_id ORDER BY x.start_zeit DESC NULLS LAST LIMIT 1);

-- Block 3: View-Repoint — siehe Task 1 Step 3. Nur falls Treffer + PR2 gemergt.
-- Pro View CREATE OR REPLACE mit LATERAL auf aktuellen Termin (start_zeit DESC LIMIT 1),
-- f.<col> -> cur_termin.<col> AS <col>. Precision-Casts bei 42P16.

COMMIT;
```

- [ ] **Step 6: Dry-Run**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spd_add_termin_columns.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/spd-pr1-dryrun.sql
npx supabase db query --linked --file /tmp/spd-pr1-dryrun.sql 2>&1 | tail -10
```
Expected: kein Fehler. Fehlerklassen: `column already exists` (Drift → streichen); `not-null violation` (COALESCE ergänzen); `42P16` (View Precision-Casts).

- [ ] **Step 7: Commit (Scripts + Migration, NICHT appliziert)** — 7-Punkte-Audit-Body.

```bash
git add scripts/cmm44-spd-verify.sql docs/21.05.2026/cmm44-spd-views-audit.md supabase/migrations/*_cmm44_spd_add_termin_columns.sql
git commit -m "chore(CMM-44): SP-D PR1 — ADD-Migration + view audit (vor Apply)"
```

---

## Task 2: PR1 — Apply + Verify + Types + Build + Push (KEIN PR)

**Branch:** `kitta/cmm-44-spd-pr1-add-columns` (Fortsetzung).

- [ ] **Step 1: Drift-Recheck** — `npx supabase db query --linked --file scripts/cmm44-spd-measure.sql 2>&1 | grep -E '"k"|"v"'`. Erwartet: 23× `MISSING`.
- [ ] **Step 2: Apply + repair**
```bash
MIG=$(ls supabase/migrations/*_cmm44_spd_add_termin_columns.sql | tail -1); TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -10
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
```
- [ ] **Step 3: Verify** — `npx supabase db query --linked --file scripts/cmm44-spd-verify.sql 2>&1 | grep -E '"k"|"v"'`. Expected: `spd_added_on_gt = 23`.
- [ ] **Step 4: Backfill-Effekt prüfen**
```bash
cat > /tmp/spd-bf.sql <<'SQL'
SELECT 'aktueller_termin_befuellt' AS k, count(*)::text AS v
FROM public.gutachter_termine gt JOIN public.faelle f ON f.claim_id=gt.claim_id
WHERE gt.id=(SELECT x.id FROM public.gutachter_termine x WHERE x.claim_id=f.claim_id ORDER BY x.start_zeit DESC NULLS LAST LIMIT 1)
  AND f.besichtigungsort_adresse IS NOT NULL AND gt.besichtigungsort_adresse IS NOT DISTINCT FROM f.besichtigungsort_adresse;
SQL
npx supabase db query --linked --file /tmp/spd-bf.sql 2>&1 | grep -E '"k"|"v"'
```
Expected: > 0 wenn faelle besichtigungsort-Daten hat (Cov 1).
- [ ] **Step 5: Types regenerieren** (PowerShell, SP-G-Lesson)
```bash
powershell -Command "& { npx supabase gen types typescript --linked 2>\$null | Out-File -Encoding utf8 src/lib/supabase/database.types.ts }" 2>&1 | tail -3
grep -nE "besichtigungsort_adresse|nachbesichtigung_status|re_termin_token" src/lib/supabase/database.types.ts | head
```
- [ ] **Step 6: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10`. (Falls lokal durch `require-in-the-middle`-Defekt blockiert: tsc als Minimum + CI-Build ist Gate.)
- [ ] **Step 7: Commit + Push (KEIN `gh pr create`)** — 7-Punkte-Audit. `git push -u origin kitta/cmm-44-spd-pr1-add-columns`.
- [ ] **Step 8: PR öffnen NACH Reviews** — `gh pr create --base staging --title "CMM-44 SP-D PR1 — 23 ADD + Backfill (Termin-Cluster)" --body "Additive ADD + Backfill auf aktuellen Termin. Migration appliziert+repair-recorded. View-Block gated auf PR2 #1525. Spec: docs/superpowers/specs/2026-05-21-cmm44-spd-termin-cluster-design.md"`

> **GATE:** Task 3 (PR2) startet erst nach PR1-`staging`-Merge (Reader-Sweep braucht regen. Types).

---

## Task 3: PR2 — Call-Site-Inventur (paren-balanced)

**Branch:** `kitta/cmm-44-spd-pr2-sweep`, frisch von `origin/staging` (nach PR1-Merge).

**Files:** Create `scripts/cmm44-spd-grep.mjs`, `docs/21.05.2026/cmm44-spd-inventory.md`.

- [ ] **Step 1: Branch** — `git fetch origin && git checkout -b kitta/cmm-44-spd-pr2-sweep origin/staging`
- [ ] **Step 2: Re-Grep-Skript** (analog `scripts/cmm44-sph-grep.mjs`, COLS = die **25** Spalten inkl. der 2 DUP `geschaetzte_fahrzeit_min`/`gcal_event_id`; `stripSubEmbeds` entfernt `claims:claim_id(...)` + `gutachter_termine(...)`):

```javascript
#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'
const COLS = ['besichtigungsort_adresse','besichtigungsort_lat','besichtigungsort_lng','besichtigungsort_place_id',
 'besichtigungsort_notiz','geschaetzte_fahrdistanz_km','geschaetzte_fahrzeit_min','gcal_event_id',
 'termin_erinnerung_5min_gesendet','sv_termin_dokument_reminder_gesendet_am','losfahren_erinnerung_gesendet',
 'wunschtermin','no_show_gemeldet_am','re_termin_token','re_termin_token_eingelaufen_am','re_termin_eskalation_an_kb_am',
 'nachbesichtigung_status','nachbesichtigung_angefordert_am','nachbesichtigung_termin_datum','nachbesichtigung_konfrontation',
 'nachbesichtigung_ergebnis','nachbesichtigung_kunde_termin_vorschlaege','nachbesichtigung_kunde_termin_eingereicht_am',
 'nachbesichtigung_sv_konfrontation_gewuenscht','nachbesichtigung_sv_termin_vereinbart_am']
function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name)
 if(e.isDirectory()){if(['node_modules','.next','.claude'].includes(e.name))continue;walk(p,o)}
 else if(/\.(ts|tsx|mjs|js)$/.test(e.name))o.push(p)}return o}
function stripSub(s){let prev='';while(prev!==s){prev=s
 s=s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g,'')
 s=s.replace(/\bgutachter_termine\s*\(([^()]|\([^()]*\))*\)/g,'')}return s}
const fromRe=/\.from\(['"]faelle['"]\)/g, nestedRe=/\bfaelle\s*\(/g, hits=[]
for(const f of walk('src')){const s=fs.readFileSync(f,'utf8'); let m
 fromRe.lastIndex=0; while((m=fromRe.exec(s))){const w=stripSub(s.slice(m.index,m.index+1500))
  for(const c of COLS){if(new RegExp(`\\b${c}\\b`).test(w)){hits.push(`${f}:${s.slice(0,m.index).split('\n').length} | ${c} | from('faelle')`);break}}}
 nestedRe.lastIndex=0; while((m=nestedRe.exec(s))){let d=1,e=m.index+m[0].length;while(e<s.length&&d>0){if(s[e]==='(')d++;else if(s[e]===')')d--;e++}
  const w=stripSub(s.slice(m.index+m[0].length,e-1)); for(const c of COLS){if(new RegExp(`\\b${c}\\b`).test(w)){hits.push(`${f}:${s.slice(0,m.index).split('\n').length} | ${c} | nested faelle(...)`);break}}}}
console.log(hits.join('\n')); console.log(`\nTOTAL: ${hits.length}`)
```

- [ ] **Step 3: Inventur fahren** — `node scripts/cmm44-spd-grep.mjs > /tmp/spd-hits.txt; cat /tmp/spd-hits.txt`. Per Spalte + per File aggregieren.
- [ ] **Step 4: Inventur-Doc** `docs/21.05.2026/cmm44-spd-inventory.md`: pro Site Pattern A-F bzw. DUP. Out-of-Scope (test-fixtures) listen. Commit (`docs(CMM-44): SP-D PR2 — call-site inventory`).

---

## Task 4: PR2 — Transform anwenden + Build + Push (KEIN PR)

**Files:** alle A/B/C/D/DUP-Sites aus der Inventur.

- [ ] **Step 1: Transform pro Site** (Regelwerk oben). Konkrete Muster:

**A (Read, nur SP-D):**
```typescript
// NACHHER
let aktTermin: { besichtigungsort_adresse: string | null } | null = null
if (fall?.claim_id) {
  const { data } = await db.from('gutachter_termine')
    .select('besichtigungsort_adresse')
    .eq('claim_id', fall.claim_id).order('start_zeit', { ascending: false }).limit(1).maybeSingle()
  aktTermin = data
}
const adresse = aktTermin?.besichtigungsort_adresse
```

**C (Write):**
```typescript
const { data: fall } = await db.from('faelle').select('claim_id').eq('id', fallId).single()
if (fall?.claim_id) {
  const { data: t } = await db.from('gutachter_termine').select('id')
    .eq('claim_id', fall.claim_id).order('start_zeit', { ascending: false }).limit(1).maybeSingle()
  if (t?.id) {
    const { error } = await db.from('gutachter_termine').update({ besichtigungsort_adresse: adresse }).eq('id', t.id)
    if (error) return { ok: false, error: error.message }
  } else console.warn(`[CMM-44 SP-D] kein Termin fuer claim ${fall.claim_id} — skip`)
}
```

**DUP (die 2 Zwillinge):** `faelle.geschaetzte_fahrzeit_min` → `gutachter_termine.geschaetzte_fahrtzeit_min`; `faelle.gcal_event_id` → `gutachter_termine.google_event_id` (aktueller Termin, Pattern A/C). Property-Name beim Konsumenten nachziehen.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. 0 Fehler.
- [ ] **Step 3: Re-Grep** — `node scripts/cmm44-spd-grep.mjs`. Expected: 0 (oder nur dokumentierte false-positives).
- [ ] **Step 4: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10`.
- [ ] **Step 5: Commit + Push (KEIN PR)** — 7-Punkte-Audit. `git push -u origin kitta/cmm-44-spd-pr2-sweep`.
- [ ] **Step 6: PR öffnen NACH Reviews** — `gh pr create --base staging --title "CMM-44 SP-D PR2 — Reader/Writer-Sweep (25 Termin-Spalten)" --body "..."`

---

## Task 5: PR2 — Portal-Smoke (nach staging-Merge)

**Files:** `scripts/smoke-cmm44-spd.mjs` (kopieren von `scripts/smoke-cmm44-spg2.mjs`), `docs/21.05.2026/cmm44-spd-smoke-pr2.md`.

- [ ] **Step 1: Smoke-Script** auf SP-D-Surfaces: SV `/gutachter/kalender` (besichtigungsort/fahrzeit-Anzeige), Fallakte `/faelle/[id]` (nachbesichtigung/re-termin), Kunde-Termin, Admin-Kalender. Detekt 5xx/pageerror/„undefined".
- [ ] **Step 2: Smoke gegen `app.staging.claimondo.de`** (`node --env-file=.env.local scripts/smoke-cmm44-spd.mjs`). Screenshots im selben Turn auswerten ([[feedback_smoke_screenshot_pflicht]]).
- [ ] **Step 3: Commit Smoke-Protokoll + Push.**

> **GATE:** Task 6 (PR3) erst wenn PR2 auf `main` (inhaltsbasierter Gate-Check `git diff origin/main origin/staging -- src/`).

---

## Task 6: PR3 — Catch-up-Backfill

**Branch:** `kitta/cmm-44-spd-pr3-catchup`, frisch von `origin/staging`.

- [ ] **Step 1: Branch + Gate-Check** (inhaltsbasiert, Squash-Release).
- [ ] **Step 2: Migration** `npx supabase migration new cmm44_spd_catchup_backfill` — idempotenter COALESCE-UPDATE der 23 ADD-Spalten auftraege←faelle... (gutachter_termine←faelle) auf aktuellen Termin:
```sql
BEGIN;
UPDATE public.gutachter_termine gt SET
  besichtigungsort_adresse = COALESCE(gt.besichtigungsort_adresse, f.besichtigungsort_adresse),
  -- … alle 23 als COALESCE(gt.<col>, f.<col>) …
  nachbesichtigung_sv_termin_vereinbart_am = COALESCE(gt.nachbesichtigung_sv_termin_vereinbart_am, f.nachbesichtigung_sv_termin_vereinbart_am)
FROM public.faelle f
WHERE gt.claim_id = f.claim_id
  AND gt.id = (SELECT x.id FROM public.gutachter_termine x WHERE x.claim_id=f.claim_id ORDER BY x.start_zeit DESC NULLS LAST LIMIT 1);
COMMIT;
```
- [ ] **Step 3: Dry-Run → Apply → repair → Verify** (analog Task 2).
- [ ] **Step 4: Commit + Push + PR NACH Review.**
- [ ] **Step 5: Finaler Portal-Smoke.**

---

## Task 7: Abschluss

- [ ] **Step 1:** Phase-1-Mapping-Update-Block (`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`): SP-D erledigt, 23 ADD + 2 DUP-Reader-Switch, PR-Nummern.
- [ ] **Step 2:** Handoff `docs/21.05.2026/handoff-cmm44-spd-abschluss.md` (SP-D-Lessons: 1:N current-termin via start_zeit, 2 DUP-Zwillinge, View-Gating auf PR2).
- [ ] **Step 3:** Memory `project_cmm44_spd_status.md` + MEMORY.md-Pointer.
- [ ] **Step 4:** Commit + Abschluss-PR `--base staging`.
- [ ] **Step 5:** Session-Abschluss-Checkliste (git status / stash list / unpushed).

---

## Definition of Done
- [ ] PR1 gemergt; Verify `spd_added_on_gt=23`; Backfill auf aktuellen Termin pro Claim.
- [ ] PR2 gemergt; Re-Grep 0 live `faelle`-Zugriffe der 25 Spalten; die 2 DUP auf GT-Zwilling umgestellt.
- [ ] PR3 appliziert + recorded (COALESCE).
- [ ] `npm run build` grün (oder CI-Build grün).
- [ ] Portal-Smoke nach PR2 + PR3 ohne Hard-Fail; Screenshots ausgewertet.
- [ ] Phase-1-Mapping + Handoff + Memory nachgezogen.

---

## Selbst-Review (Plan vs. Spec)
- **Spec §2a (15 klare ADD)** + **§2c (8 ambiguous-default-ADD)** = 23 ADD → Task 1 Step 5 ADD-Block deckt exakt 23. ✅
- **Spec §2b (2 DUP)** → Transform-Regelwerk „DUP"-Zeile + Task 4 Step 1 DUP-Muster (geschaetzte_fahrzeit→fahrtzeit, gcal→google_event). NICHT im ADD-Block. ✅
- **Spec §1 nachbesichtigung als Spalten** → 9 nachbesichtigung_* im ADD-Block. ✅
- **Spec §3 Backfill aktueller Termin (start_zeit DESC)** → Block 2 + Pattern A/C `order('start_zeit',desc).limit(1)`. ✅
- **Spec §4 Views + PR2-Gating** → Task 1 Step 3 (Audit + Gate-Hinweis), Block 3 konditional. ✅
- **Spec §5 3-PR-Struktur** → Task 1-2 (PR1), 3-4 (PR2), 6 (PR3). ✅
- **Spec §6 Non-Goals** → kein faelle-Drop (additiv), keine Konfrontation-Row, keine RLS. Im Plan respektiert. ✅
- **Spec §7 Verifikation** → Task 0/2 information_schema, DUP-Werte-Konsistenz (Task 4 — vor Reader-Switch prüfen), Re-Grep (Task 4 Step 3), Smoke (Task 5). ✅
- **db query Multi-Statement** → measure/verify als UNION-ALL. ✅
- **Keine Placeholders:** Block 3 explizit konditional („nur falls Treffer + PR2 gemergt"); PR3 COALESCE-Block mit „… alle 23 …"-Abkürzung ist ein bewusster Muster-Hinweis (die 23 Namen stehen vollständig in Block 2/Task 1) — beim Schreiben 1:1 aus Block 2 übernehmen. Catch-up DUP-Spalten (geschaetzte_fahrzeit/gcal) brauchen KEINEN Catch-up (sie wurden nie auf GT addiert).
- **Typ-Konsistenz:** Spaltennamen durchgängig identisch; `start_zeit DESC` als current-termin-Selektor überall gleich. ✅

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
