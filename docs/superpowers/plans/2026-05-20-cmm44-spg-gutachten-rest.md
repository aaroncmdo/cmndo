# CMM-44 SP-G — Gutachten-Rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 19 Gutachten-bezogenen `faelle`-Spalten (16 MOVE + 3 Reader-Umstellung) auf die `gutachten`-Sub-Table migrieren. **Rein additiv** — kein per-Spalten-`DROP COLUMN`.

**Architecture:** PR1 = additive Migration (5× `ADD COLUMN gutachten` für ki_* + positionen, UPSERT-Backfill `ON CONFLICT (claim_id) DO UPDATE COALESCE`, ggf. View-Repoint). PR2 = Reader/Writer-Sweep code-only (Tabellen-Wechsel + Spalten-Rename + 3 abgeleitete Reader). PR3 = idempotenter Catch-up-Backfill. Cardinality 1:1 dank `gutachten_claim_id_unique`. Faelle-Spalten bleiben bis Phase 6.

**Tech Stack:** Next.js 15, TypeScript, `@supabase/supabase-js`, Supabase CLI (Migrations), Postgres, Playwright (Portal-Smoke).

**Spec:** `docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** `.claude/worktrees/cmm-44-spb`, Branch `kitta/cmm-44-spg` off `origin/staging`. Pro PR ein eigener Branch gegen `staging` (Memory: PRs immer `--base staging`).
- **Harte Regeln (AGENTS.md):** Nie auf `main` pushen. DDL nur über supabase-CLI (`db query --linked` + `migration repair`). Kein unbegleiteter Stash am Session-Ende.
- **DB-Apply-Muster (SP-B-bewährt):** Migration in `BEGIN/COMMIT`; Dry-Run `BEGIN; … ROLLBACK;`; Apply via `npx supabase db query --linked --file <sql>`; danach `npx supabase migration repair --status applied <version>`. **Kein** `db push`.
- **Supabase-Link:** Der Worktree ist gelinkt (`.env.local` + `supabase/.temp/` aus dem Haupt-Checkout kopiert). `db query --linked` läuft direkt im Worktree.
- **Commit-Format:** Jeder Commit braucht den 7-Punkte-Audit-Block + echte deutsche Umlaute.
- **PR-Hygiene (SP-B-Lesson `feedback_draft_pr_nicht_release_sicher`):** Branch pushen + Reviews durchlaufen lassen, PR erst nach bestandenem Spec-Review öffnen — die Release-Automation kann sonst vor dem Gate mergen.
- **Sequencing:** PR1 additiv → jederzeit applizierbar. PR2 nach PR1-Merge. PR3 nach PR2-`main`-Release.

---

## Referenz: Vollständiges Mapping (alle 19 Spalten)

| # | `faelle` (alt) | `gutachten` (neu) | Typ | Klasse |
|--:|---|---|---|---|
| 1  | `gutachten_eingegangen_am`         | `fertiggestellt_am`                       | timestamptz | A (1:1 Rename, Ziel existiert) |
| 2  | `gutachten_betrag`                 | `gesamt_schadensbetrag`                   | numeric     | A |
| 3  | `gutachter_honorar`                | `gutachten_sv_honorar_netto`              | numeric     | A |
| 4  | `ocr_extrahiert_am`                | `ocr_finished_at`                         | timestamptz | A |
| 5  | `ocr_rohdaten`                     | `gutachten_ocr_raw`                       | jsonb       | A |
| 6  | `gutachten_hochgeladen_am`         | `pdf_uploaded_at`                         | timestamptz | A |
| 7  | `gutachten_nummer`                 | `auftragsnummer`                          | text        | A — UNIQUE auf gutachten |
| 8  | `reparaturkosten`                  | `reparaturkosten_netto`                   | numeric     | A |
| 9  | `wertminderung`                    | `minderwert`                              | numeric     | A |
| 10 | `nutzungsausfall_tagessatz`        | `gutachten_nutzungsausfall_tagessatz_eur` | numeric     | A |
| 11 | `reparaturdauer_tage`              | `wiederbeschaffungsdauer_tage`            | int4        | A |
| 12 | `ki_kalkulation`                   | `ki_kalkulation`                          | jsonb       | B (PR1 ADD COLUMN) |
| 13 | `ki_kalkulation_am`                | `ki_kalkulation_am`                       | timestamptz | B |
| 14 | `ki_geschaetzte_kosten_min`        | `ki_geschaetzte_kosten_min`               | numeric     | B |
| 15 | `ki_geschaetzte_kosten_max`        | `ki_geschaetzte_kosten_max`               | numeric     | B |
| 16 | `gutachten_positionen`             | `positionen`                              | jsonb       | B (PR1 ADD COLUMN) |
| 17 | `gutachten_vorhanden`              | *(kein MOVE — Reader liest `!!gutachten?.id`)*               | bool   | C |
| 18 | `gutachten_stundensatz`            | *(kein MOVE — Reader liefert `null`)*                        | numeric | C |
| 19 | `nutzungsausfall_gesamt`           | *(kein MOVE — Reader rechnet `tagessatz × tage`)*            | numeric | C |

Klassen-Legende: **A** = 1:1 Rename auf existierende `gutachten`-Spalte · **B** = neue Spalte auf `gutachten` (PR1 ADD) · **C** = Reader-Umstellung ohne DB-Move.

---

## Transform-Regelwerk (PR2 Reader/Writer-Sweep)

Jeder `faelle`-seitige Zugriff auf eine der 19 Spalten fällt in genau eines dieser Muster.

| Muster | Erkennung | Transform |
|---|---|---|
| **A — Direkt-Select aus `faelle`, nur SP-G-Spalten (Klasse A/B)** | `from('faelle').select('id, claim_id, gutachten_betrag, …').eq('id', fallId)` | Quelle wechseln: `from('gutachten').select('gesamt_schadensbetrag, …').eq('claim_id', claimId).maybeSingle()`. **Spalten renamen** beim Select. Property-Access auf den neuen Namen (`gutachten?.gesamt_schadensbetrag`). |
| **B — Direkt-Select aus `faelle`, gemischt** | `from('faelle').select('… non-SP-G … gutachten_betrag …')` | SP-G-Spalten in nested `gutachten(...)`-Embed: `from('faelle').select('… non-SP-G …, gutachten(gesamt_schadensbetrag, …)')`. **Spalten renamen** im Embed. Read normalisiert: `const g = Array.isArray(row.gutachten) ? row.gutachten[0] : row.gutachten; g?.gesamt_schadensbetrag`. |
| **C — Write auf `faelle` (Klasse A/B-Spalten)** | `from('faelle').update/insert({… gutachten_betrag … })` | SP-G-Spalten aus dem `faelle`-Write **entfernen**, separater `from('gutachten').upsert({ claim_id, gesamt_schadensbetrag, … }, { onConflict: 'claim_id' })`. **Spalten renamen.** Guard mit `{ error }`-Destructure. Non-SP-G-Spalten im selben Objekt bleiben auf `faelle` (Split). |
| **D — Nested `faelle(...)`-Select von anderer Tabelle** | `from('<x>').select('…, faelle(… gutachten_betrag …)')` | SP-G-Spalten in nested `gutachten(...)`-Embed verschieben — entweder neben dem `faelle`-Embed (`from('<x>').select('…, faelle(non-SP-G), claims:<…>(gutachten(<renamed>))')`) oder doppelt-genestet `faelle(gutachten(<renamed>))` falls Foreign-Key-Pfad existiert. `Array.isArray`-normalisieren. |
| **E — View-Read (Klasse A/B)** | Read aus `v_claim_full` / `v_claim_listing` / `v_faelle_mit_aktuellem_termin` etc. mit SP-G-Spalte | Falls View-Audit (Task 1) Treffer findet: PR1 repointet die View (Output-Spalte unverändert für Backward-Compat oder Rename, Entscheidung im Audit) → **kein Code-Change**. |
| **F — Reader-Umstellung Klasse C** | `fall?.gutachten_vorhanden` / `fall?.gutachten_stundensatz` / `fall?.nutzungsausfall_gesamt` | Site-spezifisch ersetzen: `!!gutachten?.id` (Existenz) bzw. `null`-Pfad (Stundensatz) bzw. `(g?.gutachten_nutzungsausfall_tagessatz_eur ?? 0) * (g?.nutzungsausfall_tage ?? 0)` (Gesamt). |
| **G — Pure TS-Typ / JSX / Property-Access** | `interface`/`type` Field, JSX `${fall.gutachten_betrag}` ohne DB-Zugriff | Property-Rename auf den neuen `gutachten`-Namen, Type-Quelle ggf. von `Database['public']['Tables']['faelle']['Row']['<col>']` auf `Database['public']['Tables']['gutachten']['Row']['<new>']` umstellen. |

**Verify-Endzustand für PR2:** Kontext-sicherer Re-Grep (paren-balanced) über alle 19 Spaltennamen → 0 live `from('faelle')`-Selects/Updates/Inserts und 0 nested `faelle(...)`-Selects die eine der 19 Spalten referenzieren. `npm run build` (mit `NODE_OPTIONS=--max-old-space-size=8192`) grün.

---

## File Structure

**Neu:**
- `scripts/cmm44-spg-measure.sql` — Live-Messung (existiert bereits, committet mit Spec)
- `scripts/cmm44-spg-views-audit.sql` — View-Audit-Query (Task 1)
- `scripts/cmm44-spg-verify.sql` — Verify-Query nach PR1/PR3 (Task 2/6)
- `supabase/migrations/<ts>_cmm44_spg_add_gutachten_columns.sql` — PR1
- `supabase/migrations/<ts>_cmm44_spg_catchup_backfill.sql` — PR3
- `docs/20.05.2026/cmm44-spg-views-audit.md`, `cmm44-spg-inventory.md`, `cmm44-spg-smoke-pr2.md`, `cmm44-spg-smoke-pr3.md`

**Modifiziert (PR2):** `src/`-Files mit `faelle`-seitigem Zugriff auf eine der 19 Spalten (Inventur Task 3). Types: `src/lib/supabase/database.types.ts` (PR1).

---

## Task 0: Live-DB-Drift-Check

**Files:** nutzt `scripts/cmm44-spg-measure.sql` (existiert)

- [ ] **Step 1: 19-Spalten-Messung erneut fahren**

Run:
```bash
npx supabase db query --linked --file scripts/cmm44-spg-measure.sql 2>&1 | grep -E '"zeile"' | sed 's/^ *"zeile": "//; s/",\?$//'
```
Expected: TOTALS-Zeile + 19 Detailzeilen. **11 Spalten** zeigen `g.udt=<typ> null=YES` (Klasse-A-Ziel existiert). **0 Spalten** zeigen `!! FEHLT auf faelle` (sonst gedroppt durch andere Session). **5 Spalten der Klasse B** (ki_* + gutachten_positionen) zeigen `(kein direktes Ziel)` — wird in PR1 ADD-COLUMN-Block addressiert. **3 Spalten der Klasse C** (gutachten_vorhanden/stundensatz/nutzungsausfall_gesamt) zeigen ebenfalls `(kein direktes Ziel)` — werden nicht migriert.

- [ ] **Step 2: Kein Commit** — reiner Verifikationsschritt.

---

## Task 1: PR1 — View-Audit + Migration schreiben + Dry-Run

**Branch:** `kitta/cmm-44-spg-pr1-add-columns`, frisch von `kitta/cmm-44-spg` (Spec-Branch — der Spec-Commit `210391b7` muss mitgenommen werden, sonst verliert PR1 den Spec).

**Files:**
- Create: `scripts/cmm44-spg-views-audit.sql`
- Create: `scripts/cmm44-spg-verify.sql`
- Create: `docs/20.05.2026/cmm44-spg-views-audit.md`
- Create: `supabase/migrations/<ts>_cmm44_spg_add_gutachten_columns.sql`

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spg-pr1-add-columns kitta/cmm-44-spg
```

