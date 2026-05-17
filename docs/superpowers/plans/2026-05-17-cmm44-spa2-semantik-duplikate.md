# CMM-44 SP-A2 — Semantik-Duplikat-Drops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 28 semantik-gleiche Duplikat-Spalten `faelle`-seitig droppen und alle Leser/Schreiber per Rename auf die bereits existierende `claims`-Spalte umstellen.

**Architecture:** Drei unabhaengige Reader/Writer-Rename-Sweep-PRs (Domaenen-Cluster 1/2/3, kein DB-Schema-Change), danach **eine** Migration (Gap-Backfill + `DROP COLUMN` ×28). `claims` ist SSoT. Reihenfolge prod-sicher: alle drei PR1-Cluster muessen auf `main` sein, bevor die Migration appliziert wird.

**Tech Stack:** Next.js 15, TypeScript, `@supabase/supabase-js`, Supabase CLI (Migrations), Postgres.

**Spec:** `docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md`

---

## Referenz: Rename-Mapping (alle 28 Paare)

Jeder `faelle`-Bezeichner links wird durch die `claims`-Spalte rechts ersetzt. Spalte „Cl" = PR-Cluster.

| `faelle` (alt) | `claims` (neu) | Cl | Notiz |
|---|---|--:|---|
| `schadens_adresse` | `schadenort_adresse` | 1 | Kollision C |
| `unfallort` | `schadenort_adresse` | 1 | Kollision C |
| `schadens_plz` | `schadenort_plz` | 1 | |
| `schadens_ort` | `schadenort_ort` | 1 | 5 faelle-Zeilen → PR2-Backfill |
| `unfallort_kategorie` | `schadenort_kategorie` | 1 | |
| `unfallort_lat` | `schadenort_lat` | 1 | |
| `unfallort_lng` | `schadenort_lng` | 1 | |
| `schadens_datum` | `schadentag` | 1 | Kollision B |
| `unfalldatum` | `schadentag` | 1 | Kollision B |
| `schadens_entdeckt_am` | `entdeckt_am` | 1 | |
| `unfall_uhrzeit` | `schadenzeit` | 1 | |
| `schadens_beschreibung` | `hergang_kunde_text` | 2 | Kollision A |
| `unfallhergang` | `hergang_kunde_text` | 2 | Kollision A |
| `schadens_hergang` | `hergang_kunde_text` | 2 | Kollision A |
| `schadens_art` | `schadenart` | 2 | |
| `schadens_fall_typ` | `fall_typ` | 2 | |
| `personenschaden_flag` | `hat_personenschaden` | 2 | |
| `halter_ungleich_fahrer_flag` | `halter_ungleich_fahrer` | 2 | |
| `sachschaden_flag` | `hat_sachschaden` | 2 | |
| `mietwagen_flag` | `hat_mietwagen` | 2 | Kollision D |
| `mietwagen_hat` | `hat_mietwagen` | 2 | Kollision D |
| `nutzungsausfall` | `hat_nutzungsausfall` | 2 | |
| `gegner_schadennummer` | `gegner_aktenzeichen` | 3 | |
| `no_show_count` | `kunde_no_show_count` / `sv_no_show_count` | 3 | Ziel pro Call-Site |
| `aktuelle_phase` | `phase` | 3 | |
| `konvertiert_von_lead` | `lead_id` | 3 | |
| `regulierung_betrag` | `regulierungs_betrag` | 3 | |
| `vs_ablehnungsgrund` | `vs_ablehnungs_grund` | 3 | |

**Wichtig:** `claims`-Tabelle hat oft auch eine `faelle`-Variante mit gleichem Namen wie das Ziel (z.B. `schadentag` existiert nur auf `claims`). Nie raten — bei Unsicherheit `information_schema` live abfragen (Befehl s. Task 0).

---

## Task 0: Live-DB-Stand verifizieren (Drift-Check)

**Files:**
- Nutzen: `scripts/probe-cmm44-spa2-divergenz.sql` (existiert bereits)

