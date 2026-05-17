# CMM-44 SP-A — Duplikat-Drops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 34 von `trg_sync_faelle_to_claims` / `trg_sync_claims_to_faelle` synchron gehaltenen Duplikat-Spalten faelle-seitig entfernen — Code liest/schreibt sie nur noch über `claims`.

**Architecture:** Zwei sequenzielle PRs. PR1 zieht alle faelle-seitigen Reader/Writer der 34 Spalten auf `claims` um (same-name → reiner Quell-Tabellen-Wechsel, kein Schema-Change). PR2 backfillt `claims` aus `faelle` (INSERT-Gap), entfernt das Sync-Trigger-Paar (synct ausschließlich diese 34 → danach funktionslos) und droppt die 34 Spalten von `faelle`.

**Tech Stack:** Next.js 15 (App Router), Supabase Postgres + supabase-js, supabase-CLI-Migrations, Playwright-Smoke-Skripte.

**Spec:** `docs/superpowers/specs/2026-05-16-cmm44-spa-duplikat-drops-design.md`

---

## Die 34 Spalten (verbindliche Liste)

```
abgeschlossen_am, auslandskennzeichen, brn, fahrerflucht, finanzierung_leasing,
finanzierungsgeber_adresse, finanzierungsgeber_name, finanzierungsgeber_vertragsnr,
gegner_bekannt, gegner_versicherung_id, gegner_versicherungsnummer, gewerbe_flag,
kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_name,
kanzlei_ansprechpartner_telefon, kanzlei_uebergeben_am, kunde_email,
kunden_konstellation, kundenbetreuer_id, polizei_aktenzeichen,
polizei_bericht_vorhanden, polizei_vor_ort, polizeibericht_status,
sachschaden_beschreibung, spezifikation, unfall_konstellation,
unfallskizze_ablehnung_grund, unfallskizze_bestaetigt, unfallskizze_generiert_am,
unfallskizze_svg, unfallskizze_url, vehicle_id, vorsteuerabzugsberechtigt,
zeugen_kontakte
```

Alle 34 existieren namensgleich auf `faelle` UND `claims`. `claims.<col>` ist die SSoT.

## DB-Objekte (verifiziert 2026-05-16)

- Trigger: `trg_sync_faelle_to_claims` ON `public.faelle`, `trg_sync_claims_to_faelle` ON `public.claims`
- Funktionen: `public.sync_faelle_to_claims()`, `public.sync_claims_to_faelle()`
- 6 Views referenzieren `faelle`: `faelle_kunde_view`, `faelle_sv_view`, `v_claim_full`, `v_claim_listing`, `v_claim_timeline`, `v_faelle_mit_aktuellem_termin`

---

# PR 1 — Reader/Writer-Sweep

**Branch:** `kitta/cmm-44-spa-pr1-reader-sweep`, frisch von `origin/staging`.

### Task 1: Worktree-Setup + Call-Site-Inventur

**Files:**
- Create: `scripts/cmm44-spa-callsites.mjs`
- Create: `scripts/cmm44-spa-callsites.txt` (Output, wird committet)

- [ ] **Step 1: Eigenen Worktree von staging anlegen**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2"
git fetch origin staging
git worktree add ../wt-cmm44-spa-pr1 -b kitta/cmm-44-spa-pr1-reader-sweep origin/staging
cd ../wt-cmm44-spa-pr1
npm install
```

- [ ] **Step 2: Inventur-Skript schreiben**

`scripts/cmm44-spa-callsites.mjs` — listet jede Datei unter `src/`, die `.from('faelle')`
nutzt UND mindestens eine der 34 Spalten erwähnt:

```js
#!/usr/bin/env node
// CMM-44 SP-A: findet faelle-Call-Sites die eine der 34 DUP-Spalten beruehren.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const COLS = ['abgeschlossen_am','auslandskennzeichen','brn','fahrerflucht','finanzierung_leasing','finanzierungsgeber_adresse','finanzierungsgeber_name','finanzierungsgeber_vertragsnr','gegner_bekannt','gegner_versicherung_id','gegner_versicherungsnummer','gewerbe_flag','kanzlei_ansprechpartner_email','kanzlei_ansprechpartner_name','kanzlei_ansprechpartner_telefon','kanzlei_uebergeben_am','kunde_email','kunden_konstellation','kundenbetreuer_id','polizei_aktenzeichen','polizei_bericht_vorhanden','polizei_vor_ort','polizeibericht_status','sachschaden_beschreibung','spezifikation','unfall_konstellation','unfallskizze_ablehnung_grund','unfallskizze_bestaetigt','unfallskizze_generiert_am','unfallskizze_svg','unfallskizze_url','vehicle_id','vorsteuerabzugsberechtigt','zeugen_kontakte']

