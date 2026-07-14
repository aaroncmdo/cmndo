# v_claim_base Gutachten-Entity (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `v_claim_base` bezieht seine Gutachten-Werte aus der kanonischen Entity `v_gutachten_werte` statt aus der rohen `gutachten g`-Tabelle — wertneutral, analog zu wie Phase bereits `v_claim_phase` joint.

**Architecture:** Zwei DDL-Änderungen in EINER atomaren Migration (`apply_migration`): (1) `v_gutachten_werte` um 5 additive Felder erweitern, (2) den Gutachten-Subquery in `v_claim_base` von `g.*` auf `vgw.*` umstellen und `LEFT JOIN gutachten g` durch `LEFT JOIN v_gutachten_werte vgw` ersetzen. Verifikation = Shape-/Wert-Diff gegen einen Baseline-Snapshot (Wertneutralität, `nonexempt_diffs = 0`).

**Tech Stack:** Supabase Postgres (prod `paizkjajbuxxksdoycev`), Supabase-Plugin-MCP (`apply_migration`/`execute_sql`), git.

## Global Constraints

- **Regel 2:** DDL ausschließlich via `mcp__plugin_supabase_supabase__apply_migration`. `execute_sql` nur READ. Nach Apply: `list_migrations` → getrackte Version `<V>` ablesen → File exakt als `supabase/migrations/<V>_<name>.sql` committen (Twin-Drift-Schutz).
- **Regel 1:** Feature-Branch `kitta/vclaimbase-gutachten-entity`, PR gegen `staging`, nie direkt auf `main`.
- **Regel 4:** Nach Prod-Deploy vollständiger Prod-Smoke.
- **Prod-Ref:** `paizkjajbuxxksdoycev` (Claimondo-v2, ACTIVE_HEALTHY). NIE die Preview-Branch-Refs.
- **View-Muster:** volle `CREATE OR REPLACE VIEW` mit kompletter Def — KEIN `pg_get_viewdef()+replace()+RAISE`-Guard (bricht fresh-Replay).
- **Verifikations-Basis:** immer die LIVE-Def (`pg_get_viewdef`), nie staging-Files (können driften).

---

### Task 1: Baseline-Snapshot der Wertneutralität

**Files:**
- Create: scratchpad `vclaimbase-baseline.json` (Referenz, nicht committen)

**Interfaces:**
- Produces: Baseline-Column-Shape (Namen+Typen) von `v_claim_base`/`v_claim_full`/`v_faelle_mit_aktuellem_termin` + Sample der 12 Gutachten-Felder pro Claim — die Vergleichsgrundlage für Task 3.

- [ ] **Step 1: Column-Shape-Baseline ziehen (READ)**

`execute_sql` gegen `paizkjajbuxxksdoycev`:
```sql
select table_name, column_name, data_type, ordinal_position
from information_schema.columns
where table_schema='public'
  and table_name in ('v_claim_base','v_claim_full','v_faelle_mit_aktuellem_termin','v_gutachten_werte')
order by table_name, ordinal_position;
```
Erwartung: `v_claim_base` 370, `v_claim_full` 166, `v_faelle` 339, `v_gutachten_werte` 46 Spalten. Ergebnis notieren (Referenz für Task 3 — Namen+Typen+Position dürfen sich NUR bei `v_gutachten_werte` ändern: +5 am Ende).

- [ ] **Step 2: Gutachten-Werte-Baseline ziehen (READ, service-role sieht 0 Rows wegen claim_sichtbar — daher DIREKT auf der Roh-Tabelle spiegeln)**

```sql
select g.claim_id,
  g.gesamt_schadensbetrag, g.fertiggestellt_am, g.reparaturkosten_netto, g.minderwert,
  g.gutachten_sv_honorar_netto, g.pdf_uploaded_at, g.positionen, g.auftragsnummer,
  (g.gutachten_nutzungsausfall_tagessatz_eur * g.nutzungsausfall_tage::numeric) as nutzungsausfall_gesamt,
  (g.id is not null) as gutachten_vorhanden
from public.gutachten g
order by g.claim_id;
```
Erwartung: aktuell 0 Rows (prod Go-Live-cleaned) → Wertneutralität ist bei 0 Gutachten trivial erfüllt; die Column-Shape-Prüfung (Step 1) trägt den Beweis. Ergebnis notieren.

- [ ] **Step 3: Live-Def von v_claim_base sichern (READ)**

```sql
select pg_get_viewdef('public.v_claim_base'::regclass, true) as def;
```
Volle Def in scratchpad `vclaimbase-live-def.sql` speichern — Basis für die Task-2-Transformation (nur der Gutachten-Teil wird geändert, alles andere byte-identisch).

---

### Task 2: Migration schreiben + applizieren (v_gutachten_werte +5, v_claim_base umstellen)

**Files:**
- Create (nach Apply): `supabase/migrations/<V>_vclaimbase_gutachten_from_entity.sql`

**Interfaces:**
- Consumes: die Live-Def aus Task 1 Step 3.
- Produces: `v_gutachten_werte` mit 5 neuen Feldern; `v_claim_base` joint `v_gutachten_werte` statt `gutachten`. Column-Shape von `v_claim_base`/`full`/`faelle` UNVERÄNDERT.