- [ ] **Step 1: Spalten-Existenz auf `faelle` + `claims` live pruefen**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
npx supabase db query --linked --file scripts/probe-cmm44-spa2-divergenz.sql
```
Expected: 28 Zeilen, eine je Paar (ohne `gegner_anzahl_beteiligte`). Wirft die Query einen
Fehler „column … does not exist", hat eine andere Session bereits eine Spalte gedroppt →
betroffenes Paar aus dem Scope streichen und im Ausfuehrungs-Log vermerken.

- [ ] **Step 2: Kein Commit** — reiner Verifikationsschritt.

---

# PR1a — Cluster 1: Schadenort + Datum (11 Spalten)

**Branch:** `kitta/cmm-44-spa2-pr1a-schadenort-datum`, frisch von `origin/staging`. PR gegen `staging`.
Spalten: `schadens_adresse`, `unfallort`, `schadens_plz`, `schadens_ort`, `unfallort_kategorie`, `unfallort_lat`, `unfallort_lng`, `schadens_datum`, `unfalldatum`, `schadens_entdeckt_am`, `unfall_uhrzeit`.

## Task 1a.1: Call-Site-Inventur Cluster 1

**Files:**
- Create: `docs/17.05.2026/cmm44-spa2-inventory-cluster1.md`

- [ ] **Step 1: Pro Spalte greppen, Treffer klassifizieren**

Run (im Repo-Root):
```bash
for col in schadens_adresse unfallort schadens_plz schadens_ort unfallort_kategorie unfallort_lat unfallort_lng schadens_datum unfalldatum schadens_entdeckt_am unfall_uhrzeit; do
  echo "### $col"
  grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```

- [ ] **Step 2: Inventur-Doc schreiben**

Fuer jeden Treffer eine Zeile: `Datei:Zeile | Spalte | Art`. `Art` ∈ `{read-faelle, read-view, read-claims, write-faelle, write-claims, type-only, jsx-display, comment}`.
- `read-claims` / `write-claims` / `type-only` / `comment` → **kein Change** (liest schon claims bzw. ist nur ein Bezeichner).
- `read-faelle`, `read-view` (View fuehrt die faelle-Spalte), `write-faelle`, `jsx-display` (zeigt einen aus faelle gelesenen Wert) → **Change noetig**.

Falsch-Positive (z.B. `unfallort` als Teil von `unfallort_lat`) durch `\b`-Grenzen schon
weitgehend ausgeschlossen — beim Klassifizieren trotzdem den Kontext lesen.

- [ ] **Step 3: Commit**

```bash
git add docs/17.05.2026/cmm44-spa2-inventory-cluster1.md
git commit -m "docs(CMM-44): SP-A2 PR1a — Call-Site-Inventur Cluster 1"
```

## Task 1a.2: Reads/Writes Cluster 1 umstellen

**Files:**
- Modify: alle Dateien mit `Art = read-faelle | read-view | write-faelle | jsx-display` aus `cmm44-spa2-inventory-cluster1.md`.

- [ ] **Step 1: Pro Call-Site nach Rename-Mapping umstellen**

Regeln:
- `.from('faelle').select('… schadens_datum …')` → `select`-Liste: `schadens_datum` durch `schadentag` ersetzen **und** die Query-Quelle auf `claims` ziehen (oder die `v_claim_*`-View, die das Feld fuehrt — bestehendes Portal-Pattern der Datei folgen, kein neuer View-Typ).
- `.from('faelle').update({ schadens_datum: x })` → `.from('claims').update({ schadentag: x }).eq('id', claimId)`. Es gibt keine Trigger-Propagierung mehr — der Write **muss** `claims` treffen.
- Property-Zugriffe (`fall.schadens_datum`, `row.schadens_ort`) auf den neuen Namen umbenennen, inkl. TypeScript-Interfaces/`type`-Definitionen, die das Feld deklarieren.
- **Kollision B** (`schadens_datum` + `unfalldatum` → `schadentag`): liest eine Datei beide, gibt es nach dem Rename zwei `schadentag`-Referenzen — auf eine reduzieren.
- **Kollision C** (`schadens_adresse` + `unfallort` → `schadenort_adresse`): analog.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Fehler. Fehler „Property 'schadens_datum' does not exist" = uebersehene Reference → fixen.

- [ ] **Step 3: Re-Grep — pro altem Namen einzeln**

Run:
```bash
for col in schadens_adresse unfallort schadens_plz schadens_ort unfallort_kategorie unfallort_lat unfallort_lng schadens_datum unfalldatum schadens_entdeckt_am unfall_uhrzeit; do
  echo "### $col"; grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```
Expected: nur noch `comment`/`type-only`-Treffer in Files, die laut Inventur kein Change brauchten. Keine `.from('faelle')`-Selects/Updates der 11 Spalten mehr.

- [ ] **Step 4: Kein Commit hier** — Commit erfolgt in Task 1a.3 nach dem Build.

## Task 1a.3: Build + Smoke + PR1a

- [ ] **Step 1: Voller Build**

Run: `npm run build`
Expected: gruen. (Routen/Server-Actions betroffen → voller Build, nicht nur `tsc`.)

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(CMM-44): SP-A2 PR1a — Cluster 1 Reader-Rename faelle->claims

11 Schadenort-/Datum-Spalten: alle faelle-seitigen Reads/Writes auf die
claims-Spalte mit dem neuen Namen umgestellt (schadens_datum->schadentag etc.).
Kein DB-Schema-Change. Kollisionsgruppen B+C aufgeloest.

Audit:
- Build: gruen (npm run build)
- UI: kein neuer Einstiegspunkt (Reader-Rename)
- Redundanz: bestehende v_claim_*-Views genutzt, kein neuer View-Typ
- Dead-Code: faelle-seitige Selects der 11 Spalten entfernt
- Spec: docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md
- Inkonsistenz: claims-Spaltennamen gegen information_schema verifiziert
- Regression: Re-Grep pro altem Namen = 0 faelle-Reads; CMM-48-Writer markiert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push + PR gegen `staging`**

```bash
git push -u origin kitta/cmm-44-spa2-pr1a-schadenort-datum
gh pr create --base staging --title "CMM-44 SP-A2 PR1a — Cluster 1 Reader-Rename" --body "Reader/Writer-Rename der 11 Schadenort-/Datum-Spalten faelle->claims. Spec: docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md. Kein DB-Schema-Change."
```

- [ ] **Step 4: Portal-Smoke (nach staging-Deploy)**

Smoke gegen `app.staging.claimondo.de` (Public/Admin/SV/Kunde/Dispatch), Screenshots im selben Schritt auswerten. Pruefen: Schadenort, Schadendatum, Schadenzeit erscheinen in Fallakte/Listen unveraendert. Ergebnis in `docs/17.05.2026/cmm44-spa2-smoke-pr1a.md`.

---

# PR1b — Cluster 2: Hergang/Art/Typ + Flags (11 Spalten)

**Branch:** `kitta/cmm-44-spa2-pr1b-hergang-flags`, frisch von `origin/staging`. PR gegen `staging`.
Spalten: `schadens_beschreibung`, `unfallhergang`, `schadens_hergang`, `schadens_art`, `schadens_fall_typ`, `personenschaden_flag`, `halter_ungleich_fahrer_flag`, `sachschaden_flag`, `mietwagen_flag`, `mietwagen_hat`, `nutzungsausfall`.

## Task 1b.1: Call-Site-Inventur Cluster 2

**Files:**
- Create: `docs/17.05.2026/cmm44-spa2-inventory-cluster2.md`

- [ ] **Step 1: Pro Spalte greppen**

Run:
```bash
for col in schadens_beschreibung unfallhergang schadens_hergang schadens_art schadens_fall_typ personenschaden_flag halter_ungleich_fahrer_flag sachschaden_flag mietwagen_flag mietwagen_hat nutzungsausfall; do
  echo "### $col"; grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```

- [ ] **Step 2: Inventur-Doc schreiben** — Klassifizierung wie Task 1a.1 Step 2.

- [ ] **Step 3: Commit**

```bash
git add docs/17.05.2026/cmm44-spa2-inventory-cluster2.md
git commit -m "docs(CMM-44): SP-A2 PR1b — Call-Site-Inventur Cluster 2"
```

## Task 1b.2: Reads/Writes Cluster 2 umstellen

**Files:**
- Modify: alle Change-noetig-Dateien aus `cmm44-spa2-inventory-cluster2.md`.

- [ ] **Step 1: Pro Call-Site nach Rename-Mapping umstellen** — Regeln wie Task 1a.2 Step 1.
  - **Kollision A** (`schadens_beschreibung` + `unfallhergang` + `schadens_hergang` → `hergang_kunde_text`): liest eine Datei mehrere, auf eine `hergang_kunde_text`-Referenz reduzieren.
  - **Kollision D** (`mietwagen_flag` + `mietwagen_hat` → `hat_mietwagen`): analog.

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` · Expected: 0 Fehler.