- [ ] **Step 2: View-Audit-Query schreiben**

Datei `scripts/cmm44-spg-views-audit.sql`:
```sql
-- CMM-44 SP-G — welche Views exponieren eine der 19 SP-G-Spalten?
-- (Nur die 16 MOVE-Spalten + die 3 Klasse-C-Spalten als Sicherheits-Check.)
SELECT c.table_name AS view_name, c.column_name
FROM information_schema.columns c
JOIN information_schema.views v
  ON v.table_schema = c.table_schema AND v.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name IN (
    'gutachten_eingegangen_am','gutachten_betrag','gutachter_honorar',
    'ocr_extrahiert_am','ocr_rohdaten','gutachten_hochgeladen_am',
    'gutachten_nummer','reparaturkosten','wertminderung',
    'nutzungsausfall_tagessatz','reparaturdauer_tage',
    'ki_kalkulation','ki_kalkulation_am','ki_geschaetzte_kosten_min',
    'ki_geschaetzte_kosten_max','gutachten_positionen',
    'gutachten_vorhanden','gutachten_stundensatz','nutzungsausfall_gesamt'
  )
ORDER BY c.table_name, c.column_name;
```

- [ ] **Step 3: View-Audit ausführen + dokumentieren**

Run: `npx supabase db query --linked --file scripts/cmm44-spg-views-audit.sql 2>&1 | tail -80`

Ergebnis nach `docs/20.05.2026/cmm44-spg-views-audit.md` schreiben — Tabelle `view_name | column_name`. Für jede Treffer-View per `pg_get_viewdef('public.<view>', true)` prüfen, ob die Spalte aus `f.<col>` (faelle-Alias) oder schon aus `gutachten.<col>` gespeist wird:
```bash
echo "SELECT pg_get_viewdef('public.<view_name>', true);" > /tmp/spg-vd.sql
npx supabase db query --linked --file /tmp/spg-vd.sql 2>&1 | tail -40
```
- Trefferliste **leer** → kein View-Repoint nötig, Migration-Block 3 entfällt.
- Treffer aus `f.<col>` → in der PR1-Migration Block 3 ein `CREATE OR REPLACE VIEW` mit Quell-Wechsel von `f.<col>` auf `gutachten.<col>` via Join `LEFT JOIN public.gutachten g ON g.claim_id = f.claim_id` (falls der View den Join noch nicht hat). Output-Spalten-Namen bleiben unverändert (Backward-Compat — Spalten heißen in der View weiterhin `gutachten_betrag` etc., werden aber jetzt aus `g.gesamt_schadensbetrag` gespeist).
- Treffer aus `gutachten.<col>` (selten — Spalte heißt zufällig gleich) → kein Repoint.

- [ ] **Step 4: Verify-Query schreiben**

Datei `scripts/cmm44-spg-verify.sql`:
```sql
-- CMM-44 SP-G — Verify: 5 neue Spalten auf gutachten?
SELECT count(*) AS spg_neu_auf_gutachten
FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachten'
  AND column_name IN (
    'ki_kalkulation','ki_kalkulation_am',
    'ki_geschaetzte_kosten_min','ki_geschaetzte_kosten_max',
    'positionen'
  );
```

