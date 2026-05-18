# SP-A3 — `faelle.fall_nummer` abschaffen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `faelle.fall_nummer` ersatzlos entfernen; `claims.claim_nummer` wird die alleinige Aktennummer im gesamten Code.

**Architecture:** Drei PRs in additiver Reihenfolge — PR1 fügt `claim_nummer` zu 5 Views hinzu (nicht brechend), PR2 zieht ~198 src-Files auf `claim_nummer` um und löscht die 3 App-Generatoren, PR3 entfernt `f.fall_nummer` aus den Views und droppt Spalte + toten Trigger. Jeder PR ist ein eigener Branch gegen `staging`; PR(N+1) startet erst nach Merge von PR(N).

**Tech Stack:** Next.js 15, Supabase (Postgres), supabase-CLI für DDL, Playwright für Portal-Smoke.

**Spec:** `docs/superpowers/specs/2026-05-17-cmm44-spa3-fall-nummer-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** Diese Arbeit läuft im Worktree `.claude/worktrees/cmm-44-spa3-fall-nummer`, Branch `kitta/cmm-44-spa3-fall-nummer` (aus `origin/main`). Pro PR ein eigener Branch gegen `staging` (Memory: PRs immer `--base staging`).
- **Harte Regeln (AGENTS.md):** Nie auf `main` pushen. DDL nur über supabase-CLI (`db query --linked` + `migration repair`), nie Management-API. Kein unbegleiteter Stash am Session-Ende.
- **DB-Apply-Muster (SP-A2-bewährt):** Migration in `BEGIN/COMMIT`; Dry-Run `BEGIN; … ROLLBACK;`; Apply via `npx supabase db query --linked --file <sql>`; danach `npx supabase migration repair --status applied <version>`. **Kein** `db push`.
- **Supabase-Link:** Der Worktree ist nicht gelinkt (`supabase/.temp` fehlt). CLI-Befehle mit `--linked` aus dem Haupt-Repo `C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2` ausführen, oder den Worktree einmalig linken: `npx supabase link --project-ref paizkjajbuxxksdoycev`.
- **Commit-Format:** Jeder Commit braucht den 7-Punkte-Audit-Block im Body (AGENTS.md). Umlaute Pflicht.

### Faktenlage (Live-DB, 2026-05-17)

- `faelle.fall_nummer`: `text`, nullable, 0 NULLs, `UNIQUE`-Constraint `faelle_fall_nummer_key` (+ Backing-Index). Format `CLM-YYYYMMDD-NNN`.
- `claims.claim_nummer`: `text`, `UNIQUE`-Constraint `claims_claim_nummer_key`, Trigger `set_claim_nummer` + Sequence `claims_claim_nummer_seq`. Format `CLM-YYYY-NNNNN`. Für jeden Claim gefüllt.
- Toter DB-Trigger `set_fall_nummer` auf `faelle` → Funktion `generate_fall_nummer()` (feuert nur `WHEN fall_nummer IS NULL`, App setzt immer → tot).
- 5 Views exponieren `f.fall_nummer`:
  - `v_claim_full`, `v_claim_listing` — exponieren `c.claim_nummer` **bereits**.
  - `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin` — haben `LEFT JOIN claims c ON c.id = f.claim_id` bereits, exponieren `claim_nummer` aber noch nicht.
- 3 App-Generatoren: `src/app/admin/faelle/anlegen/actions.ts`, `src/lib/leads/convert-lead-to-claim.ts`, hartkodiert in `src/app/api/admin/create-test-fall/route.ts` + `src/app/api/seed-testdata/route.ts`.

---

## File Structure

**Neu:**
- `scripts/_build-spa3-views.mjs` — generiert die View-Migrationen aus `pg_get_viewdef` (Vorlage: `scripts/_build-spa2-views.mjs`)
- `scripts/probe-cmm44-spa3.sql` — wiederverwendbare DB-Probe (Verify-Queries)
- `scripts/smoke-cmm44-spa3.mjs` — Portal-Smoke (Vorlage: `scripts/smoke-cmm44-spa2-pr2.mjs`)
- `supabase/migrations/<ts>_cmm44_spa3_views_add_claim_nummer.sql` — PR1
- `supabase/migrations/<ts>_cmm44_spa3_drop_fall_nummer.sql` — PR3
- `docs/17.05.2026/cmm44-spa3-smoke-pr2.md`, `…-smoke-pr3.md` — Smoke-Protokolle

**Modifiziert (PR2):** ~198 Files unter `src/` (siehe Cluster-Tasks). Generator-Files: `src/app/admin/faelle/anlegen/actions.ts`, `src/app/admin/faelle/anlegen/AnlegenFallClient.tsx`, `src/lib/leads/convert-lead-to-claim.ts`, `src/app/api/admin/create-test-fall/route.ts`, `src/app/api/seed-testdata/route.ts`. Types: `src/lib/supabase/database.types.ts`.

---

## Transform-Regelwerk (PR2 Reader-Sweep)

Jede `fall_nummer`-Referenz in `src/` fällt in genau eines dieser Muster. Der Executor bestimmt pro Vorkommen das Muster und wendet den Transform an.

| Muster | Erkennung | Transform |
|---|---|---|
| **A — Nested-Claims vorhanden** | Select hat bereits `claims:claim_id(...)` oder `claim_id(...)` | `claim_nummer` in den nested `claims(...)`-Block aufnehmen; `fall_nummer` aus dem faelle-Teil entfernen; Lesezugriff `x.fall_nummer` → `(Array.isArray(x.claims) ? x.claims[0] : x.claims)?.claim_nummer`. Nested-FK-Normalisierung beachten (AGENTS.md §Inkonsistenz). |
| **B — Direkt-Select aus `faelle`, kein Claims-Join** | `from('faelle').select('…fall_nummer…')` ohne `claim_id(...)` | Select um `claims:claim_id(claim_nummer)` erweitern, `fall_nummer` entfernen; Lesezugriff auf normalisiertes `claims.claim_nummer` umstellen. |
| **C — View-Reader** | Select aus `v_claim_full`, `v_claim_listing`, `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin` | `fall_nummer` → `claim_nummer` im Select **und** im Lesezugriff. (PR1 hat `claim_nummer` zu allen 5 Views ergänzt.) |
| **D — Lookup per `.eq('fall_nummer', …)`** | `.eq('fall_nummer', X)` auf `faelle` | Lookup auf `claims` umbauen: `from('claims').select('id, …').eq('claim_nummer', X)`; den von dort gewonnenen Claim/Fall-Bezug weiterverwenden. Betrifft `api/lexdrive/bot-callback`, `api/lexdrive/vollmacht-confirm`, `api/webhooks/lexdrive`. |
| **E — Reiner TS-Typ / Interface / Display** | Property in `interface`/`type`, JSX-Anzeige, Variablen-Name; kein DB-Zugriff | Property `fall_nummer` → `claim_nummer` umbenennen, alle Lesestellen mitziehen. |
| **F — Generator / Insert** | `fall_nummer:` in `.insert({…})`, `CLM-${…}`-Bau, `.like('fall_nummer', …)` | **Nicht renamen — löschen.** Abgedeckt durch Task 3–5. |

**Verify-Endzustand für PR2:** `git grep fall_nummer -- 'src/*'` liefert 0 Treffer, `npm run build` grün.

---

## Task 1: PR1 — `claim_nummer` zu den 5 Views hinzufügen

**Branch:** `kitta/cmm-44-spa3-pr1-views` (aus `staging`)

**Files:**
- Create: `scripts/_build-spa3-views.mjs`
- Create: `scripts/probe-cmm44-spa3.sql`
- Create: `supabase/migrations/<ts>_cmm44_spa3_views_add_claim_nummer.sql`

- [ ] **Step 1: Branch anlegen**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/cmm-44-spa3-fall-nummer"
git fetch origin
git checkout -b kitta/cmm-44-spa3-pr1-views origin/staging
```