- [ ] **Step 3: Re-Grep — pro altem Namen einzeln**

Run:
```bash
for col in schadens_beschreibung unfallhergang schadens_hergang schadens_art schadens_fall_typ personenschaden_flag halter_ungleich_fahrer_flag sachschaden_flag mietwagen_flag mietwagen_hat nutzungsausfall; do
  echo "### $col"; grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```
Expected: nur `comment`/`type-only`-Resttreffer, keine `.from('faelle')`-Zugriffe der 11 Spalten.

## Task 1b.3: Build + Smoke + PR1b

- [ ] **Step 1: Voller Build** — Run: `npm run build` · Expected: gruen.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(CMM-44): SP-A2 PR1b — Cluster 2 Reader-Rename faelle->claims

11 Hergang-/Art-/Typ-/Flag-Spalten: alle faelle-seitigen Reads/Writes auf die
claims-Spalte mit dem neuen Namen umgestellt. Kein DB-Schema-Change.
Kollisionsgruppen A+D aufgeloest.

Audit:
- Build: gruen (npm run build)
- UI: kein neuer Einstiegspunkt (Reader-Rename)
- Redundanz: bestehende v_claim_*-Views genutzt
- Dead-Code: faelle-seitige Selects der 11 Spalten entfernt
- Spec: docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md
- Inkonsistenz: claims-Spaltennamen gegen information_schema verifiziert
- Regression: Re-Grep pro altem Namen = 0 faelle-Reads; CMM-48-Writer markiert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push + PR gegen `staging`**