const files = execSync(`grep -rl "from('faelle')" src/ || true`, { encoding: 'utf8' })
  .split('\n').filter(Boolean)

const hits = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const found = COLS.filter((c) => new RegExp(`\\b${c}\\b`).test(src))
  if (found.length) hits.push({ file: f, cols: found })
}
hits.sort((a, b) => a.file.localeCompare(b.file))
const out = hits.map((h) => `${h.file}\n  ${h.cols.join(', ')}`).join('\n')
writeFileSync('scripts/cmm44-spa-callsites.txt', out + `\n\n# ${hits.length} Files\n`)
console.log(`${hits.length} Files mit faelle-Call-Site + DUP-Spalte`)
```

- [ ] **Step 3: Inventur laufen lassen**

Run: `node scripts/cmm44-spa-callsites.mjs`
Expected: gibt `<N> Files mit faelle-Call-Site + DUP-Spalte` aus, schreibt `.txt`.

- [ ] **Step 4: Inventur committen**

```bash
git add scripts/cmm44-spa-callsites.mjs scripts/cmm44-spa-callsites.txt
git commit -m "chore(CMM-44): SP-A Call-Site-Inventur — 34 DUP-Spalten"
```

> **Hinweis für Folge-Tasks:** `cmm44-spa-callsites.txt` ist die verbindliche Arbeitsliste.
> Jede dort gelistete Datei wird in Task 2/3 bearbeitet. Ein File kann sowohl in der
> lib- als auch app-Liste auftauchen — Zuordnung über den Pfad-Präfix.

---

### Task 2: Sweep `src/lib/**`

**Files:** Alle Dateien aus `cmm44-spa-callsites.txt` mit Pfad-Präfix `src/lib/`.
Erwartete Cluster (aus Voraudit): `src/lib/actions`, `src/lib/termine`, `src/lib/claims`,
`src/lib/dokumente`, `src/lib/auftrag`, `src/lib/abrechnung`, `src/lib/sla`,
`src/lib/kanzlei`, `src/lib/faelle`, `src/lib/dispatch`, `src/lib/communications`,
`src/lib/resolver`, `src/lib/finance`, `src/lib/mietwagen`, `src/lib/leads` u.a.

**Transformations-Rezept** (gilt für jede Call-Site, identisch):

Eine `faelle`-Query, die eine oder mehrere der 34 Spalten **liest**, wird auf `claims`
umgestellt. Drei Fälle:

1. **Query liest NUR 34er-Spalten (+ FK):** Quell-Tabelle `faelle` → `claims` tauschen,
   Filter `id`/`claim_id` entsprechend anpassen.
   ```ts
   // vorher
   const { data } = await supabase.from('faelle')
     .select('id, polizei_vor_ort, gewerbe_flag').eq('id', fallId).single()
   // nachher — claims ist SSoT, gleiche Spaltennamen
   const { data } = await supabase.from('claims')
     .select('id, polizei_vor_ort, gewerbe_flag').eq('id', claimId).single()
   ```
2. **Query liest 34er-Spalten gemischt mit faelle-only-Spalten:** Die 34er-Spalten aus dem
   `faelle`-`select()` entfernen und über `claim_id` aus `claims` nachladen (zweite Query
   oder Nested-Select `claims:claim_id(...)`). faelle-only-Spalten bleiben am `faelle`-Read.
   ```ts
   // nachher — 34er ueber Nested-FK aus claims
   const { data } = await supabase.from('faelle')
     .select('id, fall_nummer, claims:claim_id(polizei_vor_ort, gewerbe_flag)')
     .eq('id', fallId).single()
   // Nested-FK normalisieren (AGENTS.md §post-task-audit Punkt 6):
   const claim = Array.isArray(data.claims) ? data.claims[0] : data.claims
   ```
3. **Writes** (`.from('faelle').update({<34er-col>})`): Ziel-Tabelle `claims`,
   Filter `id` → claim-`id` bzw. `claim_id`. Server-Action-Pattern `{ ok, error }`
   beibehalten (AGENTS.md §server-actions-pattern). `revalidatePath` der betroffenen
   Routen nicht vergessen.

- [ ] **Step 1: Pro lib-Datei aus der Inventur das Rezept anwenden**

Für jede `src/lib/`-Datei aus `cmm44-spa-callsites.txt`: die faelle-Call-Sites, die eine
der 34 Spalten berühren, nach obigem Rezept umstellen. Dateien einzeln durcharbeiten.

- [ ] **Step 2: Typecheck nach jedem Cluster**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler. Bei Fehlern in der bearbeiteten Datei sofort fixen
(`feedback_ts_errors_audit`).

- [ ] **Step 3: Wrapper-Funktionen prüfen**

Run: `grep -rn "from('faelle')" src/lib/ | grep -E "$(node -e "console.log(['abgeschlossen_am','auslandskennzeichen','brn','fahrerflucht','finanzierung_leasing','finanzierungsgeber_adresse','finanzierungsgeber_name','finanzierungsgeber_vertragsnr','gegner_bekannt','gegner_versicherung_id','gegner_versicherungsnummer','gewerbe_flag','kanzlei_ansprechpartner_email','kanzlei_ansprechpartner_name','kanzlei_ansprechpartner_telefon','kanzlei_uebergeben_am','kunde_email','kunden_konstellation','kundenbetreuer_id','polizei_aktenzeichen','polizei_bericht_vorhanden','polizei_vor_ort','polizeibericht_status','sachschaden_beschreibung','spezifikation','unfall_konstellation','unfallskizze_ablehnung_grund','unfallskizze_bestaetigt','unfallskizze_generiert_am','unfallskizze_svg','unfallskizze_url','vehicle_id','vorsteuerabzugsberechtigt','zeugen_kontakte'].join('|'))")"`
Expected: 0 Treffer in `src/lib/` (alle lib-seitigen 34er-faelle-Reads umgestellt).

- [ ] **Step 4: Commit**

```bash
git add src/lib/
git commit -m "refactor(CMM-44): SP-A — lib-Layer 34 DUP-Spalten faelle->claims"
```

---

### Task 3: Sweep `src/app/**` + `src/components/**`

**Files:** Alle Dateien aus `cmm44-spa-callsites.txt` mit Präfix `src/app/` oder
`src/components/`. Erwartete Cluster: `src/app/faelle/[id]/_actions` (11),
`src/app/admin/_components` (5), `src/app/kunde/faelle/[id]` (4),
`src/app/gutachter/fall/[id]` (4), `src/app/kunde/termin/[token]`,
`src/app/kunde/re-termin/[token]`, `src/components/kunde` u.a.

- [ ] **Step 1: Pro app/components-Datei das Transformations-Rezept aus Task 2 anwenden**

Gleiches Rezept (Fall 1/2/3) wie Task 2. Bei Server-Components: prüfen, ob der Read in
einem `page.tsx` direkt oder in einer `_actions.ts` liegt — Server-Actions liefern
`{ ok, error }`.

- [ ] **Step 2: Voller Build**

Run: `npm run build`
Expected: grün. Routen/Layouts/Server-Actions betroffen → voller Build Pflicht
(AGENTS.md §post-task-audit Punkt 1, Next.js-15-Validator).

- [ ] **Step 3: Re-Grep — 0 verbleibende 34er-faelle-Reads**

Run: `node scripts/cmm44-spa-callsites.mjs`
Expected: Die Ausgabe-Datei listet nur noch Call-Sites, bei denen die 34er-Spalte
NICHT aus dem `faelle`-`select` stammt (z.B. Variablenname-Kollision). Jede echte
faelle-Lese/Schreib-Stelle der 34 ist weg. Verbleibende Treffer manuell verifizieren
und dokumentieren.

- [ ] **Step 4: Commit**

```bash
git add src/app/ src/components/
git commit -m "refactor(CMM-44): SP-A — app/components-Layer 34 DUP-Spalten faelle->claims"
```

---

### Task 4: Verifikation + PR1

- [ ] **Step 1: Voller Build final**

Run: `npm run build`
Expected: grün.

- [ ] **Step 2: Portal-Smoke gegen staging**

Smoke-Skript `scripts/smoke-cmm44-spa-pr1.mjs` schreiben (Muster: bestehende
`scripts/smoke-*.mjs`), das pro Portal eine Claim-Detail-Seite öffnet und Screenshot
macht: Public (`/`), Admin (`/faelle/[id]`), SV (`/gutachter/fall/[id]`),
Kunde (`/kunde/faelle/[id]`), Dispatch (`/dispatch/leads`).

Run: `node scripts/smoke-cmm44-spa-pr1.mjs`
Expected: kein 500er; Screenshots zeigen die betroffenen Werte (Unfallskizze-Status,
Polizei-Felder, Kanzlei-Ansprechpartner, Finanzierungsgeber, Gewerbe-Flag) unverändert
befüllt. Screenshots im selben Turn auswerten (`feedback_smoke_screenshot_pflicht`).

- [ ] **Step 3: Commit Smoke-Artefakte**

```bash
git add scripts/smoke-cmm44-spa-pr1.mjs docs/16.05.2026/cmm44-spa-pr1-smoke/
git commit -m "test(CMM-44): SP-A PR1 — Portal-Smoke 34 DUP-Spalten gruen"
```

- [ ] **Step 4: Push + PR gegen staging**

```bash
git push -u origin kitta/cmm-44-spa-pr1-reader-sweep
gh pr create --base staging --title "refactor(CMM-44): SP-A PR1 — 34 DUP-Spalten Reader/Writer faelle->claims" --body "<Audit-Block + Smoke-Screenshots + CMM-48-Writer-Abgleich>"
```

Der PR-Body markiert explizit, welche Writer-Stellen aus `cmm-48-writer-stellen-audit.md`
in diesem PR mitmigriert wurden — damit CMM-48 sie nicht doppelt anfasst.

- [ ] **Step 5: Auf Aaron's Merge-Freigabe warten** (`feedback_kein_auto_merge` /
  `feedback_staging_auto_merge` — staging-Merge erst wenn Build grün + Aaron ok).

---

# PR 2 — Trigger-Retire + DROP COLUMN

**Branch:** `kitta/cmm-44-spa-pr2-drop`, frisch von `origin/staging` **nach PR1-Merge**.

### Task 5: View-Dependency-Audit + Migration schreiben

**Files:**
- Create: `supabase/migrations/<ts>_cmm44_spa_drop_34_dup_columns.sql`
- Create: `scripts/cmm44-spa-view-deps.sql`

- [ ] **Step 1: Worktree anlegen**

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2"
git fetch origin staging
git worktree add ../wt-cmm44-spa-pr2 -b kitta/cmm-44-spa-pr2-drop origin/staging
cd ../wt-cmm44-spa-pr2
npm install
cp -r "../claimondo-v2/supabase/.temp/." supabase/.temp/   # Worktree linken (Handoff §3)
```

- [ ] **Step 2: View-Definitionen der 6 faelle-Views holen**

`scripts/cmm44-spa-view-deps.sql`:

```sql
SELECT c.relname AS view, pg_get_viewdef(c.oid) AS def
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND c.relname IN ('faelle_kunde_view','faelle_sv_view','v_claim_full',
                    'v_claim_listing','v_claim_timeline','v_faelle_mit_aktuellem_termin');
```

Run: `npx supabase db query --linked --file scripts/cmm44-spa-view-deps.sql`
Expected: 6 View-Definitionen. Pro View prüfen, ob eine der 34 Spalten **aus `faelle`**
(nicht aus `claims`) selektiert wird. Liste der anzupassenden Views festhalten.

- [ ] **Step 3: Migration schreiben**

```bash
npx supabase migration new cmm44_spa_drop_34_dup_columns
```

Inhalt der generierten Datei — Reihenfolge zwingend:

```sql
-- CMM-44 SP-A: 34 sync-getriggerte Duplikat-Spalten von faelle droppen.
-- claims ist SSoT; PR1 hat alle faelle-seitigen Reader/Writer auf claims umgestellt.

-- 1) Einmal-Backfill claims <- faelle (deckt AFTER-UPDATE-Sync-Luecke bei INSERT-only-Zeilen)
UPDATE public.claims c SET
  abgeschlossen_am = COALESCE(c.abgeschlossen_am, f.abgeschlossen_am),
  auslandskennzeichen = COALESCE(c.auslandskennzeichen, f.auslandskennzeichen),
  brn = COALESCE(c.brn, f.brn),
  fahrerflucht = COALESCE(c.fahrerflucht, f.fahrerflucht),
  finanzierung_leasing = COALESCE(c.finanzierung_leasing, f.finanzierung_leasing),
  finanzierungsgeber_adresse = COALESCE(c.finanzierungsgeber_adresse, f.finanzierungsgeber_adresse),
  finanzierungsgeber_name = COALESCE(c.finanzierungsgeber_name, f.finanzierungsgeber_name),
  finanzierungsgeber_vertragsnr = COALESCE(c.finanzierungsgeber_vertragsnr, f.finanzierungsgeber_vertragsnr),
  gegner_bekannt = COALESCE(c.gegner_bekannt, f.gegner_bekannt),
  gegner_versicherung_id = COALESCE(c.gegner_versicherung_id, f.gegner_versicherung_id),
  gegner_versicherungsnummer = COALESCE(c.gegner_versicherungsnummer, f.gegner_versicherungsnummer),
  gewerbe_flag = COALESCE(c.gewerbe_flag, f.gewerbe_flag),
  kanzlei_ansprechpartner_email = COALESCE(c.kanzlei_ansprechpartner_email, f.kanzlei_ansprechpartner_email),
  kanzlei_ansprechpartner_name = COALESCE(c.kanzlei_ansprechpartner_name, f.kanzlei_ansprechpartner_name),
  kanzlei_ansprechpartner_telefon = COALESCE(c.kanzlei_ansprechpartner_telefon, f.kanzlei_ansprechpartner_telefon),
  kanzlei_uebergeben_am = COALESCE(c.kanzlei_uebergeben_am, f.kanzlei_uebergeben_am),
  kunde_email = COALESCE(c.kunde_email, f.kunde_email),
  kunden_konstellation = COALESCE(c.kunden_konstellation, f.kunden_konstellation),
  kundenbetreuer_id = COALESCE(c.kundenbetreuer_id, f.kundenbetreuer_id),
  polizei_aktenzeichen = COALESCE(c.polizei_aktenzeichen, f.polizei_aktenzeichen),
  polizei_bericht_vorhanden = COALESCE(c.polizei_bericht_vorhanden, f.polizei_bericht_vorhanden),
  polizei_vor_ort = COALESCE(c.polizei_vor_ort, f.polizei_vor_ort),
  polizeibericht_status = COALESCE(c.polizeibericht_status, f.polizeibericht_status),
  sachschaden_beschreibung = COALESCE(c.sachschaden_beschreibung, f.sachschaden_beschreibung),
  spezifikation = COALESCE(c.spezifikation, f.spezifikation),
  unfall_konstellation = COALESCE(c.unfall_konstellation, f.unfall_konstellation),
  unfallskizze_ablehnung_grund = COALESCE(c.unfallskizze_ablehnung_grund, f.unfallskizze_ablehnung_grund),
  unfallskizze_bestaetigt = COALESCE(c.unfallskizze_bestaetigt, f.unfallskizze_bestaetigt),
  unfallskizze_generiert_am = COALESCE(c.unfallskizze_generiert_am, f.unfallskizze_generiert_am),
  unfallskizze_svg = COALESCE(c.unfallskizze_svg, f.unfallskizze_svg),
  unfallskizze_url = COALESCE(c.unfallskizze_url, f.unfallskizze_url),
  vehicle_id = COALESCE(c.vehicle_id, f.vehicle_id),
  vorsteuerabzugsberechtigt = COALESCE(c.vorsteuerabzugsberechtigt, f.vorsteuerabzugsberechtigt),
  zeugen_kontakte = COALESCE(c.zeugen_kontakte, f.zeugen_kontakte)
FROM public.faelle f
WHERE f.claim_id = c.id;

-- 2) Betroffene Views: faelle-Quelle der 34 Spalten auf claims umbiegen.
--    Pro View aus Task-5-Step-2 ein CREATE OR REPLACE VIEW hier einsetzen.
--    (Konkrete View-Defs erst nach Step 2 bekannt — pro anzupassender View ein Block.)

-- 3) Sync-Trigger-Paar entfernen (synct ausschliesslich diese 34 -> funktionslos)
DROP TRIGGER IF EXISTS trg_sync_faelle_to_claims ON public.faelle;
DROP TRIGGER IF EXISTS trg_sync_claims_to_faelle ON public.claims;
DROP FUNCTION IF EXISTS public.sync_faelle_to_claims();
DROP FUNCTION IF EXISTS public.sync_claims_to_faelle();

-- 4) Die 34 Spalten von faelle droppen
ALTER TABLE public.faelle
  DROP COLUMN abgeschlossen_am,
  DROP COLUMN auslandskennzeichen,
  DROP COLUMN brn,
  DROP COLUMN fahrerflucht,
  DROP COLUMN finanzierung_leasing,
  DROP COLUMN finanzierungsgeber_adresse,
  DROP COLUMN finanzierungsgeber_name,
  DROP COLUMN finanzierungsgeber_vertragsnr,
  DROP COLUMN gegner_bekannt,
  DROP COLUMN gegner_versicherung_id,
  DROP COLUMN gegner_versicherungsnummer,
  DROP COLUMN gewerbe_flag,
  DROP COLUMN kanzlei_ansprechpartner_email,
  DROP COLUMN kanzlei_ansprechpartner_name,
  DROP COLUMN kanzlei_ansprechpartner_telefon,
  DROP COLUMN kanzlei_uebergeben_am,
  DROP COLUMN kunde_email,
  DROP COLUMN kunden_konstellation,
  DROP COLUMN kundenbetreuer_id,
  DROP COLUMN polizei_aktenzeichen,
  DROP COLUMN polizei_bericht_vorhanden,
  DROP COLUMN polizei_vor_ort,
  DROP COLUMN polizeibericht_status,
  DROP COLUMN sachschaden_beschreibung,
  DROP COLUMN spezifikation,
  DROP COLUMN unfall_konstellation,
  DROP COLUMN unfallskizze_ablehnung_grund,
  DROP COLUMN unfallskizze_bestaetigt,
  DROP COLUMN unfallskizze_generiert_am,
  DROP COLUMN unfallskizze_svg,
  DROP COLUMN unfallskizze_url,
  DROP COLUMN vehicle_id,
  DROP COLUMN vorsteuerabzugsberechtigt,
  DROP COLUMN zeugen_kontakte;
```

> **Reihenfolge-Begründung:** Backfill vor Trigger-Drop (Trigger könnte sonst nachsyncen);
> Views vor `DROP COLUMN` (sonst blockiert die View-Dependency den Drop). `IF EXISTS`
> macht die DROP-Statements idempotent.

- [ ] **Step 4: Live-Re-Check der 34 Spalten direkt vor Apply**

Run: `npx supabase db query --linked --file scripts/cmm44-faelle-inventory.sql` (aus PR #1403)
Expected: bestätigt, dass alle 34 noch auf `faelle` existieren. Hat eine andere Session
eine Spalte bereits gedroppt → diese Zeile aus der Migration entfernen
(`feedback_information_schema_check`).

- [ ] **Step 5: Migration committen**

```bash
git add supabase/migrations/ scripts/cmm44-spa-view-deps.sql
git commit -m "feat(CMM-44): SP-A PR2 — Migration: 34 DUP-Spalten + Sync-Trigger droppen"
```

---

### Task 6: Migration applizieren + DB-Verify

- [ ] **Step 1: Targeted-Apply**

```bash
npx supabase db query --linked --agent yes --file supabase/migrations/<ts>_cmm44_spa_drop_34_dup_columns.sql
npx supabase migration repair --status applied <ts>
```

(Kein blankes `db push` — Fremd-Drift, `feedback_migration_repair_twin_drift` / Handoff §3.)
Expected: Migration läuft ohne Fehler durch.

- [ ] **Step 2: DB-Verify-Skript**

`scripts/cmm44-spa-verify.sql`:

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='faelle'
     AND column_name IN ('abgeschlossen_am','auslandskennzeichen','brn','fahrerflucht',
       'finanzierung_leasing','finanzierungsgeber_adresse','finanzierungsgeber_name',
       'finanzierungsgeber_vertragsnr','gegner_bekannt','gegner_versicherung_id',
       'gegner_versicherungsnummer','gewerbe_flag','kanzlei_ansprechpartner_email',
       'kanzlei_ansprechpartner_name','kanzlei_ansprechpartner_telefon',
       'kanzlei_uebergeben_am','kunde_email','kunden_konstellation','kundenbetreuer_id',
       'polizei_aktenzeichen','polizei_bericht_vorhanden','polizei_vor_ort',
       'polizeibericht_status','sachschaden_beschreibung','spezifikation',
       'unfall_konstellation','unfallskizze_ablehnung_grund','unfallskizze_bestaetigt',
       'unfallskizze_generiert_am','unfallskizze_svg','unfallskizze_url','vehicle_id',
       'vorsteuerabzugsberechtigt','zeugen_kontakte')) AS verbleibende_34er_spalten,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('sync_faelle_to_claims','sync_claims_to_faelle')) AS verbleibende_sync_funktionen;
```

Run: `npx supabase db query --linked --file scripts/cmm44-spa-verify.sql`
Expected: `verbleibende_34er_spalten = 0`, `verbleibende_sync_funktionen = 0`.

- [ ] **Step 3: Commit Verify-Skript**

```bash
git add scripts/cmm44-spa-verify.sql
git commit -m "test(CMM-44): SP-A PR2 — DB-Verify 34 Spalten + Sync-Trigger weg"
```

---

### Task 7: types regen + Build + Smoke + PR2

- [ ] **Step 1: Supabase-Types regenerieren**

```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

- [ ] **Step 2: Voller Build**

Run: `npm run build`
Expected: grün. Falls TS-Fehler durch entfallene `faelle`-Spalten in den Types → es gibt
noch einen nicht migrierten Reader (PR1-Lücke) → fixen.

- [ ] **Step 3: Portal-Smoke nach Drop**

`scripts/smoke-cmm44-spa-pr2.mjs` (Muster wie PR1-Smoke). Run gegen staging.
Expected: alle 5 Portale ohne 500er, betroffene Werte unverändert. Screenshots im selben
Turn auswerten (`feedback_post_drop_smoke` — voller Portal-Smoke Pflicht nach Schema-Drop).

- [ ] **Step 4: Commit Smoke + Types**

```bash
git add src/lib/database.types.ts scripts/smoke-cmm44-spa-pr2.mjs docs/16.05.2026/cmm44-spa-pr2-smoke/
git commit -m "test(CMM-44): SP-A PR2 — types regen + Portal-Smoke nach Drop gruen"
```

- [ ] **Step 5: Push + PR gegen staging**

```bash
git push -u origin kitta/cmm-44-spa-pr2-drop
gh pr create --base staging --title "feat(CMM-44): SP-A PR2 — 34 DUP-Spalten + Sync-Trigger-Paar droppen" --body "<Audit-Block + DB-Verify-Output + Smoke-Screenshots>"
```

- [ ] **Step 6: Auf Aaron's Merge-Freigabe warten.**

- [ ] **Step 7: Memory + Dekompositions-Doc nachziehen**

`project_cmm44_faelle_dekomposition` aktualisieren (SP-A done, 34 Spalten weg,
Sync-Trigger-Paar retired). Im Dekompositions-Doc den SP-A-Status auf erledigt setzen.

---

## Abschluss-Checkliste (AGENTS.md §3)

- [ ] `git status` beider Worktrees clean
- [ ] `git stash list` leer
- [ ] alle lokalen Commits gepusht
- [ ] Worktrees `wt-cmm44-spa-pr1` / `-pr2` nach Merge entfernen (`git worktree remove`)