- [ ] **Step 2: Probe-SQL anlegen**

Datei `scripts/probe-cmm44-spa3.sql`:

```sql
-- SP-A3 Verify-Queries
\echo == fall_nummer auf faelle vorhanden? ==
SELECT count(*) AS fall_nummer_spalte FROM information_schema.columns
  WHERE table_name='faelle' AND column_name='fall_nummer';
\echo == claim_nummer in den 5 Views vorhanden? ==
SELECT table_name FROM information_schema.columns
  WHERE column_name='claim_nummer'
    AND table_name IN ('v_claim_full','v_claim_listing','v_faelle_mit_aktuellem_termin','faelle_kunde_view','faelle_sv_view')
  ORDER BY table_name;
\echo == set_fall_nummer Trigger / generate_fall_nummer Funktion vorhanden? ==
SELECT 'trigger' AS art, count(*) FROM pg_trigger WHERE tgname='set_fall_nummer'
UNION ALL SELECT 'function', count(*) FROM pg_proc WHERE proname='generate_fall_nummer';
```

- [ ] **Step 3: View-Build-Script anlegen**

`scripts/_build-spa3-views.mjs` — liest die aktuellen View-Definitionen über `pg_get_viewdef` und erzeugt die Migration. Vorlage: `scripts/_build-spa2-views.mjs` (dort steht das Muster: DB-Connect über `DATABASE_URL`/Pooler, `pg_get_viewdef(view, true)`, jede Spalte auf Quell-Typ casten).