- [ ] **Step 5: Trigger-Body inspizieren (Risiko-Mitigation aus Spec §6)**

Run:
```bash
cat > /tmp/spg-triggers.sql <<'SQL'
SELECT p.proname, p.prosrc
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'gutachten' AND NOT t.tgisinternal
ORDER BY p.proname;
SQL
npx supabase db query --linked --file /tmp/spg-triggers.sql 2>&1 | tail -100
```

Output prüfen — feuern die Trigger-Funktionen Notifications/Emails/WhatsApp (`pg_notify`, `http_post`, `net.http_*`, externe Funktions-Calls)? **Falls ja:** PR1-Migration den Backfill-Block in `ALTER TABLE public.gutachten DISABLE TRIGGER <name>;` / `… ENABLE TRIGGER …;` wrappen. **Falls nein** (nur internal state wie `claims.phase` neu setzen): Backfill triggert die Updates harmlos, kein Wrapper nötig. Befund in `docs/20.05.2026/cmm44-spg-views-audit.md` als „Trigger-Audit"-Sektion festhalten.

- [ ] **Step 6: PR1-Migration generieren**

Run: `npx supabase migration new cmm44_spg_add_gutachten_columns`

Inhalt der generierten Datei — drei Blöcke in `BEGIN/COMMIT` (View-Repoint-Block konditional):

```sql
-- CMM-44 SP-G PR1 — additive Migration (kein DROP)
-- Block 1: 5× ADD COLUMN auf gutachten (4 ki_* + positionen)
-- Block 2: UPSERT-Backfill der 16 MOVE-Spalten claims_id-uniq aus faelle
-- Block 3: View-Repoint (konditional — falls View-Audit Treffer fand)
-- Nach Apply: npx supabase migration repair --status applied <timestamp>
-- Ticket: CMM-44 / Sub-Projekt SP-G

BEGIN;

-- ============================================================
-- Block 1: ADD COLUMN — 5 neue Spalten auf public.gutachten
-- ============================================================
ALTER TABLE public.gutachten
  ADD COLUMN ki_kalkulation jsonb,
  ADD COLUMN ki_kalkulation_am timestamptz,
  ADD COLUMN ki_geschaetzte_kosten_min numeric,
  ADD COLUMN ki_geschaetzte_kosten_max numeric,
  ADD COLUMN positionen jsonb;

-- ============================================================
-- Block 2: Initial-Backfill — gutachten <- faelle via UPSERT
-- COALESCE: bestehende gutachten-Werte gewinnen, faelle füllt NULL-Lücken.
-- Trigger-Wrapper hier einsetzen, falls Step 5 Side-Effects gefunden hat:
--   ALTER TABLE public.gutachten DISABLE TRIGGER trg_gutachten_benachrichtigung;
-- (analog ENABLE am Block-Ende).
-- ============================================================
INSERT INTO public.gutachten (
  claim_id,
  fertiggestellt_am,
  gesamt_schadensbetrag,
  gutachten_sv_honorar_netto,
  ocr_finished_at,
  gutachten_ocr_raw,
  pdf_uploaded_at,
  auftragsnummer,
  reparaturkosten_netto,
  minderwert,
  gutachten_nutzungsausfall_tagessatz_eur,
  wiederbeschaffungsdauer_tage,
  ki_kalkulation,
  ki_kalkulation_am,
  ki_geschaetzte_kosten_min,
  ki_geschaetzte_kosten_max,
  positionen
)
SELECT
  claim_id,
  gutachten_eingegangen_am,
  gutachten_betrag,
  gutachter_honorar,
  ocr_extrahiert_am,
  ocr_rohdaten,
  gutachten_hochgeladen_am,
  gutachten_nummer,
  reparaturkosten,
  wertminderung,
  nutzungsausfall_tagessatz,
  reparaturdauer_tage,
  ki_kalkulation,
  ki_kalkulation_am,
  ki_geschaetzte_kosten_min,
  ki_geschaetzte_kosten_max,
  gutachten_positionen
FROM public.faelle
WHERE claim_id IS NOT NULL
  AND (
       gutachten_eingegangen_am IS NOT NULL
    OR gutachten_betrag IS NOT NULL
    OR gutachter_honorar IS NOT NULL
    OR ocr_extrahiert_am IS NOT NULL
    OR ocr_rohdaten IS NOT NULL
    OR gutachten_hochgeladen_am IS NOT NULL
    OR gutachten_nummer IS NOT NULL
    OR reparaturkosten IS NOT NULL
    OR wertminderung IS NOT NULL
    OR nutzungsausfall_tagessatz IS NOT NULL
    OR reparaturdauer_tage IS NOT NULL
    OR ki_kalkulation IS NOT NULL
    OR ki_kalkulation_am IS NOT NULL
    OR ki_geschaetzte_kosten_min IS NOT NULL
    OR ki_geschaetzte_kosten_max IS NOT NULL
    OR gutachten_positionen IS NOT NULL
  )
ON CONFLICT (claim_id) DO UPDATE SET
  fertiggestellt_am                       = COALESCE(public.gutachten.fertiggestellt_am, EXCLUDED.fertiggestellt_am),
  gesamt_schadensbetrag                   = COALESCE(public.gutachten.gesamt_schadensbetrag, EXCLUDED.gesamt_schadensbetrag),
  gutachten_sv_honorar_netto              = COALESCE(public.gutachten.gutachten_sv_honorar_netto, EXCLUDED.gutachten_sv_honorar_netto),
  ocr_finished_at                         = COALESCE(public.gutachten.ocr_finished_at, EXCLUDED.ocr_finished_at),
  gutachten_ocr_raw                       = COALESCE(public.gutachten.gutachten_ocr_raw, EXCLUDED.gutachten_ocr_raw),
  pdf_uploaded_at                         = COALESCE(public.gutachten.pdf_uploaded_at, EXCLUDED.pdf_uploaded_at),
  auftragsnummer                          = COALESCE(public.gutachten.auftragsnummer, EXCLUDED.auftragsnummer),
  reparaturkosten_netto                   = COALESCE(public.gutachten.reparaturkosten_netto, EXCLUDED.reparaturkosten_netto),
  minderwert                              = COALESCE(public.gutachten.minderwert, EXCLUDED.minderwert),
  gutachten_nutzungsausfall_tagessatz_eur = COALESCE(public.gutachten.gutachten_nutzungsausfall_tagessatz_eur, EXCLUDED.gutachten_nutzungsausfall_tagessatz_eur),
  wiederbeschaffungsdauer_tage            = COALESCE(public.gutachten.wiederbeschaffungsdauer_tage, EXCLUDED.wiederbeschaffungsdauer_tage),
  ki_kalkulation                          = COALESCE(public.gutachten.ki_kalkulation, EXCLUDED.ki_kalkulation),
  ki_kalkulation_am                       = COALESCE(public.gutachten.ki_kalkulation_am, EXCLUDED.ki_kalkulation_am),
  ki_geschaetzte_kosten_min               = COALESCE(public.gutachten.ki_geschaetzte_kosten_min, EXCLUDED.ki_geschaetzte_kosten_min),
  ki_geschaetzte_kosten_max               = COALESCE(public.gutachten.ki_geschaetzte_kosten_max, EXCLUDED.ki_geschaetzte_kosten_max),
  positionen                              = COALESCE(public.gutachten.positionen, EXCLUDED.positionen);

-- ============================================================
-- Block 3: View-Repoint — nur falls Task 1 Step 3 Treffer fand.
-- Pro betroffene View ein CREATE OR REPLACE VIEW, das die SP-G-Spalten
-- von f.<col> auf gutachten.<new> umstellt (Output-Name unverändert für
-- Backward-Compat). View-Def per pg_get_viewdef holen, manuell editieren.
-- Falls Audit leer: dieser Block entfällt komplett.
-- ============================================================

COMMIT;
```