```bash
git push -u origin kitta/cmm-44-spa2-pr1b-hergang-flags
gh pr create --base staging --title "CMM-44 SP-A2 PR1b — Cluster 2 Reader-Rename" --body "Reader/Writer-Rename der 11 Hergang/Art/Typ/Flag-Spalten faelle->claims. Spec: docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md. Kein DB-Schema-Change."
```

- [ ] **Step 4: Portal-Smoke** — wie Task 1a.3 Step 4. Pruefen: Schadenhergang, Schadenart/-typ, Personenschaden/Sachschaden/Mietwagen/Nutzungsausfall-Flags in Fallakte unveraendert. Ergebnis in `docs/17.05.2026/cmm44-spa2-smoke-pr1b.md`.

---

# PR1c — Cluster 3: Rest (6 Spalten)

**Branch:** `kitta/cmm-44-spa2-pr1c-rest`, frisch von `origin/staging`. PR gegen `staging`.
Spalten: `gegner_schadennummer`, `no_show_count`, `aktuelle_phase`, `konvertiert_von_lead`, `regulierung_betrag`, `vs_ablehnungsgrund`.

## Task 1c.1: Call-Site-Inventur Cluster 3

**Files:**
- Create: `docs/17.05.2026/cmm44-spa2-inventory-cluster3.md`

- [ ] **Step 1: Pro Spalte greppen**

Run:
```bash
for col in gegner_schadennummer no_show_count aktuelle_phase konvertiert_von_lead regulierung_betrag vs_ablehnungsgrund; do
  echo "### $col"; grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```

- [ ] **Step 2: Inventur-Doc schreiben** — Klassifizierung wie Task 1a.1 Step 2. Zusaetzlich
  fuer **jede** `no_show_count`-Call-Site notieren, ob der Kontext Kunde- oder SV-No-Show
  ist → Ziel `kunde_no_show_count` bzw. `sv_no_show_count`.

- [ ] **Step 3: Commit**

```bash
git add docs/17.05.2026/cmm44-spa2-inventory-cluster3.md
git commit -m "docs(CMM-44): SP-A2 PR1c — Call-Site-Inventur Cluster 3"
```

## Task 1c.2: Reads/Writes Cluster 3 umstellen

**Files:**
- Modify: alle Change-noetig-Dateien aus `cmm44-spa2-inventory-cluster3.md`.