Logik dieses Scripts:
- Zielviews für PR1: `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin` (die 3 ohne `claim_nummer`).
- Für jede: aktuelle Definition holen, `CREATE OR REPLACE VIEW <name> AS <def mit zusätzlicher letzter Spalte `c.claim_nummer`>`.
- `CREATE OR REPLACE VIEW` erlaubt nur **Anhängen am Ende** der Spaltenliste — `c.claim_nummer` als letzte Select-Spalte einfügen, vor dem `FROM`.
- Alle drei Views haben `LEFT JOIN claims c ON c.id = f.claim_id` bereits → kein neuer Join nötig.
- Ausgabe: SQL-Block in `BEGIN; … COMMIT;`.

- [ ] **Step 4: Migration generieren**

```bash
npx supabase migration new cmm44_spa3_views_add_claim_nummer
node scripts/_build-spa3-views.mjs > supabase/migrations/<ts>_cmm44_spa3_views_add_claim_nummer.sql
```

Die Migration enthält `CREATE OR REPLACE VIEW` für `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin`, jeweils mit `c.claim_nummer` als letzter Spalte. `v_claim_full` und `v_claim_listing` bleiben unangetastet (haben `claim_nummer` schon).

- [ ] **Step 5: Dry-Run gegen die Live-DB**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2"
# Migration testweise in BEGIN/ROLLBACK wrappen und ausführen
npx supabase db query --linked --file <dry-run-variante>.sql
```

Expected: kein Fehler (insb. kein „cannot change name of view column" — falls doch, ist `claim_nummer` nicht am Listenende).

- [ ] **Step 6: Migration applizieren**

```bash
npx supabase db query --linked --file supabase/migrations/<ts>_cmm44_spa3_views_add_claim_nummer.sql
npx supabase migration repair --status applied <ts>
```

- [ ] **Step 7: Verify**

```bash
npx supabase db query --linked --file scripts/probe-cmm44-spa3.sql
```

Expected: Alle 5 Views in der `claim_nummer`-Ergebnisliste; `fall_nummer_spalte = 1` (noch da).

- [ ] **Step 8: Commit & PR**

```bash
git add scripts/_build-spa3-views.mjs scripts/probe-cmm44-spa3.sql supabase/migrations/<ts>_cmm44_spa3_views_add_claim_nummer.sql
git commit  # 7-Punkte-Audit-Body, Build n/a (nur SQL+Script)
git push -u origin kitta/cmm-44-spa3-pr1-views
gh pr create --base staging --title "CMM-44 SP-A3 PR1 — claim_nummer zu 5 Views ergaenzen" --body "<beschreibung>"
```

**PR1 muss gemergt + die Migration appliziert sein, bevor Task 2 startet.**

---

## Task 2: PR2 — Branch & Setup

**Branch:** `kitta/cmm-44-spa3-pr2-reader-sweep` (aus `staging`, nach PR1-Merge)

- [ ] **Step 1: Branch anlegen**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/cmm-44-spa3-fall-nummer"
git fetch origin
git checkout -b kitta/cmm-44-spa3-pr2-reader-sweep origin/staging
```

- [ ] **Step 2: Baseline-Inventur**

```bash
git grep -l "fall_nummer" -- 'src/*' | sort > /tmp/spa3-files-before.txt
wc -l /tmp/spa3-files-before.txt
```

Expected: ~198 Files. Diese Liste ist die Arbeitsgrundlage für Task 6–10.

---

## Task 3: PR2 — Generator `anlegeFall` entfernen

**Files:**
- Modify: `src/app/admin/faelle/anlegen/actions.ts`
- Modify: `src/app/admin/faelle/anlegen/AnlegenFallClient.tsx`

Kontext: `anlegeFall` legt zuerst `faelle` an (mit selbst-generierter `fall_nummer`), dann ruft es `createClaimForFall` (gibt die Claim-`id` zurück). Nach SP-A3 generiert der DB-Trigger `set_claim_nummer` die Nummer beim Claim-Insert; `anlegeFall` liest `claim_nummer` danach nach.

- [ ] **Step 1: Generator-Block + Insert-Feld entfernen, Return-Shape umstellen**

In `src/app/admin/faelle/anlegen/actions.ts`:

Den Return-Typ ändern:

