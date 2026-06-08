# CMM Entity — Plan 4: v_claim_full Entity-Sourcing (Gegner + Restfahrzeug) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox-Steps.
>
> **⚠️ PLAN-ONLY / EXECUTION GATED + KOORDINIERT.** Das ist eine **DDL-Migration auf `v_claim_full`** — einer kritischen 23+-Reader-View auf der **prod+staging-geteilten DB** (`paizkjajbuxxksdoycev`). Voraussetzungen: **Plan 3 (#2537) gemergt** (Writer schreiben Firma/Gegner-Fahrzeug/Versicherer-Entitäten — sonst sourct die View aus leeren Entitäten) · **Edit-Timing mit CMM-49 (`fb34de27`)** abstimmen (sie besitzen die Reader-Repoints + editieren `v_claim_full` zuletzt selbst — auf der **aktuellen** staging-Def aufsetzen, nicht auf einem Snapshot) · DDL **nur via `apply_migration`** (Regel 2, File==getrackte Version). Spec: `docs/04.06.2026/cmm-entity-katalog-spec.md` (#2429) §7 (eingefrorener Contract) + §8.4.

**Goal:** `v_claim_full` exponiert die noch flachen Gegner- + Restfahrzeug-Felder **entity-sourced** (aus `firmen`/`personen`/`versicherungen`/`vehicles`), damit CMM-49 seine ~47 entity-gated EMBED-Reader von `faelle` auf die View umstellen kann — der letzte View-Blocker vor dem `faelle`-Drop.

**Architecture:** Eine additive `CREATE OR REPLACE VIEW public.v_claim_full` — nimmt die **aktuelle** Def (Task 1) und ergänzt (a) die §7-eingefrorenen Namens-Spalten `gegner_name` (COALESCE Firma→Person) + `gegner_versicherung_name`, (b) die bisher als `NULL` hartkodierten/fehlenden Gegner-Felder (`gegner_fahrzeugtyp`/`gegner_kennzeichen`) aus der **verursacher-Partei + ihrem Fahrzeug** (Plan-3-kanonisch), (c) die fehlenden Geschädigter-Fahrzeug-Detailfelder (`fin_vin`/`lackfarbe`). Bestehende Spalten/Reihenfolge, `security_invoker` und der Flat-Contract bleiben unangetastet. **Value-preserving:** Gegner-Daten sind auf dem Bestand 0 (0 verursacher-Parties, `gegner_versicherung_id`=0, `gegnerisches_vehicle_id`≈0) → alle neuen Spalten = `null` auf Bestand, kein Consumer ändert sich sichtbar.

**Tech Stack:** Postgres-View (SQL), Supabase-Plugin `apply_migration`, `execute_sql` (READ-Verify). **Keine App-Files.**

---

## ⚠️ Zwei GATES (vor/während Execution zu klären — keine versteckten Placeholder)

- **GATE A — exakte Reader-Feldmenge (mit CMM-49):** Welche `faelle`-flachen Felder lesen die ~47 entity-gated EMBED-Reader genau? §7 friert **`gegner_name` + `gegner_versicherung_name`** definitiv ein. Die übrigen Kandidaten (`gegner_kennzeichen`, `gegner_fahrzeugtyp`, `fin_vin`, `lackfarbe`/`lackfarbe_code`) ergeben sich aus CMM-49s Klassifikation — **vor dem Compose mit `fb34de27` bestätigen**, damit die View-Spaltennamen 1:1 auf das passen, was die Reader von `faelle` erwarten (sonst kein value-preserving Repoint).
- **GATE B — Gegner-Fahrzeug-Quelle:** Plan 3 verlinkt das Gegner-Fahrzeug über die **verursacher-Partei (`claim_parties.vehicle_id`) + das Involvement (`rolle='verursacher'`)**, **NICHT** über `claims.gegnerisches_vehicle_id` (flacher Alt-Pointer, von Plan 3 nicht befüllt). Dieser Plan sourct daher `gegner_kennzeichen/fahrzeugtyp` aus der verursacher-Partei + deren `vehicle_id`. **Bestätigen**, dass das die Reader-Erwartung trifft (vs. dem Alt-Pointer).

---

## File Structure

| Datei | Verantwortung | Art |
|---|---|---|
| `supabase/migrations/<V>_cmm_entity_v_claim_full_gegner_sourcing.sql` | `CREATE OR REPLACE VIEW public.v_claim_full` — additiv Gegner/Restfahrzeug entity-sourced | Create (DDL via `apply_migration`) |

Keine `src/`-Änderung. Reader-Repoints sind **CMM-49-Revier** (separater PR, nach diesem Merge).

---

## Task 1: Aktuelle Def + Baseline snapshotten (read-only Grounding)

**Files:** keine (READ).

- [ ] **Step 1: Aktuelle View-Def ziehen** (Quelle der Wahrheit — die View ko-evolviert mit CMM-49/Entity)

```sql
SELECT pg_get_viewdef('public.v_claim_full'::regclass, true);
```
Erwartung: die Def enthält bereits `veh`-Join (geschädigter Fahrzeug), `halter_p`-LATERAL (→personen), `vv`-LATERAL (vorschaden), `parties`-jsonb (→personen), und `NULL::text AS gegner_fahrzeugtyp` / `NULL::integer AS gegner_anzahl_beteiligte`. **Auf GENAU dieser Fassung aufsetzen.**

- [ ] **Step 2: `security_invoker` ablesen** (muss erhalten bleiben)

```sql
SELECT c.relname, c.reloptions FROM pg_class c WHERE c.relname = 'v_claim_full';
```
Erwartung: `reloptions` enthält `security_invoker=true` (oder `=on`). Exakt diesen Wert in der `WITH (...)`-Klausel des `CREATE OR REPLACE` spiegeln.

- [ ] **Step 3: Value-preserving-Baseline** (Bestätigung Gegner-Daten data-inert)

```sql
SELECT
  (SELECT count(*) FROM claim_parties WHERE rolle='verursacher') AS verursacher_parties,
  (SELECT count(*) FROM claims WHERE gegner_versicherung_id IS NOT NULL) AS mit_gegner_vs,
  (SELECT count(*) FROM claims WHERE gegnerisches_vehicle_id IS NOT NULL) AS mit_gegner_vehicle,
  (SELECT count(*) FROM vehicles WHERE fin IS NOT NULL) AS vehicles_mit_fin;
```
Erwartung: verursacher_parties/mit_gegner_vs/mit_gegner_vehicle ≈ 0 (data-inert; neue Spalten = null auf Bestand). `vehicles_mit_fin` klein (1). Falls >0 verursacher-Parties existieren → vor Execution ein Stichproben-Vergleich alt(`faelle.gegner_name`) vs neu(View) je betroffenem Claim.

---

## Task 2: GATE A + B mit CMM-49 bestätigen (Koordination, kein Code)

**Files:** keine.

- [ ] **Step 1:** Mit `fb34de27` die exakte Feldmenge der ~47 entity-gated Reader abgleichen (GATE A) — Ziel-Spaltennamen festziehen: definitiv `gegner_name`, `gegner_versicherung_name`; klären `gegner_kennzeichen`/`gegner_fahrzeugtyp`/`fin_vin`/`lackfarbe`(`_code`).
- [ ] **Step 2:** Gegner-Fahrzeug-Quelle bestätigen (GATE B): verursacher-Partei.`vehicle_id` (Plan-3-kanonisch) statt `claims.gegnerisches_vehicle_id`.
- [ ] **Step 3:** Edit-Fenster für `v_claim_full` abstimmen (sie editieren die View-Def im Moment nicht — sie warten; trotzdem sicherstellen, dass keine parallele View-Mig in-flight ist, sonst Twin-Drift).

---

## Task 3: Additive `CREATE OR REPLACE VIEW` komponieren + anwenden

**Files:** `supabase/migrations/<V>_cmm_entity_v_claim_full_gegner_sourcing.sql` via `apply_migration`.

**Delta gegen die Task-1-Snapshot-Def** (additiv — bestehende Spalten/Reihenfolge unverändert):

- [ ] **Step 1: Neue JOINs** (ans Ende der `FROM`-Kette anhängen)

```sql
     -- Gegner = verursacher-Partei (Plan-3-kanonisch). Liefert Firma/Person/Fahrzeug-Quelle.
     LEFT JOIN LATERAL (
       SELECT vp.firma_id, vp.person_id, vp.vehicle_id, vp.nachname, vp.vorname,
              vp.fahrzeugtyp_klartext, vp.kennzeichen
       FROM claim_parties vp
       WHERE vp.claim_id = c.id AND vp.rolle = 'verursacher'
       ORDER BY vp.reihenfolge, vp.created_at
       LIMIT 1
     ) gp ON true
     LEFT JOIN firmen gf ON gf.id = gp.firma_id
     LEFT JOIN personen gpp ON gpp.id = gp.person_id
     LEFT JOIN versicherungen gv ON gv.id = c.gegner_versicherung_id
     LEFT JOIN vehicles gveh ON gveh.id = gp.vehicle_id
```

- [ ] **Step 2: `gegner_fahrzeugtyp` ersetzen** — die Zeile `NULL::text AS gegner_fahrzeugtyp,` durch:

```sql
    COALESCE(gveh.bauart, gp.fahrzeugtyp_klartext) AS gegner_fahrzeugtyp,
```
(`gegner_anzahl_beteiligte` bleibt `NULL::integer` — Legacy, Consumer lesen es nur vom Lead.)

- [ ] **Step 3: Neue Spalten** ans Ende der SELECT-Liste (vor dem `FROM`) anhängen:

```sql
    -- §7 eingefroren: Gegner = Firma ODER Person (deduped Entitaeten), flat-nachname-Fallback.
    COALESCE(
      gf.name,
      NULLIF(TRIM(BOTH FROM (COALESCE(gpp.vorname, ''::text) || ' '::text) || COALESCE(gpp.nachname, ''::text)), ''::text),
      gp.nachname
    ) AS gegner_name,
    gv.name AS gegner_versicherung_name,
    COALESCE(gveh.kennzeichen_aktuell, gp.kennzeichen)::text AS gegner_kennzeichen,
    -- Geschaedigter-Fahrzeug Restfelder (veh ist der bestehende Join auf c.vehicle_id):
    veh.fin AS fin_vin,
    veh.farbe_klartext AS lackfarbe,
    veh.farbcode AS lackfarbe_code,
```

- [ ] **Step 4: `apply_migration`** — vollständige `CREATE OR REPLACE VIEW public.v_claim_full WITH (security_invoker=<Task-1-Wert>) AS <Snapshot-Def + obige Deltas>;`

```
apply_migration({ name: "cmm_entity_v_claim_full_gegner_sourcing", query: "<DDL>" })
```

---

## Task 4: Migration tracken + File committen (Regel 2 Schritt 3+4)

- [ ] **Step 1:** `list_migrations` → die vom Plugin vergebene Version `<V>` ablesen.
- [ ] **Step 2:** Migration-File committen als `supabase/migrations/<V>_cmm_entity_v_claim_full_gegner_sourcing.sql` (Dateiname == getrackte Version, Anti-Twin-Drift).

```bash
git add supabase/migrations/<V>_cmm_entity_v_claim_full_gegner_sourcing.sql
git commit -m "feat(cmm-entity): v_claim_full Gegner+Restfahrzeug entity-sourced (Plan 4)"
```

---

## Task 5: Verifizieren (value-preserving + Security + Reader-Integrität)

**Files:** keine (READ).

- [ ] **Step 1: Neue Spalten existieren + null-auf-Bestand**

```sql
SELECT count(*) AS rows,
       count(gegner_name) AS gegner_name_nonnull,
       count(gegner_versicherung_name) AS gegner_vs_nonnull,
       count(fin_vin) AS fin_nonnull
FROM v_claim_full;
```
Erwartung: `rows` = Claim-Anzahl; `gegner_*_nonnull` = 0 (data-inert); `fin_nonnull` klein (= vehicles_mit_fin).

- [ ] **Step 2: Bestehende Spalten unverändert** — Stichprobe gegen eine pre-Mig gespeicherte Zeile (z.B. `kennzeichen`, `halter_name`, `parties`, `fall_status`, `claim_nummer`) → 0 diff.
- [ ] **Step 3: `security_invoker` erhalten**

```sql
SELECT reloptions FROM pg_class WHERE relname='v_claim_full';
```
Erwartung: identisch zu Task 1 Step 2.

- [ ] **Step 4: Advisors** — `get_advisors({ type: "security" })` → keine NEUEN Findings auf `v_claim_full`.
- [ ] **Step 5: Smoke** — 1 Claim mit `geschaedigter` + (falls vorhanden) 1 mit verursacher-Partei über die View lesen; Kunde-/SV-/Gast-Rollen-Views, die auf `v_claim_full` aufsetzen, leak-frei (§2-Invariante: kein PII-Leak über Rollen).

---

## Task 6: CMM-49 signalisieren

- [ ] **Step 1:** Nach Merge: Kommentar/Marker an CMM-49 (`fb34de27`) — „`v_claim_full` entity-sourced live (gegner_name/gegner_versicherung_name/gegner_kennzeichen/gegner_fahrzeugtyp/fin_vin/lackfarbe) → eure ~47 entity-gated EMBED-Reader können von `faelle` auf die View umstellen." Marker `COORDINATION-entity-plan3-writer-wiring.md` aktualisieren.

---

## Backfill-Notiz (kein Task jetzt)
Kein Daten-Backfill nötig — die View liest live aus den Entitäten. Forward-looking: sobald Plan 3 reale Gegner/Firma/Versicherer-Entitäten schreibt, füllen sich die View-Spalten automatisch.

---

## Self-Review

**1. Spec-Coverage (§7 + §8.4):** `gegner_name` = COALESCE(firmen, personen) ✓ (Task 3 Step 3) · `gegner_versicherung_name` via `gegner_versicherung_id` ✓ · ids bleiben (unverändert) ✓ · additiv, 1 Mig, keine App-Files ✓ · entsperrt CMM-49 EMBED ✓ (Task 6).

**2. Placeholder-Scan:** Determinierte Tasks (1,3,4,5) haben konkrete SQL. Die 2 offenen Punkte sind explizite **GATES** (A: exakte Reader-Feldmenge; B: Gegner-Fahrzeug-Quelle) — ehrliche Koordinations-Grenzen mit CMM-49, keine TBDs.

**3. Typ-/Namens-Konsistenz:** Quell-Spalten live verifiziert (08.06.): `firmen.name`, `versicherungen.name`, `vehicles.fin`/`farbe_klartext`/`farbcode`/`kennzeichen_aktuell`/`bauart`, `claim_parties.firma_id`/`person_id`/`vehicle_id`/`fahrzeugtyp_klartext`/`kennzeichen`/`nachname`/`vorname`. `gegner_fahrzeugtyp` behält Name+Typ (`text`), nur Wert von `NULL` → entity. Neue Spalten additiv.

**Offene Punkte für den Executor:** (a) GATE A/B mit CMM-49 (`fb34de27`) VOR Compose. (b) Auf der **aktuellen** staging-Def aufsetzen (View ko-evolviert — Task 1 frisch ziehen, nicht aus diesem Doc abschreiben). (c) `security_invoker` zwingend erhalten (sonst RLS-Bypass auf einer PII-View). (d) Plan 5 (Flat-Drop der `faelle.gegner_*`/`fin_vin`/`lackfarbe_code`-Spalten) erst NACH CMM-49s Reader-Repoint + FK==0.