- [ ] **Step 1: Pro Call-Site nach Rename-Mapping umstellen** — Regeln wie Task 1a.2 Step 1.
  - `no_show_count` → `kunde_no_show_count` oder `sv_no_show_count` gemaess der in Task 1c.1
    Step 2 notierten Kontext-Entscheidung. Beide claims-Spalten sind heute deckungsgleich;
    Default bei unklarem Kontext: `kunde_no_show_count`, im Inventur-Doc begruenden.
  - `aktuelle_phase` → `phase`; `konvertiert_von_lead` → `lead_id`. Achtung: `lead_id`
    existiert evtl. **auch** auf `faelle` — die Quelle muss `claims.lead_id` sein.

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` · Expected: 0 Fehler.

- [ ] **Step 3: Re-Grep — pro altem Namen einzeln**

Run:
```bash
for col in gegner_schadennummer no_show_count aktuelle_phase konvertiert_von_lead regulierung_betrag vs_ablehnungsgrund; do
  echo "### $col"; grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```
Expected: nur `comment`/`type-only`-Resttreffer.

## Task 1c.3: Build + Smoke + PR1c

- [ ] **Step 1: Voller Build** — Run: `npm run build` · Expected: gruen.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(CMM-44): SP-A2 PR1c — Cluster 3 Reader-Rename faelle->claims

6 Rest-Spalten (gegner_schadennummer, no_show_count, aktuelle_phase,
konvertiert_von_lead, regulierung_betrag, vs_ablehnungsgrund) auf die
claims-Spalte mit dem neuen Namen umgestellt. Kein DB-Schema-Change.

Audit:
- Build: gruen (npm run build)
- UI: kein neuer Einstiegspunkt (Reader-Rename)
- Redundanz: bestehende v_claim_*-Views genutzt
- Dead-Code: faelle-seitige Selects der 6 Spalten entfernt
- Spec: docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md
- Inkonsistenz: no_show_count-Ziel pro Call-Site dokumentiert
- Regression: Re-Grep pro altem Namen = 0 faelle-Reads; CMM-48-Writer markiert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push + PR gegen `staging`**

```bash
git push -u origin kitta/cmm-44-spa2-pr1c-rest
gh pr create --base staging --title "CMM-44 SP-A2 PR1c — Cluster 3 Reader-Rename" --body "Reader/Writer-Rename der 6 Rest-Spalten faelle->claims. Spec: docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md. Kein DB-Schema-Change."
```

- [ ] **Step 4: Portal-Smoke** — wie Task 1a.3 Step 4. Pruefen: Phase-Anzeige, No-Show-Zaehler, Regulierungsbetrag, VS-Ablehnungsgrund unveraendert. Ergebnis in `docs/17.05.2026/cmm44-spa2-smoke-pr1c.md`.

---

# PR2 — Backfill + `DROP COLUMN` ×28

> **GATE:** PR2 startet erst, wenn **PR1a + PR1b + PR1c auf `main`** sind (staging→main-Release).
> Pruefen: `git diff origin/main origin/staging -- src/` enthaelt keine SP-A2-Reader mehr —
> inhaltsbasiert, nicht per `merge-base` (Squash-Release, SP-A-Lektion c).

**Branch:** `kitta/cmm-44-spa2-pr2-drop`, frisch von `origin/staging` nach dem Release.

## Task 2.1: Dependency-Audit live

**Files:**
- Create: `scripts/probe-cmm44-spa2-deps.sql`

- [ ] **Step 1: Audit-Query schreiben**

Inhalt `scripts/probe-cmm44-spa2-deps.sql` — drei Teile:
```sql
-- (1) Views/Rules, die faelle referenzieren
SELECT DISTINCT dep.relname AS abhaengiges_objekt, dep.relkind
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dep ON dep.oid = r.ev_class
JOIN pg_class src ON src.oid = d.refobjid
WHERE src.relname = 'faelle';

-- (2) Trigger auf faelle
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid = 'public.faelle'::regclass AND NOT tgisinternal;

-- (3) Funktionen, deren Body einen der 28 faelle-Namen referenziert
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ~ ('\m(' ||
  'schadens_adresse|unfallort|schadens_plz|schadens_ort|unfallort_kategorie|' ||
  'unfallort_lat|unfallort_lng|schadens_datum|unfalldatum|schadens_entdeckt_am|' ||
  'unfall_uhrzeit|schadens_beschreibung|unfallhergang|schadens_hergang|schadens_art|' ||
  'schadens_fall_typ|personenschaden_flag|halter_ungleich_fahrer_flag|sachschaden_flag|' ||
  'mietwagen_flag|mietwagen_hat|nutzungsausfall|gegner_schadennummer|no_show_count|' ||
  'aktuelle_phase|konvertiert_von_lead|regulierung_betrag|vs_ablehnungsgrund) ');