```typescript
export async function anlegeFall(data: AnlegeFallInput): Promise<
  { success: true; fall_id: string; claim_nummer: string | null } | { success: false; error: string }
> {
```

Den Generator-Block (`// 2. Fall-Nummer generieren …` bis `const fallNummer = …`) **ersatzlos löschen**. Im `faelle`-Insert die Zeile `fall_nummer: fallNummer,` entfernen.

`createClaimForFall` gibt die Claim-`id` zurück — den Rückgabewert auffangen und `claim_nummer` nachladen:

```typescript
  let claimNummer: string | null = null
  try {
    const { createClaimForFall } = await import('@/lib/claims/create-for-fall')
    const claimId = await createClaimForFall(db, fall.id, {
      schadens_plz: data.schadens_plz,
      schadens_adresse: data.schadens_adresse ?? null,
      schadens_ort: data.schadens_ort ?? null,
      schadens_ursache: data.schadensursache ?? null,
      schadens_art: data.schadens_art ?? null,
      spezifikation: data.spezifikation ?? null,
      lead_id: lead.id,
    }, 'manuell_admin')
    if (claimId) {
      const { data: claim } = await db.from('claims').select('claim_nummer').eq('id', claimId).single()
      claimNummer = claim?.claim_nummer ?? null
    }
  } catch (err) { console.error('[AAR-811] createClaimForFall (admin-anlegen):', err) }

  revalidatePath('/admin/faelle', 'page')
  revalidatePath('/dispatch/dashboard', 'page')
  return { success: true, fall_id: fall.id, claim_nummer: claimNummer }
```

- [ ] **Step 2: Client-Caller mitziehen**

In `src/app/admin/faelle/anlegen/AnlegenFallClient.tsx`:

State-Typ und Setzen:

```typescript
  const [result, setResult] = useState<{ fall_id: string; claim_nummer: string | null } | null>(null)
```

```typescript
      if (r.success) {
        setResult({ fall_id: r.fall_id, claim_nummer: r.claim_nummer })
      } else {
```

Erfolgs-Screen-Heading:

```tsx
              <h2 className="text-lg font-semibold text-claimondo-navy">Fall {result.claim_nummer ?? '(Nummer folgt)'} angelegt</h2>
```

- [ ] **Step 3: Build**

```bash
npx tsc --noEmit
```

Expected: keine Fehler in `actions.ts` / `AnlegenFallClient.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/faelle/anlegen/actions.ts src/app/admin/faelle/anlegen/AnlegenFallClient.tsx
git commit  # 7-Punkte-Audit-Body
```

---

## Task 4: PR2 — Generator `convert-lead-to-claim` entfernen

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts`

- [ ] **Step 1: Generator-Funktion + Aufrufe entfernen**

Zeilen 474–476 enthalten `.like('fall_nummer', `CLM-${dateStr}-%`)` und `return `CLM-${dateStr}-${nr}``. Die umgebende Nummern-Generierungs-Funktion identifizieren (`grep -n "fall_nummer\|CLM-" src/lib/leads/convert-lead-to-claim.ts`), den Funktionskörper **ersatzlos löschen** und jeden Aufruf entfernen. Wenn die Funktion ihr Ergebnis in einen `faelle`-Insert schreibt, das `fall_nummer:`-Insert-Feld ebenfalls entfernen.

- [ ] **Step 2: Test mitziehen**

`src/lib/leads/__tests__/convert-lead-to-claim.test.ts` referenziert `fall_nummer` (1 Treffer). Die Assertion auf `fall_nummer` entfernen oder — falls sinnvoll — durch eine `claim_nummer`-Assertion ersetzen (`claim_nummer` ist nach Claim-Insert trigger-gefüllt).

- [ ] **Step 3: Build + Test**

```bash
npx tsc --noEmit
npx vitest run src/lib/leads/__tests__/convert-lead-to-claim.test.ts
```

Expected: tsc grün; Test grün.

- [ ] **Step 4: Commit**

```bash
git add src/lib/leads/convert-lead-to-claim.ts src/lib/leads/__tests__/convert-lead-to-claim.test.ts
git commit  # 7-Punkte-Audit-Body
```

---

## Task 5: PR2 — Hartkodierte `fall_nummer` in Seed/Test-Routen entfernen

**Files:**
- Modify: `src/app/api/admin/create-test-fall/route.ts`
- Modify: `src/app/api/seed-testdata/route.ts`

- [ ] **Step 1: `create-test-fall` bereinigen**

In `src/app/api/admin/create-test-fall/route.ts:124` die Zeile `fall_nummer: 'CLM-TEST-001',` aus dem `faelle`-Insert entfernen. Falls die Route die Nummer danach ausliest/zurückgibt, auf `claim_nummer` des zugehörigen Claims umstellen (Muster B/C aus dem Regelwerk).

- [ ] **Step 2: `seed-testdata` bereinigen**

In `src/app/api/seed-testdata/route.ts` die 5 hartkodierten `fall_nummer:`-Felder (Zeilen 400/415/433/450/466) aus den `faelle`-Inserts entfernen. Zeile 493 (`fall_nummer: f.fall_nummer`) ist ein Reader → nach Regel B/C behandeln.

- [ ] **Step 3: Build**

```bash
npx tsc --noEmit
```

Expected: keine Fehler in beiden Files.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/create-test-fall/route.ts src/app/api/seed-testdata/route.ts
git commit  # 7-Punkte-Audit-Body
```

