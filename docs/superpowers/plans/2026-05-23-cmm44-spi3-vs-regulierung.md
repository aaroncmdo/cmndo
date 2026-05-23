# CMM-44 SP-I3 (Regulierung/VS → kanzlei_faelle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Recipe-Quelle: `docs/23.05.2026/handoff-cmm44-sp-i-completion.md`.

**Goal:** 14 Regulierungs-/VS-Lifecycle-Spalten rein additiv von `faelle` auf die 1:1-Sub-Tabelle `kanzlei_faelle` verschieben (Writer schreiben künftig nur kanzlei_faelle, Reader lesen von dort/Views; `faelle`-Spalten sterben gesammelt in Phase 6).

**Architecture:** Wie SP-I1/SP-I2. PR1 = additives Schema (`ADD COLUMN` + COALESCE-Backfill für cov>0 + View-Repoints). PR2 = Code-Sweep (Writer-COLS erweitern → bestehende Peel-Kaskade greift; ~18 Direkt-Reader auf kanzlei_faelle/View repointen). Kein Dual-Write, kein per-Spalten-DROP.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase Postgres 17, `supabase db query --linked` (Regel 2), generierte TS-Types.

**Verdikt (Aaron 2026-05-23 bestätigt):** alle 14 → `kanzlei_faelle` (Kanzlei-Lifecycle). Admin/SV lesen über Views/Embeds.

---

## Die 14 Spalten (Typen provisorisch aus Handoff — in Step 0 LIVE bestätigen)

| Spalte | PG-Typ (prov.) | cov (prov.) | Writer | Notiz |
|---|---|---|---|---|
| `regulierung_am` | timestamptz | **hoch?** | state-machine (status=regulierung/-laeuft) | viele Finance/Stats-Reader + `.gte/.lte`-Filter |
| `regulierung_angekuendigt_am` | timestamptz | mittel? | state-machine | |
| `vs_eskalationsstufe` | text | **≈30** | (?) | Backfill nötig |
| `regulierungsweise` | text | 0? | (?) | |
| `vs_reaktion_typ` | text | mittel? | process-event + state-machine | section-visibility-Trigger |
| `vs_reaktion_am` | timestamptz | mittel? | process-event + state-machine | |
| `kuerzungs_betrag` | **numeric(?,?)** | mittel? | process-event | InlineEditField (stammdaten) + Gutachter-Reader |
| `vs_frist_bis` | timestamptz | klein? | process-event (mehr_zeit) | |
| `vs_kuerzung_grund` | text | mittel? | process-event + state-machine | |
| `vs_quote_prozent` | **numeric(?,?)** | klein? | process-event (quotiert) | |
| `vs_quote_grund` | text | klein? | process-event | |
| `vs_quote_akzeptiert_am` | timestamptz | klein? | process-event | |
| `vs_quote_betrag_ausgezahlt` | **numeric(?,?)** | klein? | (?) | |
| `vs_kuerzungs_typ` | text | klein? | process-event (vs_kuerzt, Pflichtfeld) | 'technisch'/'argumentativ'/'gemischt' |

**NICHT SP-I3 (gehen auf claims, NICHT anfassen):** `regulierung_betrag`/`regulierungs_betrag`, `vs_ablehnungsgrund`/`vs_ablehnungs_grund` (SP-A2, von process-event/state-machine bereits zu claims geroutet).

---

## Prerequisite — ERLEDIGT
- [x] #1570 (SP-I2 Schema) + #1581 (SP-I2 Sweep, Helper) + #1589 (SP-I2 Abschluss) alle auf `staging`.
- [x] Worktree `kitta/cmm44-spi3-vs-regulierung` off `origin/staging` (HEAD fc695c4c). `.env.local` + `supabase/.temp` reinkopiert.
- [x] Offline-Inventur + Writer-Analyse abgeschlossen (siehe unten).

---

## Step 0 — Live-Drift-Check (PR1-Prereq, sobald DB erreichbar)

