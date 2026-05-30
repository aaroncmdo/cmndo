# Design — Supabase Preview Safety-Net reparieren (Consolidated Baseline)

**Datum:** 2026-05-30 · **Status:** Proposal — wartet auf Aaron-Entscheidung
**Quelle:** Research-+Design-Workflow (7 Agenten: Branching-Mechanik · Archiv-Analyse · Ansätze · Test/Rollback · 2× adversariale Safety-Verifikation · Synthese)
**Begleit-Kontext:** docs/superpowers/specs/2026-05-29-migration-utf8-fix-design.md (der UTF-8-Fix, der das *erste* Preview-Hindernis behob)

---

## 0. TL;DR (Entscheidung)

- **Prod-Safety: bestätigt SAFE** (version-only Tracking, kein Checksum — aus supabase-CLI-Source + Live-Prod verifiziert, von beiden Adversarial-Verifiern un-widerlegt). Den Inhalt getrackter Migrations-Files zu ändern schadet Prod nie.
- **„Un-Stub" (Stubs mit Archiv-DDL füllen) ist ein DEAD END** — die Basis-Tabellen existieren NIRGENDS als `CREATE TABLE`.
- **Echter Fix = Consolidated Baseline** (READ-pg_dump → idempotenter Baseline-First-File → recorded-only auf Prod). ~halber Tag.
- **Offene Entscheidungen für Aaron:** siehe §9.

## 1. Problem

Der GitHub-Check **"Supabase Preview"** schlägt auf JEDEM PR fehl, der `supabase/migrations/` berührt:

```
ERROR: relation "public.faelle" does not exist (SQLSTATE 42P01)
At statement: 0  -- migration 20260419100432_aar571_phase_transitions
                 -- (CREATE TABLE phase_transitions ... fall_id REFERENCES public.faelle(id))
```

Der Check ist damit ein **dauerhaft rotes, nutzloses Safety-Net** — er blockt Merges (oder wird ignoriert = Alarm-Müdigkeit, maskiert echte kaputte Migrations).

## 2. Root Cause

Supabase Branching (GitHub-Integration) baut pro PR eine **frische, leere ephemere Postgres** und spielt die **gesamte** Migrationshistorie aus `supabase/migrations/` **von leer** ab (= `supabase db reset`; "No production data is copied to your Preview branch", "All migrations are rerun in sequential order").

Die foundational DDL (faelle/claims/leads/profiles/… aus 2026-04-11..04-19) wurde durch PR #1279 nach `supabase/_archive/migrations-pre-tracking/` verschoben; in `supabase/migrations/` sind diese als **leere Kommentar-Stubs** (`*_placeholder.sql`). Der from-empty-Replay erzeugt also **keine Basis-Tabellen**, und die erste echte Migration mit FK auf `faelle` (`aar571`) kracht mit 42P01.

**Empirisch verifiziert (diese Session):**
- **0 Treffer** für `CREATE TABLE (faelle|leads|profiles|sachverstaendige|organisationen)` in `supabase/migrations/` UND `supabase/_archive/`.
- `claims` wird NUR von `20260425150100_aar810a1_create_claims.sql` erzeugt — **nach** dem aar571-Fehler.
- Earliest Archive-File `20260411231056_…` beginnt mit `ALTER TABLE faelle ADD COLUMN …` → setzt `faelle` als bereits existierend voraus.

> Die Basis-Tabellen wurden **vor** dem Archiv via Management-API angelegt (vor 2026-04-11) und nie als DDL ins Repo committet.

## 3. Prod-Safety-Verdict (die load-bearing Frage)

**CONDITIONAL-SAFE — high confidence. Von BEIDEN Adversarial-Verifiern NICHT widerlegt.**

Supabase-Migration-Tracking ist **VERSION-only**, nicht checksum/content-based. Belegt auf drei Ebenen:

1. **Empirisches Schema:** `supabase_migrations.schema_migrations` Spalten = `(version, statements, name, created_by, idempotency_key, rollback)` — **kein hash/checksum**. PK = `version text`.
2. **CLI-Source (`apps/cli-go/pkg/migration/`):** `FindPendingMigrations` ist ein reiner Version-String-Merge-Join, liest **nie** File-Bytes/Name; getrackte Versionen werden geskippt und nie geöffnet. Einzige Out-of-sync-Errors = fehlende/out-of-order Version, nie "changed bytes".
3. **Live-Beweis:** Prod speichert Version `20260411231056` mit der echten 1126-Zeichen-DDL — während das Repo-File der leere Stub ist. **Dieser Mismatch existiert HEUTE** und verursacht keinen Fehler → direkter Beweis, dass Content nie verglichen wird. (Das Latin-1→UTF-8-Re-Encode der Stubs ist die zweite unabhängige Bestätigung.)

**Konsequenz:** Content eines getrackten Stubs ändern (leer → echte DDL, **gleiche Version**) ist für Prod unsichtbar → geskippt. Das **neue** Baseline-File (`00000000000000`) ist eine ungesehene Version → auf Prod via `supabase migration repair <ver> --status applied` (Row-Insert, **0 SQL**); auf der ephemeren Preview läuft es echt von leer.

**Restunsicherheit (deshalb conditional):** Docs sind zum Edge-Case "geänderter Content einer applizierten Version" **stumm**; der Schluss ruht auf CLI-Source + Live-Prod-Verifikation (konvergent, stark, aber kein kanonischer Doc-Satz).

**Load-bearing Conditions:** (a) Stub-Version **nie** umbenennen (Rename = neue untracked Version, würde auf Merge re-appliziert = echtes Risiko). (b) Baseline muss **first-sorting** sein. (c) **Nie** `supabase db reset` gegen Prod. (d) Prod-Writes laufen über das MCP-Plugin (`apply_migration`), das diese Files gar nicht liest.