---

## Task 6: PR2 — Reader-Sweep Cluster `lib/` + `components/`

**Files:** alle Files unter `src/lib/` und `src/components/` aus `/tmp/spa3-files-before.txt` (~62 Files), ausgenommen die in Task 3–5 bereits bearbeiteten.

- [ ] **Step 1: Cluster-Fileliste erzeugen**

```bash
git grep -l "fall_nummer" -- 'src/lib/*' 'src/components/*' | sort
```

- [ ] **Step 2: Pro File Transform anwenden**

Für jedes File: jedes `fall_nummer`-Vorkommen gegen das **Transform-Regelwerk** (oben) prüfen und Muster A–E anwenden. Generator-Stellen (Muster F) gibt es hier nicht mehr (in Task 3–5 erledigt). Nested-FK immer mit `Array.isArray(x) ? x[0] : x` normalisieren.

Sonderfall in diesem Cluster: `src/lib/actions/admin-kalender.ts`, `dispatch-fall-actions.ts`, `termin-actions.ts`, `email/google/flows.ts` haben mehrere Vorkommen — jedes einzeln klassifizieren.

- [ ] **Step 3: Build**

```bash
npx tsc --noEmit
```

Expected: keine Fehler.

- [ ] **Step 4: Verify Cluster sauber**

```bash
git grep -c "fall_nummer" -- 'src/lib/*' 'src/components/*'
```

Expected: 0 Treffer.

- [ ] **Step 5: Commit**

```bash
git add src/lib src/components
git commit  # 7-Punkte-Audit-Body
```

---

## Task 7: PR2 — Reader-Sweep Cluster `app/api/`

**Files:** alle Files unter `src/app/api/` mit `fall_nummer` (~30 Files), ausgenommen die in Task 5 bearbeiteten.

- [ ] **Step 1: Cluster-Fileliste**

```bash
git grep -l "fall_nummer" -- 'src/app/api/*' | sort
```

- [ ] **Step 2: Pro File Transform anwenden**

Regelwerk A–E anwenden. **Achtung Muster D** in diesem Cluster:
- `src/app/api/lexdrive/bot-callback/route.ts:42` — `.eq('fall_nummer', body.fall_nummer)` → Lookup auf `claims.claim_nummer` umbauen.
- `src/app/api/lexdrive/vollmacht-confirm/route.ts:39` — dito.
- `src/app/api/webhooks/lexdrive/route.ts:51` — `.eq('fall_nummer', fallNr)` → dito.

Für Muster D: statt `from('faelle').select('id').eq('fall_nummer', X)` →
`from('claims').select('id, fall_id').eq('claim_nummer', X).maybeSingle()` und den `fall_id`-Bezug von dort weiterverwenden. Vor der Umstellung prüfen, ob `claims` die Spalte `fall_id` führt (`git grep "fall_id" src/lib/supabase/database.types.ts` im claims-Block); falls nicht vorhanden, über `from('faelle').select('id').eq('claim_id', claim.id)` rückverknüpfen.

`src/app/api/sv-zuweisung/route.ts:431` und `webhooks/twilio/inbound/route.ts:176,563` haben bereits `claims:claim_id(...)` → Muster A.

- [ ] **Step 3: Build**

```bash
npx tsc --noEmit
```

Expected: keine Fehler.

- [ ] **Step 4: Verify**

```bash
git grep -c "fall_nummer" -- 'src/app/api/*'
```

Expected: 0 Treffer.

- [ ] **Step 5: Commit**

```bash
git add src/app/api
git commit  # 7-Punkte-Audit-Body
```

---

## Task 8: PR2 — Reader-Sweep Cluster `app/admin/` + `app/dispatch/` + `app/mitarbeiter/`

**Files:** alle Files unter diesen drei Verzeichnissen mit `fall_nummer` (~35 Files), ausgenommen die `anlegen/`-Files aus Task 3.