```

- [ ] **Step 2: Audit ausfuehren**

Run: `npx supabase db query --linked --file scripts/probe-cmm44-spa2-deps.sql`
Expected: Liste der abhaengigen Objekte. **Jedes** View/jede Funktion, die eine der 28
Spalten liest, muss in Task 2.2 vor dem `DROP COLUMN` angepasst werden (`CREATE OR REPLACE`).
Trigger-Treffer pruefen — das SP-A-Sync-Paar ist bereits weg; ein verbleibender Trigger,
der eine der 28 Spalten anfasst, blockiert sonst den Drop.

- [ ] **Step 3: Commit**

```bash
git add scripts/probe-cmm44-spa2-deps.sql
git commit -m "chore(CMM-44): SP-A2 PR2 — Dependency-Audit-Probe"
```

## Task 2.2: Migration schreiben

**Files:**
- Create: `supabase/migrations/<timestamp>_cmm44_spa2_drop_28_semantik_dup_columns.sql` (via `npx supabase migration new cmm44_spa2_drop_28_semantik_dup_columns`)

- [ ] **Step 1: Migration generieren**

Run: `npx supabase migration new cmm44_spa2_drop_28_semantik_dup_columns`

- [ ] **Step 2: Migrations-SQL schreiben** — vier Bloecke in dieser Reihenfolge:

```sql
-- BLOCK 1: Gap-Backfill — claims gewinnt, nur NULL-Luecken fuellen.
-- Kollisionsgruppen mit fester Quell-Prioritaet (erst-Spalte hat Vorrang).
UPDATE public.claims c SET schadenort_adresse = COALESCE(c.schadenort_adresse, f.schadens_adresse, f.unfallort)
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadenort_adresse IS NULL;
UPDATE public.claims c SET schadenort_plz = f.schadens_plz
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadenort_plz IS NULL AND f.schadens_plz IS NOT NULL;
UPDATE public.claims c SET schadenort_ort = f.schadens_ort
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadenort_ort IS NULL AND f.schadens_ort IS NOT NULL;
UPDATE public.claims c SET schadenort_kategorie = f.unfallort_kategorie
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadenort_kategorie IS NULL AND f.unfallort_kategorie IS NOT NULL;
UPDATE public.claims c SET schadenort_lat = f.unfallort_lat
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadenort_lat IS NULL AND f.unfallort_lat IS NOT NULL;
UPDATE public.claims c SET schadenort_lng = f.unfallort_lng
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadenort_lng IS NULL AND f.unfallort_lng IS NOT NULL;
UPDATE public.claims c SET schadentag = COALESCE(c.schadentag, f.schadens_datum, f.unfalldatum)
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadentag IS NULL;
UPDATE public.claims c SET entdeckt_am = f.schadens_entdeckt_am
  FROM public.faelle f WHERE f.claim_id = c.id AND c.entdeckt_am IS NULL AND f.schadens_entdeckt_am IS NOT NULL;
UPDATE public.claims c SET schadenzeit = f.unfall_uhrzeit
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadenzeit IS NULL AND f.unfall_uhrzeit IS NOT NULL;
UPDATE public.claims c SET hergang_kunde_text = COALESCE(c.hergang_kunde_text, f.schadens_beschreibung, f.unfallhergang, f.schadens_hergang)
  FROM public.faelle f WHERE f.claim_id = c.id AND c.hergang_kunde_text IS NULL;
UPDATE public.claims c SET schadenart = f.schadens_art
  FROM public.faelle f WHERE f.claim_id = c.id AND c.schadenart IS NULL AND f.schadens_art IS NOT NULL;
UPDATE public.claims c SET fall_typ = f.schadens_fall_typ
  FROM public.faelle f WHERE f.claim_id = c.id AND c.fall_typ IS NULL AND f.schadens_fall_typ IS NOT NULL;
UPDATE public.claims c SET hat_personenschaden = f.personenschaden_flag
  FROM public.faelle f WHERE f.claim_id = c.id AND c.hat_personenschaden IS NULL AND f.personenschaden_flag IS NOT NULL;
UPDATE public.claims c SET halter_ungleich_fahrer = f.halter_ungleich_fahrer_flag
  FROM public.faelle f WHERE f.claim_id = c.id AND c.halter_ungleich_fahrer IS NULL AND f.halter_ungleich_fahrer_flag IS NOT NULL;
UPDATE public.claims c SET hat_sachschaden = f.sachschaden_flag
  FROM public.faelle f WHERE f.claim_id = c.id AND c.hat_sachschaden IS NULL AND f.sachschaden_flag IS NOT NULL;
UPDATE public.claims c SET hat_mietwagen = COALESCE(c.hat_mietwagen, f.mietwagen_flag, f.mietwagen_hat)
  FROM public.faelle f WHERE f.claim_id = c.id AND c.hat_mietwagen IS NULL;