> DB war 2026-05-23 abends nicht erreichbar (MCP + CLI `SASL i/o timeout` / `db query --linked` 544 „login role"; REST-API ok, Projekt ACTIVE_HEALTHY → Connection-Pfad-Problem, iPhone-Hotspot/Pool). **Diese Queries zuerst fahren, Ergebnisse in die Tabelle oben + Migration unten eintragen.**

- [ ] **0a — Typen + Nullability + Defaults + Numeric-Precision (faelle vs kanzlei_faelle):**
```sql
SELECT table_name, column_name, udt_name, numeric_precision, numeric_scale, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('faelle','kanzlei_faelle')
  AND column_name IN ('regulierung_am','regulierung_angekuendigt_am','vs_eskalationsstufe','regulierungsweise','vs_reaktion_typ','vs_reaktion_am','kuerzungs_betrag','vs_frist_bis','vs_kuerzung_grund','vs_quote_prozent','vs_quote_grund','vs_quote_akzeptiert_am','vs_quote_betrag_ausgezahlt','vs_kuerzungs_typ')
ORDER BY column_name, table_name;
```
Erwartung: alle 14 auf `faelle`, **keine** auf `kanzlei_faelle` (sonst Drift → triagieren). Numeric-Precision der 3 numerics notieren (Pflicht für View-Casts, SP-G-Lesson).

- [ ] **0b — Coverage (welche Spalten brauchen Backfill):**
```sql
SELECT count(*) AS total,
  count(regulierung_am) AS regulierung_am, count(regulierung_angekuendigt_am) AS regulierung_angekuendigt_am,
  count(vs_eskalationsstufe) AS vs_eskalationsstufe, count(regulierungsweise) AS regulierungsweise,
  count(vs_reaktion_typ) AS vs_reaktion_typ, count(vs_reaktion_am) AS vs_reaktion_am,
  count(kuerzungs_betrag) AS kuerzungs_betrag, count(vs_frist_bis) AS vs_frist_bis,
  count(vs_kuerzung_grund) AS vs_kuerzung_grund, count(vs_quote_prozent) AS vs_quote_prozent,
  count(vs_quote_grund) AS vs_quote_grund, count(vs_quote_akzeptiert_am) AS vs_quote_akzeptiert_am,
  count(vs_quote_betrag_ausgezahlt) AS vs_quote_betrag_ausgezahlt, count(vs_kuerzungs_typ) AS vs_kuerzungs_typ
FROM faelle;
```
Alle Spalten mit count>0 brauchen einen Backfill-Eintrag (0 = no-op).

- [ ] **0c — Welche Views exponieren die Spalten (für Repoints — Explore sieht nur Code, NICHT DB-Views):**
```sql
SELECT DISTINCT c.relname AS view_name, c.relkind
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m')
  AND a.attname IN ('regulierung_am','regulierung_angekuendigt_am','vs_eskalationsstufe','regulierungsweise','vs_reaktion_typ','vs_reaktion_am','kuerzungs_betrag','vs_frist_bis','vs_kuerzung_grund','vs_quote_prozent','vs_quote_grund','vs_quote_akzeptiert_am','vs_quote_betrag_ausgezahlt','vs_kuerzungs_typ')
ORDER BY view_name;
```
Erwartung mind. `v_faelle_mit_aktuellem_termin`. Jede getroffene View per `pg_get_viewdef(<view>::regclass, true)` dumpen und prüfen, ob sie die Spalte aus `f.` (faelle) zieht.

- [ ] **0d — `vs_reaktion_typ`/`vs_kuerzungs_typ` enum oder text?** (0a `udt_name` zeigt es; falls enum → ADD COLUMN mit demselben enum-Typ, nicht text).

---

## PR1 — Schema (additiv): ADD + Backfill + View-Repoint

**Files:**
- Create: `supabase/migrations/<ts>_cmm44_spi3_regulierung_vs_to_kanzlei_faelle.sql`
- Modify (Doc): `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` (SP-I3-Mapping-Block)

- [ ] **Step 1: Migration-File anlegen** (`npx supabase migration new cmm44_spi3_regulierung_vs_to_kanzlei_faelle`).

- [ ] **Step 2: ADD COLUMN (14, Typen exakt aus 0a — numerics MIT precision/scale):**
```sql
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN IF NOT EXISTS regulierung_am timestamptz,
  ADD COLUMN IF NOT EXISTS regulierung_angekuendigt_am timestamptz,
  ADD COLUMN IF NOT EXISTS vs_eskalationsstufe text,
  ADD COLUMN IF NOT EXISTS regulierungsweise text,
  ADD COLUMN IF NOT EXISTS vs_reaktion_typ text,            -- falls enum: enum-Typ aus 0d
  ADD COLUMN IF NOT EXISTS vs_reaktion_am timestamptz,
  ADD COLUMN IF NOT EXISTS kuerzungs_betrag numeric,        -- precision aus 0a
  ADD COLUMN IF NOT EXISTS vs_frist_bis timestamptz,
  ADD COLUMN IF NOT EXISTS vs_kuerzung_grund text,
  ADD COLUMN IF NOT EXISTS vs_quote_prozent numeric,        -- precision aus 0a
  ADD COLUMN IF NOT EXISTS vs_quote_grund text,
  ADD COLUMN IF NOT EXISTS vs_quote_akzeptiert_am timestamptz,
  ADD COLUMN IF NOT EXISTS vs_quote_betrag_ausgezahlt numeric, -- precision aus 0a
  ADD COLUMN IF NOT EXISTS vs_kuerzungs_typ text;           -- falls enum: enum-Typ aus 0d
```

- [ ] **Step 3: Backfill (NUR cov>0-Spalten aus 0b)** — Muster SP-I2 mandatsnummer: existierende `kanzlei_faelle`-Rows updaten + fehlende anlegen. `status='versicherungskontakt'` NOT-NULL beim Insert (Gotcha 5). Spalten ohne cov weglassen.
```sql
-- UPDATE bestehender kanzlei_faelle-Rows (COALESCE = nur leere überschreiben):
UPDATE public.kanzlei_faelle kf SET
  regulierung_am = COALESCE(kf.regulierung_am, f.regulierung_am),
  vs_eskalationsstufe = COALESCE(kf.vs_eskalationsstufe, f.vs_eskalationsstufe)
  /* … alle cov>0-Spalten … */
FROM public.faelle f
WHERE kf.claim_id = f.claim_id AND f.claim_id IS NOT NULL;
-- INSERT für claims OHNE kanzlei_faelle-Row, die min. eine cov>0-Spalte gesetzt haben:
INSERT INTO public.kanzlei_faelle (claim_id, status, regulierung_am, vs_eskalationsstufe /* … */)
SELECT f.claim_id, 'versicherungskontakt', f.regulierung_am, f.vs_eskalationsstufe /* … */
FROM public.faelle f
WHERE f.claim_id IS NOT NULL
  AND (f.regulierung_am IS NOT NULL OR f.vs_eskalationsstufe IS NOT NULL /* … OR je cov>0-Spalte */)
  AND NOT EXISTS (SELECT 1 FROM public.kanzlei_faelle kf WHERE kf.claim_id = f.claim_id);
```

- [ ] **Step 4: View-Repoint (server-seitig generieren — kein Hand-Transkript):** Für jede View aus 0c: `pg_get_viewdef` holen, Spalten-Quellen `f.<col>` → `kf.<col>` ersetzen. **GOTCHA:** `v_faelle_mit_aktuellem_termin` hat den `LEFT JOIN kanzlei_faelle kf` SCHON (seit SP-I1) → KEINEN zweiten Join, nur Quelle umbiegen. Numeric-Spalten MIT explizitem Precision-Cast (`kf.kuerzungs_betrag::numeric(p,s) AS kuerzungs_betrag`, SP-G-Lesson). Timestamptz unkritisch. Generierung via Node-Script (`pg_get_viewdef` + `replace()`), Vorlage: SP-I1/SP-I2-Migrationen.

- [ ] **Step 5: Migration applizieren (Regel 2 — kein db push):**
```
npx supabase db query --linked --file supabase/migrations/<ts>_cmm44_spi3_*.sql
npx supabase migration repair --status applied <version>
```
Bei DB-Pfad-Problem: direkter Pooler via `db query --db-url "$(cat supabase/.temp/pooler-url)"` (nur wenn --linked weiter 544t; reines DDL ist über transaction-pooler ok).

- [ ] **Step 6: Post-Apply-Verifikation** — 0a/0b erneut: 14 Spalten jetzt auf kanzlei_faelle, Backfill-Counts = faelle-cov. View-Smoke (`SELECT … FROM v_faelle_mit_aktuellem_termin LIMIT 1`).

- [ ] **Step 7: Types regen (PowerShell) + voller Build:**
```
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
npm run build
```

- [ ] **Step 8: Commit (Audit-Block) + PR1 gegen staging.** Type-Regen-Drift NICHT strippen (Aaron: Types=DB). Stacked-PR-Gotcha: PR2 erst nach PR1-staging-Merge branchen ODER PR1-Artefakte in PR2 via `git checkout origin/staging --` auflösen.

---

## PR2 — Code-Sweep (Writer-COLS + Reader-Repoints)

**Writer (trivial — Peel-Kaskade existiert schon):**
- [ ] **Step 1:** `src/lib/kanzlei-fall/upsert-kanzlei-fall.ts` — `KANZLEI_FAELLE_COLS` um die 14 Spalten erweitern. Damit greifen `peelKanzleiFaelleColumns` in `process-event.ts:778` und `state-machine.ts:128` automatisch → beide schreiben via `upsertKanzleiFall` nach kanzlei_faelle. **Keine** Edits in process-event.ts/state-machine.ts nötig (verifiziert: beide rufen upsertKanzleiFall; keine der 14 in CLAIM_OWNED_DUPLICATE_COLUMNS).
- [ ] **Step 2: Andere faelle-Writer finden** (2-Stufen-Lesson — sonst silent stale für NEUE Fälle):
```
rg -n "from\('faelle'\)\.(update|upsert|insert)" src/   # jeden Hit prüfen ob er eine der 14 setzt
rg -n "FALL_EDITABLE_FIELDS|updateFallField|InlineEditField" src/  # Inline-Edit-Pfade
```
  Kandidaten aus Inventur: `_actions/stammdaten.ts` (kuerzungs_betrag in Edit-Allowlist), `_actions/prozess.ts`, `_actions/kanzlei-paket.ts`. Falls `updateFallField` eine der 14 schreibt ohne kanzlei-Peel → Peel ergänzen (SP-I2-Muster) ODER Feld aus Allowlist auf kanzlei_faelle-Pfad umlenken.

**Reader (~18 R-direct — Inventur, jeder Hit bei Ausführung re-grep + INDEPENDENT triagieren):**
- [ ] **Step 3 — `regulierung_am`-Filter-Reader** (`.gte/.lte('regulierung_am', …)` — Filter auf Embed unmöglich → auf `v_faelle_mit_aktuellem_termin` umstellen, die Spalte ist dort flach):
  - `src/lib/finance/abrechnungen-generator.ts:169-173`, `src/app/admin/_components/MonatsUmsatzForecast.tsx:34-35`, `src/app/admin/finance/(hub)/page.tsx:520-549`, `src/lib/analytics/finance.ts:144`, `src/app/admin/_components/WichtigeUpdatesWidget.tsx` (`.not('regulierung_am','is',null)`).
- [ ] **Step 4 — `regulierung_am`-Select/Display-Reader** (Embed `claims:claim_id(kanzlei_faelle(regulierung_am))` + Array-Normalisierung, ODER View):
  - `src/lib/finance/fall-finanzen.ts:55`, `src/app/faelle/[id]/page.tsx:634`, `src/app/admin/_components/DashboardStats.tsx:39-60`, `src/app/admin/statistiken/{page.tsx:156,StatistikenClient.tsx}`, `src/lib/makler/queries.ts` (liest schon aus v_faelle… → prüfen ob Pattern E), `src/app/kunde/{page.tsx,faelle/page.tsx}`.
- [ ] **Step 5 — `kuerzungs_betrag`/`vs_kuerzung_grund`/`vs_reaktion_*`-Reader:**
  - `src/lib/sla/kanzlei-mahnungen.ts`, `src/lib/sla/blocker-detection.ts`, `src/app/gutachter/fall/[id]/stellungnahme/page.tsx:29`, `src/app/gutachter/fall/[id]/_components/KanzleiStatusCard.tsx` (hat schon Fallback-Logik — prüfen), `src/app/faelle/[id]/_prozess/Sections.tsx:193-645`, `src/app/faelle/[id]/_stammdaten/Sections.tsx:473`.
- [ ] **Step 6 — R-view (Pattern E, KEINE Code-Änderung, nur verifizieren):** `src/lib/fall/queries.ts:50` (`FALL_SELECT_KUNDE` enthält regulierung_am; getFallForAdmin/Sv/Kunde lesen v_faelle…). Kunde-Components (KundeAktivStatusHero/FallKarte) → Typ-Inferenz aus View.
- [ ] **Step 7 — Re-Grep-Verifikation:** Script analog `scripts/cmm44-spi2-grep.mjs` (COLS = die 14) → 0 echte `faelle`-Zugriffe auf die 14 (außer database.types.ts + Kommentare). `npm run build` grün.
- [ ] **Step 8: Commit (Audit-Block) + PR2 gegen staging.**

---

## Smoke (nach PR2, gegen app.staging.claimondo.de)
- [ ] Script analog `scripts/smoke-cmm44-spi2.mjs`. Pflicht-Flows: Admin-Fallakte VS-Reaktion-Section (gekürzt/quotiert/voll), Gutachter-KanzleiStatusCard, Admin-Finance/Statistiken (regulierung_am-Aggregation), Kunde-Fallkarte. Screenshots im selben Turn auswerten (Memory). HARD-Errors = 0.

## PR4 — Catch-up (nach PR2-main-Release)
- [ ] Idempotenter COALESCE-Upsert (faelle→kanzlei_faelle) für zwischen Backfill und PR2-Deploy entstandene Werte. IS-NULL-guarded (SP-B-Lesson).

## Abschluss
- [ ] SP-I3-Mapping-Block in `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`.
- [ ] Handoff-Update + Memory `project_cmm44_spi3_status` + Smoke-Script committen.
- [ ] Roadmap [[project_cmm44_spi_roadmap]] aktualisieren (SP-I3 done → SP-I4/I5/I6 offen).

---

## Self-Review-Notizen
- **Spec-Coverage:** 14 Spalten (Schema PR1) + Writer (PR2 S1-2) + 18 Reader (PR2 S3-6) + Views (PR1 S4) abgedeckt.
- **Writer-Risiko (kritisch):** additiv „grün" trügt — neue Fälle schreiben nur kanzlei_faelle. Step 2 (alle faelle-Writer finden) + 2-Stufen-Review verhindern silent-stale-Reader.
- **DB-abhängige Lücken:** numeric-Precision (0a), cov-Liste für Backfill (0b), vollständige View-Liste (0c), enum-vs-text (0d) — alle via Step-0-Queries vor PR1 zu füllen.
- **Offen für Aaron:** keine (Verdikt bestätigt). SP-I6 `kanzlei_id`-Heimat bleibt späterer Slice.
