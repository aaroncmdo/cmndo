# Query-Parse-Ratchet: Write-Pfad-Erweiterung (Design)

**Datum:** 2026-07-16 · **Branch:** `kitta/query-parse-ratchet` · **Approved:** Aaron 16.07. (Scope „Write + SELECT-Embeds")

## 1. Kontext

Zwei unabhaengige Prod-Incident-Klassen (14.–15.07.) waren **stille PostgREST-Fehler**, die kein Build/tsc/bestehender Ratchet faengt:

* **SELECT-Parse-Fehler** (42703 tote Spalte / PGRST200 fehlende Relation / PGRST201 mehrdeutiger Embed / PGRST205 fehlende Tabelle): 63 statische Queries parsten auf prod nicht, 6 Tage unbemerkt (`const { data } = await …` verschluckt jeden Fehler). Fixes: #4251/#4279/#4396/#4397.
* **Write-Pfad-Drift** (Spalten-Renames, die INSERT/UPDATE brechen): 3 echte Bugs in #4396 (`fall_dokumente.typ`→`dokument_typ` INSERT, `pflichtdokumente.datei_url`→`dokument_url` UPDATE ×2 — „Pflicht-Slot wurde nie hochgeladen").

**Fuer SELECTs existiert der Ratchet bereits** (PR #4251): `scripts/check-query-parse.mjs` extrahiert statische `.from().select()`-Ketten und **trockenschiesst sie live** gegen die Env-DB (`GET …?select=…&limit=1`) — PostgREST selbst ist das Orakel, 0 False-Positives, alle Fehlerklassen. CI faehrt `--ratchet` (ci.yml:228).

**Zwei strukturelle Luecken** (Befund f99fdb10, [[coordination-an-prod-query-parse-sweep-writepath-drift]]):

1. Der Trockenschuss probt nur `select=` — **INSERT/UPDATE/UPSERT-Objektkeys sind unsichtbar** (ein Write laesst sich nicht nebenwirkungsfrei live proben).
2. Ohne DB-Keys skippt das Script komplett (exit 0) — **in CI ohne Secrets laeuft effektiv nichts**.

## 2. Ziel

Den bestehenden `check:query-parse` um eine **statische Write-Pfad-Achse** erweitern: `.insert/.update/.upsert({…})`-Objektkeys werden gegen einen **committeten Schema-Snapshot** validiert („Spalte existiert in Tabelle"). Statisch = laeuft ueberall, auch in CI ohne Secrets. Gleiche Ratchet-Mechanik (Baseline + Boy-Scout, `--warn`/`--ratchet`/`--update-baseline`).

**Nicht-Ziele (YAGNI):**
* Kein Nachbau des PostgREST-Planers fuer SELECTs — der Live-Trockenschuss bleibt das SELECT-Orakel.
* Keine Filter-Spalten-Pruefung (`.eq/.order/...`) in v1 — eigene FP-Flaechen (JSON-Pfade, Embed-Referenzen), dokumentierte Folge-Achse.
* Keine `.rpc()`-, Nicht-public-Schema- (`.schema(…)`) oder dynamischen Ketten.

## 3. Architektur

### 3.1 Schema-Snapshot: `scripts/lib/schema-snapshot.json`

```json
{ "generatedAt": "…", "project": "paizkjajbuxxksdoycev",
  "tables": { "<relname>": { "kind": "t" | "v", "columns": ["…"] } } }
```

Alle public-Relations (`pg_class.relkind in r,v,m,p,f`; Views/MatViews als `v`). Generiert per MCP `execute_sql` (READ); Regenerations-SQL im Header von `check-query-parse.mjs` (Muster `status-check-constraints.json`). Neue Spalte per Migration → Snapshot im selben PR aktualisieren.

### 3.2 Pure Logik: `scripts/lib/query-parse-scan.mjs` (Erweiterung)

* `extractStaticWrites(src)` → `{ table, op: 'insert'|'update'|'upsert', keys: string[], line }[]`
  Findet `.from('<literal>')`-Ketten (Segmentierung wie `extractStaticQueries`: bis zum naechsten `.from(`) und darin `.insert(`/`.update(`/`.upsert(` mit **Objekt-Literal** (`{…}` brace-matched, auch Array-Form `[{…},…]` — jedes Top-Level-Objekt). Extrahiert Top-Level-Keys auf Tiefe 1: Identifier (`col:`), quoted (`'col':`) und **Shorthand** (`col,`/`col}`).
* `validateWrites(writes, snapshot)` → `{ table, column, op, line }[]`
  Verletzung, wenn `tables[table].kind === 't'` und `column ∉ columns`. Zusatzfall `column: '(unknown table)'`, wenn `table ∉ snapshot` (Write auf nicht-existente Tabelle = PGRST205-Klasse im Write-Pfad).
* `writeKey(table, column)` → `write::<table>::<column>` (file-/zeilen-unabhaengig, wie `queryKey`).

**0-FP-Disziplin (Skips, Vorbild flag-drift/extractStaticQueries):**
* Kommentare gestrippt (zeilentreu); Template-`.from(`-Tabellen und Nicht-Literal-Argumente (`.update(payload)`) uebersprungen.
* Computed Keys (`[x]:`) und Spread (`...x`) werden ignoriert — **explizite** Keys daneben werden trotzdem geprueft.
* `kind === 'v'` (View) → Write-Validierung komplett skippen (updatable Views nicht statisch entscheidbar).
* Kette enthaelt `.schema(` vor dem Write → skip (Nicht-public-Schema).
* Methoden-Shadowing (eigene `.update()` auf Nicht-Supabase-Objekten): gleiche bewusste Annahme wie flag-drift — Kette muss ein `.from('<literal>')` haben; Restrisiko via Baseline-Review beim Rollout = 0 Fund.

### 3.3 Runner: `scripts/check-query-parse.mjs` (Umbau)

* **Write-Check laeuft IMMER** (statisch, kein Env noetig) — vor dem Env-Gate.
* Dry-Fire (SELECT) weiterhin nur mit `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; ohne Keys: nur noch der SELECT-Teil skippt (Meldung), **exit-Verhalten des Write-Teils bleibt aktiv**.
* Baseline `scripts/query-parse-baseline.json` bekommt zweites Array `writeKeys` neben `keys`.
  `--update-baseline`: `writeKeys` immer aktualisieren; `keys` **nur wenn der Dry-Fire lief** (sonst wuerde ein Env-loser Lauf die SELECT-Baseline wipen).
* `--ratchet`: exit 1 bei neuen `keys` ODER neuen `writeKeys`.

### 3.4 CI

ci.yml:228 faehrt bereits `node scripts/check-query-parse.mjs --ratchet` (ohne DB-Secrets → bisher no-op). Mit dieser Erweiterung wird die **Write-Achse dort sofort aktiv** — Baseline wird in diesem PR mit dem Ist-Stand generiert (grandfathered), CI bleibt auf Merge gruen und blockt nur NEUE Write-Drift. Kein neuer CI-Step, keine Secrets.

## 4. Tests (`scripts/lib/__tests__/query-parse-scan.test.mjs`, vitest)

Extraktion: einfacher insert/update/upsert · Array-Form · Shorthand-Keys · quoted Keys · Spread+explizit · computed-Skip · Nicht-Literal-Skip (`.update(payload)`) · Kommentar-Immunitaet · Ketten-Bindung (kein Fremd-`.from()`) · `.schema(`-Skip · Zeilennummern. Validierung: tote Spalte flaggt · gueltige Keys nicht · View-Skip · unbekannte Tabelle · `writeKey`-Stabilitaet.

## 5. Rollout in diesem PR

1. Snapshot committen (generiert 16.07., Spot-Checks: 233 Relations/30 Views; `fall_dokumente.typ`/`pflichtdokumente.titel`/`email_log.body_html` korrekt absent).
2. Scanner + Tests + Runner-Umbau.
3. `--update-baseline` (Dry-Fire lief 16.07. gegen prod): **SELECT-Baseline 64 → 16** (45 durch #4396/#4397 behoben — Slash gehoert zu diesem PR) + `writeKeys`-Ist-Stand.
4. Kein `src/**`-Change → Regel-4: kein Runtime-Flow-Impact (im PR vermerken).

## 6. Verbleibende tote Queries (16, ausserhalb dieses PRs — getrackte Tasks)

(A) `gutachter_termine→sachverstaendige` PGRST200 ×4 — `sv_id` ohne FK, user-facing, Fix = FK-DDL (Orphan-Check!) oder Umbau. (B) Hint-Fixes ×6 (`gutachter_finder_anfragen`, `claims→leads`, `v_faelle_mit_aktuellem_termin→leads`). (C) Geroutet/owned: `email_log` (8e584af2) · `kanzlei_abrechnungen` (Produktfrage) · `fall_documents`-Typo · `gutachter_rechnungen` · `article_comments`/`technische_probleme` (DDL/Join).