- [ ] **Step 1: Cluster-Fileliste**

```bash
git grep -l "fall_nummer" -- 'src/app/admin/*' 'src/app/dispatch/*' 'src/app/mitarbeiter/*' | sort
```

- [ ] **Step 2: Pro File Transform anwenden**

Regelwerk A–E. Häufig hier: Muster B (`from('faelle').select('id, fall_nummer')` in `admin/kalender`, `admin/meine-tasks`, `admin/reklamationen`, `admin/tasks`, `gutachter/tasks` — letzteres erst Task 9). Muster E für Kanban-/Widget-Interfaces (`FaelleKanban.tsx`, `KanbanBoard.tsx`, `WichtigeUpdatesWidget.tsx`). `admin/faelle/(hub)/page.tsx:244` hat den Fallback `r.fall_nummer ?? r.claim_nummer` → auf reines `claim_nummer` reduzieren.

- [ ] **Step 3: Build**

```bash
npx tsc --noEmit
```

Expected: keine Fehler.

- [ ] **Step 4: Verify**

```bash
git grep -c "fall_nummer" -- 'src/app/admin/*' 'src/app/dispatch/*' 'src/app/mitarbeiter/*'
```

Expected: 0 Treffer.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/app/dispatch src/app/mitarbeiter
git commit  # 7-Punkte-Audit-Body
```

---

## Task 9: PR2 — Reader-Sweep Cluster `app/gutachter/` + `app/kunde*/` + `app/faelle/` + Rest

**Files:** alle restlichen Files unter `src/app/` mit `fall_nummer` (~70 Files): `gutachter/`, `kunde/`, `kunde-termin/`, `faelle/`, `sv/`, `flow/`, `kanzlei/`.

- [ ] **Step 1: Cluster-Fileliste**

```bash
git grep -l "fall_nummer" -- 'src/app/gutachter/*' 'src/app/kunde/*' 'src/app/kunde-termin/*' 'src/app/faelle/*' 'src/app/sv/*' 'src/app/flow/*' 'src/app/kanzlei/*' | sort
```

- [ ] **Step 2: Pro File Transform anwenden**

Regelwerk A–E. `src/app/faelle/[id]/_actions/filmcheck.ts` Zeilen 61/86 sind Muster B (`from('faelle').select('fall_nummer')`) — **aber** dieselbe Datei generiert `mandatsnummer` (Zeilen 34/44, `CLM-${year}-…`): `mandatsnummer` ist **Out of Scope**, nicht anfassen. Nur `fall_nummer` umstellen.

- [ ] **Step 3: Build (voll)**

```bash
npm run build
```

Expected: Build grün. Voller Build statt nur `tsc`, weil dieser Cluster Routen/Server-Actions berührt (AGENTS.md §1 Build Check).

- [ ] **Step 4: Verify gesamtes `src/`**

```bash
git grep -c "fall_nummer" -- 'src/*'
```

Expected: **0 Treffer** im gesamten `src/`-Baum.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit  # 7-Punkte-Audit-Body
```

---

## Task 10: PR2 — Types regenerieren & Portal-Smoke

**Files:**
- Modify: `src/lib/supabase/database.types.ts`
- Create: `scripts/smoke-cmm44-spa3.mjs`
- Create: `docs/17.05.2026/cmm44-spa3-smoke-pr2.md`

- [ ] **Step 1: Types regenerieren**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2"
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

Hinweis: `fall_nummer` ist zu diesem Zeitpunkt **noch** in `faelle` (Drop erst PR3) — die regenerierten Types enthalten `fall_nummer` also weiterhin und zusätzlich `claim_nummer` in den 3 erweiterten Views. Das ist korrekt; der Sweep nutzt nur `claim_nummer`.

- [ ] **Step 2: Build mit neuen Types**

```bash
npm run build
```

Expected: Build grün.

- [ ] **Step 3: Smoke-Script anlegen**

`scripts/smoke-cmm44-spa3.mjs` — Vorlage `scripts/smoke-cmm44-spa2-pr2.mjs`. Loggt sich in 5 Portale ein (Admin / Dispatch / SV / Kunde / Public), öffnet je eine Seite mit angezeigter Aktennummer (Fall-Liste, Fallakte-Header, Finance), macht Screenshots. Test-User aus `docs/`-E2E-Setup (Memory: `twofa_aktiviert=false`, Passwort `Test1234!`).

- [ ] **Step 4: Smoke gegen staging fahren**

```bash
node scripts/smoke-cmm44-spa3.mjs
```