## 4. Recommended Approach — B) Consolidated Baseline

- **Nicht A) Un-stub:** DEAD END (keine `CREATE TABLE faelle` irgendwo; verschiebt 42P01 nur).
- **Nicht C) Branching disablen / E) non-blocking:** entfernt das Rot, aber auch das Netz — nur als **interimistischer Unblock**.
- **Nicht D) Seed-from-prod:** nicht supported (Branches starten leer; `seed.sql` läuft NACH Migrations, kann Basis-DDL nicht ersetzen).
- **B):** schema-only READ-pg_dump des aktuellen Prod-`public`, idempotent gehärtet, als chronologisch erste Migration `00000000000000_baseline_public_schema.sql`. Preview baut Basis zuerst → aar571-FK greift. Auf Prod recorded-only.

## 5. SAFE Build + Test Plan (Preview als Harness, ZERO Prod-Writes)

1. **Branch** off `staging`: `kitta/aar-XXX-supabase-preview-baseline`.
2. **Baseline generieren (READ-only):** `supabase db dump --db-url "<prod SESSION-pooler READ url>" -f baseline_public_schema.sql` (schema-only; public + Extensions + Enums/Types). Reines `pg_dump` = keine DDL → Regel-2-CLI-DDL-Verbot greift nicht.
3. **Idempotent härten:** `CREATE TABLE IF NOT EXISTS`, guarded `CREATE TYPE`, `CREATE EXTENSION IF NOT EXISTS`. Reihenfolge: Extensions → Types/Enums → Tables → Constraints/Indexes → Views/Functions.
4. **Platzieren:** `supabase/migrations/00000000000000_baseline_public_schema.sql`. Stubs + echte Migrations unverändert (Stubs bleiben leer = no-op).
5. **Local dry-run (billigste Schleife, kein Prod):** `supabase db reset` gegen lokalen Docker-Stack (oder throwaway free-tier). Rot→Grün iterieren (Extension-Order, Type-Pre-Creation, View-Deps).
6. **PR öffnen** (grün lokal → push → `gh pr create --base staging`). Triggert "Supabase Preview" auf frischer ephemerer DB.
7. **Observe** (GitHub-Checks → "Supabase Preview"; Dashboard → Manage Branches → View logs). Für sauberen from-empty-Rerun PR close+reopen.
8. **Merge-Time-Neutralisierung:** `supabase migration repair 00000000000000 --status applied` (Row-Insert, 0 SQL). Verify per READ-`execute_sql`: genau eine neue Version, keine DDL gelaufen.

## 6. Rollback (trivial — alles File-only)

- **Während Test:** `git reset --hard origin/staging`; Preview-DB disposable. Kein Prod-Impact.
- **Nach Merge:** `git revert` des Merge-Commits. Prod-`schema_migrations` unberührt; optional Row via `migration repair … --status reverted` (Metadata, 0 DDL).
- **Invariante:** Prods echtes Schema ändert sich zu KEINEM Zeitpunkt.

## 7. Risks

- **R1 (mittel, contained auf Preview):** Replay scheitert an späteren Archiv-Renames (AAR-599 `sv_treffpunkt`→`besichtigungsort_*`) oder View/Function-Dependency-Order. → Nur in ephemerer Preview, lokal iterierbar.
- **R2 (niedrig):** Baseline-Idempotenz unvollständig → kollidiert mit den ~76 späteren ALTERs. → durchgängig `IF NOT EXISTS`; lokaler `db reset` fängt's.
- **R3 (niedrig):** Verhaltensänderung — künftiger from-empty `db reset` führt jetzt echte DDL aus (vorher no-op). Harmlos, dokumentieren.
- **R4 (Prozess):** 8+ Sessions teilen Prod. Baseline sortiert FIRST + recorded-only → keine Kollision mit der 2026*-Timeline.
- **R5 (residual):** Doc-Silence (siehe §3). Mitigiert durch Merge-Time-READ-Verify.

## 8. Inkonsistenz-Notiz

`supabase/migrations/` hat ~499 Files; Archiv-README spricht von 142, Analyse fand 141 Stubs + 2 Orphan-Stubs (`20260510162407`, `20260510162415` ohne Archiv-Twin). Für B irrelevant (B berührt keinen Stub), aber im Ticket notieren.

## 9. Offene Entscheidungen (Aaron)

1. **Baseline-Ansatz (B) freigeben** statt Un-stub? (Un-stub ist empirisch tot; B ist ~halber Tag + verdient eigenes Linear-Ticket + Regel-2-Review.)
2. **Interim Approach E** (Preview-Check non-blocking / aus required checks nehmen), damit Migrations-PRs nicht weiter rot-blockiert werden, während B gebaut wird? Oder dauerhaft-rot aktuell tolerierbar?
3. **READ-Connection für `pg_dump`:** welche Prod-SESSION-Pooler-Read-URL/Credentials? (Reiner Read — Regel 2 greift nicht, aber ich brauche den Connection-String; `.env.local` hat keinen.)
4. **Wer führt das Merge-Time `migration repair 00000000000000 --status applied` gegen Prod aus** — ich (benannte Session) oder du? (recorded-only, 0 SQL, aber schreibt 1 Zeile in prod schema_migrations.)
5. **Branching-Strategie:** Soll Supabase Branching langfristig aktiv bleiben (Compute/Storage-Kosten pro PR), oder ist ein nicht-blockierender informativer Check das gewünschte Endbild — d.h. lohnt der halbe Tag für B überhaupt vs. einfach E?
6. **Lokales `supabase db reset`:** habe ich Docker/lokalen Supabase-Stack zur Verfügung, oder nutze ich ein throwaway free-tier Projekt für die Iteration?