**Trigger-Side-Effects:** Falls Step 5 Side-Effects gefunden hat, vor `INSERT` einfügen:
```sql
ALTER TABLE public.gutachten DISABLE TRIGGER trg_gutachten_benachrichtigung;
```
und nach dem Backfill-Block:
```sql
ALTER TABLE public.gutachten ENABLE TRIGGER trg_gutachten_benachrichtigung;
```
**`trg_refresh_claim_phase_from_gutachten` und `set_gutachten_updated_at` NICHT disablen** — die sind erwünscht (`claims.phase` soll konsistent bleiben, `updated_at` soll aktualisiert werden).

- [ ] **Step 7: Dry-Run gegen die Live-DB**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spg_add_gutachten_columns.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/spg-pr1-dryrun.sql
npx supabase db query --linked --file /tmp/spg-pr1-dryrun.sql 2>&1 | tail -10
```
Expected: kein Fehler. Bei „column … already exists" → Drift (eine ki_*-Spalte oder `positionen` ist auf gutachten schon da) → betroffene Spalte aus Block 1 + Block 2 streichen + im Bericht vermerken. Bei „duplicate key value violates unique constraint" → Backfill-Konflikt auf `auftragsnummer` (UNIQUE) — passiert wenn zwei `faelle` denselben `gutachten_nummer` führen; pro Konflikt eine `WHERE auftragsnummer IS NULL OR NOT EXISTS …`-Klausel ergänzen. Bei „trigger … fired" mit Side-Effect-Notification → Trigger-Disable im Block 2 nachziehen.

- [ ] **Step 8: Commit (Scripts + Migrationsdatei, noch nicht appliziert)**

```bash
git add scripts/cmm44-spg-views-audit.sql scripts/cmm44-spg-verify.sql docs/20.05.2026/cmm44-spg-views-audit.md supabase/migrations/*_cmm44_spg_add_gutachten_columns.sql
git commit -F - <<'EOF'
chore(CMM-44): SP-G PR1 — ADD-Migration + View/Trigger-Audit (vor Apply)

5x ADD COLUMN auf gutachten (ki_* + positionen) + UPSERT-Backfill der 16
MOVE-Spalten faelle->gutachten via ON CONFLICT (claim_id) DO UPDATE COALESCE.
View-Audit + Trigger-Body-Audit-Ergebnisse in docs/20.05.2026/. Dry-Run
gegen Live-DB grün.

Audit:
- Build: n/a (SQL + Audit-Doc, kein Code)
- UI: n/a
- Redundanz: Verify-/Audit-SQL folgt SP-B-probe-Muster
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md
- Inkonsistenz: Spalten-Defs aus Live-Messung, nicht geraten
- Regression: n/a (additiv, noch nicht appliziert)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: PR1 — Apply + Verify + Types + Build + Push

**Branch:** `kitta/cmm-44-spg-pr1-add-columns` (Fortsetzung von Task 1). **PR wird in Task 2 Step 7 NOCH NICHT geöffnet** — die `feedback_draft_pr_nicht_release_sicher`-Lesson: Branch pushen, intern reviewen, erst nach bestandenem Review PR öffnen.

- [ ] **Step 1: Drift-Recheck**

Run:
```bash
npx supabase db query --linked --file scripts/cmm44-spg-measure.sql 2>&1 | grep -E '"zeile"' | sed 's/^ *"zeile": "//; s/",\?$//'
```
Expected: 11 Klasse-A-Spalten mit `g.udt=<typ>`-Ziel, 5 Klasse-B-Spalten `(kein direktes Ziel)`, 3 Klasse-C-Spalten `(kein direktes Ziel)`. Bei Drift → Task 1 Step 7 wiederholen, Migration anpassen.

- [ ] **Step 2: Migration applizieren**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spg_add_gutachten_columns.sql | tail -1)
TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -10
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
```
Expected: kein Fehler. `migration repair` meldet „Repaired migration history: [<TS>] => applied".

- [ ] **Step 3: Verify — 5 neue Spalten auf `gutachten`**

```bash
npx supabase db query --linked --file scripts/cmm44-spg-verify.sql 2>&1 | grep -E '"spg_neu_auf_gutachten"'
```
Expected: `"spg_neu_auf_gutachten": 5`.

- [ ] **Step 4: Backfill-Effekt verifizieren**

```bash
cat > /tmp/spg-backfill-verify.sql <<'SQL'
-- Wieviele gutachten-Zeilen existieren jetzt insgesamt + wieviele wurden
-- durch SP-G PR1 angelegt (Approximation: gutachten.created_at >= now() - interval '5 min')?
SELECT
  (SELECT count(*) FROM public.gutachten) AS gutachten_rows_total,
  (SELECT count(*) FROM public.gutachten WHERE created_at >= now() - interval '5 min') AS gutachten_rows_neu,
  (SELECT count(DISTINCT claim_id) FROM public.faelle WHERE claim_id IS NOT NULL AND (
     gutachten_eingegangen_am IS NOT NULL OR gutachten_betrag IS NOT NULL OR
     gutachter_honorar IS NOT NULL OR ocr_extrahiert_am IS NOT NULL OR
     ocr_rohdaten IS NOT NULL OR gutachten_hochgeladen_am IS NOT NULL OR
     gutachten_nummer IS NOT NULL OR reparaturkosten IS NOT NULL OR
     wertminderung IS NOT NULL OR nutzungsausfall_tagessatz IS NOT NULL OR
     reparaturdauer_tage IS NOT NULL OR ki_kalkulation IS NOT NULL OR
     ki_kalkulation_am IS NOT NULL OR ki_geschaetzte_kosten_min IS NOT NULL OR
     ki_geschaetzte_kosten_max IS NOT NULL OR gutachten_positionen IS NOT NULL
   )) AS faelle_mit_spg_werten;
SQL
npx supabase db query --linked --file /tmp/spg-backfill-verify.sql 2>&1 | tail -8
```
Expected: `gutachten_rows_total >= 1` (1 alter Test-Row + N neu); `faelle_mit_spg_werten ≤ gutachten_rows_total` (jeder faelle-Eintrag mit SP-G-Werten hat jetzt einen gutachten-Row).

- [ ] **Step 5: Types regenerieren**

```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts 2>$null
```
PowerShell-Variante (`2>$null`) statt Bash-`2>&1`, weil Bash sonst CLI-Stderr-Update-Notice in das Types-File bleeden kann (SP-B-Task-2-Lesson). Verifizieren:
```bash
head -1 src/lib/supabase/database.types.ts   # muss "export type Json =" sein
tail -1 src/lib/supabase/database.types.ts   # muss "} as const" sein
```

- [ ] **Step 6: Build**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`, TypeScript-Phase ohne Fehler, exit 0. Falls OOM trotz 8 GB Heap: `.next` löschen (`rm -rf .next`) + erneut.

- [ ] **Step 7: Commit + Push (KEIN PR öffnen)**

```bash
git add src/lib/supabase/database.types.ts
git commit -F - <<'EOF'
feat(CMM-44): SP-G PR1 — 5 Gutachten-Spalten ADD + UPSERT-Backfill 16 MOVE

ADD COLUMN x5 auf gutachten (ki_kalkulation, ki_kalkulation_am, ki_geschaetzte_
kosten_min/max, positionen) + Initial-Backfill der 16 MOVE-Spalten aus faelle
via INSERT ... ON CONFLICT (claim_id) DO UPDATE SET COALESCE(...). Migration
appliziert + via repair recorded. Rein additiv — faelle unverändert.
Supabase-Types regeneriert.

Audit:
- Build: grün (npm run build, exit 0)
- UI: n/a (Schema-Vorbereitung, kein UI-Change)
- Redundanz: keine — 5 Spalten auf gutachten neu (Live-Messung)
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md
- Inkonsistenz: Spalten-Defs live gemessen; Verify spg_neu_auf_gutachten=5
- Regression: additiv — bestehende Reader/Writer unberührt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spg-pr1-add-columns
```

**Wichtig:** `gh pr create` jetzt NICHT ausführen. Branch ist gepusht, wartet auf Spec-Review + Code-Quality-Review (siehe subagent-driven-development-Skill). Review-Loop läuft auf Branch-Ebene, PR erst nach beidem Reviews ✅.

- [ ] **Step 8: PR öffnen — erst NACH bestandenen Reviews**

Nach erfolgreichen Reviews:
```bash
gh pr create --base staging --title "CMM-44 SP-G PR1 — 5 ADD + UPSERT-Backfill (16 MOVE-Spalten)" --body "Additive ADD-COLUMN-Migration + UPSERT-Backfill der Gutachten-MOVE-Spalten. Migration bereits appliziert + repair-recorded. Spec: docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md"
```

> **GATE:** Task 3 (PR2) startet erst, wenn PR1 auf `staging` gemergt ist — der Reader-Sweep braucht die regenerierten Types in `database.types.ts`.

---

## Task 3: PR2 — Call-Site-Inventur

**Branch:** `kitta/cmm-44-spg-pr2-sweep`, frisch von `origin/staging` (nach PR1-Merge).

**Files:**
- Create: `docs/20.05.2026/cmm44-spg-inventory.md`

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spg-pr2-sweep origin/staging
```

- [ ] **Step 2: Kontext-sicherer Call-Site-Sweep (paren-balanced)**

SP-B hat gezeigt: naive `grep`-basierte Inventur übersieht multi-line `from('faelle').select(...)`-Blöcke und doppelt-genestete `faelle(...)`-Embeds. Lösung: paren-balanced Node-Skript.

Datei `scripts/cmm44-spg-grep.mjs` (Inventur-Helper, kann nach Sweep gelöscht werden):
```javascript
#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const COLS = [
  'gutachten_eingegangen_am','gutachten_betrag','gutachter_honorar',
  'ocr_extrahiert_am','ocr_rohdaten','gutachten_hochgeladen_am',
  'gutachten_nummer','reparaturkosten','wertminderung',
  'nutzungsausfall_tagessatz','reparaturdauer_tage',
  'ki_kalkulation','ki_kalkulation_am','ki_geschaetzte_kosten_min',
  'ki_geschaetzte_kosten_max','gutachten_positionen',
  'gutachten_vorhanden','gutachten_stundensatz','nutzungsausfall_gesamt',
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

const fromRe = /\.from\(['"]faelle['"]\)/g
const nestedRe = /\bfaelle\s*\(/g

const hits = []
for (const f of walk('src')) {
  const s = fs.readFileSync(f, 'utf8')

  // Direkt-from(faelle): 1500-char Fenster
  let m
  while ((m = fromRe.exec(s))) {
    const window = s.slice(m.index, m.index + 1500)
    for (const c of COLS) {
      const re = new RegExp(`\\b${c}\\b`)
      // Ausschluss: SP-G-Spalte im claims:claim_id(...) oder gutachten(...)-Sub-Embed
      const stripped = window
        .replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, '')
        .replace(/gutachten\s*\(([^()]|\([^()]*\))*\)/g, '')
      if (re.test(stripped)) {
        const ln = s.slice(0, m.index).split('\n').length
        hits.push(`${f}:${ln} | ${c} | from('faelle') multi-line`)
        break
      }
    }
  }

  // Nested faelle(...): pro Treffer den Inhalt der Klammer durchsuchen
  nestedRe.lastIndex = 0
  while ((m = nestedRe.exec(s))) {
    // Paren-balance: ab match + 'faelle('.length den Block bis zur passenden ')' lesen
    const start = m.index + m[0].length
    let depth = 1, end = start
    while (end < s.length && depth > 0) {
      const ch = s[end]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      end++
    }
    const body = s.slice(start, end - 1)
    // Sub-Embeds (claims/gutachten) entfernen — die sind ok
    const stripped = body
      .replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, '')
      .replace(/gutachten\s*\(([^()]|\([^()]*\))*\)/g, '')
    for (const c of COLS) {
      const re = new RegExp(`\\b${c}\\b`)
      if (re.test(stripped)) {
        const ln = s.slice(0, m.index).split('\n').length
        hits.push(`${f}:${ln} | ${c} | nested faelle(...)`)
        break
      }
    }
  }

  // Klasse-C-Property-Access: fall?.gutachten_vorhanden / fall.gutachten_stundensatz / fall?.nutzungsausfall_gesamt
  for (const c of ['gutachten_vorhanden','gutachten_stundensatz','nutzungsausfall_gesamt']) {
    const re = new RegExp(`\\b\\w+\\??\\.${c}\\b`, 'g')
    let prop
    while ((prop = re.exec(s))) {
      const ln = s.slice(0, prop.index).split('\n').length
      hits.push(`${f}:${ln} | ${c} | Klasse-C-Property-Access (${prop[0]})`)
    }
  }
}

console.log(hits.join('\n'))
console.log(`\nTOTAL HITS: ${hits.length}`)
```

Run:
```bash
node scripts/cmm44-spg-grep.mjs > /tmp/spg-hits.txt
wc -l /tmp/spg-hits.txt
head -40 /tmp/spg-hits.txt
```

- [ ] **Step 3: Inventur-Doc schreiben**

`docs/20.05.2026/cmm44-spg-inventory.md` — Tabelle (oder Liste) der Treffer: `Datei:Zeile | Spalte | Muster A-G`. Klassifizierung pro Treffer (Muster-Regelwerk im Plan-Header). Bei Display-Strings (`${fall.gutachten_betrag}`) als Muster G klassifizieren. Bei Type-Definitionen (`type FaelleRow = …`) ebenfalls Muster G. Bei `triggerStatusEmail`/`apply_gutachten_ocr`-RPC-Calls als „aus Scope" markieren (RPC schreibt schon gutachten).

Falls die Inventur **>80 betroffene Files** zählt, hier den Spec-Hinweis prüfen: „bei <80 reicht 1 PR" — sonst Cluster-Schnitt einplanen (z.B. PR2a Klasse A+B / PR2b Klasse C+G).

```bash
git add docs/20.05.2026/cmm44-spg-inventory.md scripts/cmm44-spg-grep.mjs
git commit -m "docs(CMM-44): SP-G PR2 — Call-Site-Inventur (paren-balanced)"
```

---

## Task 4: PR2 — Transform anwenden

**Files:** alle in der Inventur als A/B/C/D klassifizierten Files. Klasse E/F → kein Code-Change; Klasse G → Property-Rename ohne DB-Wechsel.

- [ ] **Step 1: Pro Call-Site das Transform anwenden**

Aus Task 3 Inventur-Doc abarbeiten, eine Datei nach der anderen. Pattern aus dem Plan-Header (§ „Transform-Regelwerk"):

**Beispiel Muster A** (`fall-finanzen.ts`-Analog):
```typescript
// VORHER
const { data: fall } = await db.from('faelle')
  .select('claim_id, gutachten_betrag, wertminderung, gutachter_honorar')
  .eq('id', fallId).single()
const betrag = fall?.gutachten_betrag

// NACHHER
const { data: fall } = await db.from('faelle')
  .select('claim_id')
  .eq('id', fallId).single()
let gutachtenRow: { gesamt_schadensbetrag: number | null; minderwert: number | null; gutachten_sv_honorar_netto: number | null } | null = null
if (fall?.claim_id) {
  const { data: g } = await db.from('gutachten')
    .select('gesamt_schadensbetrag, minderwert, gutachten_sv_honorar_netto')
    .eq('claim_id', fall.claim_id).maybeSingle()
  gutachtenRow = g
}
const betrag = gutachtenRow?.gesamt_schadensbetrag
```

**Beispiel Muster B** (gemischter Select):
```typescript
// VORHER
const { data } = await db.from('faelle')
  .select('id, status, gutachten_betrag, wertminderung')
  .eq('id', fallId).single()
const w = data?.wertminderung

// NACHHER
const { data } = await db.from('faelle')
  .select('id, status, gutachten(gesamt_schadensbetrag, minderwert)')
  .eq('id', fallId).single()
const g = Array.isArray(data?.gutachten) ? data.gutachten[0] : data?.gutachten
const w = g?.minderwert
```

**Beispiel Muster C** (Writer):
```typescript
// VORHER
await db.from('faelle').update({ gutachten_betrag, wertminderung, status: 'erstellt' }).eq('id', fallId)

// NACHHER (Split — SP-G-Spalten auf gutachten, status bleibt auf faelle):
const { data: fall } = await db.from('faelle').select('claim_id').eq('id', fallId).single()
if (fall?.claim_id) {
  const { error: gErr } = await db.from('gutachten').upsert(
    { claim_id: fall.claim_id, gesamt_schadensbetrag: gutachten_betrag, minderwert: wertminderung },
    { onConflict: 'claim_id' }
  )
  if (gErr) return { ok: false, error: gErr.message }
}
const { error: fErr } = await db.from('faelle').update({ status: 'erstellt' }).eq('id', fallId)
if (fErr) return { ok: false, error: fErr.message }
```

**Beispiel Muster F — `gutachten_vorhanden`:**
```typescript
// VORHER
if (fall?.gutachten_vorhanden) { … }

// NACHHER (Default — Existenz-Check):
const { data: g } = await db.from('gutachten').select('id').eq('claim_id', fall.claim_id).maybeSingle()
if (g?.id) { … }
// Falls Reader-Site einen Status-Filter erwartet (z.B. „nur fertiges Gutachten"),
// die konkrete Bedingung pro Site setzen, nicht generisch raten.
```

**Beispiel Muster F — `nutzungsausfall_gesamt`:**
```typescript
// VORHER
const gesamt = fall?.nutzungsausfall_gesamt ?? 0

// NACHHER
const { data: g } = await db.from('gutachten')
  .select('gutachten_nutzungsausfall_tagessatz_eur, nutzungsausfall_tage')
  .eq('claim_id', fall.claim_id).maybeSingle()
const gesamt = (Number(g?.gutachten_nutzungsausfall_tagessatz_eur) || 0) * (Number(g?.nutzungsausfall_tage) || 0)
```

**Beispiel Muster F — `gutachten_stundensatz`:**
```typescript
// VORHER
const ssatz = fall?.gutachten_stundensatz ?? null
// Im JSX:  <span>{ssatz ?? '–'} €/h</span>

// NACHHER — Variante 1 (Display behalten, gutachten.gutachten_lohnsatz_ak_eur als Surrogat):
const { data: g } = await db.from('gutachten').select('gutachten_lohnsatz_ak_eur').eq('claim_id', fall.claim_id).maybeSingle()
const ssatz = (g?.gutachten_lohnsatz_ak_eur as number | null) ?? null

// NACHHER — Variante 2 (Display ersatzlos entfernen, wenn pre-launch nie sichtbar war):
// JSX-Block + Variable löschen
```
Site-Entscheidung dokumentieren — die Inventur-Notiz pro Stelle ergänzen.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: 0 Fehler. Typische Fehler:
- „Property 'gutachten_betrag' does not exist on type 'Tables<\"faelle\">'..." → der Select wurde umgestellt aber der Reader liest noch das alte Property. Reader-Stelle nachziehen.
- „Argument of type … is not assignable to parameter of type 'never'" — `claims:claim_id(...)`-Embed-Typ wird je nach Relation-Detection als Objekt-oder-Array typisiert. `Array.isArray`-Normalisierung einsetzen + ggf. explizite Typ-Annotation am `gutachtenRow` (`as { … } | null`).

- [ ] **Step 3: Kontext-sicherer Re-Grep (Voll-Sweep)**

```bash
node scripts/cmm44-spg-grep.mjs > /tmp/spg-postsweep.txt
echo "HITS noch im Code:"
cat /tmp/spg-postsweep.txt
```
Expected: leere oder fast leere Liste. Verbleibende Treffer pro Stück triagieren — sind sie wirklich live `faelle`-Reads/Writes oder false-positives (z.B. Code-Kommentare, JSX-Display-Strings die nur den Namen erwähnen)? Echte Reste: Site fixen + erneut greppen, bis sauber.

- [ ] **Step 4: Voller Build**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`, exit 0. Routen/Server-Actions betroffen → voller Build, nicht nur `tsc`.

- [ ] **Step 5: Commit + Push (KEIN PR öffnen — Review-Gate wie PR1)**

```bash
git add -A
git commit -F - <<'EOF'
refactor(CMM-44): SP-G PR2 — Reader/Writer-Sweep faelle->gutachten

19 Gutachten-bezogene Spalten: alle faelle-seitigen Reads/Writes auf
gutachten umgestellt. 11 Klasse-A-Mappings (1:1 Rename, Ziel existiert),
5 Klasse-B (durch PR1 ADD COLUMN auf gutachten), 3 Klasse-C (abgeleitet:
gutachten_vorhanden via Existenz, gutachten_stundensatz null/Lohnsatz-AK,
nutzungsausfall_gesamt aus tagessatz*tage). Pattern C = MOVE (gutachten-only,
kein Dual-Write). Kein DB-Schema-Change in diesem PR.

Audit:
- Build: grün (npm run build, exit 0)
- UI: kein neuer Einstiegspunkt (Quell-Tabellen-Wechsel + Property-Rename)
- Redundanz: bestehende gutachten-Reads/Embeds genutzt
- Dead-Code: faelle-seitige Zugriffe der 19 Spalten entfernt
- Spec: docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md
- Inkonsistenz: Spalten-Rename konsistent angewendet; Writes treffen gutachten direkt
- Regression: kontext-sicherer paren-balanced Re-Grep = 0 live faelle-Zugriffe

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spg-pr2-sweep
```

**Wichtig:** wieder kein `gh pr create` — wartet auf Reviews (Spec + Code-Quality).

- [ ] **Step 6: PR öffnen NACH Reviews**

```bash
gh pr create --base staging --title "CMM-44 SP-G PR2 — Reader/Writer-Sweep faelle->gutachten (19 Spalten)" --body "Tabellen-Wechsel + Spalten-Rename für 19 Gutachten-bezogene Spalten. Kein DB-Schema-Change. Spec: docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md"
```

---

## Task 5: PR2 — Portal-Smoke (nach staging-Merge)

**Files:**
- Create: `docs/20.05.2026/cmm44-spg-smoke-pr2.md`

- [ ] **Step 1: PR-Merge abwarten + staging-Deploy**

PR2 wird nach Spec+Code-Quality-Review auf staging gemergt (Session-Auto-Merge erlaubt). VPS-Deploy ist automatisch via PM2.

- [ ] **Step 2: Smoke-Script ausführen**

Falls `scripts/smoke-cmm44-spb.mjs` (SP-B) existiert: kopieren + auf SP-G-Felder anpassen (`gutachten_betrag` / `wertminderung` / `reparaturkosten` Display-Strings, KI-Felder-Anzeige falls UI dafür existiert).

Falls noch keins: einmaliges manuelles Klick-Smoke gegen `app.staging.claimondo.de` für **5 Portale**:

| Portal | URL-Pfad | Was prüfen |
|---|---|---|
| Public | `/` | — (irrelevant für SP-G) |
| Admin | `/admin/faelle/<id>` | Fallakte-Header: Gutachten-Betrag, Wertminderung, Reparaturkosten anzeigt; Finance-Tab: Kanzlei-Provisions-Berechnung korrekt |
| Dispatch | `/dispatch/leads/<id>` | (eher irrelevant für SP-G, aber Klick-Sanity-Check) |
| SV | `/gutachter/auftraege/<id>` | Gutachten-Upload-Status, OCR-Status |
| Kunde | `/kunde/faelle/<id>` | Schadenshöhe-Display |

Screenshots im selben Turn auswerten (`feedback_smoke_screenshot_pflicht`).

- [ ] **Step 3: Smoke-Protokoll**

`docs/20.05.2026/cmm44-spg-smoke-pr2.md` — Tabelle Portal × Seite × OK/WARN/FAIL, Screenshot-Referenzen, Befunde. Bei Hard-Fail: STOP, Befund analysieren, ggf. PR2-Nachzug aufmachen (PR2-Branch ist gemergt → neuer Branch off staging).

```bash
git add docs/20.05.2026/cmm44-spg-smoke-pr2.md
git commit -m "docs(CMM-44): SP-G PR2 — Portal-Smoke-Protokoll (5 Portale)"
git push origin HEAD
```

> **GATE:** Task 6 (PR3) startet erst, wenn PR2 auf `main` ist (staging→main-Release durch Aaron).

---

## Task 6: PR3 — Catch-up-Backfill

**Branch:** `kitta/cmm-44-spg-pr3-catchup-backfill`, frisch von `origin/staging`.

> **GATE-Check inhaltsbasiert** (Squash-Release, SP-A-Lektion c):
> ```bash
> git fetch origin
> git diff origin/main origin/staging -- src/ supabase/migrations/ | head -5
> ```
> Output leer oder nur unwesentlich → PR1+PR2 sind inhaltsbasiert auf main. Andernfalls warten.

**Files:**
- Create: `supabase/migrations/<ts>_cmm44_spg_catchup_backfill.sql`

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spg-pr3-catchup-backfill origin/staging
```

- [ ] **Step 2: Catch-up-Backfill-Migration generieren**

Run: `npx supabase migration new cmm44_spg_catchup_backfill`

Inhalt — **identischer UPSERT-Block wie PR1 Block 2**, also INSERT + ON CONFLICT (claim_id) DO UPDATE SET COALESCE(...), in `BEGIN/COMMIT` gewrappt. SP-A2-Pattern: bestehende `gutachten`-Werte gewinnen, faelle füllt nur NULL-Slots. Idempotent + kollisionsfrei. Den PR1-Block 2 1:1 übernehmen, Block 1 (ADD COLUMN) und Block 3 (View-Repoint) entfallen.

```sql
-- CMM-44 SP-G PR3 — Catch-up-Backfill (additiv, kein DROP)
--
-- Fängt SP-G-Werte ein, die zwischen PR1-Initial-Backfill und PR2-Writer-Deploy
-- noch auf faelle geschrieben wurden, während gutachten-seitig leer blieb.
-- Pattern: ON CONFLICT (claim_id) DO UPDATE SET <col> = COALESCE(gutachten.<col>, EXCLUDED.<col>).
-- Bestehende gutachten-Werte gewinnen (claims/gutachten ist SSoT). Idempotent.
--
-- Nach Apply: npx supabase migration repair --status applied <timestamp>
-- Ticket: CMM-44 / Sub-Projekt SP-G / Plan Task 6 / Spec §3 PR3

BEGIN;

INSERT INTO public.gutachten (claim_id, fertiggestellt_am, gesamt_schadensbetrag, …)
SELECT claim_id, gutachten_eingegangen_am, gutachten_betrag, …
FROM public.faelle
WHERE claim_id IS NOT NULL AND (… OR …)   -- (gleicher 16-Spalten-Block wie PR1)
ON CONFLICT (claim_id) DO UPDATE SET
  fertiggestellt_am     = COALESCE(public.gutachten.fertiggestellt_am, EXCLUDED.fertiggestellt_am),
  …;                                       -- (gleicher 16-Spalten-COALESCE-Block wie PR1)

COMMIT;
```

**Wichtig:** Trigger-Disable NICHT wiederholen, falls in PR1 nötig war — der zweite Backfill auf bereits bestehende gutachten-Rows mit COALESCE ist ein No-op auf den meisten Zeilen, weil die Werte schon da sind. Notification-Trigger sollten daher nicht oder maximal für neu-erstellte Rows feuern (pre-launch erträglich).

- [ ] **Step 3: Dry-Run**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spg_catchup_backfill.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/spg-pr3-dryrun.sql
npx supabase db query --linked --file /tmp/spg-pr3-dryrun.sql 2>&1 | tail -5
```
Expected: kein Fehler.

- [ ] **Step 4: Applizieren + Verify**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spg_catchup_backfill.sql | tail -1)
TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -5
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
npx supabase db query --linked --file scripts/cmm44-spg-verify.sql 2>&1 | grep -E '"spg_neu_auf_gutachten"'
```
Expected: `spg_neu_auf_gutachten = 5` unverändert (additiv).

- [ ] **Step 5: Commit + Push**

```bash
git add supabase/migrations/*_cmm44_spg_catchup_backfill.sql
git commit -F - <<'EOF'
feat(CMM-44): SP-G PR3 — Catch-up-Backfill gutachten aus faelle

Idempotenter Re-UPSERT der 16 SP-G-MOVE-Spalten gutachten<-faelle via
INSERT ... ON CONFLICT (claim_id) DO UPDATE SET COALESCE(gutachten.<col>,
EXCLUDED.<col>). Fängt faelle-Writes aus dem Fenster PR1-Backfill ->
PR2-Writer-Deploy. Additiv, kein Drop. Migration appliziert + repair-recorded.

Audit:
- Build: n/a (reine UPSERT-Migration, kein Code)
- UI: n/a
- Redundanz: UPSERT-Block identisch zu PR1 Block 2 (bewusst, idempotent)
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md §3 PR3
- Inkonsistenz: additiv; faelle behält die Daten bis Phase 6
- Regression: n/a (additiv, COALESCE schützt bestehende gutachten-Werte)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spg-pr3-catchup-backfill
```

- [ ] **Step 6: PR öffnen NACH Review (PR3 ist kleine UPSERT-Migration — eine kurze Sicht-Prüfung reicht)**

```bash
gh pr create --base staging --title "CMM-44 SP-G PR3 — Catch-up-Backfill (16 MOVE-Spalten)" --body "Idempotenter Re-UPSERT gutachten<-faelle der 16 MOVE-Spalten. COALESCE-Pattern (bestehende gutachten-Werte gewinnen). Migration bereits appliziert + repair-recorded. Spec: docs/superpowers/specs/2026-05-20-cmm44-spg-gutachten-rest-design.md"
```

- [ ] **Step 7: Finaler Portal-Smoke**

Wie Task 5 — kurzer 5-Portal-Klick-Walk gegen `app.staging.claimondo.de`. Protokoll `docs/20.05.2026/cmm44-spg-smoke-pr3.md`. Bei 0 Hard-Fails fertig.

---

## Task 7: Abschluss

- [ ] **Step 1: Phase-1-Mapping nachziehen**

`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` — Update-Block (analog SP-A2/B-Update):
```markdown
**Update 2026-05-20:** SP-G erledigt — 19 Gutachten-bezogene Spalten (16 MOVE + 3 Reader-Umstellung) auf `gutachten` migriert. 5 ADD COLUMN auf gutachten (4 ki_* + positionen). Architektur additiv (PR1 #<n> Migration / PR2 #<n> Code-Sweep / PR3 #<n> Catch-up); faelle-Spalten bleiben bis Phase 6 (SP-L). Spec/Plan: `docs/superpowers/specs|plans/2026-05-20-cmm44-spg-gutachten-rest*.md`.
```
PR-Nummern nach Merge eintragen.

- [ ] **Step 2: Handoff-Doc schreiben**

`docs/20.05.2026/handoff-cmm44-spg-abschluss.md` — analog SP-B-Handoff: was erledigt, Verifikation (DB + Re-Grep + Build + Smoke), Lessons (SP-G-spezifisch — vor allem Sub-Table-UPSERT, 1:1-Cardinality via UNIQUE-Constraint, Trigger-Side-Effects-Audit), Lose Enden, nächster CMM-44-Schritt (SP-C / SP-G2 / SP-H / SP-J — siehe Phase-1 §4).

- [ ] **Step 3: Memory aktualisieren (extern)**

`C:\Users\Aaron Sprafke\.claude\projects\C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2\memory\project_cmm44_spg_status.md` schreiben (Pattern wie `project_cmm44_spb_status.md`). MEMORY.md-Pointer ergänzen.

- [ ] **Step 4: Commit**

```bash
git add docs/   # NUR docs/ — Memory liegt außerhalb des Repos
git commit -m "docs(CMM-44): SP-G erledigt — Handoff + Phase-1-Mapping nachgezogen"
git push origin HEAD
gh pr create --base staging --title "CMM-44 SP-G Abschluss — Handoff + Phase-1-Mapping" --body "SP-G abgeschlossen — siehe docs/20.05.2026/handoff-cmm44-spg-abschluss.md. Nächster CMM-44-Schritt: SP-C / SP-G2 / SP-H / SP-J."
```

- [ ] **Step 5: Session-Abschluss-Checkliste (AGENTS.md Regel 3)**

```bash
git status                          # Working-Tree clean?
git stash list                      # Leer / alte dokumentierte Stashes?
git log --branches --not --remotes  # Alle lokalen Commits gepusht?
```

---

## Definition of Done

- [ ] PR1 gemergt; Verify: 5 neue Spalten auf `gutachten`; Backfill befüllte alle `faelle`-Zeilen mit SP-G-Werten in `gutachten`-Rows (Step 4 Task 2).
- [ ] PR2 gemergt; kontext-sicherer Re-Grep = 0 live `from('faelle')`-Zugriffe + 0 `faelle(...)`-Nested-Selects der 19 Spalten.
- [ ] PR3 appliziert + recorded; UPSERT idempotent.
- [ ] `npm run build` (8 GB heap) grün nach Type-Regen.
- [ ] 5-Portal-Smoke nach PR2 + PR3 ohne Hard-Fail; Screenshots ausgewertet.
- [ ] Phase-1-Mapping + Handoff-Doc + Memory nachgezogen.

---

## Selbst-Review (Plan vs. Spec)

- **Spec §1 Scope (19 Spalten, 16 MOVE + 3 Reader-Umstellung, deine 3 Aaron-Entscheidungen)** — Task 1 Step 6 deckt 11 A + 5 B; Task 4 Step 1 deckt die 3 Klasse-C-Reader (Beispiele für jede der drei). ✅
- **Spec §1 Mapping-Tabelle** — Plan-Referenz-Tabelle bildet das 1:1 ab. ✅
- **Spec §2 (1:1 Cardinality via `gutachten_claim_id_unique`, Trigger-Liste, RPC `apply_gutachten_ocr`)** — Task 1 Step 5 prüft Trigger-Body live; Migration-UPSERT nutzt `ON CONFLICT (claim_id)`. RPC bleibt unverändert (Spec §3 Out-of-Scope). ✅
- **Spec §3 PR1 (ADD + UPSERT-Backfill + View-Repoint konditional)** — Task 1 + 2 vollständig. ✅
- **Spec §3 PR2 (Reader/Writer-Sweep, Pattern A-G)** — Task 3 (Inventur) + Task 4 (Transform mit Beispielen pro Pattern). ✅
- **Spec §3 PR3 (idempotenter Catch-up COALESCE)** — Task 6. ✅
- **Spec §4 (Migrations-Vorgehen)** — `BEGIN/COMMIT`, Dry-Run, `db query --linked` + `repair`, kein `db push`: Task 1 Step 7, Task 2 Step 2, Task 6 Step 3/4. ✅
- **Spec §5 (5-Portal-Smoke, Erfolgskriterien)** — Task 5 + Task 6 Step 7; `git grep` 0 in Task 4 Step 3 + Definition of Done. ✅
- **Spec §6 Risiken** — alle in Plan-Tasks adressiert: Trigger-Audit (Task 1 Step 5), gutachten_vorhanden konkretes Prädikat (Task 4 Step 1 Muster F), nutzungsausfall_gesamt null-Operand (Task 4 Step 1), kontext-sicherer Re-Grep (Task 3 + Task 4 Step 3 mit paren-balanced Node-Skript), Drift-Recheck (Task 2 Step 1), View-Read-Audit (Task 1 Step 3). ✅
- **`feedback_draft_pr_nicht_release_sicher`** (SP-B-Lesson) — alle PRs: Branch pushen → Review → erst dann `gh pr create`. Vermerkt in Task 2 Step 7+8, Task 4 Step 5+6, Task 6 Step 5+6. ✅
- **Typ-Konsistenz im Plan** — Property-Namen konsistent (`gesamt_schadensbetrag`, `minderwert`, `wiederbeschaffungsdauer_tage` etc.) zwischen Tasks. ✅
- **Plan-Header — Goal/Architecture/Tech Stack** vorhanden, Header-Block-Format korrekt. ✅
- **Keine Placeholders** — alle Tasks zeigen konkrete Code-Beispiele oder Inventur-Befunde. „Pro Site klären"-Stellen sind explizit gerechtfertigt (Klasse-C-Reader müssen pro Stelle entscheiden, das ist kein Placeholder).

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