UPDATE public.claims c SET hat_nutzungsausfall = f.nutzungsausfall
  FROM public.faelle f WHERE f.claim_id = c.id AND c.hat_nutzungsausfall IS NULL AND f.nutzungsausfall IS NOT NULL;
UPDATE public.claims c SET gegner_aktenzeichen = f.gegner_schadennummer
  FROM public.faelle f WHERE f.claim_id = c.id AND c.gegner_aktenzeichen IS NULL AND f.gegner_schadennummer IS NOT NULL;
UPDATE public.claims c SET kunde_no_show_count = f.no_show_count
  FROM public.faelle f WHERE f.claim_id = c.id AND c.kunde_no_show_count IS NULL AND f.no_show_count IS NOT NULL;
UPDATE public.claims c SET phase = f.aktuelle_phase
  FROM public.faelle f WHERE f.claim_id = c.id AND c.phase IS NULL AND f.aktuelle_phase IS NOT NULL;
UPDATE public.claims c SET lead_id = f.konvertiert_von_lead
  FROM public.faelle f WHERE f.claim_id = c.id AND c.lead_id IS NULL AND f.konvertiert_von_lead IS NOT NULL;
UPDATE public.claims c SET regulierungs_betrag = f.regulierung_betrag
  FROM public.faelle f WHERE f.claim_id = c.id AND c.regulierungs_betrag IS NULL AND f.regulierung_betrag IS NOT NULL;
UPDATE public.claims c SET vs_ablehnungs_grund = f.vs_ablehnungsgrund
  FROM public.faelle f WHERE f.claim_id = c.id AND c.vs_ablehnungs_grund IS NULL AND f.vs_ablehnungsgrund IS NOT NULL;

-- BLOCK 2: blockierende Views/Funktionen anpassen (CREATE OR REPLACE) —
-- konkret aus Task 2.1 Audit. Falls Audit leer: dieser Block entfaellt.
-- BEKANNT: v_faelle_mit_aktuellem_termin fuehrt die 11 Cluster-1-Spalten
-- (schadens_datum, unfallort, schadens_ort, ...) faelle-basiert. View-Def
-- repointen: die 11 Spalten aus claims (Join via claim_id) ziehen, dabei die
-- BESTEHENDEN Ausgabe-Aliasnamen (schadens_datum etc.) BEIBEHALTEN — so bleiben
-- die ~10 View-Reader unveraendert (PR1-Scope-Entscheidung 2026-05-17, Frage 5).
-- Das ist bewusst Tech-Debt: die Alt-Namen ueberleben als View-interne Aliase
-- bis zum View-Cleanup in SP-K/SP-L.

-- BLOCK 3: DROP COLUMN x28
ALTER TABLE public.faelle
  DROP COLUMN schadens_adresse, DROP COLUMN unfallort, DROP COLUMN schadens_plz,
  DROP COLUMN schadens_ort, DROP COLUMN unfallort_kategorie, DROP COLUMN unfallort_lat,
  DROP COLUMN unfallort_lng, DROP COLUMN schadens_datum, DROP COLUMN unfalldatum,
  DROP COLUMN schadens_entdeckt_am, DROP COLUMN unfall_uhrzeit, DROP COLUMN schadens_beschreibung,
  DROP COLUMN unfallhergang, DROP COLUMN schadens_hergang, DROP COLUMN schadens_art,
  DROP COLUMN schadens_fall_typ, DROP COLUMN personenschaden_flag,
  DROP COLUMN halter_ungleich_fahrer_flag, DROP COLUMN sachschaden_flag,
  DROP COLUMN mietwagen_flag, DROP COLUMN mietwagen_hat, DROP COLUMN nutzungsausfall,
  DROP COLUMN gegner_schadennummer, DROP COLUMN no_show_count, DROP COLUMN aktuelle_phase,
  DROP COLUMN konvertiert_von_lead, DROP COLUMN regulierung_betrag, DROP COLUMN vs_ablehnungsgrund;