- [ ] **Step 1: v_gutachten_werte-Erweiterung bauen**

Volle `CREATE OR REPLACE VIEW public.v_gutachten_werte AS` (Live-Def aus Task 1) mit **10** Feldern **am Ende** der SELECT-Liste, vor dem `FROM` (v_claim_base holt 18 g-Felder; 8 trägt die Entity schon):
```sql
    -- ... alle bestehenden 46 Spalten unveraendert ...
    g.gesamt_schadensbetrag,
    g.fertiggestellt_am,
    g.ocr_finished_at,
    g.ki_kalkulation,
    g.ki_kalkulation_am,
    g.ki_geschaetzte_kosten_min,
    g.ki_geschaetzte_kosten_max,
    g.pdf_uploaded_at,
    g.positionen,
    g.auftragsnummer
   FROM claims c
     LEFT JOIN gutachten g ON g.claim_id = c.id
  WHERE claim_sichtbar_fuer_aktuellen_user(c.id);
```
(Die bestehenden 46 Spalten byte-identisch übernehmen; nur die 10 additiv anhängen. `g.wiederbeschaffungsdauer_tage` trägt die Entity bereits.)

- [ ] **Step 2: v_claim_base-Gutachten-Subquery umstellen**

In der Live-Def von `v_claim_base` (Task 1 Step 3) im inneren Subquery `sub`:
- **Join ersetzen:** `LEFT JOIN gutachten g ON g.claim_id = c.id` → `LEFT JOIN v_gutachten_werte vgw ON vgw.claim_id = c.id`
- **Feld-Referenzen umschreiben** (`g.` → `vgw.`), identische Aliase:
  - `g.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag` → `vgw.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag`
  - `g.fertiggestellt_am AS gutachten_eingegangen_am` → `vgw.fertiggestellt_am AS gutachten_eingegangen_am`
  - `g.gutachten_nutzungsausfall_tagessatz_eur::numeric(10,2) AS nutzungsausfall_tagessatz` → `vgw.gutachten_nutzungsausfall_tagessatz_eur::numeric(10,2) AS nutzungsausfall_tagessatz`
  - `g.gutachten_sv_honorar_netto AS gutachter_honorar` → `vgw.gutachten_sv_honorar_netto AS gutachter_honorar`
  - `g.gutachten_ocr_raw AS ocr_rohdaten` → `vgw.gutachten_ocr_raw AS ocr_rohdaten`
  - `g.id IS NOT NULL AS gutachten_vorhanden` → `vgw.gutachten_id IS NOT NULL AS gutachten_vorhanden`
  - `g.pdf_uploaded_at AS gutachten_hochgeladen_am` → `vgw.pdf_uploaded_at AS gutachten_hochgeladen_am`
  - `g.positionen AS gutachten_positionen` → `vgw.positionen AS gutachten_positionen`
  - `g.auftragsnummer AS gutachten_nummer` → `vgw.auftragsnummer AS gutachten_nummer`
  - `g.reparaturkosten_netto AS reparaturkosten` → `vgw.reparaturkosten_netto AS reparaturkosten`
  - `g.minderwert AS wertminderung` → `vgw.minderwert AS wertminderung`
  - `(g.gutachten_nutzungsausfall_tagessatz_eur * g.nutzungsausfall_tage::numeric)::numeric(10,2) AS nutzungsausfall_gesamt` → `(vgw.gutachten_nutzungsausfall_tagessatz_eur * vgw.nutzungsausfall_tage::numeric)::numeric(10,2) AS nutzungsausfall_gesamt`
  - `g.wiederbeschaffungsdauer_tage AS reparaturdauer_tage` → `vgw.wiederbeschaffungsdauer_tage AS reparaturdauer_tage`
  - `g.ocr_finished_at AS ocr_extrahiert_am` → `vgw.ocr_finished_at AS ocr_extrahiert_am`
  - `g.ki_kalkulation` → `vgw.ki_kalkulation`
  - `g.ki_kalkulation_am` → `vgw.ki_kalkulation_am`
  - `g.ki_geschaetzte_kosten_min::numeric(10,2) AS ki_geschaetzte_kosten_min` → `vgw.ki_geschaetzte_kosten_min::numeric(10,2) AS ki_geschaetzte_kosten_min`
  - `g.ki_geschaetzte_kosten_max::numeric(10,2) AS ki_geschaetzte_kosten_max` → `vgw.ki_geschaetzte_kosten_max::numeric(10,2) AS ki_geschaetzte_kosten_max`

**Alles außerhalb des Gutachten-Subquerys byte-identisch lassen** (die anderen ~360 Spalten, alle Joins inkl. `v_claim_phase`, das `WHERE claim_sichtbar_fuer_aktuellen_user`). **Verifizieren, dass `g.` NUR im Gutachten-Subquery vorkommt** (live: 19 Zeilen, alle im sub) — sonst würde eine `g.`-Referenz ausserhalb ins Leere zeigen.

