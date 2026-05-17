# SP-A3 — `faelle.fall_nummer` abschaffen (CMM-44 Claim-as-SSoT)

**Master:** CMM-44 (`faelle`-Tabelle wird abgeschafft, `claims` ist SSoT)
**Datum:** 2026-05-17
**Branch:** `kitta/cmm-44-spa3-fall-nummer`
**Vorlage:** SP-A2 (`docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate.md`,
`scripts/_build-spa2-views.mjs`, `scripts/smoke-cmm44-spa2-pr2.mjs`)

---

## 1 · Ziel & Scope

`faelle.fall_nummer` ist eine Legacy-Aktennummer, die parallel zum kanonischen
`claims.claim_nummer` existiert. SP-A3 schafft `fall_nummer` ersatzlos ab: `claim_nummer`
wird die alleinige Aktennummer, ~198 src-Files ziehen darauf um, die drei
`fall_nummer`-Generatoren werden gelöscht.

**In Scope:**
- 5 Views auf `claim_nummer` repointen
- ~198 src-Files `fall_nummer` → `claim_nummer`
- 3 App-seitige Generatoren entfernen
- Toten DB-Trigger `set_fall_nummer` + Funktion `generate_fall_nummer` aufräumen
- `DROP COLUMN faelle.fall_nummer` (nimmt UNIQUE-Constraint `faelle_fall_nummer_key` mit)

**Out of Scope:** `mandatsnummer` (eigene Spalte, eigener Generator in
`src/app/faelle/[id]/_actions/filmcheck.ts` — bleibt unverändert), `gutachten_nummer`,
`lead_nummer`. SP-B..J unverändert.

## 2 · Ausgangslage (Live-DB, 2026-05-17)

Zwei parallele Nummern-Schemata — keine Drift, zwei verschiedene Systeme:

| | `faelle.fall_nummer` | `claims.claim_nummer` |
|---|---|---|
| Format | `CLM-YYYYMMDD-NNN` (Datum + 3-stellig/Tag), z.B. `CLM-20260514-004` | `CLM-YYYY-NNNNN` (Jahr + 5-stellig global), z.B. `CLM-2026-00119` |
| Generator | App-Code | DB-Trigger `set_claim_nummer` + Sequence `claims_claim_nummer_seq` |
| Befüllung | App setzt immer | Trigger befüllt jeden Claim, nie NULL |
| Constraint | `UNIQUE (fall_nummer)` = `faelle_fall_nummer_key` (+ Index) | sequenzbasiert eindeutig |
| NULLs | 0 / 30 | 0 / 30 |
| Reader | 198 src-Files | 11 src-Files |

- Alle 30 Fälle: `fall_nummer ≠ claim_nummer` (erwartbar — verschiedene Formate).
- **Designentscheidung (Aaron, 2026-05-17):** `claim_nummer` gewinnt, `fall_nummer` wird
  ersatzlos gedroppt. Kein Backfill. Bestehende 30 Test-Fälle wechseln sichtbar ihre
  Aktennummer — pre-launch unkritisch.
- DB-Trigger `set_fall_nummer` → Funktion `generate_fall_nummer` ist **tot**: produziert
  ein abweichendes Format (`YYYY-NNNN`), feuert nur `WHEN fall_nummer IS NULL`, die App
  setzt `fall_nummer` aber immer. Wird mit aufgeräumt.

### Generierungs-Stellen von `fall_nummer` (App-seitig)

| Datei | Zeilen | Inhalt |
|---|---|---|
| `src/app/admin/faelle/anlegen/actions.ts` | 92-94, 108, 35/144 | `CLM-${date}-${seq}`-Generator + Insert-Feld + Return-Shape |
| `src/lib/leads/convert-lead-to-claim.ts` | 474-476 | gleicher `CLM-${date}-${seq}`-Generator (Lead→Fall-Pfad) |
| `src/app/api/admin/create-test-fall/route.ts` | 124 | hartkodiert `'CLM-TEST-001'` |
| `src/app/api/seed-testdata/route.ts` | 400/415/433/450/466 | 5× hartkodierte `fall_nummer`-Werte |

Der **Ziel-Generator existiert bereits** (`set_claim_nummer`) — „Generator umziehen" heißt
real: die App-Generatoren ersatzlos löschen, der Claim bekommt seine Nummer ohnehin.

### Views, die `f.fall_nummer` exponieren (5)