```
Hinweis: `no_show_count` wird in den `kunde_no_show_count`-Backfill geleitet (Default-Ziel
laut Spec); falls Task 1c die SV-Variante als kanonisch bestimmt hat, Backfill-Zeile
entsprechend auf `sv_no_show_count` aendern.

- [ ] **Step 3: Kein Commit hier** — Commit nach erfolgreichem Apply (Task 2.3).

## Task 2.3: Migration applizieren

- [ ] **Step 1: Drift-Recheck**

Run: `npx supabase db query --linked --file scripts/probe-cmm44-spa2-divergenz.sql`
Expected: alle 28 Paare noch vorhanden. Fehlt eine Spalte → Migration anpassen.

- [ ] **Step 2: Targeted-Apply**

Run:
```bash
npx supabase db query --linked --file supabase/migrations/<timestamp>_cmm44_spa2_drop_28_semantik_dup_columns.sql
npx supabase migration repair --status applied <timestamp>
```
Expected: kein Fehler. Bei „cannot drop column … because other objects depend on it" →
Block 2 unvollstaendig, abhaengiges Objekt nachtragen, erneut.

- [ ] **Step 3: Verify — 0 Spalten auf `faelle`**

Run:
```bash
echo "SELECT count(*) AS rest FROM information_schema.columns WHERE table_schema='public' AND table_name='faelle' AND column_name IN ('schadens_adresse','unfallort','schadens_plz','schadens_ort','unfallort_kategorie','unfallort_lat','unfallort_lng','schadens_datum','unfalldatum','schadens_entdeckt_am','unfall_uhrzeit','schadens_beschreibung','unfallhergang','schadens_hergang','schadens_art','schadens_fall_typ','personenschaden_flag','halter_ungleich_fahrer_flag','sachschaden_flag','mietwagen_flag','mietwagen_hat','nutzungsausfall','gegner_schadennummer','no_show_count','aktuelle_phase','konvertiert_von_lead','regulierung_betrag','vs_ablehnungsgrund');" > /tmp/spa2_verify.sql
npx supabase db query --linked --file /tmp/spa2_verify.sql
```
Expected: `rest = 0`.

- [ ] **Step 4: Commit Migration**

```bash
git add supabase/migrations/
git commit -m "feat(CMM-44): SP-A2 PR2 — 28 Semantik-Duplikat-Spalten auf faelle droppen"
```

## Task 2.4: Types regen + Build

- [ ] **Step 1: Types neu generieren**

Run: `npx supabase gen types typescript --linked > src/types/database.types.ts`
(Pfad an das real existierende Typen-File anpassen — vorher `ls src/types/`.)

- [ ] **Step 2: Voller Build**

Run: `npm run build`
Expected: gruen. Ein TS-Fehler „Property 'schadens_datum' does not exist on type 'faelle'"
= ein in PR1 uebersehener Reader → fixen, bevor PR2 weitergeht.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(CMM-44): SP-A2 PR2 — Supabase-Types nach 28-Spalten-Drop regen"
```

## Task 2.5: Smoke + PR2

- [ ] **Step 1: Push + PR gegen `staging`**

```bash
git push -u origin kitta/cmm-44-spa2-pr2-drop
gh pr create --base staging --title "CMM-44 SP-A2 PR2 — Backfill + DROP COLUMN x28" --body "Gap-Backfill + 28x DROP COLUMN auf faelle. Migration bereits appliziert + via repair recorded. Spec: docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md"
```

- [ ] **Step 2: Voller Portal-Smoke nach Schema-Drop**

Smoke gegen `app.staging.claimondo.de`, alle 5 Portale, Screenshots im selben Schritt
auswerten (`feedback_post_drop_smoke`). Pruefen: alle in §1 der Spec gelisteten Werte
erscheinen in Fallakte/Listen unveraendert. Ergebnis in `docs/17.05.2026/cmm44-spa2-smoke-pr2.md`.

- [ ] **Step 3: Audit-Doc + Phase-1-Mapping nachziehen**

`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`: `fall_nummer` (→ SP-A3) und
`gegner_anzahl_beteiligte` (→ SP-C) als Re-Klassifizierung vermerken; SP-A2 als erledigt
markieren. Commit:
```bash
git add docs/
git commit -m "docs(CMM-44): SP-A2 erledigt — Phase-1-Mapping + fall_nummer/gegner_anzahl nachgezogen"
```

---

## Definition of Done

- [ ] PR1a + PR1b + PR1c gemergt; je Portal-Smoke gruen, Re-Grep = 0 faelle-Reads.
- [ ] PR2-Migration appliziert + `repair`-recorded; `information_schema` = 0 der 28 Spalten auf `faelle`.
- [ ] `npm run build` gruen nach Type-Regen.
- [ ] Voller Portal-Smoke nach Drop ohne Hard-Fail, Screenshots ausgewertet.
- [ ] `fall_nummer` (SP-A3) + `gegner_anzahl_beteiligte` (SP-C) im Phase-1-Mapping nachgezogen.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