Smoke läuft gegen `app.staging.claimondo.de` (Memory: nie Prod). Screenshots im selben Turn auswerten (Memory: Screenshot-Pflicht). Erwartung: jede angezeigte Aktennummer im Format `CLM-YYYY-NNNNN`; keine leeren Nummern-Felder; keine Runtime-Errors.

- [ ] **Step 5: Smoke-Protokoll schreiben**

`docs/17.05.2026/cmm44-spa3-smoke-pr2.md` — Tabelle Portal × Seite × OK/WARN/FAIL, Screenshot-Referenzen, Befunde.

- [ ] **Step 6: Commit & PR**

```bash
git add src/lib/supabase/database.types.ts scripts/smoke-cmm44-spa3.mjs docs/17.05.2026/cmm44-spa3-smoke-pr2.md
git commit  # 7-Punkte-Audit-Body
git push -u origin kitta/cmm-44-spa3-pr2-reader-sweep
gh pr create --base staging --title "CMM-44 SP-A3 PR2 — Reader-Sweep fall_nummer -> claim_nummer + Generatoren entfernen" --body "<beschreibung>"
```

**PR2 muss gemergt + deployt sein, bevor Task 11 startet** — sonst brechen verbliebene Reader beim Drop.

---

## Task 11: PR3 — `f.fall_nummer` aus Views entfernen & `DROP COLUMN`

**Branch:** `kitta/cmm-44-spa3-pr3-drop` (aus `staging`, nach PR2-Merge)

**Files:**
- Modify: `scripts/_build-spa3-views.mjs` (Drop-Modus)
- Create: `supabase/migrations/<ts>_cmm44_spa3_drop_fall_nummer.sql`

- [ ] **Step 1: Branch anlegen**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/cmm-44-spa3-fall-nummer"
git fetch origin
git checkout -b kitta/cmm-44-spa3-pr3-drop origin/staging
```

- [ ] **Step 2: View-Abhängigkeiten prüfen**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2"
```

SQL-Probe: hängen die 5 Views voneinander ab (View-auf-View)?

```sql
SELECT dependent.relname AS abhaengige_view, referenced.relname AS basis
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dependent ON dependent.oid = r.ev_class
JOIN pg_class referenced ON referenced.oid = d.refobjid
WHERE dependent.relkind='v' AND referenced.relkind='v'
  AND dependent.relname <> referenced.relname
  AND dependent.relname IN ('v_claim_full','v_claim_listing','v_faelle_mit_aktuellem_termin','faelle_kunde_view','faelle_sv_view');
```

Ergebnis bestimmt die `DROP VIEW`-Reihenfolge (abhängige zuerst) bzw. ob `CASCADE` nötig ist.

- [ ] **Step 3: Drop-Modus im Build-Script ergänzen**

`scripts/_build-spa3-views.mjs` um einen Modus erweitern, der für alle 5 Views `DROP VIEW <name>;` + `CREATE VIEW <name> AS <def OHNE die `f.fall_nummer`-Spalte>` erzeugt. `CREATE OR REPLACE VIEW` kann **keine Spalte entfernen** → `DROP` + `CREATE` zwingend. Reihenfolge gemäß Step-2-Ergebnis. Jede Spalte auf Quell-Typ casten (SP-A2-Lesson).

- [ ] **Step 4: Migration generieren**

```bash
npx supabase migration new cmm44_spa3_drop_fall_nummer
node scripts/_build-spa3-views.mjs --drop > supabase/migrations/<ts>_cmm44_spa3_drop_fall_nummer.sql
```

Die Migration (in `BEGIN; … COMMIT;`) muss enthalten — in dieser Reihenfolge:

```sql
BEGIN;
-- 1. Views ohne f.fall_nummer neu bauen (DROP + CREATE, abhaengige zuerst)
DROP VIEW IF EXISTS <abhaengige_views_zuerst>;
DROP VIEW IF EXISTS v_claim_full, v_claim_listing, v_faelle_mit_aktuellem_termin, faelle_kunde_view, faelle_sv_view;
CREATE VIEW <name> AS <def ohne f.fall_nummer>;  -- fuer alle 5, Basis-Views zuerst
-- 2. Spalte droppen (UNIQUE-Constraint faelle_fall_nummer_key + Index fallen automatisch mit)
ALTER TABLE faelle DROP COLUMN fall_nummer;
-- 3. Toten Trigger + Funktion aufraeumen
DROP TRIGGER IF EXISTS set_fall_nummer ON faelle;
DROP FUNCTION IF EXISTS generate_fall_nummer();
COMMIT;
```

- [ ] **Step 5: Dry-Run**