`v_claim_full`, `v_claim_listing`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`,
`faelle_sv_view`. `v_claim_full` und `v_claim_listing` führen zusätzlich bereits
`c.claim_nummer`.

## 3 · PR-Struktur (3 PRs, additive Reihenfolge)

Anders als SP-A2 müssen die **Views zuerst**: die 198 Reader lesen `claim_nummer` künftig
aus Views, die diese Spalte heute nicht exponieren.

### PR1 — Views additiv

Eine Migration: die 5 Views so `CREATE OR REPLACE`, dass sie `claim_nummer` zusätzlich
zum bestehenden `fall_nummer` exponieren. Rein additiv, nicht brechend.

- `v_claim_full`, `v_claim_listing`: führen `c.claim_nummer` bereits → keine Änderung
  am Spalten-Set nötig; nur prüfen/sicherstellen, dass die Spalte existiert.
- `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`: `c.claim_nummer`
  ergänzen (über den bestehenden `claims`-Join bzw. Join über `claim_id` hinzufügen,
  falls noch keiner existiert).
- View-Defs deterministisch über `pg_get_viewdef` generieren (SP-A2-Vorlage
  `scripts/_build-spa2-views.mjs`); jede Spalte auf den Quell-Typ casten.

### PR2 — Reader-Sweep + Generator-Entfernung

Kein DDL. Im Implementation-Plan in Portal-Cluster (PR2a/b/c) chunkbar, falls 198 Files
zu groß für einen Review.

**Reader-Sweep:** alle `fall_nummer`-Referenzen in `src/` → `claim_nummer`. Betrifft
TypeScript-Interfaces/Types, `.select('fall_nummer')`-Aufrufe, Nested-FK-Selects,
Display-Strings, Email-/PDF-Templates. Bestehende Fallbacks der Art
`r.fall_nummer ?? r.claim_nummer` (z.B. `admin/faelle/(hub)/page.tsx:244`) werden auf
reines `claim_nummer` reduziert.

**Generator-Entfernung:**
- `admin/faelle/anlegen/actions.ts`: Generator-Block (92-94) raus, `fall_nummer:` aus dem
  faelle-Insert raus, Return-Shape `{ …; fall_nummer }` → `{ …; claim_nummer }`; Caller
  `AnlegenFallClient.tsx` (Zeilen 33/56) mitziehen.
- `lib/leads/convert-lead-to-claim.ts`: Generator-Block (474-476) raus.
- `api/admin/create-test-fall/route.ts` + `api/seed-testdata/route.ts`: hartkodierte
  `fall_nummer`-Werte aus den Inserts entfernen.

**Types:** `src/lib/supabase/database.types.ts` regenerieren.

### PR3 — Drop

Eine Migration, `BEGIN/COMMIT`:
1. `f.fall_nummer` aus den 5 Views entfernen (`CREATE OR REPLACE VIEW`, nur noch
   `claim_nummer`).
2. `DROP COLUMN faelle.fall_nummer` — entfernt die UNIQUE-Constraint
   `faelle_fall_nummer_key` + Backing-Index automatisch mit.
3. `DROP TRIGGER set_fall_nummer ON faelle` + `DROP FUNCTION generate_fall_nummer()`.

## 4 · Migrations-Vorgehen (bewährt aus SP-A2)

1. Vor jeder Migration Live-DB messen (`information_schema` + `pg_get_viewdef`).
2. Migration in `BEGIN/COMMIT`; vor dem Apply Dry-Run `BEGIN; … ROLLBACK;`.
3. Apply via `npx supabase db query --linked --file <sql>` +
   `npx supabase migration repair --status applied <version>` — **kein** `db push`.
4. `information_schema`-Verify nach jedem Schritt.
5. Regel 2 (DDL nur CLI) + Regel 3 (kein unbegleiteter Stash) einhalten.

## 5 · Tests & Erfolgskriterium

Portal-Smoke auf 5 Portalen (Admin / Dispatch / SV / Kunde / Public) mit Screenshots
nach PR2 und nach PR3 — überall wo eine Aktennummer angezeigt wird (Fall-Listen,
Fallakte-Header, Finance, Emails-Preview, Magic-Link-Seiten) steht jetzt
`CLM-YYYY-NNNNN`. Smoke-Skript analog `scripts/smoke-cmm44-spa2-pr2.mjs`.

**Erfolg, wenn:**
- `information_schema.columns` zeigt `fall_nummer` nicht mehr auf `faelle`.
- `git grep fall_nummer -- 'src/*'` liefert 0 Treffer.
- `npm run build` grün.
- Portal-Smoke: 0 Hard-Fails, jede angezeigte Aktennummer im `CLM-YYYY-NNNNN`-Format.

## 6 · Risiken

- **Reader-Sweep-Umfang (198 Files):** Risiko übersehener Referenzen → Build-Check +
  `git grep`-Verify als Gate; Portal-Smoke fängt Runtime-Reste.
- **View-Repoint scheitert an Typ-Mismatch:** jede repointete Spalte explizit auf den
  Quell-Typ casten (SP-A2-Lesson).
- **Reihenfolge:** PR2 darf erst nach PR1-Merge starten (Reader brauchen `claim_nummer`
  in den Views); PR3 erst nach PR2-Merge (sonst brechen verbliebene Reader).
- **`claim_nummer`-Eindeutigkeit:** vor PR3 verifizieren, dass `claim_nummer` eine
  UNIQUE-Constraint trägt (Sequenz garantiert Generierungs-, nicht Schema-Eindeutigkeit)
  — falls nicht, im Plan als Vorab-Schritt ergänzen.