- [ ] **Step 3: EINE atomare Migration applizieren**

`apply_migration({ project_id: 'paizkjajbuxxksdoycev', name: 'vclaimbase_gutachten_from_entity', query: <beide CREATE OR REPLACE nacheinander: zuerst v_gutachten_werte, dann v_claim_base> })`.
Reihenfolge zwingend: `v_gutachten_werte` zuerst (sonst referenziert `v_claim_base` ein nicht-existentes Feld).
Erwartung: `{"success":true}`.

- [ ] **Step 4: Getrackte Version ablesen (READ)**

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 1;
```
Version `<V>` notieren.

---

### Task 3: Wertneutralität verifizieren (der "grüne" Test)

**Files:** keine (READ-Verifikation gegen prod)

**Interfaces:**
- Consumes: Baseline aus Task 1, Migration aus Task 2.

- [ ] **Step 1: Column-Shape-Diff (MUSS null Änderung an base/full/faelle sein)**

```sql
select table_name, column_name, data_type, ordinal_position
from information_schema.columns
where table_schema='public'
  and table_name in ('v_claim_base','v_claim_full','v_faelle_mit_aktuellem_termin')
order by table_name, ordinal_position;
```
Erwartung: **byte-identisch zur Task-1-Baseline** (370/166/339, gleiche Namen/Typen/Positionen). Jede Abweichung = Fehler → Migration zurückrollen (Live-Def-Backup aus Task 1 re-applizieren) und Transformation prüfen.

- [ ] **Step 2: v_gutachten_werte hat +5 Felder**

```sql
select count(*) from information_schema.columns where table_schema='public' and table_name='v_gutachten_werte';
```
Erwartung: **56** (46 + 10).

- [ ] **Step 3: v_claim_base joint jetzt die Entity, nicht mehr roh**

```sql
select
  (pg_get_viewdef('public.v_claim_base'::regclass, true) ~* '\mjoin\s+(public\.)?gutachten\s+g\M')::int as noch_roh,
  (pg_get_viewdef('public.v_claim_base'::regclass, true) ilike '%v_gutachten_werte vgw%')::int as joint_entity;
```
Erwartung: `noch_roh=0`, `joint_entity=1`.

- [ ] **Step 4: Wert-Diff (bei >0 Gutachten)**

Wenn Task 1 Step 2 Rows lieferte: die Gutachten-Felder von `v_claim_base` gegen die Roh-Tabellen-Baseline vergleichen (per authentifiziertem Kontext oder Roh-Join-Spiegel). Bei 0 Gutachten: durch Step 1 (Shape-Identität) + die Unique-Constraint-Garantie abgedeckt — im Migration-File-Kommentar vermerken.

---

### Task 4: Migration-File committen + PR + Prod-Smoke

**Files:**
- Create: `supabase/migrations/<V>_vclaimbase_gutachten_from_entity.sql`

- [ ] **Step 1: Migration-File schreiben (Name == getrackte Version `<V>`)**

Der exakte applizierte SQL-Text (beide `CREATE OR REPLACE`), mit Kopf-Kommentar: Zweck, Wertneutralitäts-Begründung (Unique-Constraint claim_id, gleiche Felder, gleiches Gate), Verifikations-Ergebnis (Shape-Diff=0).

- [ ] **Step 2: Committen + pushen**

```bash
git add supabase/migrations/<V>_vclaimbase_gutachten_from_entity.sql
git commit -m "feat(views): v_claim_base Gutachten aus v_gutachten_werte statt roh (Phase 1)"
git push -u origin kitta/vclaimbase-gutachten-entity
```

- [ ] **Step 3: PR gegen staging**

`gh pr create --base staging` mit Body: Zweck, Wertneutralität, Shape-Diff=0, Verweis auf Spec. Auf grünen `build` + `Supabase Preview` warten (Preview-Flake = bekannt, siehe Vermittler-Lane).

- [ ] **Step 4: Prod-Smoke nach Merge+Deploy (Regel 4)**

Nach main-Deploy: authentifizierter Read auf `/admin/faelle/[id]` (ein Claim mit Gutachten, sobald vorhanden) → Gutachten-Werte (reparaturkosten/wertminderung/nutzungsausfall/honorar) korrekt angezeigt. Bei 0 Gutachten auf prod: Read-Surface-Verifikation (Seite rendert ohne Fehler) + Live-DB-Shape-Check, im PR begründen. `v_claim_full` + `v_faelle` erben — stichprobenartig eine Consumer-Seite je View laden.

---

## Self-Review

**Spec coverage:** Phase 1 §3 (v_gutachten_werte +5, v_claim_base umstellen, Wertneutralität, isolierte Lieferung) → Tasks 1–4. ✅ Phase 2 → eigener Plan (Scope-Split, angekündigt). ✅
**Placeholder scan:** Keine TBD/TODO; die einzige Bedingung ("bei >0 Gutachten") ist explizit mit dem 0-Rows-Fallback aufgelöst. ✅
**Type consistency:** Feld-Namen konsistent (base-Aliase unverändert, nur `g.`→`vgw.`; `g.id`→`vgw.gutachten_id`). ✅