```bash
npx supabase db query --linked --file <dry-run-mit-ROLLBACK>.sql
```

Expected: kein Fehler. Insbesondere kein „cannot drop column fall_nummer because other objects depend on it" — falls doch, fehlt ein View im DROP-Block oder es gibt einen weiteren Consumer (dann mit der `pg_depend`-Probe aus Step 2 nachfassen).

- [ ] **Step 6: Migration applizieren**

```bash
npx supabase db query --linked --file supabase/migrations/<ts>_cmm44_spa3_drop_fall_nummer.sql
npx supabase migration repair --status applied <ts>
```

- [ ] **Step 7: Verify**

```bash
npx supabase db query --linked --file scripts/probe-cmm44-spa3.sql
```

Expected: `fall_nummer_spalte = 0`; `claim_nummer` weiterhin in allen 5 Views; `set_fall_nummer`-Trigger = 0, `generate_fall_nummer`-Funktion = 0.

- [ ] **Step 8: Types regenerieren & Build**

```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
npm run build
```

Expected: `database.types.ts` enthält kein `fall_nummer` mehr; Build grün.

- [ ] **Step 9: Portal-Smoke (final)**

```bash
node scripts/smoke-cmm44-spa3.mjs
```

5 Portale gegen staging, Screenshots auswerten. Erwartung: 0 Hard-Fails, jede Aktennummer im `CLM-YYYY-NNNNN`-Format. Protokoll nach `docs/17.05.2026/cmm44-spa3-smoke-pr3.md`.

- [ ] **Step 10: Commit & PR**

```bash
git add scripts/_build-spa3-views.mjs supabase/migrations/<ts>_cmm44_spa3_drop_fall_nummer.sql src/lib/supabase/database.types.ts docs/17.05.2026/cmm44-spa3-smoke-pr3.md
git commit  # 7-Punkte-Audit-Body
git push -u origin kitta/cmm-44-spa3-pr3-drop
gh pr create --base staging --title "CMM-44 SP-A3 PR3 — DROP COLUMN faelle.fall_nummer + Views + toter Trigger" --body "<beschreibung>"
```

---

## Task 12: Abschluss

- [ ] **Step 1: Handoff-Doc schreiben**

`docs/17.05.2026/handoff-2026-05-17-cmm44-spa3-abschluss.md` — analog SP-A2-Handoff: was erledigt (PR1/2/3), Verify-Ergebnisse, nächster Schritt SP-B (64 CLAIMS-Spalten, siehe `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md §4`).

- [ ] **Step 2: Memory aktualisieren**

`project_cmm44_spa3_status.md` anlegen (analog `project_cmm44_spa2_status.md`), Pointer in `MEMORY.md`. SP-A3 als erledigt markieren, SP-B als nächstes.

- [ ] **Step 3: Session-Abschluss-Checkliste (AGENTS.md Regel 3)**

```bash
git status            # Working-Tree clean?
git stash list        # Leer / alte Stashes dokumentiert?
git log --branches --not --remotes   # Alle Commits gepusht?
```

- [ ] **Step 4: Worktree aufräumen** (nach Merge aller 3 PRs)

```bash
git worktree remove ".claude/worktrees/cmm-44-spa3-fall-nummer"
```

---

## Selbst-Review (Plan vs. Spec)

- **Spec §1 Scope** — 5 Views (Task 1, 11), 198 Files (Task 6–9), 3 Generatoren (Task 3–5), toter Trigger (Task 11), DROP COLUMN (Task 11): ✅ alle abgedeckt.
- **Spec §2 mandatsnummer Out of Scope** — explizit in Task 9 Step 2 ausgenommen: ✅.
- **Spec §3 PR-Reihenfolge** — PR1 vor PR2 vor PR3, Merge-Gates in Task 1/10 notiert: ✅.
- **Spec §4 Migrations-Vorgehen** — `BEGIN/COMMIT`, Dry-Run, `db query --linked` + `repair`, kein `db push`: ✅ in Task 1, 11.
- **Spec §5 Erfolgskriterium** — `information_schema`-Verify (Task 11 Step 7), `git grep` 0 Treffer (Task 9 Step 4), Build grün, 5-Portal-Smoke: ✅.
- **Spec §6 Risiko claim_nummer-UNIQUE** — Live verifiziert: `claims_claim_nummer_key` existiert, kein Vorab-Schritt nötig → Risiko erledigt, nicht im Plan.
- **Typ-Konsistenz** — Return-Shape `{ success, fall_id, claim_nummer }` in Task 3 Step 1+2 konsistent; Regelwerk-Muster A–F durchgängig referenziert.
